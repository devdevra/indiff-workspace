/**
 * Original, dependency-free local workspace domain logic.
 * Nothing in this module calls a model, network, storage API, or third party.
 * Workflow outputs are deterministic text transformations, not AI responses.
 */

const KINDS = new Set(['input', 'extract', 'draft', 'review', 'merge']);
const now = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const asText = (value) => typeof value === 'string' ? value : value == null ? '' : String(value);
// Byte limits include structured-data duplication, not merely visible output.
const NODE_BUDGET_BYTES = 20 * 1024;
const RUN_BUDGET_BYTES = 80 * 1024;
const INPUT_BUDGET_BYTES = 64 * 1024;
const LEDGER_BUDGET_BYTES = 4096;
const STEP_ERROR_BYTES = 384;
const encoder = new TextEncoder();
const jsonBytes = (value) => encoder.encode(JSON.stringify(value)).byteLength;
const budgetError = () => new Error('로컬 실행 용량 한도를 초과했습니다. 문서 내용이나 병합 단계를 줄여 다시 실행해 주세요.');
function textBytes(text, limit = Infinity) {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > limit) return bytes;
  }
  return bytes;
}
function boundedJoin(parts, separator, limit) {
  let size = Math.max(0, parts.length - 1) * textBytes(separator);
  for (const part of parts) {
    size += textBytes(part, limit);
    if (size > limit) throw budgetError();
  }
  return parts.join(separator);
}
function shortError(error) {
  let message = Array.from(asText(error?.message || error)).slice(0, 128).join('');
  while (jsonBytes(message) > STEP_ERROR_BYTES) message = Array.from(message).slice(0, -1).join('');
  return message;
}
function nodeBudget(result) {
  if (textBytes(result.output, NODE_BUDGET_BYTES) > NODE_BUDGET_BYTES || jsonBytes(result) > NODE_BUDGET_BYTES) throw budgetError();
  return result;
}
let sequence = 0;

export function uid(prefix = 'item') {
  const safe = asText(prefix).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'item';
  const random = globalThis.crypto?.randomUUID?.();
  sequence += 1;
  return `${safe}_${random || `${Date.now().toString(36)}_${sequence.toString(36)}`}`;
}

/** Return a fresh, independently editable Korean creative-project example. */
export function makeInitialState() {
  const updatedAt = now();
  return {
    version: 1,
    documents: [
      {
        id: 'doc_brief', title: '새벽의 배달 · 프로젝트 브리프',
        body: '# 새벽의 배달\n\n비가 그친 새벽, 마지막 배달을 앞둔 라이더 수연이 오래된 사진관에서 작은 소포를 받는다. 소포의 수신인은 20년 전의 자신이다.\n\n## 기획 의도\n빠른 도시의 리듬 속에서 잊고 지낸 기억을 마주하는 60초 감성 단편. 관객이 마지막 한 컷에서 인물의 선택을 이해하도록 만든다.\n\n## 제작 기준\n러닝타임 60초, 총 6개 숏. 새벽의 청록빛과 사진관의 따뜻한 주황빛을 대비한다. 대사는 마지막 한 문장만 사용한다.\n\n## 주요 장면\n1. 젖은 도로를 달리는 라이더의 바퀴 클로즈업.\n2. 불이 켜진 사진관 앞에서 라이더가 멈춘다.\n3. 주인이 낡은 소포를 건넨다.\n4. 소포 안에는 어린 수연의 사진과 편지가 들어 있다.\n5. 라이더가 헬멧을 벗고 사진관 안으로 들어간다.\n6. 창 너머 두 사람의 실루엣과 함께 새벽이 밝아 온다.\n\n## 확인할 점\n사진 소품의 시대감과 젖은 노면의 반사를 확인한다. 실제 제작 전 초상권과 촬영 허가는 별도 확인한다.',
        tags: ['브리프', '단편', '프리비스'], updatedAt, notes: [
          {id: 'note_brief', text: '마지막 장면의 감정이 먼저 읽히는지 확인하기.', createdAt: updatedAt},
        ],
      },
      {
        id: 'doc_shots', title: '6개 숏 · 스토리보드 노트',
        body: '# 스토리보드 노트\n\nS01 · 0–8초 · 로우 앵글, 바퀴를 따라가는 트래킹. 물웅덩이에 간판 빛이 흔들린다.\n\nS02 · 8–17초 · 사진관 와이드. 라이더가 프레임 오른쪽에서 멈춘다. 음악이 잠깐 비워진다.\n\nS03 · 17–27초 · 손과 소포의 인서트. 종이 표면의 물방울과 오래된 주소를 보여 준다.\n\nS04 · 27–39초 · 사진을 바라보는 수연의 클로즈업. 시선 이동 뒤에 짧은 호흡을 둔다.\n\nS05 · 39–51초 · 문 안쪽에서 바라본 미디엄 숏. 헬멧을 벗는 동작이 선택의 순간이 된다.\n\nS06 · 51–60초 · 창 밖 고정 와이드. 대사: “이제야 도착했네요.” 청록빛 새벽에 주황빛이 남는다.\n\n사운드: 빗물 떨어지는 소리, 자전거 체인, 종이의 마찰음. 음악은 S05부터 얇게 다시 들어온다.',
        tags: ['스토리보드', '6개 숏', '연출'], updatedAt, notes: [],
      },
      {
        id: 'doc_checklist', title: '프리비스 · 검토 체크리스트',
        body: '# 프리비스 검토\n\n- 각 숏의 길이 합계가 60초인지 확인한다.\n- 라이더의 진행 방향과 시선 연결을 유지한다.\n- 사진의 내용이 화면에서 읽히는 시간을 확보한다.\n- 청록색 외부와 주황색 내부의 대비를 유지한다.\n- 자동 검사 결과 이후에 연출자가 감정과 리듬을 직접 검토한다.\n\n이 작업공간의 실행은 브라우저 안에서 동작하는 규칙 기반 로컬 데모다. AI 모델과 외부 서비스는 연결되어 있지 않다.',
        tags: ['검토', '제작'], updatedAt, notes: [],
      },
    ],
    agents: [
      {id: 'agent_editor', name: '지우', role: '기획 정리', instructions: '원문에서 기획 의도와 제작 조건을 먼저 확인한다. 없는 사실은 추가하지 않는다.', model: '미연결'},
      {id: 'agent_story', name: '서윤', role: '스토리 구성', instructions: '원문 문장을 근거로 장면 순서를 정리한다. 대사와 감정을 임의로 만들어 내지 않는다.', model: '미연결'},
      {id: 'agent_review', name: '도현', role: '제작 검토', instructions: '입력과 초안의 존재, 의존 단계 완료 여부를 확인한다. 최종 연출 판단은 사람이 한다.', model: '미연결'},
    ],
    tasks: [
      {id: 'task_brief', title: '브리프의 제작 조건 정리', agentId: 'agent_editor', status: 'done', documentId: 'doc_brief'},
      {id: 'task_shots', title: '6개 숏의 시선 연결 검토', agentId: 'agent_story', status: 'in-progress', documentId: 'doc_shots'},
      {id: 'task_review', title: '60초 프리비스 검토', agentId: 'agent_review', status: 'todo', documentId: 'doc_checklist'},
    ],
    workflow: {
      id: 'workflow_storyboard', title: '브리프에서 스토리보드까지', nodes: [
        {id: 'node_input', title: '문서 불러오기', kind: 'input', agentId: 'agent_editor', dependsOn: [], required: true},
        {id: 'node_extract', title: '핵심 내용 추출', kind: 'extract', agentId: 'agent_editor', dependsOn: ['node_input'], required: true},
        {id: 'node_draft', title: '구성 초안 정리', kind: 'draft', agentId: 'agent_story', dependsOn: ['node_extract'], required: true},
        {id: 'node_review', title: '입력·초안 자동 검사', kind: 'review', agentId: 'agent_review', dependsOn: ['node_draft'], required: true},
        {id: 'node_merge', title: '검사 결과 병합', kind: 'merge', agentId: 'agent_editor', dependsOn: ['node_draft', 'node_review'], required: true},
      ],
    },
    runs: [], activeDocumentId: 'doc_brief',
  };
}

/** Stable topological ordering. Invalid graphs never receive an executable order. */
export function validateWorkflow(workflow) {
  const errors = [];
  if (!workflow || typeof workflow !== 'object' || !Array.isArray(workflow.nodes)) {
    return {ok: false, errors: ['워크플로의 nodes 배열이 필요합니다.'], order: []};
  }
  // Array.from also exposes sparse slots as invalid nodes instead of skipping them.
  const nodes = Array.from(workflow.nodes);
  if (!nodes.length) return {ok: false, errors: ['워크플로에 노드를 한 개 이상 추가하세요.'], order: []};
  if (nodes.length > 100) return {ok: false, errors: ['워크플로는 최대 100개 노드까지 실행할 수 있습니다.'], order: []};
  const ids = new Set();
  nodes.forEach((node, index) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push(`${index + 1}번째 노드 형식이 올바르지 않습니다.`);
      return;
    }
    if (typeof node.id !== 'string' || !node.id.trim()) errors.push(`${index + 1}번째 노드에 유효한 ID가 필요합니다.`);
    else if (node.id.length > 128) errors.push(`${index + 1}번째 노드 ID는 128자 이하여야 합니다.`);
    else if (ids.has(node.id)) errors.push(`중복 노드 ID: ${node.id}`);
    else ids.add(node.id);
    if (typeof node.title !== 'string' || !node.title.trim()) errors.push(`${node.id || index + 1}: 노드 이름이 필요합니다.`);
    else if (node.title.length > 240) errors.push(`${index + 1}번째 노드 이름은 240자 이하여야 합니다.`);
    if (!KINDS.has(node.kind)) errors.push(`${node.id || index + 1}: 지원하지 않는 단계 종류입니다.`);
    if (!Array.isArray(node.dependsOn)) errors.push(`${node.id || index + 1}: dependsOn 배열이 필요합니다.`);
    if (node.required !== undefined && typeof node.required !== 'boolean') errors.push(`${node.id || index + 1}: required는 true 또는 false여야 합니다.`);
  });
  nodes.forEach((node) => {
    if (!node || !Array.isArray(node.dependsOn)) return;
    const seen = new Set();
    node.dependsOn.forEach((id) => {
      if (typeof id !== 'string' || !ids.has(id)) errors.push(`${node.id}: 존재하지 않는 의존 노드 ${asText(id) || '(빈 ID)'}`);
      if (id === node.id) errors.push(`${node.id}: 자기 자신을 의존할 수 없습니다.`);
      if (seen.has(id)) errors.push(`${node.id}: 중복 의존 노드 ${asText(id)}`);
      seen.add(id);
    });
    if (node.kind === 'merge' && !node.dependsOn.length) errors.push(`${node.id}: 병합에는 한 개 이상의 의존 단계가 필요합니다.`);
  });
  if (errors.length) return {ok: false, errors, order: []};
  const remaining = new Set(nodes.map((node) => node.id));
  const order = [];
  while (remaining.size) {
    const next = nodes.find((node) => remaining.has(node.id) && node.dependsOn.every((id) => !remaining.has(id)));
    if (!next) {
      errors.push(`순환 의존 관계가 있습니다: ${[...remaining].join(', ')}`);
      return {ok: false, errors, order: []};
    }
    order.push(next.id);
    remaining.delete(next.id);
  }
  return {ok: true, errors: [], order};
}

export function textStats(text) {
  const value = asText(text);
  const normalized = value.replace(/\r\n|\r/gu, '\n');
  const trimmed = normalized.trim();
  const words = trimmed ? (trimmed.match(/\S+/gu) || []).length : 0;
  return {
    characters: Array.from(value).length,
    words,
    lines: value ? value.split(/\r\n|\r|\n/u).length : 0,
    paragraphs: trimmed ? trimmed.split(/\n\s*\n/u).filter((part) => part.trim()).length : 0,
    readingMinutes: words ? Math.max(1, Math.ceil(words / 220)) : 0,
  };
}

const sentences = (text) => asText(text).replace(/^\s{0,3}#{1,6}\s+/gm, '').split(/(?<=[.!?。！？])\s+|[\r\n]+/u).map((line) => line.trim()).filter(Boolean);

/** Extractive preview: first three non-empty sentences/lines, never invented text. */
export function summarizeText(text) {
  const parts = sentences(text).slice(0, 3);
  if (!parts.length) return '문서 내용이 비어 있습니다.';
  const result = parts.join(' ');
  return Array.from(result).length > 360 ? `${Array.from(result).slice(0, 357).join('')}…` : result;
}

export function safeFilename(name) {
  let result = asText(name).normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-').replace(/\s+/gu, ' ').replace(/^[.\s-]+|[.\s-]+$/gu, '');
  if (!result) return 'document';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(result)) result = `_${result}`;
  result = Array.from(result).slice(0, 96).join('').replace(/[.\s-]+$/gu, '');
  return result || 'document';
}

const STOPWORDS = new Set(['그리고', '하지만', '위해', '대한', '있는', '한다', '않는다', '합니다', '이후', '함께', '모든', 'the', 'and', 'with', 'this', 'that', 'from', 'into', 'for', 'are', 'was']);
function keywords(text) {
  const counts = new Map();
  for (const token of asText(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
    if (Array.from(token).length < 2 || STOPWORDS.has(token) || /^\d+$/u.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, 12).map(([word, count]) => ({word, count}));
}

function abortError() {
  const error = new Error('사용자가 실행을 중지했습니다.');
  error.name = 'AbortError';
  return error;
}
function checkAbort(signal) { if (signal?.aborted) throw abortError(); }
function delay(ms, signal) {
  checkAbort(signal);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, {once: true});
  });
}

function processNode(node, documents, dependencySteps, ancestorSteps) {
  if (node.kind === 'merge') {
    // Validate and estimate BEFORE building repeated dependency artifacts. A DAG
    // can otherwise grow exponentially even with a very small source document.
    if (!dependencySteps.length || dependencySteps.some((step) => step.status !== 'completed')) throw new Error('모든 의존 단계가 성공해야 병합할 수 있습니다.');
    if (dependencySteps.some((step) => step.kind === 'review' && step.data?.passed !== true)) throw new Error('자동 검사 승인이 없는 결과는 병합할 수 없습니다.');
    let estimated = 2048 + jsonBytes(node.title) * 2;
    for (const step of dependencySteps) {
      estimated += (jsonBytes(step.title) + jsonBytes(step.output) + 16) * 2;
      if (estimated > NODE_BUDGET_BYTES) throw budgetError();
    }
    const artifact = boundedJoin(dependencySteps.map((step) => `## ${step.title}\n\n${step.output}`), '\n\n', NODE_BUDGET_BYTES / 2);
    return nodeBudget({output: `# ${node.title}\n\n${artifact}\n\n병합 상태: 의존 단계 성공 확인 후 수락됨 (로컬 데모).\n최종 제작 승인과 사람의 검토는 별도입니다.`, data: {accepted: true, artifact, dependencyIds: dependencySteps.map((step) => step.nodeId), requiresHumanReview: true}});
  }
  if (documents.length > 200) throw budgetError();
  let inputBytes = 0;
  for (const document of documents) {
    inputBytes += textBytes(document.title, INPUT_BUDGET_BYTES) + textBytes(document.body, INPUT_BUDGET_BYTES);
    if (inputBytes > INPUT_BUDGET_BYTES) throw budgetError();
  }
  const sources = documents.filter((document) => document.body.trim());
  const combined = boundedJoin(sources.map((document) => `${document.title}\n${document.body}`), '\n\n', INPUT_BUDGET_BYTES + 1000);
  const stats = textStats(sources.map((document) => document.body).join('\n\n'));
  const terms = keywords(combined);
  const priorDrafts = ancestorSteps.filter((step) => step.kind === 'draft' && step.status === 'completed');
  const dependencyDrafts = dependencySteps.filter((step) => step.kind === 'draft');
  const drafts = dependencyDrafts.length ? dependencyDrafts : priorDrafts;
  if (node.kind === 'input') {
    return {output: `${sources.length}개 문서 · ${stats.characters.toLocaleString('ko-KR')}자 · ${stats.words.toLocaleString('ko-KR')}개 어절\n${sources.map((document) => `- ${document.title}`).join('\n') || '입력 문서 없음'}\n\n브라우저 내부 로컬 처리. 외부 전송 없음.`, data: {documentCount: sources.length, documentIds: sources.map((document) => document.id), stats}};
  }
  if (node.kind === 'extract') {
    return {output: `핵심어 (빈도 기준)\n${terms.map(({word, count}) => `- ${word} (${count})`).join('\n') || '- 추출할 내용 없음'}\n\n원문 미리보기\n${sources.map((document) => `${document.title}: ${summarizeText(document.body)}`).join('\n\n') || '문서 내용이 비어 있습니다.'}`, data: {keywords: terms, summaries: sources.map((document) => ({documentId: document.id, text: summarizeText(document.body)}))}};
  }
  if (node.kind === 'draft') {
    if (!sources.length) throw new Error('초안을 구성할 입력 문서가 없습니다.');
    const outline = sources.map((document) => ({documentId: document.id, title: document.title, points: sentences(document.body).filter((line) => !line.startsWith('#')).slice(0, 6)}));
    // Outline text is stored both as visible output and structured provenance.
    if (jsonBytes(outline) * 2 + 2048 > NODE_BUDGET_BYTES) throw budgetError();
    const output = `# 원문 기반 구성 초안\n\n${outline.map((section, index) => `## ${index + 1}. ${section.title}\n${section.points.map((point) => `- ${point}`).join('\n')}`).join('\n\n')}\n\n검토 키워드: ${terms.map(({word}) => word).join(', ')}\n\n이 초안은 원문을 규칙에 따라 재배열한 로컬 데모입니다. AI 생성, 사실 검증, 연출자의 최종 검토는 수행되지 않았습니다.`;
    return {output, data: {outline, keywords: terms, sourceDocumentIds: sources.map((document) => document.id), generatedByAI: false}};
  }
  if (node.kind === 'review') {
    const checks = [
      {label: '입력 문서에 본문이 있음', passed: sources.length > 0},
      {label: '완료된 초안이 있음', passed: drafts.some((step) => Boolean(step.output.trim()))},
      {label: '모든 의존 단계가 완료됨', passed: dependencySteps.every((step) => step.status === 'completed')},
    ];
    const passed = checks.every((check) => check.passed);
    const output = `로컬 자동 검사\n${checks.map((check) => `${check.passed ? '통과' : '확인 필요'} · ${check.label}`).join('\n')}\n\n감정, 저작권, 사실관계, 촬영 안전은 사람이 별도로 검토해야 합니다.`;
    if (!passed) {
      const error = new Error('검토 기준을 통과하지 못해 병합을 승인할 수 없습니다.');
      error.output = output;
      error.data = {passed: false, checks, requiresHumanReview: true};
      throw error;
    }
    return {output, data: {passed: true, checks, requiresHumanReview: true}};
  }
  throw new Error(`지원하지 않는 단계: ${asText(node.kind)}`);
}

/**
 * Run an immutable input snapshot sequentially in stable topological order.
 * onStep(step, run) receives detached snapshots at each state transition.
 * Invalid input resolves with status failed. Abort resolves with cancelled.
 * A failed prerequisite blocks dependants, including optional prerequisites.
 */
export async function executeWorkflow(workflow, {onStep, signal, delayMs = 250, documents = []} = {}) {
  const startedAt = now();
  const validation = validateWorkflow(workflow);
  const run = {id: uid('run'), mode: 'local-demo', status: 'running', steps: [], output: '', startedAt, finishedAt: null, errors: [], warnings: []};
  const log = (field, message) => {
    const value = shortError(message);
    if (jsonBytes({errors: run.errors, warnings: run.warnings, next: value}) <= LEDGER_BUDGET_BYTES) run[field].push(value);
  };
  validation.errors.forEach((message) => log('errors', message));
  if (!validation.ok) { run.status = 'failed'; run.finishedAt = now(); return run; }
  // Copy only the values the runner uses, before the first await.
  const nodes = workflow.nodes.map((node) => ({...node, dependsOn: [...node.dependsOn]}));
  const docs = (Array.isArray(documents) ? documents : []).filter((document) => document && typeof document === 'object').map((document) => ({id: asText(document.id), title: asText(document.title) || '제목 없는 문서', body: asText(document.body)}));
  run.steps = nodes.map((node) => ({id: uid('step'), nodeId: node.id, title: node.title, kind: node.kind, agentId: node.agentId || null, status: 'pending', output: '', data: null, error: null, startedAt: null, finishedAt: null}));
  const byId = new Map(run.steps.map((step) => [step.nodeId, step]));
  const hasMerge = nodes.some((node) => node.kind === 'merge');
  const finalOutput = (steps) => hasMerge
    ? boundedJoin(steps.filter((step) => step.kind === 'merge' && step.status === 'completed' && step.data?.accepted === true).map((step) => step.output), '\n\n', RUN_BUDGET_BYTES)
    : steps.filter((step) => step.status === 'completed').at(-1)?.output || '';
  const checkRunBudget = (candidate) => {
    // Reserve each unfinished step's terminal timestamp/error before admitting
    // more output, plus a bounded error/warning ledger. No post-hoc truncation.
    const steps = run.steps.map((step) => {
      const value = candidate?.nodeId === step.nodeId ? candidate : step;
      return ['pending', 'running'].includes(value.status)
        ? {...value, status: 'blocked', error: 'x'.repeat(STEP_ERROR_BYTES), startedAt: now(), finishedAt: now()}
        : value;
    });
    const projected = {...run, status: 'completed', steps, output: finalOutput(steps), finishedAt: now()};
    if (jsonBytes(projected) + LEDGER_BUDGET_BYTES > RUN_BUDGET_BYTES) throw budgetError();
  };
  try { checkRunBudget(); }
  catch (error) { run.steps = []; run.status = 'failed'; run.finishedAt = now(); log('errors', error); return run; }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const ancestorsOf = (node) => {
    const ids = new Set();
    const visit = (id) => {
      if (ids.has(id)) return;
      ids.add(id);
      nodeById.get(id).dependsOn.forEach(visit);
    };
    node.dependsOn.forEach(visit);
    return run.steps.filter((step) => ids.has(step.nodeId));
  };
  const waitMs = Number.isFinite(Number(delayMs)) ? Math.max(0, Math.min(60_000, Number(delayMs))) : 250;
  const notify = async (step) => {
    if (typeof onStep !== 'function') return;
    try { await onStep(clone(step), clone(run)); }
    catch (error) { log('warnings', `진행 알림 처리 오류: ${shortError(error)}`); }
  };
  for (const nodeId of validation.order) {
    const node = nodes.find((item) => item.id === nodeId);
    const step = byId.get(nodeId);
    if (signal?.aborted) break;
    const dependencies = node.dependsOn.map((id) => byId.get(id));
    if (dependencies.some((dependency) => dependency.status !== 'completed')) {
      step.status = 'blocked'; step.error = '선행 단계가 성공하지 않아 실행하지 않았습니다.'; step.finishedAt = now();
      await notify(step); continue;
    }
    step.status = 'running'; step.startedAt = now();
    await notify(step);
    try {
      checkAbort(signal);
      await delay(waitMs, signal);
      checkAbort(signal);
      const result = nodeBudget(processNode(node, docs, dependencies, ancestorsOf(node)));
      checkRunBudget({...step, ...result, status: 'completed', finishedAt: now()});
      step.output = result.output; step.data = result.data; step.status = 'completed'; step.finishedAt = now();
    } catch (error) {
      step.status = error?.name === 'AbortError' ? 'cancelled' : 'failed';
      step.error = shortError(error); step.output = ''; step.data = null; step.finishedAt = now();
      if (error?.output) {
        try {
          const result = nodeBudget({output: error.output, data: error.data || null});
          checkRunBudget({...step, ...result}); Object.assign(step, result);
        } catch { /* Preserve the readable failure without oversized diagnostics. */ }
      }
      if (step.status === 'failed') log('errors', `${step.title}: ${step.error}`);
    }
    await notify(step);
    if (step.status === 'cancelled') break;
  }
  const wasCancelled = run.steps.some((step) => step.status === 'cancelled') || (signal?.aborted && run.steps.some((step) => step.status === 'pending'));
  for (const step of run.steps.filter((item) => item.status === 'pending')) {
    step.status = wasCancelled ? 'cancelled' : 'blocked';
    step.error = wasCancelled ? '실행이 중지되어 처리하지 않았습니다.' : '실행되지 않은 단계입니다.';
    step.finishedAt = now(); await notify(step);
  }
  run.status = wasCancelled ? 'cancelled' : run.steps.some((step) => step.status !== 'completed') ? 'failed' : 'completed';
  // Only accepted merges can become the final artifact of a workflow containing merges.
  run.output = run.status === 'completed' ? finalOutput(run.steps) : '';
  run.finishedAt = now();
  return run;
}
