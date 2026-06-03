const API_BASE_URL = window.SURF_API_BASE_URL || "";
const MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine";
const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEZONE = "Asia/Seoul";

const STATIC_SPOTS = [
  {
    id: "songjeong",
    name: "송정",
    fullName: "송정해수욕장",
    latitude: 35.1786,
    longitude: 129.1997,
    beachFacingAngle: 135,
    note: "부산 대표 서핑 스팟"
  },
  {
    id: "dadaepo",
    name: "다대포",
    fullName: "다대포해수욕장",
    latitude: 35.0471,
    longitude: 128.9673,
    beachFacingAngle: 180,
    note: "넓은 해변과 긴 라인업을 보는 스팟"
  }
];

const state = {
  loading: true,
  error: null,
  data: null,
  currentSpotId: "songjeong",
  selectedDate: null,
  showRaw: false,
  listeners: []
};

const elements = {
  spotSwitch: document.querySelector("#spotSwitch"),
  statusArea: document.querySelector("#statusArea"),
  bestSummary: document.querySelector("#bestSummary"),
  todayCard: document.querySelector("#todayCard"),
  criteriaCard: document.querySelector("#criteriaCard"),
  dateStrip: document.querySelector("#dateStrip"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  hourlyList: document.querySelector("#hourlyList"),
  detailGrid: document.querySelector("#detailGrid"),
  rawToggle: document.querySelector("#rawToggle"),
  rawData: document.querySelector("#rawData"),
  refreshButton: document.querySelector("#refreshButton")
};

function subscribe(listener) {
  state.listeners.push(listener);
}

function setState(patch) {
  Object.assign(state, patch);
  state.listeners.forEach((listener) => listener());
}

function formatDay(dateString) {
  return new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    month: "numeric",
    day: "numeric"
  }).format(new Date(`${dateString}T00:00:00+09:00`));
}

function ratingClass(rating) {
  if (rating === "좋음") return "good";
  if (rating === "보통") return "normal";
  return "caution";
}

function trendIcon(rating) {
  if (rating === "좋음") return "ph-trend-up";
  if (rating === "보통") return "ph-minus";
  return "ph-trend-down";
}

function getCurrentSpot() {
  if (!state.data) return null;
  return state.data.spots.find((spot) => spot.id === state.currentSpotId) || state.data.spots[0];
}

function getSelectedHours() {
  const spot = getCurrentSpot();
  if (!spot || !state.selectedDate) return [];
  return spot.hourly.filter((item) => item.date === state.selectedDate);
}

function getBestHourForSelectedDate() {
  const hours = getSelectedHours();
  return hours.reduce((best, item) => {
    if (!best || item.translated.score > best.translated.score) return item;
    return best;
  }, null);
}

function getOverallBestHour() {
  const spot = getCurrentSpot();
  if (!spot) return null;

  return spot.hourly.reduce((best, item) => {
    if (!best || item.translated.score > best.translated.score) return item;
    return best;
  }, null);
}

function conditionChecks(item) {
  const wavePass = item.wave_height >= 0.9;
  const periodPass = item.wave_period >= 7;
  const windPass = item.translated.wind_type === "오프쇼어";

  return [
    {
      key: "wave",
      label: "파고",
      passed: wavePass,
      value: `${item.wave_height ?? "-"}m`
    },
    {
      key: "period",
      label: "주기",
      passed: periodPass,
      value: `${item.wave_period ?? "-"}s`
    },
    {
      key: "wind",
      label: "바람",
      passed: windPass,
      value: item.translated.wind_type
    }
  ];
}

function formatBestWindow(item) {
  if (!item) return "계산 중";
  return `${formatDay(item.date)} ${item.hour}`;
}

function buildVerdict(best) {
  if (!best) return "데이터 대기 중";
  if (best.translated.rating === "좋음") {
    return "오늘은 들어갈 명분 있습니다. 파고와 면 상태가 같이 받쳐주는 시간대를 노리세요.";
  }
  if (best.translated.rating === "보통") {
    return "완전한 축제는 아니지만 탈 수는 있습니다. 장비 선택과 타이밍이 중요합니다.";
  }
  return "오늘은 기대치를 낮추는 쪽입니다. 운동 삼아 들어가거나 다음 스웰을 기다리는 편이 낫습니다.";
}

function renderBestSummary() {
  const spot = getCurrentSpot();
  const overallBest = getOverallBestHour();

  if (state.loading || !spot || !overallBest) {
    elements.bestSummary.innerHTML = `
      <div class="summary-card">
        <p class="section-kicker">OVERALL BEST</p>
        <h2>전체 최고 추천 계산 중</h2>
        <p>Open-Meteo 데이터를 가져와 7일 중 가장 괜찮은 시간대를 찾고 있습니다.</p>
      </div>
    `;
    return;
  }

  elements.bestSummary.innerHTML = `
    <div class="summary-card">
      <div>
        <p class="section-kicker">OVERALL BEST</p>
        <h2>${formatBestWindow(overallBest)}</h2>
        <p>${overallBest.translated.rating}, 파고 ${overallBest.wave_height}m, 주기 ${overallBest.wave_period}s, 바람 ${overallBest.translated.wind_type}</p>
      </div>
      <div class="summary-score ${ratingClass(overallBest.translated.rating)}">
        <span>SCORE</span>
        <strong>${overallBest.translated.score}</strong>
      </div>
    </div>
  `;
}

function renderCriteriaCard() {
  const best = getBestHourForSelectedDate();

  if (!best) {
    elements.criteriaCard.innerHTML = "";
    return;
  }

  const checks = conditionChecks(best);

  elements.criteriaCard.innerHTML = `
    <div class="criteria-head">
      <div>
        <p class="section-kicker">JUDGEMENT RULE</p>
        <h2>판정 기준</h2>
      </div>
      <p>파고 0.9m 이상 + 주기 7초 이상 + 오프쇼어면 좋은 파도 후보로 봅니다.</p>
    </div>
    <div class="criteria-grid">
      ${checks
        .map((check) => `
          <div class="criteria-chip ${check.passed ? "pass" : "fail"}">
            <span>${check.label}</span>
            <strong>${check.value}</strong>
            <em>${check.passed ? "통과" : "탈락"}</em>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderStatus() {
  if (state.loading) {
    elements.statusArea.innerHTML = `
      <div class="notice">
        <i class="ph ph-spinner-gap"></i>
        <span>섭힙 인덱스 계산 중. 파고, 주기, 바람을 묶어서 보는 중입니다.</span>
      </div>
    `;
    return;
  }

  if (state.error) {
    elements.statusArea.innerHTML = `
      <div class="notice is-error">
        <i class="ph ph-warning-circle"></i>
        <span>${state.error}</span>
      </div>
    `;
    return;
  }

  const updatedAt = state.data?.updated_at
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(state.data.updated_at))
    : "갱신 시간 없음";

  elements.statusArea.innerHTML = `
    <div class="notice">
      <i class="ph ph-pulse"></i>
      <span>LIVE ${updatedAt} · 서퍼 기준 컨디션 스코어</span>
    </div>
  `;
}

function renderSpotSwitch() {
  const spots = state.data?.spots || [];

  elements.spotSwitch.innerHTML = spots
    .map((spot) => `
      <button class="spot-button ${spot.id === state.currentSpotId ? "is-active" : ""}" type="button" data-spot-id="${spot.id}">
        <span>${spot.name}</span>
        <small>${spot.id.toUpperCase()}</small>
      </button>
    `)
    .join("");
}

function renderTodayCard() {
  const spot = getCurrentSpot();
  const best = getBestHourForSelectedDate();

  if (state.loading || !spot || !best) {
    elements.todayCard.innerHTML = `
      <div class="hero-content">
        <p>예보 데이터를 준비하고 있습니다.</p>
      </div>
    `;
    return;
  }

  const pillClass = ratingClass(best.translated.rating);
  const heroTitle =
    best.translated.rating === "좋음"
      ? `${best.hour} LONG`
      : best.translated.rating === "보통"
        ? `${best.hour} WAIT`
        : `${best.hour} SKIP`;

  elements.todayCard.innerHTML = `
    <div class="hero-content">
      <div class="hero-topline">
        <span>${spot.full_name}</span>
        <span>FACING ${spot.beach_facing_angle}°</span>
      </div>
      <div class="hero-row">
        <div>
          <p class="eyebrow">TODAY'S BEST WINDOW</p>
          <h2>${heroTitle}</h2>
        </div>
        <span class="rating-pill ${pillClass}">
          <i class="ph ${trendIcon(best.translated.rating)}"></i>
          ${best.translated.rating} ${best.translated.score}
        </span>
      </div>
      <p class="hero-copy">${best.translated.wave_height_text}</p>
      <p class="hero-signal"><span>SUBHIP SIGNAL</span>${buildVerdict(best)}</p>
      <div class="metric-row">
        <div class="metric"><span>WAVE</span><strong>${best.wave_height ?? "-"}m</strong></div>
        <div class="metric"><span>PERIOD</span><strong>${best.wave_period ?? "-"}s</strong></div>
        <div class="metric"><span>WIND</span><strong>${best.translated.wind_type}</strong></div>
      </div>
    </div>
  `;
}

function renderDateStrip() {
  const spot = getCurrentSpot();

  if (!spot) {
    elements.dateStrip.innerHTML = "";
    return;
  }

  elements.dateStrip.innerHTML = spot.daily
    .map((day) => `
      <button class="date-button ${day.date === state.selectedDate ? "is-active" : ""}" type="button" data-date="${day.date}">
        <strong>${formatDay(day.date)}</strong>
        <span>${day.rating} · ${day.best_score}</span>
      </button>
    `)
    .join("");
}

function renderHourlyList() {
  const hours = getSelectedHours();

  elements.selectedDateLabel.textContent = state.selectedDate ? formatDay(state.selectedDate) : "";

  if (!hours.length) {
    elements.hourlyList.innerHTML = `<div class="empty">선택한 날짜의 시간별 데이터가 없습니다.</div>`;
    return;
  }

  elements.hourlyList.innerHTML = hours
    .map((item) => {
      const checks = conditionChecks(item);

      return `
        <article class="hour-card">
          <div class="hour-time">${item.hour}</div>
          <div class="hour-main">
            <strong>${item.translated.summary}</strong>
            <span>${item.translated.wind_comment}</span>
            <div class="mini-checks">
              ${checks
                .map((check) => `
                  <span class="${check.passed ? "pass" : "fail"}">${check.label} ${check.passed ? "통과" : "탈락"}</span>
                `)
                .join("")}
            </div>
          </div>
          <div class="score-badge ${ratingClass(item.translated.rating)}">${item.translated.score}</div>
        </article>
      `;
    })
    .join("");
}

function renderDetails() {
  const best = getBestHourForSelectedDate();

  if (!best) {
    elements.detailGrid.innerHTML = "";
    return;
  }

  const cards = [
    {
      icon: "ph-sparkle",
      title: "종합 설명",
      body: buildVerdict(best)
    },
    {
      icon: "ph-drop-half",
      title: "웻슈트",
      body: best.translated.suit_recommendation
    },
    {
      icon: "ph-wind",
      title: best.translated.wind_type,
      body: best.translated.wind_comment
    },
    {
      icon: "ph-arrows-split",
      title: best.break_type,
      body: best.break_comment
    },
    {
      icon: "ph-timer",
      title: "파도 주기",
      body: best.translated.wave_period_text
    }
  ];

  elements.detailGrid.innerHTML = cards
    .map((card) => `
        <article class="detail-card">
          <div class="detail-icon"><i class="ph ${card.icon}"></i></div>
          <div>
            <h3>${card.title}</h3>
            <p>${card.body}</p>
          </div>
        </article>
      `)
    .join("");
}

function renderRawData() {
  const spot = getCurrentSpot();
  const best = getBestHourForSelectedDate();
  const payload = {
    spot: spot?.id,
    selected_date: state.selectedDate,
    best_hour: best,
    source: state.data?.source
  };

  elements.rawData.hidden = !state.showRaw;
  elements.rawToggle.querySelector("i").className = state.showRaw ? "ph ph-caret-up" : "ph ph-caret-down";
  elements.rawData.textContent = JSON.stringify(payload, null, 2);
}

function buildQuery(params) {
  return new URLSearchParams(params).toString();
}

function at(list, index) {
  return Array.isArray(list) ? list[index] : null;
}

function normalizeAngle(angle) {
  if (typeof angle !== "number" || Number.isNaN(angle)) return null;
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

function classifyWaveBreak(waveDirection, beachFacingAngle) {
  const angleDiff = normalizeAngle(waveDirection - beachFacingAngle);

  if (angleDiff === null) {
    return {
      angle_diff: null,
      break_type: "방향 정보 없음",
      break_comment: "파도 방향 데이터가 없어 브레이크 성향을 판단하지 않았습니다."
    };
  }

  const absDiff = Math.abs(angleDiff);

  if (absDiff <= 15) {
    return {
      angle_diff: angleDiff,
      break_type: "A프레임",
      break_comment: "정면으로 들어오는 파도라 좌우로 갈라지는 구간을 기대할 수 있습니다."
    };
  }

  if (angleDiff < -15 && angleDiff >= -70) {
    return {
      angle_diff: angleDiff,
      break_type: "레프트 성향",
      break_comment: "오른쪽에서 먼저 부서지는 흐름입니다."
    };
  }

  if (angleDiff > 15 && angleDiff <= 70) {
    return {
      angle_diff: angleDiff,
      break_type: "라이트 성향",
      break_comment: "왼쪽에서 먼저 부서지는 흐름입니다."
    };
  }

  return {
    angle_diff: angleDiff,
    break_type: "방향 불리",
    break_comment: "해변 방향과 파도 방향이 많이 어긋나 힘이 약하거나 차피할 수 있습니다."
  };
}

function classifyWind(windDirection, beachFacingAngle) {
  if (windDirection === null || windDirection === undefined) {
    return {
      wind_type: "바람 정보 없음",
      wind_comment: "바람 방향 데이터가 없어 파도 면 상태를 판단하지 않았습니다."
    };
  }

  const onshoreDiff = Math.abs(normalizeAngle(windDirection - beachFacingAngle));
  const offshoreDiff = Math.abs(normalizeAngle(windDirection - ((beachFacingAngle + 180) % 360)));

  if (offshoreDiff <= 60) {
    return {
      wind_type: "오프쇼어",
      wind_comment: "육지에서 바다로 부는 바람입니다. 파도 면이 정리될 가능성이 높습니다."
    };
  }

  if (onshoreDiff <= 60) {
    return {
      wind_type: "온쇼어",
      wind_comment: "바다에서 육지로 부는 바람입니다. 파도 면이 지저분하고 힘이 흩어질 수 있습니다."
    };
  }

  return {
    wind_type: "사이드 바람",
    wind_comment: "해변을 비스듬히 가르는 바람입니다. 강하면 라인 잡기가 어려울 수 있습니다."
  };
}

function translateWaveHeight(height) {
  if (height === null || height === undefined) return "파고 데이터가 아직 없습니다.";
  if (height < 0.4) return "너무 작습니다. 서핑보다는 패들, 테이크오프 연습 정도로 보는 날입니다.";
  if (height < 0.8) return "작은 파도입니다. 롱보드나 소프트보드로 가볍게 놀 수는 있지만 좋은 날로 보긴 어렵습니다.";
  if (height < 1.0) return "탈 수는 있지만 아직 약간 아쉽습니다. 바람과 주기가 좋아야 재미가 납니다.";
  if (height <= 1.5) return "서핑하기 좋은 크기입니다. 면이 깨끗하면 충분히 즐길 만한 컨디션입니다.";
  if (height <= 1.8) return "힘 있는 파도입니다. 중급 이상에게는 좋을 수 있지만 라인업과 안전을 확인하세요.";
  return "큰 파도입니다. 경험자 기준에서도 컨디션과 안전 확인이 먼저입니다.";
}

function translateWavePeriod(period) {
  if (period === null || period === undefined) return "주기 데이터가 아직 없습니다.";
  if (period >= 9) return "주기가 좋아 파도가 힘 있게 밀고 들어올 가능성이 큽니다.";
  if (period >= 7) return "주기가 무난합니다. 파고가 받쳐주면 충분히 탈 만합니다.";
  if (period >= 6) return "주기가 짧은 편입니다. 파도가 빨리 무너질 수 있습니다.";
  return "주기가 짧아 파도가 힘 없이 부서질 가능성이 큽니다.";
}

function getSuitRecommendation(temp) {
  if (temp === null || temp === undefined) return "수온 확인 후 웻슈트를 결정하세요.";
  if (temp <= 14) return "5/4mm 풀슈트 + 부츠 + 글러브";
  if (temp <= 18) return "3/2mm 풀슈트";
  if (temp <= 22) return "스프링슈트 또는 얇은 풀슈트";
  return "보드숏 또는 래시가드";
}

function getWaveHeightScore(height) {
  if (height === null || height === undefined) return 0;
  if (height < 0.4) return -26;
  if (height < 0.7) return -16;
  if (height < 0.9) return 0;
  if (height < 1.0) return 10;
  if (height <= 1.4) return 30;
  if (height <= 1.8) return 12;
  return -14;
}

function getPeriodScore(period) {
  if (period === null || period === undefined) return 0;
  if (period >= 9) return 18;
  if (period >= 7) return 12;
  if (period >= 6) return 5;
  return -12;
}

function getWindScore(windType, windSpeed) {
  let score = 0;
  if (windType === "오프쇼어") score += 16;
  if (windType === "온쇼어") score -= 18;
  if (windSpeed === null || windSpeed === undefined) return score;
  if (windSpeed <= 3) score += 8;
  else if (windSpeed <= 6) score += 2;
  else if (windSpeed <= 9) score -= 8;
  else score -= 18;
  return score;
}

function scoreStaticHour(frame, beachFacingAngle) {
  const wind = classifyWind(frame.wind_direction_10m, beachFacingAngle);
  let score = 44;

  score += getWaveHeightScore(frame.wave_height);
  score += getPeriodScore(frame.wave_period);
  score += getWindScore(wind.wind_type, frame.wind_speed_10m);

  if (frame.wave_height < 0.7) score = Math.min(score, 49);
  else if (frame.wave_height < 0.9) score = Math.min(score, 62);
  else if (frame.wave_height < 1.0) score = Math.min(score, 73);
  if (frame.wave_period < 6) score = Math.min(score, 72);
  if (frame.wave_period < 7) score = Math.min(score, 73);
  if (wind.wind_type !== "오프쇼어") score = Math.min(score, 78);
  if (wind.wind_type !== "오프쇼어" && frame.wave_period < 7) score = Math.min(score, 68);
  if (wind.wind_type === "온쇼어" && frame.wind_speed_10m >= 4) score = Math.min(score, 70);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function ratingFromScore(score) {
  if (score >= 74) return "좋음";
  if (score >= 52) return "보통";
  return "별로";
}

function translateStaticFrame(frame, spot) {
  const wind = classifyWind(frame.wind_direction_10m, spot.beachFacingAngle);
  const score = scoreStaticHour(frame, spot.beachFacingAngle);
  const rating = ratingFromScore(score);

  return {
    score,
    rating,
    wave_height_text: translateWaveHeight(frame.wave_height),
    wave_period_text: translateWavePeriod(frame.wave_period),
    water_temperature_text: frame.sea_surface_temperature === null ? "수온 데이터가 아직 없습니다." : "수온 기준 웻슈트 선택을 참고하세요.",
    suit_recommendation: getSuitRecommendation(frame.sea_surface_temperature),
    wind_type: wind.wind_type,
    wind_comment: wind.wind_comment,
    summary: `${rating}: 파고 ${frame.wave_height ?? "-"}m, 주기 ${frame.wave_period ?? "-"}초, 바람 ${wind.wind_type}`
  };
}

function buildDailySummaries(hourly) {
  const grouped = hourly.reduce((days, item) => {
    if (!days[item.date]) days[item.date] = [];
    days[item.date].push(item);
    return days;
  }, {});

  return Object.entries(grouped).map(([date, items]) => {
    const bestHour = items.reduce((best, item) => {
      if (!best || item.translated.score > best.translated.score) return item;
      return best;
    }, null);

    const avgScore = Math.round(items.reduce((sum, item) => sum + item.translated.score, 0) / items.length);

    return {
      date,
      best_time: bestHour?.hour || null,
      rating: bestHour?.translated.rating || "정보 없음",
      avg_score: avgScore,
      best_score: bestHour?.translated.score || null,
      summary: bestHour ? `${bestHour.hour} 전후가 가장 무난합니다. ${bestHour.translated.summary}` : "예보 데이터가 없습니다."
    };
  });
}

async function fetchStaticSpotForecast(spot) {
  const marineUrl = `${MARINE_API_URL}?${buildQuery({
    latitude: spot.latitude,
    longitude: spot.longitude,
    hourly: "wave_height,wave_period,wave_direction,sea_surface_temperature",
    timezone: TIMEZONE,
    forecast_days: 7,
    cell_selection: "sea"
  })}`;
  const weatherUrl = `${WEATHER_API_URL}?${buildQuery({
    latitude: spot.latitude,
    longitude: spot.longitude,
    hourly: "wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "ms",
    timezone: TIMEZONE,
    forecast_days: 7
  })}`;

  const [marineResponse, windResponse] = await Promise.all([
    fetch(marineUrl),
    fetch(weatherUrl)
  ]);

  if (!marineResponse.ok || !windResponse.ok) {
    throw new Error("Open-Meteo 직접 호출 실패");
  }

  const marine = await marineResponse.json();
  const wind = await windResponse.json();
  const marineHourly = marine.hourly || {};
  const windHourly = wind.hourly || {};

  const hourly = marineHourly.time.map((time, index) => {
    const frame = {
      time,
      date: time.slice(0, 10),
      hour: time.slice(11, 16),
      wave_height: at(marineHourly.wave_height, index),
      wave_period: at(marineHourly.wave_period, index),
      wave_direction: at(marineHourly.wave_direction, index),
      sea_surface_temperature: at(marineHourly.sea_surface_temperature, index),
      wind_speed_10m: at(windHourly.wind_speed_10m, index),
      wind_direction_10m: at(windHourly.wind_direction_10m, index)
    };
    const breakInfo = classifyWaveBreak(frame.wave_direction, spot.beachFacingAngle);

    return {
      ...frame,
      translated: translateStaticFrame(frame, spot),
      break_type: breakInfo.break_type,
      break_comment: breakInfo.break_comment,
      angle_diff: breakInfo.angle_diff
    };
  });

  return {
    id: spot.id,
    name: spot.name,
    full_name: spot.fullName,
    note: spot.note,
    latitude: spot.latitude,
    longitude: spot.longitude,
    beach_facing_angle: spot.beachFacingAngle,
    hourly_units: {
      wave_height: "m",
      wave_period: "s",
      wave_direction: "deg",
      sea_surface_temperature: "°C",
      wind_speed_10m: "m/s",
      wind_direction_10m: "deg"
    },
    hourly,
    daily: buildDailySummaries(hourly)
  };
}

async function fetchStaticSurfData() {
  const spots = await Promise.all(STATIC_SPOTS.map((spot) => fetchStaticSpotForecast(spot)));

  return {
    updated_at: new Date().toISOString(),
    last_error: null,
    source: {
      marine: "Open-Meteo Marine API",
      weather: "Open-Meteo Weather Forecast API",
      mode: "static-browser-fetch"
    },
    spots
  };
}

function render() {
  renderStatus();
  renderSpotSwitch();
  renderBestSummary();
  renderTodayCard();
  renderCriteriaCard();
  renderDateStrip();
  renderHourlyList();
  renderDetails();
  renderRawData();
  elements.refreshButton.disabled = state.loading;
}

async function loadSurfData({ refresh = false } = {}) {
  setState({ loading: true, error: null });

  try {
    const endpoint = refresh ? "/api/surf-data/refresh" : "/api/surf-data";
    const response = await fetch(`${API_BASE_URL}${endpoint}`);

    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }

    const data = await response.json();
    const currentSpot = data.spots.find((spot) => spot.id === state.currentSpotId) || data.spots[0];
    const selectedDate = state.selectedDate || currentSpot?.daily?.[0]?.date || null;

    setState({
      loading: false,
      data,
      currentSpotId: currentSpot?.id || state.currentSpotId,
      selectedDate
    });
  } catch (error) {
    try {
      const data = await fetchStaticSurfData();
      const currentSpot = data.spots.find((spot) => spot.id === state.currentSpotId) || data.spots[0];
      const selectedDate = state.selectedDate || currentSpot?.daily?.[0]?.date || null;

      setState({
        loading: false,
        data,
        currentSpotId: currentSpot?.id || state.currentSpotId,
        selectedDate
      });
    } catch (staticError) {
      setState({
        loading: false,
        error: `예보를 불러오지 못했습니다. ${staticError.message || error.message}`
      });
    }
  }
}

elements.spotSwitch.addEventListener("click", (event) => {
  const button = event.target.closest("[data-spot-id]");
  if (!button || !state.data) return;

  const spot = state.data.spots.find((item) => item.id === button.dataset.spotId);
  setState({
    currentSpotId: button.dataset.spotId,
    selectedDate: spot?.daily?.[0]?.date || null
  });
});

elements.dateStrip.addEventListener("click", (event) => {
  const button = event.target.closest("[data-date]");
  if (!button) return;
  setState({ selectedDate: button.dataset.date });
});

elements.rawToggle.addEventListener("click", () => {
  setState({ showRaw: !state.showRaw });
});

elements.refreshButton.addEventListener("click", () => {
  loadSurfData({ refresh: true });
});

subscribe(render);
loadSurfData();
