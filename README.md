# GitHub Pages 업로드 순서

1. ZIP 압축을 풉니다.
2. 저장소 루트에 아래 파일을 넣습니다.
   - index.html
   - app.js
   - manifest.webmanifest
   - sw.js
   - icon-192.png
   - icon-512.png
3. `.github/workflows/deploy.yml` 도 그대로 업로드합니다.
4. GitHub 저장소 Settings > Pages > Source 를 GitHub Actions 로 바꿉니다.
5. main 브랜치에 푸시합니다.

큰 TXT 파일 대응:
- app.js 는 청크 단위로 파일을 읽고, 중간중간 브라우저에게 쉬는 시간을 줍니다.
- 페이지는 전체를 한 번에 만들지 않고, 현재 필요한 범위만 계산합니다.
