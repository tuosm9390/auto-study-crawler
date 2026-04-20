# 🎬 YouTube → NotebookLM 자동 학습 플랫폼

매일 특정 시간에 YouTube 채널 영상을 자동으로 크롤링하고 NotebookLM에 소스로 추가하여 AI 분석을 통한 개인 학습 플랫폼입니다.

## ✨ 주요 기능

- **자동 크롤링**: 설정한 시간에 YouTube 채널 새 영상 자동 감지
- **NotebookLM 연동**: 신규 영상을 자동으로 NotebookLM 소스로 등록
- **중복 방지**: 이미 등록된 영상은 재등록하지 않음
- **학습 대시보드**: 수집 현황, 채널별 진행률, 영상 검색·필터링
- **알림**: Slack / Telegram으로 신규 영상 알림 (선택)
- **스케줄링**: GitHub Actions (클라우드) 또는 Windows 작업 스케줄러

## 🚀 빠른 시작

### 1. 사전 준비

- **Node.js 18+** 설치
- **YouTube Data API 키** 발급 ([Google Cloud Console](https://console.cloud.google.com/))
- **NotebookLM 인증**: `nlm login` 실행

### 2. 설치

```bash
npm install
```

### 3. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일에 YOUTUBE_API_KEY 입력
```

### 4. 채널 설정

`config/channels.json` 파일을 편집하세요:

```json
{
  "channels": [
    {
      "id": "UCxxxxxxxxxxxxxx",       // YouTube 채널 ID
      "name": "채널 이름",
      "url": "https://www.youtube.com/@handle",
      "notebookId": "",               // NotebookLM 노트북 ID (비워두면 자동 생성)
      "notebookTitle": "📺 채널 학습 노트",
      "enabled": true
    }
  ]
}
```

> 💡 채널 ID 확인 방법: YouTube 채널 페이지 → 소스 보기 → `channelId` 검색

### 5. 크롤러 실행

```bash
# 테스트 (실제 추가 없이 미리 보기)
npm run crawler:dry-run

# 실제 실행
npm run crawler

# 특정 채널만 처리
npx ts-node crawler/index.ts UCxxxxxxxxxxxxxx
```

### 6. 대시보드 실행

```bash
npm run dev
# http://localhost:3000 접속
```

## ⏰ 스케줄링 설정

### GitHub Actions (권장)

1. 저장소를 GitHub에 푸시
2. **Settings → Secrets** 에서 시크릿 추가:
   - `YOUTUBE_API_KEY`: YouTube API 키
   - `NLM_COOKIES`: NotebookLM 쿠키 (`~/.nlm/tokens.json` 참고)
3. `.github/workflows/youtube-crawler.yml`의 cron 시간 조정

```yaml
# KST 07:00 = UTC 22:00 (전날)
cron: '0 22 * * *'
```

### Windows 작업 스케줄러

```powershell
# 관리자 권한으로 실행
.\scripts\install-scheduler.ps1 -ScheduleTime "07:00"
```

## 📁 프로젝트 구조

```
├── crawler/
│   ├── index.ts          # 메인 크롤러 스크립트
│   ├── youtube.ts        # YouTube API 클라이언트
│   ├── notebooklm.ts     # NotebookLM 연동
│   ├── state.ts          # 상태 파일 관리
│   ├── notify.ts         # Slack/Telegram 알림
│   └── logger.ts         # 컬러 로거
├── dashboard/            # Next.js 대시보드
│   └── src/app/
│       ├── page.tsx      # 메인 대시보드 UI
│       └── api/          # API 라우트
├── config/
│   └── channels.json     # 채널 설정
├── data/
│   └── videos.json       # 수집 상태 (자동 업데이트)
├── .github/workflows/
│   └── youtube-crawler.yml  # GitHub Actions
└── scripts/
    └── install-scheduler.ps1  # Windows 작업 스케줄러 설치
```

## 🔑 YouTube 채널 ID 찾는 방법

1. YouTube 채널 페이지 방문
2. 채널 URL에서 `/channel/UC...` 형식이면 그것이 ID
3. `@handle` 형식이면 크롤러가 자동 변환 (채널 ID란에 `@handle` 입력 가능)

## ❓ FAQ

**Q: NotebookLM 노트북 ID는 어떻게 찾나요?**  
A: NotebookLM에서 노트북 열기 → URL에서 `/notebook/` 뒤의 문자열

**Q: `nlm` 명령어를 찾을 수 없어요**  
A: `pip install notebooklm-mcp` 또는 [nlm 설치 가이드](https://github.com/nt-nlm/nlm) 참고

**Q: YouTube API 쿼터가 부족해요**  
A: `MAX_CHECK_VIDEOS=5`로 줄이거나 Google Cloud Console에서 쿼터 증가 신청
