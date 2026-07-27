# ccdeck

동시 실행되는 Claude Code 세션들을 칸반으로 추적하는 macOS Electron 앱. 전체 요구사항은 `docs/SPEC.md`.

## 공개 레포 데이터 규칙 (절대 준수)

이 레포는 GitHub 공개를 전제로 한다. 사용자의 실제 세션 데이터에는 회사 정보가 포함되므로:

- `~/.claude/projects/`의 실제 JSONL(원본·발췌·복사본)을 레포 안으로 가져오지 않는다. 테스트 픽스처는 **합성 데이터만** 사용하고, 생성 스크립트를 함께 둔다
- 코드·문서·픽스처·스크린샷에 회사 식별 정보(사내 레포명, 티켓 프리픽스, 사내 URL) 금지
- 런타임 산출물(아카이브 DB, 캐시)은 `/data/`에만 쓰고 gitignore 유지
- 사용자 개인 워크플로우 값(랩업 커맨드 등)은 하드코딩하지 말고 설정으로 뺀다

## UI 스타일 규칙

- 색·간격·타이포는 `src/renderer/src/styles/tokens.css`의 CSS 변수만 참조한다. 사용자의 로컬 디자인시스템이 완성되면 토큰 값 교체 + restyle pass 한 번으로 갈아입히는 구조를 유지
- 컴포넌트는 로직 중심으로, 스타일 결합을 얇게

## 개발

- `npm run dev` — electron-vite dev 모드
- `npm run typecheck` — main/preload(node) + renderer(web) 타입체크
- `npm run build` — 프로덕션 번들 (electron-builder 패키징은 추후)
