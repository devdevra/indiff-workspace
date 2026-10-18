# INDIFF · Windows/Android 플랫폼 소스 작업본

## GitHub / Codex 시작점 · 2026-10-18

이 저장소는 기존 독립 작성 Windows/Android 포트의 소스와 문서를 옮긴 작업본입니다. 원본 INDIFF 전체 앱이나 완성된 설치 파일은 아닙니다. 이전 빌드·검사 기록과 이번 이전 검증을 구분한 상태는 [이전 상태](docs/MIGRATION_STATUS.md)를 보세요.

- 루트 웹 작업: Node.js >=20. 루트 package.json에는 설치할 의존성이 없고 루트 package-lock.json도 없으므로 루트에서 npm ci를 실행하지 않습니다.
- 기본 검사 명령: npm run check, npm test, npm run check:platform. 이번 소스 이전에서는 명령을 다시 실행하지 않았습니다.
- Windows 패키지: platforms/windows/package.json과 실제 package-lock.json이 있습니다. 별도 Node.js >=22.12.0과 승인된 다운로드·빌드 예산이 필요합니다. 준비된 환경에서만 해당 폴더의 npm ci를 사용하세요.
- Codex 클라우드 환경은 소스 업로드 시점에 아직 설정·검증되지 않았습니다. 저장소 존재만으로 실행 환경 준비가 끝났다고 보지 마세요.

기존 `INDIFF Workspace Lab`의 대형 크림/녹색 대시보드를 교체하여, 원본의 프로젝트 파일 트리·문서 탭·분할·팀 채팅 구조·자유 배치 보드 조작을 기준으로 다시 작성한 로컬 웹 구현입니다.

이 폴더는 기존 배포와 분리되어 있습니다. 원본 UI 교정본에 실제 Android SAF/AtomicFile 및 Windows Electron 호스트 소스·빌드 설정을 추가했습니다. 원본 workflow JSON 카드/연결/위치 편집과 미지 필드 보존도 구현했습니다. Android 디버그 APK는 실제 빌드와 서명·ZIP·에셋 검증을 마쳤습니다. 기기 실행 검증과 Windows EXE 빌드는 남아 있으며 원본 전체 기능의 완성본은 아닙니다.

플랫폼 구현/정확한 미구현 범위: docs/PLATFORM_HOSTS.md. Android: platforms/android/README.md. Windows: platforms/windows/README.md.

검사: npm run check / npm test / npm run check:java-syntax / npm run check:platform. 에셋 준비만: npm run stage:android / npm run prepare:windows. 이 명령은 SDK나 Electron을 설치하지 않습니다.

## 실행

Node.js 20 이상이 이미 설치된 환경에서 추가 패키지 설치 없이:

1. 이 폴더에서 `npm start`
2. `http://127.0.0.1:4173` 열기
3. 종료는 Ctrl+C

포트 변경: macOS/Linux `PORT=4178 npm start`, Windows PowerShell `$env:PORT=4178; npm start`.
`index.html`을 file://로 직접 열면 ES 모듈 제약이 있으므로 로컬 서버를 사용하세요. 서버는 loopback에만 바인딩합니다.

## 지금 동작하는 범위

- dark zinc 셸, 280px 파일 탐색기, 32px 탭 바, 26px 상태바, 빈 패널 문구
- 가상 프로젝트 폴더/파일 트리와 문서·본문·메모 검색
- 문서 생성/경로 변경/제목/본문 편집, 안전한 Markdown 부분집합 읽기, 메모, UTF-8 TXT/Markdown 가져오기/내보내기
- 한 번 클릭은 교체 가능한 임시 탭, 두 번 클릭 또는 편집은 고정 탭
- 탭 닫기/재정렬/다른 패널 이동, 좌우·상하 분할 최대 4개, 구분선 드래그·키보드 크기 조절
- 모바일에서는 같은 패널과 파일 탐색기를 하단 패널 선택/드로어로 접근
- 자유 배치 보드, 곡선 연결선, 출력→입력 점 연결, 순환/자기 연결 거부, 연결 선택/삭제, 줌/이동/전체 맞춤
- 역할 이름·설명·지시와 업무 상태 저장
- 팀 채팅과 같은 형태로 내 로컬 메모를 저장. AI 응답/상대방 메시지는 생성하지 않음
- 문서 통계/빈도 기반 핵심어/원문 구성/입력 검사/결과 병합의 결정적 로컬 규칙 실행, 중단, 실행 기록, 결과를 문서로 저장
- 원본 .workflow.json 가져오기·카드/위치 편집·원본 형식 내보내기, 알 수 없는 필드 보존, 모든 원본 노드 실행 차단
- 문서·업무·역할·실행 기록 + 탭·분할·보드 위치·카메라·대화 메모 전체 백업/복원
- 손상된 저장 데이터 감지 시 원본 보호, 원본 백업·확인 후 초기화

## 원본과 남은 차이

실제 AI 팀 대화나 Claude/Codex CLI를 흉내 낸 응답을 만들지 않습니다. 외부 API·유료 요청·OS 명령·원본 앱 서버는 실행하지 않습니다.

미구현/미검증: AI/터미널/MCP, 실제 폴더 등록·감시·원본 파일 직접 편집, 원본 문서/미디어 편집기·브라우저 패널, 협업/기기 동기화, 원본 YAML, 원본 전체 UI/팀 세션 상태 호환. Android 디버그 APK 빌드·서명 검증은 완료했고, Windows EXE 빌드와 양쪽 실제 기기/OS 런타임 검증은 남아 있습니다. 상세 차이는 `docs/FIDELITY.md`, 호스트/모바일 다음 단계는 `docs/PLATFORM_ROADMAP.md`를 보세요.

## 저장과 한도

- 작업공간: 현재 origin의 localStorage `indiff.original-ui.workspace.v1`
- 레이아웃/보드/대화: 별도 localStorage `indiff.original-ui.layout.v1`
- 기존 배포의 저장 키를 덮어쓰지 않습니다. 기존 V1 작업공간 JSON도 가져올 수 있습니다.
- 문서 200, 역할 50, 업무 500, 노드 100, 문서당 메모 200, 최근 실행 30
- TXT/MD 가져오기는 파일당 1MiB, 작업공간 백업 5MiB + UI 상태 2MiB, 로컬 대화 메모 200개/각 16,000자
- 로컬 규칙 실행은 문서 30개/제목·본문 합계 16,000자까지. 열린 브라우저 탭 안에서 실행하며 닫으면 중단됩니다.
- 원본 파일시스템이 아니라 브라우저의 가상 경로입니다. 사이트 주소·포트 변경, 시크릿 모드 종료, 브라우저 데이터 삭제 시 데이터가 이어지지 않을 수 있으니 백업하세요.
- 같은 origin 여러 탭 동시 편집·자동 병합은 지원하지 않습니다. 하나의 탭에서 작업하세요.
- 비밀번호·API 키를 입력/저장하지 마세요. 네트워크를 거치는 모델 연결은 없습니다.

## 검증과 빌드

- `npm run check`: 앱/코어/저장/레이아웃/서버/빌드 문법 검사
- `npm test`: Node 기본 테스트 러너, 106개 단위/통합 검사
- `npm run build`: 독립 소스 ZIP과 정적 `dist` 생성
- `npm run test:browser`: 기존에 Playwright/Chromium이 설치된, 브라우저 실행이 허용되는 환경에서 수행

브라우저 QA는 Node 검사와 별개입니다. 이 작업 환경에서 새 Chromium 프로세스 실행은 OS 소켓 권한과 실행 환경 mount 오류로 막혔습니다. 브라우저 테스트 파일을 제공하지만 통과했다고 주장하지 않습니다. 별도 클라우드 브라우저 비교 검수와 사용자 확인 전에는 시각 충실도를 승인 완료로 취급하지 마세요.

## 권리와 소스 경계

이 구현 코드·스타일·단순 SVG 아이콘·CSS 구슬은 독립 작성했습니다. 원본 소스는 정적 텍스트 관찰만 했으며 `require`, `eval`, import, 실행, 네트워크 호출을 하지 않았습니다. 원본의 이미지/로고/폰트/실행 코드를 포함하지 않습니다. Pretendard는 설치된 시스템 폰트가 있을 때만 사용하고 미설치 시 시스템 폰트로 대체합니다. 원본 브랜딩/소스/별도 자산의 제품 배포 권리를 부여하는 것은 아닙니다. `docs/RIGHTS.md` 참고.

독립 작성 소스에 한해 MIT License. 원본 INDIFF의 라이선스를 주장하지 않습니다.
