/** Capability-limited native transport. No HTTP, credentials, shell or model APIs. */
import {parseState,serializeState,MAX_BACKUP_BYTES} from './storage.js';
import {validateUI} from './layout.js';
export const PLATFORM_FORMAT='indiff.platform-workspace';
export const MAX_SNAPSHOT_BYTES=MAX_BACKUP_BYTES+2*1024*1024;
const bytes=s=>new TextEncoder().encode(s).length;
export function snapshotOf(workspace,ui){
  const safeWorkspace=parseState(serializeState(workspace));
  validateUI(ui,safeWorkspace.documents,safeWorkspace.workflow.nodes);
  const snapshot={format:PLATFORM_FORMAT,version:1,workspace:safeWorkspace,ui:structuredClone(ui)};
  if(bytes(JSON.stringify(snapshot))>MAX_SNAPSHOT_BYTES)throw Error('플랫폼 작업공간 한도 7MiB를 초과했습니다.');
  return snapshot;
}
export function parseSnapshot(value){
  if(!value||value.format!==PLATFORM_FORMAT||value.version!==1)throw Error('지원하지 않는 플랫폼 작업공간입니다.');
  if(Object.keys(value).some(k=>!['format','version','workspace','ui'].includes(k)))throw Error('알 수 없는 플랫폼 스냅샷 필드입니다.');
  return snapshotOf(value.workspace,value.ui);
}
export function createAndroidTransport(bridge,{timeoutMs=120000}={}){
  let sequence=0;const pending=new Map();
  bridge.onmessage=event=>{let data;try{data=JSON.parse(event.data);}catch{return;}const entry=pending.get(data.id);if(!entry)return;pending.delete(data.id);clearTimeout(entry.timer);entry.resolve(data.result);};
  return {invoke(method,payload={}){return new Promise((resolve,reject)=>{const id=`request_${++sequence}`,timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(Error('기기 응답이 지연됐습니다. 파일 선택 화면과 저장 상태를 확인하세요.'),{code:'host.timeout'}));},timeoutMs);pending.set(id,{resolve,reject,timer});try{bridge.postMessage(JSON.stringify({id,method,payload}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}};
}
export function createPlatform(scope=globalThis){
  const window=scope.window||scope;
  const native=window.indiffNative|| (window.IndiffBridge?.postMessage?createAndroidTransport(window.IndiffBridge):null);
  async function invoke(method,payload={}){
    if(!native)throw Object.assign(Error('브라우저에서는 네이티브 기능을 사용할 수 없습니다.'),{code:'host.unavailable'});
    const result=await native.invoke(method,payload);
    if(!result||typeof result.ok!=='boolean')throw Error('네이티브 응답 형식이 올바르지 않습니다.');
    if(!result.ok)throw Object.assign(Error(result.error?.message||'기기 작업을 완료하지 못했습니다.'),{code:result.error?.code||'host.failed'});
    return result.value;
  }
  return Object.freeze({native:!!native,invoke,info:()=>native?invoke('host.info'):Promise.resolve({platform:'web',ai:false,connection:'disconnected'}),async connection(){if(!native)return {state:'disconnected',configured:false};const result=await invoke('host.connection');return {...result,state:result.state||result.status||'disconnected',configured:!!result.configured};},
    async loadWorkspace(){const result=await invoke('workspace.load');return result.snapshot===null?null:parseSnapshot(result.snapshot);},
    saveWorkspace:(workspace,ui)=>invoke('workspace.save',{snapshot:snapshotOf(workspace,ui)}),
    pickFile:(kind='text')=>invoke('file.pick',{kind}),saveText:(name,text,kind='text')=>invoke('file.saveAs',{name,text,kind}),
  });
}
/** Serialize writes and coalesce pending snapshots; never let an old save overwrite a new save. */
export function createPersistenceQueue(platform,onStatus=()=>{}){
  let pending=null,running=false,revision=0,settled=Promise.resolve();
  async function drain(){running=true;while(pending){const item=pending;pending=null;try{await platform.invoke('workspace.save',{snapshot:item.snapshot});if(!pending)onStatus({state:'saved',revision:item.revision});}catch(error){onStatus({state:'error',revision:item.revision,error});}}running=false;}
  return {enqueue(workspace,ui){const snapshot=snapshotOf(workspace,ui);pending={snapshot,revision:++revision};onStatus({state:'saving',revision});if(!running)settled=drain();return revision;},flush(){return settled;}};
}
