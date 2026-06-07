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

현재 점수는 해외 빅웨이브 기준이 아니라 부산 송정/다대포 로컬 사용성을 우선합니다. 한국은 평균 파도가 작기 때문에 송정은 0.5m 이상 정스웰, 다대포는 파고보다 주기, 스웰 각도, 물때, 바람을 더 강하게 봅니다.

2026년 6월 2일 다대포는 실제 현장 체감상 “약다대뽕”으로 보고, 이 날의 데이터 패턴을 보정 샘플로 사용합니다. 완전한 다대뽕은 아니어도 0.8~1.1m 전후, 약풍, 미들~로우/썰물 타이밍, 남쪽~남동쪽으로 살아나는 스웰이면 약다대뽕 후보로 남깁니다. 다만 주기 6초 미만은 상한을 낮게 둡니다.

다대포 로컬 보정은 다음 순서로 봅니다.

1. 주기: 9초 이상이면 재밌는 후보, 10~12초 이상이면 다대뽕 후보, 6초 미만은 힘 없는 뻥파도 가능성을 크게 봅니다.
2. 스웰 방향: SW~SSW~WSW를 베스트로 보고, 남스웰은 가능, 남동은 약다대뽕/체크권, E~ENE 동해 계열은 힘이 죽는 방향으로 감점합니다.
3. 물때: 만조 정점보다 중썰물, 썰물 후반, 간조 전후, Low~Mid를 우선합니다.
4. 바람: N/NNE/NE 북풍 계열 약풍을 가장 좋게 보고, 남풍 온쇼어와 강풍은 크게 감점합니다.
5. 파고: 0.8~1.8m를 실전 범위로 보지만, 0.8m + 긴 주기가 1.8m + 짧은 주기보다 좋을 수 있습니다.

외부 서핑 앱의 차트는 정답으로 보지 않고 비교 모델로만 사용합니다. 실제 현장 후기, 우리 데이터, Open-Meteo, JMA/IMOC, 외부 서핑 앱이 서로 얼마나 일치하는지 비교해서 데이터 정합성을 높입니다.

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
- 송정은 중물~만조권을 우선합니다.
- 다대포 미드/몰운대/송안은 중썰물~간조 전후, Low~Mid 구간을 우선합니다.
- 이 조위 데이터는 모델 기반이며 연안 정확도는 제한적입니다. 항해나 안전 판단용이 아니라 서핑 컨디션 참고용입니다.

일본 파고 지도:

- `https://gga.kr/pds/w_.php`의 IMOC/JMA 파고 지도는 외부 파고 보정 소스로 참고합니다.
- 화면에는 일본 파고 이미지를 띄우지 않고, 스크립트가 부산 연안 근처 픽셀 색상을 읽어 `client/data/jma-wave.json`, `docs/data/jma-wave.json`으로 데이터화합니다.
- JMA/IMOC 지도는 현재 약 3일치만 제공됩니다. 앱은 이 범위 안에서는 `JMA 보정`, 4일째부터는 `Open-Meteo 단독`으로 표시합니다.
- 하루가 지나면 JMA/IMOC 페이지도 새 3일 구간으로 밀려나므로, GitHub Actions 또는 로컬 `npm run update:jma` 실행으로 다시 앞 3일의 보정 정확도가 갱신됩니다.
- JMA 값은 지도 색상 밴드 기반의 근사치이므로, Open-Meteo 파고를 완전히 대체하지 않습니다. 두 값의 차이가 0.8m 미만이면 `Open-Meteo 60% + JMA 40%` 비율로 합산하고, 0.8m 이상이면 JMA 보정을 제외하고 `Open-Meteo 우선`으로 표시합니다.

시간대 필터:

- 실제 입수 가능성이 낮은 `20:00~04:00` 데이터는 추천, 일별 요약, 시간별 차트에서 제외합니다.
- 화면과 베스트 계산은 `05:00~19:00` 시간대만 사용합니다.

## 5개 포인트 현장형 점수 보정

점수 계산은 `shared/surfScoring.js`의 순수 함수로 분리되어 `docs/app.js`, `client/app.js`, `server/utils/translator.js`가 같은 기준을 공유합니다. 기존 `score`, `rating`, `wave_height`, `wave_period`, `wave_direction`, `wind_speed`, `wind_direction` 필드는 유지하고, 새 판단 정보는 optional 필드로 붙입니다.

- 송정 라스트웨이브: 기본 첫 탭입니다. 0.5~1.3m, 7~12초, SE~SSE 스웰을 더 강하게 보고 E 계열은 사이즈가 있을 때만 가점합니다.
- 송정 서프홀릭: 0.4~1.2m, 7~12초, ESE~SE~SSE 스웰, WNW~N 약한 오프쇼어, `mid_rising`/`high_approach` 조위를 우선합니다.
- 다대포 몰운대: 상대적으로 작게 들어오는 포인트라 체감 사이즈에 0.9 보정을 두고, SW~SSW 스웰과 중썰물~간조 전후를 우선합니다.
- 다대포 미드: 메인 다대뽕 포인트입니다. SW~SSW~WSW 스웰, 0.8~1.8m, 9초 이상 주기, 약한 N/NNE/NE 바람, 중썰물~간조 전후면 `다대뽕` 후보로 봅니다.
- 다대포 송안: 항상 조류/라인업 거리 리스크가 붙고 최고점을 80점으로 제한합니다. 초보자 단독 입수는 비추천입니다.

다대포 등급은 `다대뽕`, `남스웰 양호`, `약다대뽕`, `탈만함`, `애매하지만 체크`, `비추천`으로 나눕니다. 등급이 좋아도 무조건 100점을 주지 않고, 등급별 상한과 조류/강수/과한 사이즈 플래그를 먼저 적용합니다.

새 optional 출력 필드:

- `flags`: 장주기 덤프, 온쇼어, 예보 불일치, 비 직후 리버마우스 리스크 같은 주의 신호
- `confidence`: `high`, `medium`, `low`, `normal`
- `dadaeppong_grade`: 다대포 포인트 전용 등급
- `tide_phase_advanced`: `low`, `low_rising`, `low_mid`, `mid_rising`, `high_approach`, `high_falling`, `mid_falling`
- `tide_trend`: `rising`, `falling`, `turning`, `unknown`
- `wave_height_used`: 실제 점수 계산에 사용한 파고
- `wave_source_label`: `Open-Meteo 단독`, `JMA 보정`, `Open-Meteo + JMA 보정`, `Open-Meteo 우선`
- `current_risk`, `beginner_warning`, `local_comment`

JMA/IMOC 파고 보정은 현재 지도 데이터 특성상 약 3일치만 사용할 수 있고, 4일째부터는 `Open-Meteo 단독`으로 명시합니다. 다만 3일치 안에서도 Open-Meteo와 JMA 색상 판독값의 차이가 0.8m 이상이면 과보정 가능성이 크다고 보고 `Open-Meteo 우선`으로 점수 계산합니다. 하루가 지나면 GitHub Actions 또는 `npm run update:jma`가 새 3일 구간을 다시 갱신합니다.

## 투데이 체크 카드

투데이 카드는 선택한 날짜의 05:00~19:00 중 가장 점수가 높은 시간대를 초보자도 바로 읽을 수 있게 풀어 설명합니다.

- `Open-Meteo`는 예보 API 이름입니다. 이전의 `OM` 표기는 줄임말이라 혼동을 줄이기 위해 풀어 씁니다.
- 기온, 체감온도, 바다 수온, 비, 돌풍, 강풍·태풍성 위험 신호를 함께 표시합니다.
- 강풍·태풍성 항목은 Open-Meteo의 풍속, 돌풍, 강수, 뇌우 코드를 바탕으로 한 앱 내부 위험 신호입니다. 기상청 공식 특보와 같지는 않으므로 실제 입수 전에는 공식 특보도 확인해야 합니다.
- 보드 추천은 파고, 주기, 바람을 기준으로 `롱보드`, `미드보드`, `숏보드` 가능성을 나눕니다.
- 옷 추천은 수온 기준 웻슈트와 기온/비/바람에 따른 바람막이, 여벌 옷 필요성을 같이 보여줍니다.
- 스웰, 오프쇼어, 온쇼어는 카드 안에서 한 줄 설명으로 다시 풀어 씁니다.
- 배경 이미지는 제거하고, 카드 안 정보칩마다 색을 달리해 파도, 스웰, 바람, 조위, 날씨, 추천 보드를 구분합니다.

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

## 송정 전용 보정

- 송정 라스트웨이브는 첫 탭이자 남측 라인업, 서프홀릭은 중앙~우측 라인업 좌표로 사용합니다.
- 송정 스팟 상세 카드에는 라스트웨이브/서프홀릭 포인트 지도 이미지를 각각 표시합니다.
- 송정은 S~SE 스웰을 최우선으로 보고, E 스웰은 사이즈가 있을 때만 가산합니다.
- NE 스웰은 방파제와 지형 영향으로 차트보다 약할 수 있어 감점합니다.
- 8초 이상 주기는 힘이 붙는 구간으로 가산하지만, 10초 이상이면서 파고가 크면 덤프 가능성으로 점수 상한을 둡니다.
- 바람은 5km/h 이하 무풍권 또는 W/NW 오프쇼어를 좋게 보고, S/SW 온쇼어는 감점합니다.
