# Windows 독립 호스트 소스

교정 UI를 Electron에 연결하는 **독립 작성 호스트**입니다. 원본 INDIFF 실행 파일·추출 client/server·원본 라이브러리를 포함하거나 실행하지 않습니다. Windows 설치 EXE가 만들어졌다는 뜻은 아닙니다. Android 우선 작업과 분리한 Windows 소스 단계입니다.

## 현재 확인된 상태

- Node.js 24.19.0 / npm 11.9.0, Linux x64에서 순수 호스트 검사 22개 통과
- `main.mjs`, `host-core.mjs`, `preload.cjs`, `prepare-web.mjs` 문법 검사 통과
- Electron/electron-builder/Wine/makensis 실행 파일은 이 환경에서 발견되지 않음
- 패키지 설치, Electron 실행, NSIS 빌드, Windows 설치·파일 대화상자·종료/재시작 검수는 **수행하지 않음**
- 서명 인증서, 아이콘/브랜딩 배포권, 릴리스 권한, 자동 업데이트·공개 배포 설정 없음

## 파일과 빌드

- `host-core.mjs`: Node 기본 모듈만 사용하는 제한된 파일/작업공간 서비스. Electron 없이 단위 검사 가능
- `main.mjs`: 격리·샌드박스 BrowserWindow, 신뢰 문서 IPC, 로컬 커스텀 프로토콜, 네이티브 선택기
- `preload.cjs`: 창에 `indiffNative.invoke(method,payload)` 한 함수만 노출
- `prepare-web.mjs`: 이 포트의 index.html/styles.css/app.js와 lib/*.js만 복사하고 SHA-256 manifest 생성
- `electron-builder.json`: x64 NSIS, 사용자 단위 설치, 관리자 승격/설치 후 실행/배포 없음

작업 폴더는 `platforms/windows`입니다. 추가 설치 없이 가능한 검사:

```sh
npm run check
npm test
npm run prepare:web
```

`prepare:web`은 파일 복사만 합니다. 원본/서버/앱은 실행하지 않습니다. 프런트엔드를 수정한 후 다시 실행해야 합니다. web/와 web-manifest.json은 생성물이며 소스 아카이브에 넣을 필요가 없습니다.

아래는 **나중에 빌드 환경과 패키지 설치가 허용된 경우에만** 실행하는 절차입니다. 여기서는 실행하지 않았습니다.

```sh
npm ci
npm run pack
npm run dist
```

별도 package.json의 정확한 버전은 Electron **44.9.0**, electron-builder **26.17.0**입니다. 2026-10-17 공식 릴리스 목록에서 확인했습니다. Node >=22.12.0은 이 프로젝트의 빌드 기준이며 Electron CLI의 최소 요구 버전이라고 주장하지 않습니다. 실제 npm 해석으로 생성된 package-lock.json이 이 폴더에 포함되어 있습니다. 도구 의존성 설치·Electron 실행·EXE 패키징은 완료하지 않았으므로 재현 빌드 검증 완료를 뜻하지 않습니다. 별도로 승인된 설치 환경에서 npm ci를 사용하고 결과를 검증하세요.

빌드에는 npm 패키지와 Electron/NSIS 보조 바이너리 다운로드가 필요합니다. Windows x64 빌드 머신이 권장됩니다. Linux에서 Windows를 만들려면 Wine 등 별도 도구가 필요할 수 있습니다. 이 환경에는 검증된 도구가 없고 자동으로 설치하지 않습니다. 개인/공개 배포 전에 실제 Windows에서 패키징·설치·시작·권한·파일 잠금·복구 검수를 해야 합니다.

현재 `signAndEditExecutable:false`는 서명/아이콘 수정 없는 내부 미리보기 설정입니다. Authenticode 서명이나 원본 이름/아이콘 사용 권한을 제공하지 않으며 SmartScreen 경고 없는 배포를 보장하지 않습니다. 서명·제품 브랜딩 단계에서 설정과 권리를 별도로 검토하세요.

## 공통 네이티브 계약

모든 호출은 JSON 직렬화 가능한 결과만 반환합니다.

```js
{ok:true,value:...}
{ok:false,error:{code:'...',message:'...'}}
```

- `host.info`, `{}`: platform/windows, native/true, 버전, 지원 method 목록, 바이트 한도
- `host.connection`, `{}`: connected/false, status/disconnected, ai/terminal/mcp 모두 false
- `workspace.load`, `{}`: `{snapshot:null}` 또는 전체 snapshot
- `workspace.save`, `{snapshot}`: `{saved:true,bytes}`. snapshot은 `{format:'indiff.platform-workspace',version:1,workspace:{...},ui:{...}}`
- `file.pick`, `{kind:'text'|'workspace'}`: `{canceled:true}` 또는 `{canceled:false,handle,name,text,bytes}`
- `file.saveAs`, `{kind:'text'|'workspace',name?,text}`: 네이티브 저장 대화상자 뒤 `{canceled:true}` 또는 `{canceled:false,handle,name,bytes}`
- `file.save`, `{handle,text}`: 이전 선택기로 발급된 handle만 허용. `{canceled:false,handle,name,bytes}`

kind 생략 시 text입니다. text는 UTF-8 1MiB, workspace는 7MiB입니다. text 확장자는 .txt/.md/.markdown/.json, workspace는 .json만 허용합니다. 백업 선택/내보내기는 JSON 최상위 객체와 구조 한도를 검사하고 indiff-ui-correction 및 indiff.platform-workspace JSON을 수용합니다. 작업공간·UI의 상세 스키마 및 참조 검증은 프런트엔드가 가져오기/호스트 저장 전에 수행합니다. 영구 snapshot은 호스트도 형식/버전/workspace/ui/전체 크기를 검사합니다.

취소는 오류가 아니며 `{ok:true,value:{canceled:true}}`입니다. 취소 시 파일과 기존 handle은 바뀌지 않습니다. 지원하지 않는 AI/CLI/프로세스/임의 경로 API는 UNSUPPORTED입니다. OS 오류 메시지·절대 파일 경로를 렌더러에 돌려주지 않습니다.

## 보안과 저장 의미

- indiff-app://workspace/index.html의 지정된 최상위 frame/webContents만 IPC 가능
- contextIsolation/sandbox 활성화, Node integration/webview/DevTools 비활성화. preload가 fs, Electron IPC 객체나 이벤트를 내보내지 않음
- 준비 단계에서 복사한 asset의 manifest 크기·SHA-256을 시작 시 검사한 후 메모리에서만 제공
- 원격 요청, 외부 탐색/새 창/프레임/웹뷰/다운로드/기기 권한을 거부. HTTP 서버와 AI 연결 없음
- CSP는 외부 script/connect/frame/object/worker를 차단. 현재 UI가 동적 좌표/크기에 inline style을 사용하므로 style-src에만 unsafe-inline 허용
- 작업공간 저장 위치는 Electron userData 내부의 고정 workspace-v1.json. 렌더러는 이 경로를 정하거나 받지 못함
- 선택된 파일의 절대 경로는 호스트만 보관. UUID handle은 문서 세션에 묶이고 reload/close/crash 시 무효화
- 일반 파일/UTF-8/NUL/확장자/바이트를 검사. 심볼릭 링크·폴더 거부. 현재 파일 내용 hash가 달라지거나 삭제되면 CONFLICT로 덮어쓰기 차단
- 저장은 같은 폴더의 배타적 임시 파일 → fsync → rename. 실패 시 기존 파일을 unlink해서 재시도하지 않음. 작업공간 쓰기 순서 보장, 네이티브 파일 대화상자 중복 BUSY 처리
- close/reload가 commit 이전에 확인되면 취소하고 임시 파일 제거. 이미 rename된 commit은 취소되지 않음. UI는 응답을 받은 뒤에만 저장 완료를 표시해야 함
- 손상 snapshot을 읽지 못하면 오류를 반환하고 기존 바이트 보존. 자동 초기화 없음

원자적 rename과 hash 검사는 동시 실행/OS 오류 방어이며 백업이나 모든 파일시스템의 정전 내구성 보장은 아닙니다. 악성 로컬 OS 사용자의 파일/폴더 교체 경쟁을 완전히 방어하는 보안 저장소가 아닙니다. 외부 편집기는 호스트의 최종 검사와 rename 사이에도 파일을 바꿀 수 있습니다. 네트워크 드라이브, 읽기 전용/잠긴 파일, 디스크 부족, 긴 경로, 한글/이모지/UNC 경로는 실제 Windows QA가 필요합니다.

## 남은 Windows 수동 검수

1. 준비된 asset으로 실행, 저장 뒤 재시작 시 문서/탭/분할/보드/메모 복원
2. TXT/MD와 1MiB 경계, 작업공간 JSON 7MiB 경계, 손상/과대/잘못된 UTF-8, 취소, 반복 클릭
3. 저장 후 외부 변경/삭제 충돌, Save As 취소, 읽기 전용/잠긴 파일/디스크 부족, reload/close 중 대화상자
4. 원격 탐색/팝업/iframe/권한/실행 IPC 차단과 native 취소 시 UI 저장 완료 오표시 방지
5. NSIS 사용자 설치/삭제. 삭제 시 userData를 자동 제거하지 않는지 확인

## 권리와 공식 근거

이 폴더의 LICENSE는 독립 작성 코드에만 적용합니다. 원본 INDIFF 패키지의 라이선스·상표·이미지·소스·배포 허가를 주장하지 않습니다. Electron/Chromium/Node/빌드 도구 및 전이 의존성은 각자 라이선스가 있으며 실제 번들에 들어가는 고지/라이선스 파일을 보존·검토해야 합니다. 원본 패키지의 루트 LICENSE/완전한 runtime/lockfile을 확보했다는 의미가 아닙니다.

2026-10-17 확인한 1차 출처:

- [Electron 44.9.0 공식 릴리스](https://github.com/electron/electron/releases/tag/v44.9.0), [공식 stable 목록](https://releases.electronjs.org/release?channel=stable)
- [electron-builder 26.17.0 공식 릴리스](https://github.com/electron-userland/electron-builder/releases/tag/electron-builder%4026.17.0)
- [Electron 보안 권고](https://www.electronjs.org/docs/latest/tutorial/security), [커스텀 protocol](https://www.electronjs.org/docs/latest/api/protocol)
- [electron-builder v26 설정](https://www.electron.build/v26/docs/configuration/), [v26 Windows 설정](https://www.electron.build/v26/docs/api/app-builder-lib.interface.windowsconfiguration/), [v26 NSIS 설정](https://www.electron.build/v26/docs/api/app-builder-lib.interface.nsisoptions/)
- [v26 크로스 플랫폼 빌드 의존성](https://www.electron.build/v26/docs/features/multi-platform-build/), [Electron 배포/서명 개요](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)

## Portable build preflight status (2026-10-17)

`electron-builder.portable.json` is a schema-checked direct-zlib configuration (`portable.useZip:true`) with unsigned user-level x64 payload, single builder job and no publication. A real `package-lock.json` was generated. It is source/configuration only: no complete Windows unpacked app or portable EXE was built.

The approved1.7GB tool preflight verified the official Electron44.9.0 Windowsx64 ZIP once. Package-size HEAD requests later hit proxy403 on registry.npmjs.org, and work stopped without another access route. No original or generated PE was modified. Existing650MB RSS remained in force; fixed PE resource handling has a static large-buffer overlap risk. Read `../../qa/windows-build-preflight.json` for passed, failed and never-run stages. Do not treat the official runtime ZIP as a finished INDIFF app.
