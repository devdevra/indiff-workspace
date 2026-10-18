package app.indiff.port;

import android.app.Activity;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.*;
import android.widget.TextView;
import androidx.webkit.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Native Android host. All execution/model/remote-host capabilities stay disconnected. */
public final class MainActivity extends Activity {
    private static final String ORIGIN="https://appassets.androidplatform.net";
    private static final String ENTRY=ORIGIN+"/assets/web/index.html";
    private static final String CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    private static final int PICK=31,CREATE=32;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private WebView web;private NativeFiles files;private Pending pending;private boolean destroyed;
    private static final class Pending {
        final String id,kind,text;final JavaScriptReplyProxy reply;
        Pending(String id,String kind,String text,JavaScriptReplyProxy reply){this.id=id;this.kind=kind;this.text=text;this.reply=reply;}
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);files=new NativeFiles(getFilesDir(),getContentResolver());
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){showFailure("Android System WebView 업데이트 후 다시 여세요. 안전한 네이티브 브리지가 지원되지 않습니다.");return;}
        web=new WebView(this);WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setMediaPlaybackRequiresUserGesture(true);settings.setGeolocationEnabled(false);
        final WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClientCompat(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !ENTRY.equals(request.getUrl().toString());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                String url=request.getUrl().toString();String pathname=request.getUrl().getPath();
                // Exact asset allowlist. No fallback request is ever allowed to reach the network.
                if("GET".equals(request.getMethod())&&url.startsWith(ORIGIN+"/assets/web/")&&pathname!=null&&pathname.matches("/assets/web/(index\\.html|styles\\.css|app\\.js|lib/[a-z-]+\\.js)")){
                    WebResourceResponse response=loader.shouldInterceptRequest(request.getUrl());
                    if(response!=null){Map<String,String> headers=new HashMap<>();headers.put("Content-Security-Policy",CSP);headers.put("X-Content-Type-Options","nosniff");headers.put("Cache-Control","no-store");response.setResponseHeaders(headers);return response;}
                }
                return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();}
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){files.clearHandles();view.destroy();web=null;showFailure("화면 프로세스가 종료되었습니다. 앱을 다시 열면 마지막 네이티브 저장본을 읽습니다.");return true;}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
            @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){callback.invoke(origin,false,false);}
            @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result){if(!ENTRY.equals(url)){result.cancel();return true;}return super.onJsAlert(view,url,message,result);}
        });
        WebViewCompat.addWebMessageListener(web,"IndiffBridge",Collections.singleton(ORIGIN),(view,message,sourceOrigin,isMainFrame,reply)->{
            if(!isMainFrame||!ORIGIN.equals(sourceOrigin.toString())||!ENTRY.equals(view.getUrl()))return;
            String id="";try{
                String raw=message.getData();if(raw==null||raw.length()>NativeFiles.SNAPSHOT_LIMIT*2+65536)throw new IOException("요청이 너무 큽니다.");
                JSONObject request=NativeFiles.jsonObject(raw,NativeFiles.SNAPSHOT_LIMIT*2+65536);id=request.getString("id");if(!id.matches("request_[0-9]{1,15}"))throw new IOException("잘못된 요청 ID입니다.");
                dispatch(id,request.getString("method"),request.optJSONObject("payload")==null?new JSONObject():request.getJSONObject("payload"),reply);
            }catch(Exception error){respond(reply,id,null,"host.invalid",error.getMessage());}
        });
        setContentView(web);web.loadUrl(ENTRY);
    }
    private void dispatch(String id,String method,JSONObject payload,JavaScriptReplyProxy reply)throws Exception{
        switch(method){
            case "host.info":respond(reply,id,new JSONObject().put("platform","android").put("version",1).put("ai",false).put("nativeFiles",true).put("connection","disconnected"),null,null);break;
            case "host.connection":respond(reply,id,new JSONObject().put("state","disconnected").put("configured",false).put("protocol","indiff-host-v1").put("reason","Windows 호스트 페어링·동기화는 아직 연결되지 않았습니다."),null,null);break;
            case "workspace.load":io.execute(()->execute(reply,id,()->files.load()));break;
            case "workspace.save":{JSONObject snapshot=payload.getJSONObject("snapshot");io.execute(()->execute(reply,id,()->files.save(snapshot)));break;}
            case "file.pick":startPicker(id,payload,reply,false);break;
            case "file.saveAs":startPicker(id,payload,reply,true);break;
            case "file.save":io.execute(()->execute(reply,id,()->files.saveHandle(payload)));break;
            default:respond(reply,id,null,"host.unsupported","지원하지 않는 네이티브 기능입니다. AI·CLI·호스트 연결은 미연결입니다.");
        }
    }
    private void startPicker(String id,JSONObject payload,JavaScriptReplyProxy reply,boolean write)throws Exception{
        if(pending!=null){respond(reply,id,null,"host.busy","열린 파일 선택 화면을 먼저 마치세요.");return;}
        String kind=payload.optString("kind","text");if(!kind.equals("text")&&!kind.equals("workspace"))throw new IOException("지원하지 않는 파일 종류입니다.");
        String text=write?payload.getString("text"):null;
        if(write){NativeFiles.bounded(text,kind.equals("workspace")?NativeFiles.SNAPSHOT_LIMIT:NativeFiles.TEXT_LIMIT);if(kind.equals("workspace"))NativeFiles.jsonObject(text,NativeFiles.SNAPSHOT_LIMIT);}
        Intent intent=new Intent(write?Intent.ACTION_CREATE_DOCUMENT:Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType(write?(kind.equals("workspace")?"application/json":"text/plain"):"*/*");
        if(!write)intent.putExtra(Intent.EXTRA_MIME_TYPES,kind.equals("workspace")?new String[]{"application/json","text/plain"}:new String[]{"text/plain","text/markdown","application/json"});
        if(write){String name=payload.optString("name",kind.equals("workspace")?"indiff-workspace.json":"document.md").replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_");if(name.length()>150)name=name.substring(0,150);intent.setType(name.toLowerCase(Locale.ROOT).endsWith(".json")?"application/json":"text/plain");intent.putExtra(Intent.EXTRA_TITLE,name);}
        pending=new Pending(id,kind,text,reply);
        try{startActivityForResult(intent,write?CREATE:PICK);}catch(Exception error){pending=null;throw error;}
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);if(requestCode!=PICK&&requestCode!=CREATE)return;Pending item=pending;pending=null;if(item==null)return;
        if(resultCode!=RESULT_OK||data==null||data.getData()==null){try{respond(item.reply,item.id,new JSONObject().put("canceled",true),null,null);}catch(Exception ignored){}return;}
        Uri uri=data.getData();if(!"content".equals(uri.getScheme())){respond(item.reply,item.id,null,"file.invalid","문서 제공자가 반환한 위치를 사용할 수 없습니다.");return;}
        io.execute(()->execute(item.reply,item.id,()->{String name=displayName(uri);return requestCode==PICK?files.picked(uri,name,item.kind):files.saveUri(uri,name,item.text,item.kind);}));
    }
    private String displayName(Uri uri){try(Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())return cursor.getString(0);}catch(Exception ignored){}return "document.md";}
    private interface Work {JSONObject run()throws Exception;}
    private void execute(JavaScriptReplyProxy reply,String id,Work work){try{respond(reply,id,work.run(),null,null);}catch(Exception error){respond(reply,id,null,"host.io","기기 작업 실패: "+error.getClass().getSimpleName()+". 원본은 보존하고 백업을 확인하세요.");}}
    private void respond(JavaScriptReplyProxy reply,String id,JSONObject value,String code,String message){
        try{JSONObject result=new JSONObject().put("ok",code==null);if(code==null)result.put("value",value==null?JSONObject.NULL:value);else result.put("error",new JSONObject().put("code",code).put("message",message==null?"요청을 완료하지 못했습니다.":message));String encoded=new JSONObject().put("id",id).put("result",result).toString();runOnUiThread(()->{if(!destroyed)reply.postMessage(encoded);});}catch(Exception ignored){}
    }
    private void showFailure(String message){TextView text=new TextView(this);text.setText(message);text.setTextColor(0xfffafafa);text.setBackgroundColor(0xff09090b);text.setPadding(32,64,32,32);setContentView(text);}
    @Override public void onBackPressed(){
        if(web==null){super.onBackPressed();return;}
        web.evaluateJavascript("(()=>{const dialogs=[...document.querySelectorAll('dialog[open]')];if(dialogs.length){dialogs[dialogs.length-1].close();return true;}if(document.body.classList.contains('mobile-tree-open')){document.body.classList.remove('mobile-tree-open');return true;}window.dispatchEvent(new Event('indiff-native-pause'));return false;})()",handled->{if(!"true".equals(handled))finishBack();});
    }
    private void finishBack(){super.onBackPressed();}
    @Override protected void onPause(){if(web!=null){web.evaluateJavascript("window.dispatchEvent(new Event('indiff-native-pause'))",null);web.onPause();}super.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){destroyed=true;pending=null;files.clearHandles();io.shutdown();if(web!=null){web.stopLoading();web.destroy();web=null;}super.onDestroy();}
}
