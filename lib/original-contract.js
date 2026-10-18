/** Independently written, JSON-only adapter based on static contract inspection.
 * Original card/edge/file fields stay distinct from the local-demo execution model.
 * This module never resolves folders, executes nodes or migrates an original file.
 */
export const ORIGINAL_JSON_LIMIT=1024*1024;
const knownKinds=new Set(['claude','role','session','trigger','read','folder','write','http','shell','if','wait']);
const clone=value=>structuredClone(value);
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const fail=message=>{throw Error('원본 JSON: '+message);};
/** JSON.parse alone silently overwrites duplicate keys. Detect those before accepting a file. */
export function parseOriginalJSON(source){
 if(typeof source!=='string'||new TextEncoder().encode(source).length>ORIGINAL_JSON_LIMIT)fail('UTF-8 JSON은 1MiB 이하여야 합니다.');
 const text=source.replace(/^\uFEFF/,''),data=JSON.parse(text);let at=0,count=0;
 const white=()=>{while(/\s/u.test(text[at]||'')&&at<text.length)at++;};
 function string(){const start=at++;while(at<text.length){if(text[at]==='\\'){at+=2;continue;}if(text[at++]==='"')return JSON.parse(text.slice(start,at));}fail('문자열이 끝나지 않았습니다.');}
 function value(depth){if(++count>20000||depth>20)fail('JSON 구조 한도를 초과했습니다.');white();const c=text[at];
  if(c==='{'){at++;white();const keys=new Set();if(text[at]==='}'){at++;return;}while(at<text.length){white();const key=string();if(keys.has(key))fail('중복 키는 무손실로 해석할 수 없습니다: '+key);if(['__proto__','prototype','constructor'].includes(key))fail('지원하지 않는 객체 키입니다: '+key);keys.add(key);white();at++;value(depth+1);white();if(text[at++]==='}')return;} }
  else if(c==='['){at++;white();if(text[at]===']'){at++;return;}while(at<text.length){value(depth+1);white();if(text[at++]===']')return;}}
  else if(c==='"')string();else{const start=at;while(at<text.length&&!/[\s,}\]]/u.test(text[at]))at++;if(start===at)fail('값이 없습니다.');const scalar=JSON.parse(text.slice(start,at));if(typeof scalar==='number'&&!Number.isFinite(scalar))fail('유한한 숫자만 지원합니다.');}
 }
 value(0);return data;
}
export function parseOriginalWorkflow(source){const document=parseOriginalJSON(source);inspectOriginalWorkflow(document);return document;}
export function serializeOriginalWorkflow(document){inspectOriginalWorkflow(document);const result=JSON.stringify(document,null,2)+'\n';parseOriginalJSON(result);return result;}
export function inspectOriginalWorkflow(document){
 function jsonSafe(value,depth=0,seen=new Set()){if(depth>20)fail('JSON 구조 깊이를 초과했습니다.');if(value===null||typeof value==='string'||typeof value==='boolean')return;if(typeof value==='number'&&Number.isFinite(value))return;if(!value||typeof value!=='object'||(!Array.isArray(value)&&!plain(value))||seen.has(value))fail('원본 필드에 JSON으로 보존할 수 없는 값이 있습니다.');seen.add(value);for(const key of Object.keys(value)){if(['__proto__','prototype','constructor'].includes(key))fail('지원하지 않는 객체 키입니다.');jsonSafe(value[key],depth+1,seen);}seen.delete(value);}
 jsonSafe(document);
 if(!plain(document)||!Array.isArray(document.cards)||!Array.isArray(document.links))fail('워크플로에는 cards와 links 배열이 필요합니다.');
 if(document.cards.length>100||document.links.length>500)fail('카드 100개·연결 500개 한도입니다.');
 if(document.name!==undefined&&typeof document.name!=='string')fail('name은 문자열이어야 합니다.');
 const ids=new Set(),nodes=[],edges=[],warnings=[];
 for(const card of document.cards){if(!plain(card)||typeof card.id!=='string'||!card.id||card.id.length>128||ids.has(card.id))fail('카드 ID가 없거나 중복됐습니다.');ids.add(card.id);
  for(const key of ['title','does','role','folder','prompt','format','mode','type','session'])if(card[key]!==undefined&&typeof card[key]!=='string')fail(`카드 ${card.id}의 ${key}은 문자열이어야 합니다.`);
  const kind=(card.type||(card.session?'session':'claude')).toLowerCase(),position=document.layout?.[card.id];if(position!==undefined&&(!Array.isArray(position)||position.length!==2||position.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1000000)))fail('카드 위치가 올바르지 않습니다.');
  const node={id:card.id,title:card.title||card.id,does:card.does??card.role??'',kind,folder:card.folder||'.',position:position?[...position]:null,execution:'disconnected',supportedForExecution:false,knownKind:knownKinds.has(kind)};
  if(!node.knownKind)warnings.push(`알 수 없는 노드 종류 ${kind}: 원본 필드는 보존하고 실행하지 않습니다.`);
  if(/^(?:[a-z]:|[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/i.test(node.folder))warnings.push(`카드 ${card.id}의 폴더 참조는 보존만 합니다. 접근 권한을 만들지 않습니다.`);
  nodes.push(node);
 }
 if(document.layout!==undefined&&!plain(document.layout))fail('layout은 객체여야 합니다.');
 function edge(from,to,label=''){if(typeof from!=='string'||typeof to!=='string'||typeof label!=='string')fail('연결 필드 형식이 올바르지 않습니다.');const branch=/^(.*):(yes|no)$/.exec(from.trim()),source=branch?branch[1]:from.trim(),target=to.trim();if(!ids.has(source)||!ids.has(target))fail('존재하지 않는 카드를 연결합니다.');edges.push({id:`edge_${edges.length}`,from:source,to:target,port:branch?.[2]||'',label});}
 for(const link of document.links){if(typeof link==='string'){const match=/^(.+?)\s*->\s*(.+)$/.exec(link);if(!match)fail('연결 화살표를 읽을 수 없습니다.');let to=match[2].trim(),label='';if(!ids.has(to)){const labeled=/^([^:]+):\s*(.*)$/.exec(to);if(labeled&&ids.has(labeled[1].trim())){to=labeled[1].trim();label=labeled[2];}}edge(match[1],to,label);}
  else if(plain(link)&&link.from!==undefined)edge(link.from,link.to,link.label??'');
  else if(plain(link)&&Object.keys(link).length===1){const [route,label]=Object.entries(link)[0],match=/^(.+?)\s*->\s*(.+)$/.exec(route);if(!match)fail('연결 화살표를 읽을 수 없습니다.');edge(match[1],match[2],label);}
  else fail('지원하지 않는 연결 형식입니다.');
 }
 return {name:document.name||'이름 없는 원본 워크플로',nodes,edges,warnings,execution:{allowed:false,reason:'원본 노드는 AI·CLI·네트워크 실행이 미연결입니다. 로컬 규칙 노드로 변환하지 않습니다.'},sourceOfTruth:'project/workflows/*.workflow.json',uiStateFile:'.indiff-workflows.json'};
}
export function updateOriginalCard(document,id,patch){inspectOriginalWorkflow(document);if(!plain(patch)||Object.keys(patch).some(k=>!['title','does','prompt','format','mode'].includes(k)))fail('지원하지 않는 카드 편집입니다.');const next=clone(document),card=next.cards.find(c=>c.id===id);if(!card)fail('카드를 찾을 수 없습니다.');Object.assign(card,clone(patch));inspectOriginalWorkflow(next);return next;}
export function updateOriginalPosition(document,id,position){inspectOriginalWorkflow(document);if(!document.cards.some(c=>c.id===id))fail('카드를 찾을 수 없습니다.');const next=clone(document);next.layout??={};next.layout[id]=clone(position);inspectOriginalWorkflow(next);return next;}
export function originalFileKind(filename){if(/\.workflow\.json$/i.test(filename))return 'workflow';if(/\.workflow\.ya?ml$/i.test(filename))return 'yaml-unsupported';if(filename==='.indiff-workflows.json')return 'workflow-view-state';if(filename==='.indiff.json')return 'project-registry';return 'unsupported';}
export function parseOriginalProjectState(source,filename){const kind=originalFileKind(filename);if(!['workflow-view-state','project-registry'].includes(kind))fail('프로젝트/UI 상태 파일 종류가 아닙니다.');const data=parseOriginalJSON(source);if(!plain(data))fail('상태는 객체여야 합니다.');if(kind==='project-registry'&&(!Array.isArray(data.roots)||data.roots.some(r=>typeof r!=='string')))fail('roots 배열이 필요합니다.');if(kind==='workflow-view-state'){for(const field of ['views','active','fires'])if(data[field]!==undefined&&!plain(data[field]))fail(field+'는 객체여야 합니다.');if(data.current!==undefined&&typeof data.current!=='string')fail('current는 문자열이어야 합니다.');}return {kind,data,executionAllowed:false,importPolicy:'preserve-only; no folders registered; no triggers activated'};}
