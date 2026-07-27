# ccdeck

동시에 돌아가는 여러 Claude Code 세션을 칸반 보드로 추적하는 macOS 데스크톱 앱.

여러 터미널 창에서 Claude Code를 병렬로 돌릴 때 "지금 뭐가 돌고 있고, 뭐가 내 확인을 기다리고 있는지"를 한눈에 보여준다.

- **칸반 보드** — 실행중 / 확인 필요 / 완료. 카드는 세션의 실제 상태를 따라 자동으로 이동
- **카드 정보** — 프로젝트·브랜치, 작업 요약, 경과 시간, 서브에이전트 활동, 프로세스 메모리
- **사용량 위젯** — 남은 Claude 사용량 (5시간/주간 윈도우)
- **메뉴바 상주 + macOS 알림** — 확인이 필요한 순간을 놓치지 않게
- **터미널 비의존** — `~/.claude/projects/` JSONL과 Claude Code hooks 기반이라 Warp, iTerm, Terminal.app 어디서든 동작

상세 설계는 [docs/SPEC.md](docs/SPEC.md) 참고.

## 개발

```bash
npm install
npm run dev
```
