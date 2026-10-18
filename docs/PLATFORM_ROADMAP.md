# Windows 호스트와 모바일: 다음 구현 경계

현재 UI 교정본은 원본 실제 기능의 축소 대체물을 최종 이식본으로 내놓는 단계가 아닙니다. 아래 플랫폼 기능이 실제 구현·검증되어야 Windows/모바일 버전으로 완료 판정할 수 있습니다.

## 1. 공통 프런트엔드

파일 트리/문서 탭/분할/팀 채팅/보드 컴포넌트와 도메인 상태를 공유합니다. 지금의 가상 문서 저장과 로컬 규칙 실행은 개발용 adapter로 유지하며, 실제 adapter가 연결되기 전 상태를 항상 미연결로 표시합니다. API 키 문자열만 바꾸어 AI 연결이 된 것처럼 보이게 하지 않습니다.

예정 capability interface:

- workspace.listRoots/listEntries/readDocument/writeDocument/watch
- document.import/export, supportedFormats
- agent.listProviders/listAgents/start/cancel/getStatus
- team.listRooms/readMessages/sendMessage/subscribe
- workflow.validate/start/cancel/getRun/subscribe
- session.list/attach/detach, terminal.start/resize/close
- artifacts.list/read/export/validate

각 adapter는 available, reason, supportsCancellation, permissions, budget, revision을 명시합니다. unavailable일 때 UI는 미연결과 이유를 보여 주며 가짜 응답으로 대체하지 않습니다.

## 2. Windows 호스트

- 원본과 기능/계약을 먼저 비교한 뒤 허가된 원본 코드 사용 여부와 독립 재작성 경계를 확정합니다.
- 데스크톱 래퍼/호스트를 별도 모듈로 구축하고 실제 디스크 폴더 선택·문서 읽기/원자적 저장·변경 감시를 연결합니다.
- 선택된 프로젝트 루트 밖 접근을 차단하고 경로 정규화/심볼릭 링크/재파싱 지점·인코딩·큰 파일·동시 편집 충돌을 검사합니다.
- 모델/CLI 도구의 상태·표준출력·표준에러·진행률·취소·종료 코드와 산출물을 실제 값으로 표시합니다.
- 임의 셸 문자열 실행을 기본 허용하지 않습니다. 도구별 허용 인터페이스와 프로젝트·비용·시간·동시 작업 한도를 둡니다.
- 비밀 정보는 프런트엔드 localStorage와 일반 소스 ZIP에 저장하지 않습니다. 모델 공급자 인증·OS 보안 저장소·토큰 정책이 별도 필요합니다.
- 호스트는 loopback/로컬 IPC 접근을 인증하고 Origin 검증·CSRF 방어·세션 폐기·작업 멱등성을 갖춰야 합니다.
- 실제 Windows 환경에서 파일 감시/긴 경로/한글 경로/프로세스 종료/재개/설치·업데이트·서명·차단 경고를 검증합니다.

현재 상태: 안전 경계가 있는 Electron 호스트 소스와 패키징 설정을 작성했습니다. Windows용 의존성 설치·EXE 빌드·Windows 런타임 테스트는 남아 있습니다. CLI는 미연결이며 원본 macOS 서버는 실행하지 않았습니다.

## 3. 모바일

- 같은 트리/문서/팀/보드 디자인 언어와 상태를 사용하되 좁은 화면에서는 파일 드로어·패널 선택으로 접근합니다.
- 기기 로컬 문서 작업에는 운영체제 파일 선택·저장 권한과 실제 저장 adapter가 필요합니다.
- 원본 데스크톱 CLI/터미널 기능은 휴대폰에서 브라우저 localStorage로 대체할 수 없습니다. 실제 기능 제공에는 명시적으로 승인된 Windows/서버 호스트와 인증된 연결이 필요합니다.
- 원격 호스트 연결 시 사용자·프로젝트 격리, 짧은 세션, 연결 상실 표시, 서버 작업 상태 재조회, 이중 실행 방지, 취소/재개, 민감 데이터/과금 동의가 필요합니다.
- 오프라인 편집과 재연결 충돌은 revision 기반으로 처리하고 덮어쓰기 전 확인합니다.
- Android 테스트 APK는 디버그 빌드·서명 검증을 마쳤습니다. WebView/SAF 기기 동작·백그라운드·키보드/뒤로가기·회전·앱 재실행·설치 검증은 별도 단계입니다.

현재 상태: Android 네이티브 SAF/AtomicFile 호스트와 디버그 APK가 작성·빌드되었습니다. 실제 기기 런타임 검증, 원격 호스트 연결·동기화·백그라운드 원격 작업은 남아 있습니다.

## 4. 완료 판정에 필요한 실제 증거

1. 원본 대비 기능별 parity matrix와 화면/동작 비교
2. 실제 문서 저장·외부 수정·재실행 후 복원
3. 승인된 모델/CLI의 실제 요청 ID·단계 상태·요금·취소·실패 복구
4. 같은 작업을 Windows에서 시작하고 모바일에서 관찰/조작해 중복 실행이 없다는 증거
5. EXE/APK 빌드 해시·설치/실행/제거·권한·서명 검사
6. 원본 소스/상표/별도 자산 권리 확인
