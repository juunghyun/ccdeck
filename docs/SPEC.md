# ccdeck 스펙 (2026-07-27 인터뷰 확정)

동시 실행되는 다수의 Claude Code 세션을 칸반으로 추적하는 macOS Electron 앱. 터미널 비의존.

## 확정 결정

| 항목 | 결정 |
|---|---|
| 상태 감지 | 하이브리드 — `~/.claude/projects/*/*.jsonl` 파일 감시 + 전역 hooks가 앱의 localhost 서버로 POST |
| 남은 사용량 | OAuth usage API 우선(Keychain `Claude Code-credentials`), 실패 시 JSONL 로컬 집계 폴백 |
| 터미널 연동 | 창/탭 점프 없음 — 프로젝트 경로·브랜치 표시로 식별 |
| 작업 요약 | 휴리스틱 (첫 사용자 프롬프트 + 최근 메시지 + 세션 summary 엔트리), LLM 호출 없음 |
| 앱 형태 | 칸반 창 + 메뉴바 상주 (배지: 실행중 N · 확인필요 M) |
| 알림 | macOS 알림 배너 + Dock/메뉴바 배지, 종류별 on/off |
| 카드 액션 | 아카이브 · 상세 타임라인 · Finder 열기 · 요약 복사 · 랩업(마무리 커맨드) 실행 |
| 완료 카드 | 수동 아카이브 (자동 소멸 X), 아카이브분은 히스토리 탭 |

## 칸반 상태 머신

카드는 드래그가 아니라 세션의 실제 상태를 따라 자동 이동한다.

- **실행중** — 턴 진행 중 (UserPromptSubmit 이후 ~ Stop 이전). 현재 턴 경과시간, 활성 서브에이전트 개수·이름, 프로세스 메모리(RSS) 표시
- **확인 필요** — 권한 승인 대기(Notification 훅) / 질문 대기 / 턴 종료(Stop 훅). 진입 시 macOS 알림. 터미널에서 새 프롬프트 입력하면 자동으로 실행중 복귀
- **완료** — 세션 종료(SessionEnd) 또는 사용자가 완료 처리. 수동 아카이브 전까지 유지

헤더 상주: 사용량 위젯(5시간/주간 잔여), 전체 요약(claude 프로세스 수, 총 메모리).

## 랩업 액션

카드에서 랩업 실행 시 해당 세션을 `claude -p --resume <session-id>`로 헤드리스 재개해 사용자가 설정한 마무리 커맨드(기본값 없음, 설정에서 지정)를 실행한다. 진행 상태를 카드에 표시하고 완료 시 아카이브 제안. 토큰을 소모하는 유일한 기능.

## 아키텍처

- **메인 프로세스**: chokidar JSONL watcher / hooks 수신용 localhost HTTP 서버 / `ps` 폴링(RSS) / usage 수집기 / Tray·알림
- **훅 설치**: `~/.claude/settings.json`에 SessionStart·UserPromptSubmit·Notification·Stop·SessionEnd 훅을 앱 설정 화면에서 명시적으로 설치/제거
- **렌더러**: React 칸반. 스타일은 `styles/tokens.css` CSS 변수만 참조 (디자인시스템 교체 예정)
- **스택**: Electron + TypeScript + React + Vite (electron-vite), 패키징 electron-builder(.dmg)

## 미검증 리스크

1. OAuth usage 엔드포인트 비공식 — 깨지면 로컬 집계 폴백으로 동작
2. Keychain 접근 시 macOS 권한 프롬프트 1회
3. headless `--resume` + 스킬 실행 조합 미검증 — 랩업 구현 전 선검증 필요
