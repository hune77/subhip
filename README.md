# Surf Forecast App

부산 송정, 다대포 서핑 예보를 서퍼가 바로 판단할 수 있게 보여주는 모바일 우선 웹앱입니다. Open-Meteo에서 파도와 바람 데이터를 가져오고, 서버 메모리에 캐싱한 뒤 프론트엔드에서 “오늘 파도가 탈 만한지”, “언제가 그나마 좋은지”, “웻슈트는 뭘 입어야 하는지”, “파도 방향은 어떤 성향인지”를 보여줍니다.

## 기술 스택

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js, Express
- API: Open-Meteo Marine API, Open-Meteo Weather Forecast API
- Cache: 서버 In-Memory Cache
- Scheduler: node-cron
- Mobile 확장: Capacitor 설정 파일 포함

## 폴더 구조

```text
surf-forecast-app/
  client/
    index.html
    style.css
    app.js
  server/
    config/
      spots.js
    routes/
      health.js
      surfData.js
    services/
      cache.js
      forecastService.js
      openMeteo.js
    utils/
      translator.js
      waveDirection.js
    index.js
  capacitor.config.json
  package.json
  README.md
```

## 설치 및 실행

PowerShell에서 `npm` 실행 정책 오류가 나면 `npm.cmd`를 사용하세요.

```bash
cd C:\Users\line\Documents\Codex\surf-forecast-app
npm.cmd install
npm.cmd start
```

개발 중 파일 변경을 자동 감지하려면:

```bash
npm.cmd run dev
```

브라우저에서 엽니다.

```text
http://localhost:3000
```

## GitHub Pages 공개 배포

이 프로젝트는 `docs/` 폴더에 정적 배포용 파일을 둡니다. GitHub Pages에서는 서버를 실행할 수 없기 때문에, `docs/app.js`가 Open-Meteo API를 브라우저에서 직접 호출합니다.

GitHub에 올린 뒤:

1. GitHub 저장소 페이지로 이동
2. `Settings` 클릭
3. `Pages` 클릭
4. `Build and deployment`에서 `Deploy from a branch` 선택
5. Branch: `main`
6. Folder: `/docs`
7. Save

몇 분 뒤 아래 형태의 주소가 생깁니다.

```text
https://깃허브아이디.github.io/저장소이름/
```

## API

### Health Check

```http
GET /api/health
```

예상 응답:

```json
{
  "ok": true,
  "cache_ready": true,
  "updated_at": "2026-06-02T04:31:44.923Z",
  "refreshing": false,
  "last_error": null
}
```

### 전체 서핑 데이터

```http
GET /api/surf-data
```

### 특정 스팟만 조회

```http
GET /api/surf-data?spot=songjeong
GET /api/surf-data?spot=dadaepo
```

### 강제 새로고침

```http
GET /api/refresh
GET /api/surf-data/refresh
```

## 백엔드 데이터 흐름

1. 서버 시작 시 `refreshForecastCache()`를 1회 실행합니다.
2. `openMeteo.js`가 Marine API에서 파고, 주기, 파향, 수온을 가져옵니다.
3. 같은 시간축으로 Weather Forecast API에서 10m 풍속, 풍향을 가져옵니다.
4. `forecastService.js`가 시간별 데이터를 합칩니다.
5. `translator.js`가 서핑 컨디션 해석 문구와 점수를 붙입니다.
6. `waveDirection.js`가 A프레임, 레프트, 라이트, 방향 불리를 판정합니다.
7. 결과를 `cache.js`의 메모리에 저장하고 `/api/surf-data`로 제공합니다.

## 서핑 컨디션 해석 로직

현재 점수는 해외 빅웨이브 기준이 아니라 부산 송정/다대포 로컬 사용성을 우선합니다. 한국은 평균 파도가 작기 때문에 송정은 0.5m 이상 정스웰, 다대포는 남스웰과 1.0m 전후 사이즈를 더 현실적으로 평가합니다.

2026년 6월 2일 다대포는 실제 현장 체감상 “약다대뽕”으로 보고, 이 날의 데이터 패턴을 보정 샘플로 사용합니다. 완전한 남스웰이 아니더라도 남동~동남 계열, 0.8~1.0m 전후, 비가 그친 시간대, 중물~만조권, 약~중간 오프쇼어/사이드 바람이면 약다대뽕 후보로 하한 점수를 보정합니다.

파고 기준:

- 0.4m 미만: 너무 작음, 패들/테이크오프 연습 수준
- 0.4m ~ 0.8m: 작은 파도, 롱보드로 가볍게 놀 수는 있지만 좋은 날은 아님
- 0.9m ~ 1.0m: 탈 수는 있지만 주기와 바람이 좋아야 재미가 남
- 1.0m ~ 1.5m: 서핑하기 좋은 중심 구간
- 1.5m ~ 1.8m: 힘 있는 파도, 중급 이상에게 좋을 수 있음
- 1.8m 이상: 큰 파도, 안전과 실력 확인 우선

수온 기준:

- 14도 이하: 5/4mm 풀슈트, 부츠, 글러브 권장
- 15도 ~ 18도: 3/2mm 풀슈트 권장
- 19도 이상: 얇은 슈트 또는 보드숏 고려

파도 주기 기준:

- 8초 이상: 길게 밀고 들어오는 파도
- 6초 ~ 7초: 보통 간격
- 5초 이하: 짧고 바쁘게 부서질 수 있음

바람 기준:

- 해변이 바라보는 방향의 반대편에서 부는 바람: 글라시 가능성
- 바다에서 해변 방향으로 부는 바람: 차피 주의
- 비스듬히 가르는 바람: 사이드 바람

조위 기준:

- Open-Meteo Marine API의 `sea_level_height_msl`을 사용합니다.
- 송정, 다대포 미드/몰운대는 중물~만조권을 우선합니다.
- 다대포 송안은 Low~Mid 구간을 우선합니다.
- 이 조위 데이터는 모델 기반이며 연안 정확도는 제한적입니다. 항해나 안전 판단용이 아니라 서핑 컨디션 참고용입니다.

일본 파고 지도:

- `https://gga.kr/pds/w_.php`의 IMOC/JMA 파고 지도를 앱에 참고 카드로 표시합니다.
- 현재는 지도 이미지를 사람이 확인하는 보조 자료입니다.
- 지도 색상을 자동 판독해 점수에 합산하는 기능은 다음 단계입니다.

## 파도 방향 판정

`wave_direction - beach_facing_angle`을 계산한 뒤 -180도 ~ 180도 범위로 정규화합니다.

- `abs(angleDiff) <= 15`: A프레임
- `-70 <= angleDiff < -15`: 레프트 성향
- `15 < angleDiff <= 70`: 라이트 성향
- 그 외: 방향 불리

## 프론트엔드 State 패턴

`client/app.js`는 전역 `state` 객체를 기준으로 동작합니다.

- `loading`: 로딩 상태
- `error`: 에러 메시지
- `data`: API 응답 원본
- `currentSpotId`: 현재 선택된 스팟
- `selectedDate`: 현재 선택된 날짜
- `showRaw`: 원본 JSON 표시 여부

상태가 바뀌면 `setState()`가 모든 렌더 함수를 다시 실행합니다. 작은 앱에서 React 없이도 데이터 흐름을 이해하기 쉬운 구조입니다.

## Capacitor 확장 가이드

설정 파일은 이미 `capacitor.config.json`에 들어 있습니다.

```json
{
  "appId": "com.codex.surfforecast",
  "appName": "Surf Forecast",
  "webDir": "client",
  "server": {
    "cleartext": true
  }
}
```

Android 또는 iOS 프로젝트를 붙일 때:

```bash
npx cap add android
npx cap add ios
npx cap sync
```

주의: Capacitor 앱에서 `/api/surf-data`를 그대로 쓰려면 백엔드 서버가 접근 가능한 주소에 떠 있어야 합니다. VPS에 배포한 뒤 `client/app.js`의 `window.SURF_API_BASE_URL` 방식으로 API 주소를 주입하는 구조로 확장하면 됩니다.

## 자주 나는 오류

### PowerShell에서 npm이 막힘

오류:

```text
npm.ps1 cannot be loaded because running scripts is disabled
```

해결:

```bash
npm.cmd install
npm.cmd start
```

### 3000 포트 충돌

다른 앱이 3000번 포트를 쓰고 있으면:

```bash
$env:PORT=3001
npm.cmd start
```

접속 주소:

```text
http://localhost:3001
```

### API가 늦게 뜸

서버 시작 직후 Open-Meteo API를 호출합니다. 네트워크 상태에 따라 첫 로딩이 몇 초 걸릴 수 있습니다. 실패해도 서버는 죽지 않고 `/api/health`의 `last_error`에서 원인을 확인할 수 있습니다.

## 다음 구현 후보

- 조위 데이터 추가
- 오늘 추천 시간 알림
- 스팟별 즐겨찾기
- VPS 배포용 Dockerfile
- Capacitor Android 빌드
