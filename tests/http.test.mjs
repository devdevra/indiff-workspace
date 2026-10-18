/** Starts only our independent static server in the same executor namespace. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('own static server serves allowlisted app modules and refuses private/runtime files',async()=>{
 const child=spawn(process.execPath,['tools/serve.mjs'],{cwd:root,env:{...process.env,PORT:'48178'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 try{await Promise.race([once(child.stdout,'data'),once(child,'error').then(([e])=>{throw e}),new Promise((_,r)=>setTimeout(()=>r(Error('server start timeout: '+output)),5000))]);
 const base='http://127.0.0.1:48178';let r=await fetch(base);assert.equal(r.status,200);assert.match(await r.text(),/data-theme="dark"/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 for(const name of ['app.js','styles.css','lib/core.js','lib/layout.js','lib/storage.js']){r=await fetch(base+'/'+name);assert.equal(r.status,200,name);}
 for(const name of ['server.js','.git/config','package.json','lib/missing.js']){r=await fetch(base+'/'+name);assert.equal(r.status,404,name);}
 r=await fetch(base+'/app.js',{method:'POST'});assert.equal(r.status,405);
 r=await fetch(base+'/index.html',{method:'HEAD'});assert.equal(r.status,200);assert.equal(await r.text(),'');
 }finally{child.kill('SIGTERM');await once(child,'exit').catch(()=>{});}
});
