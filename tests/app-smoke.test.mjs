/** JavaScript bootstrap/render smoke with explicit DOM stubs; NOT a browser/pixel test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('app module bootstraps and every screen renders under minimal DOM stubs, without network',async()=>{
 const original={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,CSS:globalThis.CSS,matchMedia:globalThis.matchMedia,fetch:globalThis.fetch};
 const elements=new Map(),storage=new Map();
 class El{constructor(){this.value='';this.innerHTML='';this.textContent='';this.hidden=false;this.dataset={};this.style={setProperty(){}};this.classList={toggle(){},add(){},remove(){},contains(){return false}};}querySelector(s){return get(s)}querySelectorAll(){return []}addEventListener(){}append(){}remove(){}click(){}focus(){}showModal(){this.open=true}close(){this.open=false}getBoundingClientRect(){return {width:1000,height:700,left:0,top:0}}}
 function get(s){if(!elements.has(s))elements.set(s,new El());return elements.get(s)}
 globalThis.document={querySelector:get,querySelectorAll:()=>[],body:new El(),documentElement:new El(),createElement:()=>new El(),addEventListener(){}};
 globalThis.window={addEventListener(){}};globalThis.CSS={escape:s=>String(s).replace(/["\\]/g,'\\$&')};globalThis.matchMedia=()=>({matches:false});globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};globalThis.fetch=()=>{throw Error('Network is not authorized by this local-only smoke test')};
 const dir=await mkdtemp(path.join(tmpdir(),'indiff-own-ui-smoke-'));
 let qa;
 try{const src=(await readFile(path.join(root,'app.js'),'utf8')).replaceAll("from './lib/",`from '${pathToFileURL(path.join(root,'lib/')).href}`)+`\nexport const qa={open,render,paneBody,markdown,renderLayout,renderBoard,renderTeam,renderRuns,renderAbout,exportBackup,newDocument,editNode,renderOriginalWorkflow,editOriginalCard,save,dispose:()=>{clearTimeout(saveTimer);clearTimeout(toastTimer)},getState:()=>state,getUI:()=>ui,submit:f=>dialogSubmit(f)};`;
 const filename=path.join(dir,'runtime.mjs');await writeFile(filename,src);({qa}=await import(pathToFileURL(filename)));
 assert.match(get('#panes').innerHTML,/Open it\.<br>That's enough\./);assert.match(get('#file-tree').innerHTML,/Project|INDIFF Workspace/);
 qa.open('doc_brief');assert.match(get('#panes').innerHTML,/새벽의 배달/);qa.getUI().layout.mode='edit';qa.render();assert.match(get('#panes').innerHTML,/document-editor/);
 const safe=qa.markdown('# 제목\n\n<script>globalThis.pwned=1</script>\n\n- 항목');assert.ok(safe.includes('&lt;script&gt;'));assert.ok(!safe.includes('<script>'));assert.match(safe,/<h1>제목<\/h1>/);assert.match(safe,/<ul>/);
 for(const id of ['@team','@board','@runs','@about']){qa.open(id);assert.ok(get('#panes').innerHTML.length>1000);}
 assert.match(qa.renderTeam(),/외부 전송 없음/);assert.match(qa.renderBoard(),/bd-edge/);assert.match(qa.renderAbout(),/EXE/);assert.match(qa.renderAbout(),/APK/);
 qa.newDocument();const form=new FormData();form.set('path','NewFolder/테스트.md');qa.submit(form);qa.save();qa.render();assert.equal(qa.getState().documents.length,4);assert.ok(Object.values(qa.getUI().paths).includes('NewFolder/테스트.md'));assert.match(get('#panes').innerHTML,/테스트/);
 qa.editNode();const nodeForm=new FormData();nodeForm.set('title','추가 노드');nodeForm.set('kind','input');nodeForm.set('agentId','');qa.submit(nodeForm);qa.save();assert.equal(qa.getState().workflow.nodes.length,6);
 const saved=JSON.parse(storage.get('indiff.original-ui.workspace.v1'));assert.equal(saved.documents.length,4);assert.ok(!storage.has('indiff.workspace.v1'));assert.equal(globalThis.pwned,undefined);
 const originalFixture=await readFile(path.join(root,'tests/fixtures/original-workflow.json'),'utf8');
 await get('#text-import').onchange({target:{files:[{name:'original.workflow.json',size:Buffer.byteLength(originalFixture),text:async()=>originalFixture}],value:''}});
 const originalDoc=qa.getState().documents.at(-1);assert.ok(Object.values(qa.getUI().paths).includes('workflows/original.workflow.json'));assert.match(qa.renderOriginalWorkflow(originalDoc),/original-card/);assert.equal(JSON.parse(originalDoc.body).cards[0].vendor_extension.keep,true);
 qa.editOriginalCard(originalDoc,'reader');const editOriginal=new FormData();for(const [key,value] of Object.entries({title:'원본 수정',does:'하는 일',prompt:'지시',format:'목록',mode:'plan'}))editOriginal.set(key,value);qa.submit(editOriginal);qa.save();assert.equal(JSON.parse(originalDoc.body).cards[0].title,'원본 수정');assert.equal(JSON.parse(originalDoc.body).cards[0].vendor_extension.keep,true);
 
 }finally{qa?.dispose();await rm(dir,{recursive:true,force:true});Object.assign(globalThis,original);}
});
