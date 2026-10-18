package app.indiff.port;

import android.content.ContentResolver;
import android.net.Uri;
import android.util.AtomicFile;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.json.*;

/** Only app-private snapshot paths and URI handles minted by an OS picker. */
final class NativeFiles {
    static final int TEXT_LIMIT=1024*1024, SNAPSHOT_LIMIT=7*1024*1024;
    private final AtomicFile workspace;
    private final ContentResolver resolver;
    private final ConcurrentHashMap<String,Uri> handles=new ConcurrentHashMap<>();
    NativeFiles(File directory,ContentResolver resolver){workspace=new AtomicFile(new File(directory,"workspace-v1.json"));this.resolver=resolver;}
    static String readBounded(InputStream stream,int limit)throws IOException{
        try(InputStream input=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            if(input==null)throw new IOException("파일을 열 수 없습니다.");
            byte[] buffer=new byte[8192];int count,total=0;
            while((count=input.read(buffer))!=-1){total+=count;if(total>limit)throw new IOException("파일 용량 한도를 초과했습니다.");out.write(buffer,0,count);}
            try{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(out.toByteArray())).toString().replaceFirst("^\\uFEFF","");}
            catch(CharacterCodingException e){throw new IOException("UTF-8 텍스트 파일만 지원합니다.");}
        }
    }
    static byte[] bounded(String text,int limit)throws IOException{
        if(text==null||text.indexOf('\0')>=0)throw new IOException("텍스트 형식이 올바르지 않습니다.");
        byte[] bytes=text.getBytes(StandardCharsets.UTF_8);if(bytes.length>limit)throw new IOException("파일 용량 한도를 초과했습니다.");return bytes;
    }
    static JSONObject jsonObject(String text,int limit)throws Exception{
        bounded(text,limit);int depth=0,tokens=0;boolean quoted=false,escaped=false;
        for(int i=0;i<text.length();i++){char c=text.charAt(i);if(quoted){if(escaped)escaped=false;else if(c=='\\')escaped=true;else if(c=='"')quoted=false;continue;}if(c=='"'){quoted=true;tokens++;}else if(c=='{'||c=='['){if(++depth>32)throw new IOException("JSON 구조가 너무 깊습니다.");tokens++;}else if(c=='}'||c==']')depth--;else if(c==',')tokens++;if(tokens>200000||depth<0)throw new IOException("JSON 구조 한도를 초과했습니다.");}
        return new JSONObject(text);
    }
    static JSONObject snapshot(JSONObject object)throws Exception{
        if(!"indiff.platform-workspace".equals(object.optString("format"))||object.optInt("version")!=1||!(object.opt("workspace") instanceof JSONObject)||!(object.opt("ui") instanceof JSONObject)||object.length()!=4)throw new IOException("지원하지 않는 작업공간 형식입니다.");
        bounded(object.toString(),SNAPSHOT_LIMIT);return object;
    }
    synchronized JSONObject load()throws Exception{
        if(!workspace.getBaseFile().exists()&&!new File(workspace.getBaseFile()+".bak").exists())return new JSONObject().put("snapshot",JSONObject.NULL);
        return new JSONObject().put("snapshot",snapshot(jsonObject(readBounded(workspace.openRead(),SNAPSHOT_LIMIT),SNAPSHOT_LIMIT)));
    }
    synchronized JSONObject save(JSONObject value)throws Exception{
        byte[] bytes=bounded(snapshot(value).toString(),SNAPSHOT_LIMIT);FileOutputStream output=null;
        try{output=workspace.startWrite();output.write(bytes);workspace.finishWrite(output);return new JSONObject().put("bytes",bytes.length);}
        catch(Exception error){if(output!=null)workspace.failWrite(output);throw error;}
    }
    JSONObject picked(Uri uri,String name,String kind)throws Exception{
        String text=readBounded(resolver.openInputStream(uri),"workspace".equals(kind)?SNAPSHOT_LIMIT:TEXT_LIMIT);
        if("workspace".equals(kind))jsonObject(text,SNAPSHOT_LIMIT);
        String handle=UUID.randomUUID().toString();handles.put(handle,uri);
        return new JSONObject().put("canceled",false).put("handle",handle).put("name",name).put("text",text);
    }
    JSONObject saveUri(Uri uri,String name,String text,String kind)throws Exception{
        byte[] bytes=bounded(text,"workspace".equals(kind)?SNAPSHOT_LIMIT:TEXT_LIMIT);
        if("workspace".equals(kind))jsonObject(text,SNAPSHOT_LIMIT);
        // SAF providers do not guarantee atomic replacement; app-private autosave above does.
        try(OutputStream output=resolver.openOutputStream(uri,"wt")){if(output==null)throw new IOException("파일 저장 위치를 열 수 없습니다.");output.write(bytes);output.flush();}
        String handle=UUID.randomUUID().toString();handles.put(handle,uri);
        return new JSONObject().put("canceled",false).put("handle",handle).put("name",name).put("bytes",bytes.length);
    }
    JSONObject saveHandle(JSONObject payload)throws Exception{
        Uri uri=handles.get(payload.getString("handle"));if(uri==null)throw new IOException("파일 핸들이 만료되었습니다. 파일을 다시 선택하세요.");
        return saveUri(uri,"선택한 파일",payload.getString("text"),"text");
    }
    void clearHandles(){handles.clear();}
}
