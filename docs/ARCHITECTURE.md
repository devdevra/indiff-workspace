# UI 교정본 구조

- `index.html`: 원본 구조에 맞춘 Project 파일 탐색기, pane root, 상태바, 로컬 상태 구슬, 편집 dialog
- `styles.css`: 독립 작성 dark zinc 레이아웃. 원본의 280/32/26px 치수와 패널/보드/팀 배치를 반영
- `app.js`: DOM 조율, 문서/트리/메모/역할/보드/포인터/가져오기/백업/로컬 실행
- `lib/layout.js`: 순수 재귀 split tree, preview/pinned tabs, tab movement, validated UI state, DAG connections, curve path
- `lib/core.js`: 기존 독립 코어. 결정적 텍스트 처리와 DAG 검증. AI/네트워크 호출 없음
- `lib/storage.js`: 기존 독립 엄격 스키마. 작업본 전용 키로 분리
- `tools/serve.mjs`: loopback 정적 파일 allowlist. 호스트/파일시스템/AI 서버 아님
- `tools/build.mjs`: dist와 전체 독립 소스 ZIP

작업공간과 UI 상태는 각각 localStorage에 저장합니다. 양쪽 저장이 성공해야 UI를 저장 완료로 표시합니다. 브라우저 저장소를 넘는 원자적 트랜잭션/다중 탭 병합은 구현하지 않았습니다. 백업은 workspace+ui 단일 envelope로 내보내며 legacy v1 작업공간 JSON도 받습니다. 복원 전 workspace 엄격 스키마와 UI 참조/한도를 모두 검사하고 덮어쓰기 확인을 받습니다.

상태의 문서 ID·노드 ID는 HTML escape/CSS escape 후 DOM에 사용합니다. Markdown은 텍스트 escape 후 허용된 제목/목록/단락/코드블록만 직접 그립니다. 원문 HTML·링크·이미지를 실행/로드하지 않습니다. 코드 실행/셀 실행/외부 네트워크/AI 응답 생성은 없습니다.

원본 실제 플랫폼 기능을 연결하기 위한 별도 capability/host 경계는 `PLATFORM_ROADMAP.md`를 보세요.
