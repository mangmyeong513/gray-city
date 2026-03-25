# TXT Reader Line

## 파일 구성
- `index.html`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`
- `.github/workflows/deploy.yml`

## GitHub Pages 배포
1. 이 파일들을 저장소 루트에 넣습니다.
2. 워크플로 파일은 `.github/workflows/deploy.yml` 경로에 둡니다.
3. GitHub 저장소의 **Settings > Pages > Source** 를 **GitHub Actions** 로 바꿉니다.
4. `main` 브랜치에 푸시하면 배포됩니다.

## TXT 문법
- `# 제목`
- `## 중제목`
- `### 소제목`
- `> 인용문`
- `*연한 강조*`
- `**강한 강조**`
- `"자동 줄바꿈 강하게"`
- `'작은따옴표'`
- `[details: 제목]`
- `[/details]`

## 메모
- 커스텀 서체는 한 개만 유지됩니다.
- 최근 책 다시 열기, 업데이트 확인 버튼이 들어 있습니다.
