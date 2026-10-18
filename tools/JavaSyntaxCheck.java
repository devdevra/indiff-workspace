import com.sun.source.util.JavacTask;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;
/** Syntax parser only; no Android SDK attribution or bytecode compilation. */
class JavaSyntaxCheck {
 public static void main(String[] args)throws Exception{
  JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();if(compiler==null)throw new IllegalStateException("jdk.compiler module unavailable");
  List<String> files=new ArrayList<>();for(String arg:args)try(var paths=Files.walk(Path.of(arg))){paths.filter(p->p.toString().endsWith(".java")).forEach(p->files.add(p.toString()));}
  DiagnosticCollector<JavaFileObject> diagnostics=new DiagnosticCollector<>();
  try(StandardJavaFileManager manager=compiler.getStandardFileManager(diagnostics,null,null)){
   JavacTask task=(JavacTask)compiler.getTask(null,manager,diagnostics,List.of("-proc:none"),null,manager.getJavaFileObjectsFromStrings(files));task.parse();long errors=diagnostics.getDiagnostics().stream().filter(d->d.getKind()==Diagnostic.Kind.ERROR).count();
   for(var d:diagnostics.getDiagnostics())System.out.println(d);
   System.out.println("Parsed "+files.size()+" Java source files; syntax errors="+errors+". Android/AndroidX API linkage and native runtime NOT verified.");if(errors>0)System.exit(1);
  }
 }
}
