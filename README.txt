TXT Reader Minimal PWA

구성:
- index.html
- app.js
- worker.js
- manifest.webmanifest
- sw.js
- icon-192.png
- icon-512.png

특징:
- TXT 불러오기
- 로딩 퍼센트
- 글 잘림 없이 스크롤 읽기
- 큰 파일은 worker 우선, 실패하면 기본 방식으로 fallback
- 최소한의 UI
- PWA 설치 가능

참고:
- 로컬 파일로 열어도 fallback 덕분에 본문이 보이도록 만들었습니다.
- PWA 설치는 GitHub Pages 같은 HTTPS 배포에서 가장 잘 동작합니다.
