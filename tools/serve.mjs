/** Zero-dependency development server. Only binds loopback and serves allowlisted files. */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT must be an integer from 1024 to 65535.');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.zip':'application/zip'};
const server=createServer(async(req,res)=>{try{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end()}const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const relative=requested==='/'?'index.html':requested.replace(/^\//,'');if(relative.includes('..')||relative.split('/').some(p=>p.startsWith('.'))||!(/^(?:index\.html|app\.js|styles\.css|lib\/[a-z-]+\.js|source-manifest\.json|source-text\/\d+\.txt|INDIFF_WindowsAndroid_Source_Incomplete\.zip)$/).test(relative)){res.writeHead(404);return res.end('Not found')}let filename=path.join(root,relative);if(['source-manifest.json','INDIFF_WindowsAndroid_Source_Incomplete.zip'].includes(relative)||relative.startsWith('source-text/'))filename=path.join(root,'dist',relative);const bytes=await readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes)}catch(error){res.writeHead(error.code==='ENOENT'?404:400,{'Content-Type':'text/plain; charset=utf-8'});res.end('파일이 없어요. 코드 뷰어는 npm run build 후 열 수 있어요.')}});
server.listen(port,'127.0.0.1',()=>console.log(`INDIFF UI correction: http://localhost:${port}\nCtrl+C로 종료합니다. 코드 뷰어·소스 ZIP은 npm run build로 생성합니다.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
