/** Local-only persistence and validated, portable workspace backups. */
export const STORAGE_KEY = 'indiff.original-ui.workspace.v1';
export const MAX_TEXT_BYTES = 1024 * 1024;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const LIMITS = Object.freeze({
  documents: 200,
  agents: 50,
  tasks: 500,
  nodes: 100,
  notes: 200,
  tags: 50,
  runs: 30,
  body: MAX_TEXT_BYTES,
  instructions: 100_000,
});
const ROOT_FIELDS = ['version', 'documents', 'agents', 'tasks', 'workflow', 'runs', 'activeDocumentId'];
const NODE_KINDS = new Set(['input', 'extract', 'draft', 'review', 'merge']);
const RUN_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const STEP_STATUSES = new Set(['completed', 'failed', 'cancelled', 'blocked']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const encoder = new TextEncoder();

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function byteLength(text) {
  return encoder.encode(text).byteLength;
}

/**
 * Validation does not coerce, repair, drop unknown fields, or mutate its input.
 * References may be null/empty while the user is composing an unassigned item.
 */
export function validateState(data) {
  const errors = [];
  const add = (message) => { if (errors.length < 40) errors.push(message); };
  let totalStringLength = 0;

  function record(value, path, fields) {
    if (!isRecord(value)) {
      add(`${path}: 객체 형식이어야 합니다.`);
      return false;
    }
    if (fields) {
      const allowed = new Set(fields);
      for (const key of Object.keys(value)) {
        if (!allowed.has(key) || UNSAFE_KEYS.has(key)) add(`${path}: 지원하지 않는 필드가 있습니다 (${key}).`);
      }
      for (const key of fields) {
        if (!Object.hasOwn(value, key)) add(`${path}.${key}: 필수 항목이 없습니다.`);
      }
    }
    return true;
  }

  function string(value, path, max, nonempty = false) {
    if (typeof value !== 'string') {
      add(`${path}: 문자열이어야 합니다.`);
      return false;
    }
    totalStringLength += value.length;
    if (value.length > max || (nonempty && !value.trim())) {
      add(`${path}: ${nonempty ? '비어 있지 않은 ' : ''}${max}자 이하 문자열이어야 합니다.`);
      return false;
    }
    if (value.includes('\u0000')) {
      add(`${path}: 널 문자를 사용할 수 없습니다.`);
      return false;
    }
    return true;
  }

  function id(value, path) {
    if (!string(value, path, 128, true)) return false;
    if (/[\u0000-\u001f\u007f]/u.test(value) || value !== value.trim()) {
      add(`${path}: 식별자에 공백이나 제어 문자를 사용할 수 없습니다.`);
      return false;
    }
    return true;
  }

  function array(value, path, max) {
    if (!Array.isArray(value)) {
      add(`${path}: 배열이어야 합니다.`);
      return false;
    }
    if (value.length > max) {
      add(`${path}: 최대 ${max}개까지 저장할 수 있습니다.`);
      return false;
    }
    if (Object.keys(value).length !== value.length || Object.keys(value).some((key) => !/^(0|[1-9]\d*)$/u.test(key))) {
      add(`${path}: 빈 배열 항목이나 추가 속성을 사용할 수 없습니다.`);
      return false;
    }
    return true;
  }

  function collection(value, path, max, fields, inspect) {
    const ids = new Set();
    if (!array(value, path, max)) return ids;
    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (!record(item, itemPath, fields)) return;
      if (id(item.id, `${itemPath}.id`)) {
        if (ids.has(item.id)) add(`${itemPath}.id: 중복된 식별자입니다.`);
        ids.add(item.id);
      }
      inspect(item, itemPath);
    });
    return ids;
  }

  function reference(value, path, ids) {
    if (value === null || value === '') return;
    if (id(value, path) && !ids.has(value)) add(`${path}: 연결된 항목을 찾을 수 없습니다.`);
  }

  function timestamp(value, path) {
    if (!string(value, path, 64, true)) return;
    const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.exec(value);
    const year = Number(match?.[1]);
    const month = Number(match?.[2]);
    const day = Number(match?.[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (!match || month < 1 || month > 12 || day < 1 || day > days[month - 1] || !Number.isFinite(Date.parse(value))) {
      add(`${path}: 올바른 ISO 날짜·시간 문자열이어야 합니다.`);
    }
  }

  function stringList(value, path, max) {
    if (array(value, path, max)) value.forEach((entry, index) => string(entry, `${path}[${index}]`, 5_000));
  }

  function runRecord(run, path) {
    for (const field of ['id', 'mode', 'status', 'steps', 'output', 'startedAt', 'finishedAt', 'errors']) {
      if (!Object.hasOwn(run, field)) add(`${path}.${field}: 필수 항목이 없습니다.`);
    }
    id(run.id, `${path}.id`);
    if (run.mode !== 'local-demo') add(`${path}.mode: local-demo 실행 기록만 가져올 수 있습니다.`);
    if (!RUN_STATUSES.has(run.status)) add(`${path}.status: 종료된 실행 기록만 저장할 수 있습니다.`);
    string(run.output, `${path}.output`, 100_000);
    timestamp(run.startedAt, `${path}.startedAt`);
    timestamp(run.finishedAt, `${path}.finishedAt`);
    stringList(run.errors, `${path}.errors`, 500);
    if (Object.hasOwn(run, 'warnings')) stringList(run.warnings, `${path}.warnings`, 500);
    if (Object.hasOwn(run, 'workflowTitle')) string(run.workflowTitle, `${path}.workflowTitle`, 240);
    if (!array(run.steps, `${path}.steps`, LIMITS.nodes)) return;
    const nodeIds = new Set();
    const stepIds = new Set();
    run.steps.forEach((step, index) => {
      const stepPath = `${path}.steps[${index}]`;
      if (!record(step, stepPath)) return;
      for (const field of ['nodeId', 'title', 'kind', 'status', 'output']) {
        if (!Object.hasOwn(step, field)) add(`${stepPath}.${field}: 필수 항목이 없습니다.`);
      }
      if (id(step.nodeId, `${stepPath}.nodeId`)) {
        if (nodeIds.has(step.nodeId)) add(`${stepPath}.nodeId: 중복된 실행 노드입니다.`);
        nodeIds.add(step.nodeId);
      }
      string(step.title, `${stepPath}.title`, 240);
      if (!NODE_KINDS.has(step.kind)) add(`${stepPath}.kind: 지원하지 않는 노드 종류입니다.`);
      if (!STEP_STATUSES.has(step.status)) add(`${stepPath}.status: 종료된 단계 상태여야 합니다.`);
      string(step.output, `${stepPath}.output`, 100_000);
      if (Object.hasOwn(step, 'id') && id(step.id, `${stepPath}.id`)) {
        if (stepIds.has(step.id)) add(`${stepPath}.id: 중복된 단계 식별자입니다.`);
        stepIds.add(step.id);
      }
      if (Object.hasOwn(step, 'agentId') && step.agentId !== null && step.agentId !== '') id(step.agentId, `${stepPath}.agentId`);
      if (Object.hasOwn(step, 'error') && step.error !== null) string(step.error, `${stepPath}.error`, 5_000);
      if (Object.hasOwn(step, 'startedAt') && step.startedAt !== null) timestamp(step.startedAt, `${stepPath}.startedAt`);
      if (Object.hasOwn(step, 'finishedAt')) timestamp(step.finishedAt, `${stepPath}.finishedAt`);
    });
    if (run.status === 'completed' && (!run.steps.length || run.steps.some((step) => step?.status !== 'completed'))) {
      add(`${path}.steps: 완료된 실행에는 한 개 이상의 완료 단계가 필요합니다.`);
    }
  }

  // Run records contain core-generated snapshots. Keep their JSON shape flexible,
  // while bounding every level and rejecting unsupported or unsafe JSON values.
  function runValue(value, path, depth, seen, counter) {
    counter.count += 1;
    if (counter.count > 10_000 || depth > 12) {
      add(`${path}: 실행 기록의 구조가 너무 큽니다.`);
      return;
    }
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') { string(value, path, 100_000); return; }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) add(`${path}: 유한한 숫자여야 합니다.`);
      return;
    }
    if (!Array.isArray(value) && !isRecord(value)) {
      add(`${path}: JSON으로 저장할 수 없는 값입니다.`);
      return;
    }
    if (seen.has(value)) { add(`${path}: 순환 참조가 있습니다.`); return; }
    seen.add(value);
    if (Array.isArray(value)) {
      if (array(value, path, 1_000)) value.forEach((entry, index) => runValue(entry, `${path}[${index}]`, depth + 1, seen, counter));
    } else {
      const keys = Object.keys(value);
      if (keys.length > 100) add(`${path}: 실행 기록의 필드가 너무 많습니다.`);
      else keys.forEach((key) => {
        if (UNSAFE_KEYS.has(key)) add(`${path}: 안전하지 않은 필드 이름입니다.`);
        string(key, `${path} 필드 이름`, 128, true);
        runValue(value[key], `${path}.${key}`, depth + 1, seen, counter);
      });
    }
    seen.delete(value);
  }

  try {
    if (!record(data, '백업', ROOT_FIELDS)) return { ok: false, errors };
    if (data.version !== 1) add('백업.version: 지원하지 않는 백업 버전입니다. 버전 1만 가져올 수 있습니다.');

    const documentIds = collection(data.documents, 'documents', LIMITS.documents,
      ['id', 'title', 'body', 'tags', 'updatedAt', 'notes'], (document, path) => {
        string(document.title, `${path}.title`, 240);
        string(document.body, `${path}.body`, LIMITS.body);
        timestamp(document.updatedAt, `${path}.updatedAt`);
        if (array(document.tags, `${path}.tags`, LIMITS.tags)) {
          const tags = new Set();
          document.tags.forEach((tag, index) => {
            if (string(tag, `${path}.tags[${index}]`, 80, true)) {
              if (tags.has(tag)) add(`${path}.tags: 중복된 태그입니다.`);
              tags.add(tag);
            }
          });
        }
        collection(document.notes, `${path}.notes`, LIMITS.notes, ['id', 'text', 'createdAt'], (note, notePath) => {
          string(note.text, `${notePath}.text`, 20_000);
          timestamp(note.createdAt, `${notePath}.createdAt`);
        });
      });

    const agentIds = collection(data.agents, 'agents', LIMITS.agents,
      ['id', 'name', 'role', 'instructions', 'model'], (agent, path) => {
        string(agent.name, `${path}.name`, 120);
        string(agent.role, `${path}.role`, 240);
        string(agent.instructions, `${path}.instructions`, LIMITS.instructions);
        if (agent.model !== '미연결') add(`${path}.model: 이 작업실은 미연결 모델만 지원합니다.`);
      });

    collection(data.tasks, 'tasks', LIMITS.tasks,
      ['id', 'title', 'agentId', 'status', 'documentId'], (task, path) => {
        string(task.title, `${path}.title`, 500);
        string(task.status, `${path}.status`, 64, true);
        reference(task.agentId, `${path}.agentId`, agentIds);
        reference(task.documentId, `${path}.documentId`, documentIds);
      });

    if (record(data.workflow, 'workflow', ['id', 'title', 'nodes'])) {
      id(data.workflow.id, 'workflow.id');
      string(data.workflow.title, 'workflow.title', 240);
      const nodeIds = collection(data.workflow.nodes, 'workflow.nodes', LIMITS.nodes,
        ['id', 'title', 'kind', 'agentId', 'dependsOn', 'required'], (node, path) => {
          string(node.title, `${path}.title`, 240);
          if (!NODE_KINDS.has(node.kind)) add(`${path}.kind: 지원하지 않는 노드 종류입니다.`);
          reference(node.agentId, `${path}.agentId`, agentIds);
          if (typeof node.required !== 'boolean') add(`${path}.required: 참 또는 거짓이어야 합니다.`);
          if (array(node.dependsOn, `${path}.dependsOn`, LIMITS.nodes)) {
            const dependencies = new Set();
            node.dependsOn.forEach((dependency, index) => {
              if (!id(dependency, `${path}.dependsOn[${index}]`)) return;
              if (dependencies.has(dependency)) add(`${path}.dependsOn: 중복된 연결입니다.`);
              if (dependency === node.id) add(`${path}.dependsOn: 자기 자신에게 연결할 수 없습니다.`);
              dependencies.add(dependency);
            });
          }
        });
      if (Array.isArray(data.workflow.nodes) && data.workflow.nodes.length <= LIMITS.nodes) {
        const nodes = data.workflow.nodes.filter(isRecord);
        const graph = new Map(nodes.filter((node) => typeof node.id === 'string').map((node) => [node.id, node]));
        nodes.forEach((node) => {
          if (Array.isArray(node.dependsOn)) node.dependsOn.forEach((dependency) => {
            if (typeof dependency === 'string' && !nodeIds.has(dependency)) add('workflow.nodes: 존재하지 않는 노드 연결이 있습니다.');
          });
        });
        const visiting = new Set();
        const visited = new Set();
        function visit(nodeId) {
          if (visiting.has(nodeId)) return true;
          if (visited.has(nodeId)) return false;
          visiting.add(nodeId);
          const dependencies = graph.get(nodeId)?.dependsOn;
          if (Array.isArray(dependencies)) {
            for (const dependency of dependencies) {
              if (graph.has(dependency) && visit(dependency)) return true;
            }
          }
          visiting.delete(nodeId);
          visited.add(nodeId);
          return false;
        }
        if ([...graph.keys()].some(visit)) add('workflow.nodes: 순환 연결이 있습니다.');
      }
    }

    reference(data.activeDocumentId, 'activeDocumentId', documentIds);
    if (array(data.runs, 'runs', LIMITS.runs)) {
      const runIds = new Set();
      data.runs.forEach((run, index) => {
        if (!record(run, `runs[${index}]`)) return;
        runRecord(run, `runs[${index}]`);
        runValue(run, `runs[${index}]`, 0, new WeakSet(), { count: 0 });
        if (errors.length === 0 && byteLength(JSON.stringify(run)) > 256 * 1024) {
          add(`runs[${index}]: 실행 기록 하나는 최대 256KB까지 저장할 수 있습니다.`);
        }
        if (Object.hasOwn(run, 'id') && id(run.id, `runs[${index}].id`)) {
          if (runIds.has(run.id)) add(`runs[${index}].id: 중복된 식별자입니다.`);
          runIds.add(run.id);
        }
      });
    }

    if (totalStringLength > MAX_BACKUP_BYTES) add('백업이 너무 큽니다. 최대 5MB까지 저장할 수 있습니다.');
    if (errors.length === 0 && byteLength(JSON.stringify(data)) > MAX_BACKUP_BYTES) {
      add('백업이 너무 큽니다. 최대 5MB까지 저장할 수 있습니다.');
    }
  } catch {
    add('백업 데이터를 안전하게 읽을 수 없습니다. 올바른 JSON 객체인지 확인해 주세요.');
  }
  return { ok: errors.length === 0, errors };
}

export function serializeState(state) {
  const result = validateState(state);
  if (!result.ok) throw new Error(`작업실을 저장할 수 없습니다. ${result.errors[0]}`);
  // No coercion or field stripping: the exported data is exactly the validated data.
  const json = JSON.stringify(state, null, 2);
  if (byteLength(json) > MAX_BACKUP_BYTES) throw new Error('백업이 너무 큽니다. 최대 5MB까지 저장할 수 있습니다.');
  return json;
}

export function parseState(json) {
  if (typeof json !== 'string') throw new Error('백업 파일은 JSON 텍스트여야 합니다.');
  if (byteLength(json) > MAX_BACKUP_BYTES) throw new Error('백업 파일이 너무 큽니다. 최대 5MB까지 가져올 수 있습니다.');
  let state;
  try {
    state = JSON.parse(json.replace(/^\uFEFF/u, ''));
  } catch {
    throw new Error('백업 JSON을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.');
  }
  const result = validateState(state);
  if (!result.ok) throw new Error(`백업을 가져올 수 없습니다. ${result.errors[0]}`);
  return state;
}

function getStorage(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.getItem !== 'function' || typeof target.setItem !== 'function') throw new Error();
    return target;
  } catch {
    throw new Error('브라우저 저장소에 접근할 수 없습니다. 저장 권한과 개인정보 보호 설정을 확인하고 JSON 백업을 내려받아 주세요.');
  }
}

export function saveState(state, storage) {
  const json = serializeState(state);
  const target = getStorage(storage);
  try {
    target.setItem(STORAGE_KEY, json);
  } catch (error) {
    if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22 || error?.code === 1014) {
      throw new Error('브라우저 저장 공간이 가득 찼습니다. JSON 백업을 내려받고 불필요한 문서나 실행 기록을 정리해 주세요.');
    }
    throw new Error('브라우저에 작업실을 저장하지 못했습니다. 저장 권한을 확인하고 JSON 백업을 내려받아 주세요.');
  }
}

export function loadState(fallback, storage) {
  let json;
  try {
    json = getStorage(storage).getItem(STORAGE_KEY);
  } catch (error) {
    return { state: fallback, warning: error?.message || '브라우저 저장소를 읽지 못했습니다.' };
  }
  if (json === null) return { state: fallback, warning: null };
  try {
    return { state: parseState(json), warning: null };
  } catch (error) {
    // Preserve the stored value; the caller decides whether to recover/replace it.
    return { state: fallback, warning: `저장된 작업실을 불러오지 못했습니다. 기존 저장 데이터는 유지됩니다. ${error.message}` };
  }
}

export async function importTextFile(file) {
  if (!file || typeof file.name !== 'string' || !/\.(txt|md|markdown)$/iu.test(file.name)) {
    throw new Error('TXT, MD, MARKDOWN 텍스트 파일만 가져올 수 있습니다.');
  }
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_TEXT_BYTES) {
    throw new Error('텍스트 파일은 최대 1MB까지 가져올 수 있습니다.');
  }
  if (typeof file.arrayBuffer !== 'function') throw new Error('이 파일을 읽을 수 없습니다. 텍스트 파일을 다시 선택해 주세요.');
  let bytes;
  try {
    const buffer = await file.arrayBuffer();
    if (Object.prototype.toString.call(buffer) !== '[object ArrayBuffer]') throw new Error();
    bytes = new Uint8Array(buffer);
  } catch {
    throw new Error('파일을 읽지 못했습니다. 파일을 다시 선택해 주세요.');
  }
  if (bytes.byteLength > MAX_TEXT_BYTES || bytes.byteLength !== file.size) {
    throw new Error('파일 크기가 올바르지 않거나 1MB를 초과합니다. 파일을 다시 선택해 주세요.');
  }
  let body;
  try {
    body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('UTF-8 텍스트 파일만 가져올 수 있습니다. 파일 인코딩을 UTF-8로 저장해 주세요.');
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(body)) {
    throw new Error('바이너리 데이터나 지원하지 않는 제어 문자가 포함된 파일은 가져올 수 없습니다.');
  }
  if (body.length > LIMITS.body) throw new Error(`문서 본문은 최대 ${LIMITS.body.toLocaleString('ko-KR')}자까지 가져올 수 있습니다.`);
  const title = file.name.split(/[\\/]/u).pop().replace(/\.(txt|md|markdown)$/iu, '').trim().slice(0, 240) || '가져온 문서';
  return { title, body };
}
