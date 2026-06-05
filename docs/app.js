const MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine";
const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEZONE = "Asia/Seoul";

const SPOTS = [
  {
    id: "songjeong-lastwave",
    region: "songjeong",
    name: "라스트웨이브",
    shortName: "라스트",
    fullName: "송정 라스트웨이브 앞",
    latitude: 35.1787,
    longitude: 129.1992,
    beachFacingAngle: 135,
    idealSwellFrom: 315,
    tidePreference: "mid-high",
    beginnerRiskHeight: 1.5,
    note: "송정 남동향 기준. 북서 계열에서 들어오는 정스웰과 약한 오프쇼어를 우선합니다."
  },
  {
    id: "songjeong-surfholic",
    region: "songjeong",
    name: "서프홀릭",
    shortName: "서프홀릭",
    fullName: "송정 서프홀릭 앞",
    latitude: 35.1793,
    longitude: 129.2000,
    beachFacingAngle: 135,
    idealSwellFrom: 315,
    tidePreference: "mid-high",
    beginnerRiskHeight: 1.5,
    note: "송정 남동향 기준. 0.5m 이상 정스웰이면 롱보드 기준 탈만한 시간대로 봅니다."
  },
  {
    id: "dadaepo-morundae",
    region: "dadaepo",
    name: "몰운대",
    shortName: "몰운대",
    fullName: "다대포 몰운대 포인트",
    latitude: 35.0464,
    longitude: 128.9647,
    beachFacingAngle: 180,
    idealSwellFrom: 180,
    tidePreference: "mid-high",
    beginnerRiskHeight: 1.6,
    note: "Left breaking 성향. 다대포 세 포인트 중 파도가 비교적 작게 들어오는 편으로 봅니다.",
    mapImage: "./assets/dadaepo-points.jpg"
  },
  {
    id: "dadaepo-mid",
    region: "dadaepo",
    name: "미드",
    shortName: "미드",
    fullName: "다대포 미드 포인트",
    latitude: 35.0469,
    longitude: 128.9687,
    beachFacingAngle: 180,
    idealSwellFrom: 180,
    tidePreference: "mid-high",
    beginnerRiskHeight: 1.6,
    note: "가장 많은 서퍼가 타는 구간. 간조에는 빠르게 닫히고, 중물~만조에 롱보드 컨디션이 좋아지는 쪽으로 봅니다.",
    mapImage: "./assets/dadaepo-points.jpg"
  },
  {
    id: "dadaepo-songan",
    region: "dadaepo",
    name: "송안",
    shortName: "송안",
    fullName: "다대포 송안 포인트",
    latitude: 35.0479,
    longitude: 128.9725,
    beachFacingAngle: 180,
    idealSwellFrom: 180,
    tidePreference: "low-mid",
    beginnerRiskHeight: 1.4,
    note: "라인업이 멀고 조류 대응이 필요합니다. 초보자 입수 비추천. Mid-Low~Low-Mid 구간을 우선합니다.",
    mapImage: "./assets/dadaepo-points.jpg"
  }
];

const state = {
  loading: true,
  error: null,
  data: null,
  currentSpotId: "songjeong-lastwave",
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

function buildQuery(params) {
  return new URLSearchParams(params).toString();
}

function at(list, index) {
  return Array.isArray(list) ? list[index] : null;
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

function normalizeAngle(angle) {
  if (typeof angle !== "number" || Number.isNaN(angle)) return null;
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

function angularDistance(a, b) {
  const diff = normalizeAngle(a - b);
  return diff === null ? 180 : Math.abs(diff);
}

function directionArrow(deg) {
  if (deg === null || deg === undefined) return "-";
  const arrows = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"];
  return arrows[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function getCurrentSpot() {
  if (!state.data) return null;
  return state.data.spots.find((spot) => spot.id === state.currentSpotId) || state.data.spots[0];
}

function getSelectedHours() {
  const spot = getCurrentSpot();
  if (!spot || !state.selectedDate) return [];
  return spot.hourly.filter((item) => item.date === state.selectedDate && isSurfableHour(item.hour));
}

function getBestHourForSelectedDate() {
  return getSelectedHours().reduce((best, item) => {
    if (!best || item.translated.score > best.translated.score) return item;
    return best;
  }, null);
}

function getOverallBestHour() {
  const spot = getCurrentSpot();
  if (!spot) return null;
  return spot.hourly.filter((item) => isSurfableHour(item.hour)).reduce((best, item) => {
    if (!best || item.translated.score > best.translated.score) return item;
    return best;
  }, null);
}

function isSurfableHour(hourText) {
  const hour = Number(String(hourText).slice(0, 2));
  return hour >= 5 && hour <= 19;
}

function getDefaultSelectedDate(spot) {
  return spot?.daily?.find((day) => day.best_score !== null)?.date || spot?.daily?.[0]?.date || null;
}

function classifyWind(windDirection, beachFacingAngle) {
  if (windDirection === null || windDirection === undefined) {
    return {
      wind_type: "바람 정보 없음",
      wind_comment: "바람 방향 데이터가 없어 파도 면 상태를 판단하지 않았습니다."
    };
  }

  const onshoreDiff = angularDistance(windDirection, beachFacingAngle);
  const offshoreDiff = angularDistance(windDirection, (beachFacingAngle + 180) % 360);

  if (offshoreDiff <= 60) {
    return {
      wind_type: "오프쇼어",
      wind_comment: "해변에서 바다로 부는 바람입니다. 파도 면이 정리될 가능성이 높습니다."
    };
  }

  if (onshoreDiff <= 60) {
    return {
      wind_type: "온쇼어",
      wind_comment: "바다에서 해변으로 부는 바람입니다. 강하면 파도가 빨리 무너지고 지저분해집니다."
    };
  }

  return {
    wind_type: "사이드 바람",
    wind_comment: "해변을 비스듬히 가르는 바람입니다. 강하면 라인 잡기가 어려울 수 있습니다."
  };
}

function classifySwell(frame, spot) {
  if (spot.region === "dadaepo") {
    const southDiff = angularDistance(frame.wave_direction, 180);
    const seDiff = angularDistance(frame.wave_direction, 115);

    if (southDiff <= 55) {
      return {
        type: "남스웰",
        passed: true,
        diff: southDiff,
        dadaeppong: true,
        weakDadaeppong: false,
        comment: "다대포가 가장 잘 받는 남스웰 계열입니다."
      };
    }

    if (seDiff <= 50 && frame.wave_height >= 0.75) {
      return {
        type: "약다대뽕 스웰",
        passed: true,
        diff: seDiff,
        dadaeppong: true,
        weakDadaeppong: true,
        comment: "6월 2일 실제 체감처럼, 남스웰은 아니지만 다대포에서 약하게 살아날 수 있는 남동~동남 계열입니다."
      };
    }

    if (seDiff <= 70 && frame.wave_height >= 0.9) {
      return {
        type: "애매한 다대포 스웰",
        passed: true,
        diff: seDiff,
        dadaeppong: false,
        weakDadaeppong: true,
        comment: "방향은 완벽하지 않지만 사이즈가 받쳐주면 다대포에서 반응할 수 있습니다."
      };
    }

    return {
      type: "역스웰",
      passed: false,
      diff: Math.min(southDiff, seDiff),
      dadaeppong: false,
      weakDadaeppong: false,
      comment: "다대포 기준으로는 체감 파도가 약하게 들어올 가능성이 큽니다."
    };
  }

  const diff = angularDistance(frame.wave_direction, spot.idealSwellFrom);

  if (diff <= 45) {
    return {
      type: "정스웰",
      passed: true,
      diff,
      comment: "파도 방향이 스팟이 받는 주 방향과 잘 맞습니다."
    };
  }

  if (diff <= 90) {
    return {
      type: "비스듬한 스웰",
      passed: frame.wave_height >= 0.8,
      diff,
      comment: "방향은 살짝 비껴갑니다. 사이즈가 받쳐주면 탈 수 있습니다."
    };
  }

  return {
    type: "역스웰",
    passed: false,
    diff,
    comment: "차트보다 체감 파도가 약하게 들어올 가능성이 큽니다."
  };
}

function classifyTide(frame, spot) {
  if (frame.sea_level_height_msl === null || frame.sea_level_height_msl === undefined) {
    return {
      type: "조위 없음",
      passed: false,
      comment: "조위 데이터가 없어 타이드 판단은 제외했습니다."
    };
  }

  const tide = frame.tide_phase || "unknown";
  if (spot.tidePreference === "low-mid") {
    const passed = tide === "low" || tide === "mid";
    return {
      type: tideLabel(tide),
      passed,
      comment: passed ? "송안 기준으로 선호하는 Low~Mid 구간입니다." : "송안은 만조 전후보다 Low~Mid 구간을 우선합니다."
    };
  }

  const passed = tide === "mid" || tide === "high";
  return {
    type: tideLabel(tide),
    passed,
    comment: passed ? "중물~만조권으로 롱보드 기준 유리하게 봅니다." : "간조권이라 빠르게 닫히거나 얕아질 수 있습니다."
  };
}

function tideLabel(tide) {
  if (tide === "high") return "만조권";
  if (tide === "mid") return "중물";
  if (tide === "low") return "간조권";
  return "조위 애매";
}

function translateWaveHeight(height, spot) {
  if (height === null || height === undefined) return "파고 데이터가 아직 없습니다.";

  if (spot.region === "songjeong") {
    if (height < 0.4) return "송정 기준으로 작습니다. 패들 연습이나 소프트보드 정도로 보세요.";
    if (height < 0.5) return "작지만 정스웰이면 롱보드로 겨우 탈 수 있는 구간입니다.";
    if (height < 0.8) return "정스웰이면 롱보드 기준 탈만합니다. 한국 기준으로는 나쁘지 않습니다.";
    if (height < 1.5) return "송정 기준 좋은 사이즈입니다. 바람만 약하면 충분히 즐길 만합니다.";
    return "송정 기준 큽니다. 초보자는 위험할 수 있습니다.";
  }

  if (height < 0.7) return "다대포 기준 작습니다. 포인트와 타이드가 받쳐줘야 합니다.";
  if (height < 1.0) return "다대포 기준 애매하지만 남스웰과 약한 바람이면 롱보드 가능성이 있습니다.";
  if (height < 1.8) return "다대포 기준 좋은 사이즈입니다. 남스웰, 6m/s 이하 바람이면 우선 확인할 만합니다.";
  return "다대포 기준 큽니다. 조류와 라인업 거리까지 고려해야 합니다.";
}

function translateWavePeriod(period, spot) {
  if (period === null || period === undefined) return "주기 데이터가 아직 없습니다.";

  if (spot.region === "songjeong") {
    if (period >= 9) return "송정은 긴 피리어드가 덤프 성향을 만들 수 있습니다. 무조건 가산하지 않습니다.";
    if (period >= 6) return "송정 기준 무난한 주기입니다. 파고와 스웰 방향이 더 중요합니다.";
    return "주기가 짧아 힘이 약할 수 있습니다.";
  }

  if (period >= 7) return "다대포 기준 통과 주기입니다. 사이즈와 남스웰이면 좋은 후보입니다.";
  if (period >= 6) return "다대포 기준 최소권입니다. 다른 조건이 좋아야 합니다.";
  return "다대포 기준 주기가 짧습니다.";
}

function getSuitRecommendation(temp) {
  if (temp === null || temp === undefined) return "수온 확인 후 웻슈트를 결정하세요.";
  if (temp <= 14) return "5/4mm 풀슈트 + 부츠 + 글러브";
  if (temp <= 18) return "3/2mm 풀슈트";
  if (temp <= 22) return "스프링슈트 또는 얇은 풀슈트";
  return "보드숏 또는 래시가드";
}

function scoreHour(frame, spot) {
  const wind = classifyWind(frame.wind_direction_10m, spot.beachFacingAngle);
  const swell = classifySwell(frame, spot);
  const tide = classifyTide(frame, spot);
  let score = 42;

  if (spot.region === "songjeong") {
    if (frame.wave_height >= 0.5) score += 16;
    if (frame.wave_height >= 0.8) score += 18;
    if (frame.wave_height >= 1.5) score -= 18;
    if (swell.type === "정스웰") score += 24;
    else if (swell.type === "비스듬한 스웰") score += 8;
    else score -= 18;
    if (frame.wave_period >= 6 && frame.wave_period < 9) score += 8;
    if (frame.wave_period >= 9) score -= 8;
  } else {
    if (frame.wave_height >= 0.75) score += 10;
    if (frame.wave_height >= 0.9) score += 18;
    if (frame.wave_height >= 1.0) score += 16;
    if (frame.wave_height >= 1.8) score -= 8;
    if (swell.type === "남스웰") score += 24;
    else if (swell.type === "약다대뽕 스웰") score += 18;
    else if (swell.type === "애매한 다대포 스웰") score += 10;
    else score -= 16;
    if (frame.wave_period >= 7) score += 14;
    else if (frame.wave_period >= 6) score += 5;
    else if (swell.weakDadaeppong && frame.wave_height >= 0.8) score -= 2;
    else score -= 10;
  }

  if (wind.wind_type === "오프쇼어") score += frame.wind_speed_10m <= 5 ? 16 : 8;
  if (wind.wind_type === "온쇼어") score -= frame.wind_speed_10m >= 6 ? 24 : 12;
  if (frame.wind_speed_10m <= 5) score += 6;
  if (frame.wind_speed_10m >= 10) score -= 24;
  if (tide.passed) score += spot.region === "dadaepo" ? 10 : 4;
  if (spot.region === "dadaepo" && frame.precipitation >= 1) score -= 6;
  if (spot.region === "dadaepo" && frame.precipitation >= 5) score -= 20;

  const weakDadaeppongWindow =
    spot.region === "dadaepo" &&
    swell.weakDadaeppong &&
    frame.wave_height >= 0.78 &&
    frame.wave_height <= 1.1 &&
    (wind.wind_type === "오프쇼어" || wind.wind_type === "사이드 바람") &&
    frame.wind_speed_10m <= 8 &&
    tide.passed &&
    (!frame.precipitation || frame.precipitation < 1);

  if (weakDadaeppongWindow) {
    score = Math.max(score, 68);
    if (frame.wave_height >= 0.9) score = Math.max(score, 72);
  }

  if (frame.wave_height < 0.5 && spot.region === "songjeong") score = Math.min(score, 58);
  if (frame.wave_height < 0.9 && spot.region === "dadaepo") score = Math.min(score, 62);
  if (weakDadaeppongWindow) score = Math.max(score, 68);
  if (wind.wind_type === "온쇼어" && frame.wind_speed_10m >= 6) score = Math.min(score, 58);
  if (frame.wind_speed_10m >= 10) score = Math.min(score, 45);
  if (spot.region === "dadaepo" && frame.precipitation >= 5) score = Math.min(score, 55);
  if (spot.id === "dadaepo-songan" && frame.translated?.rating !== "좋음") score = Math.min(score, 74);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function ratingFromScore(score) {
  if (score >= 72) return "좋음";
  if (score >= 52) return "보통";
  return "별로";
}

function translateFrame(frame, spot) {
  const wind = classifyWind(frame.wind_direction_10m, spot.beachFacingAngle);
  const swell = classifySwell(frame, spot);
  const tide = classifyTide(frame, spot);
  const score = scoreHour(frame, spot);
  const rating = ratingFromScore(score);

  return {
    score,
    rating,
    signal: signalColor(score),
    wave_height_text: translateWaveHeight(frame.wave_height, spot),
    wave_period_text: translateWavePeriod(frame.wave_period, spot),
    water_temperature_text: frame.sea_surface_temperature === null ? "수온 데이터가 아직 없습니다." : "수온 기준 웻슈트 선택을 참고하세요.",
    suit_recommendation: getSuitRecommendation(frame.sea_surface_temperature),
    wind_type: wind.wind_type,
    wind_comment: wind.wind_comment,
    swell_type: swell.type,
    swell_comment: swell.comment,
    tide_type: tide.type,
    tide_comment: tide.comment,
    summary: `${rating}: 파고 ${frame.wave_height ?? "-"}m, 주기 ${frame.wave_period ?? "-"}초, ${swell.type}, 바람 ${wind.wind_type}`
  };
}

function signalColor(score) {
  if (score >= 72) return "green";
  if (score >= 52) return "yellow";
  return "red";
}

function conditionChecks(item) {
  const spot = getCurrentSpot();
  const swell = classifySwell(item, spot);
  const tide = classifyTide(item, spot);
  const wavePass = spot.region === "songjeong" ? item.wave_height >= 0.5 : item.wave_height >= 1.0;
  const periodPass = spot.region === "songjeong" ? item.wave_period >= 6 && item.wave_period < 9 : item.wave_period >= 6.5;
  const windPass = item.wind_speed_10m <= 5 || (item.translated.wind_type === "오프쇼어" && item.wind_speed_10m <= 7);
  const rainPass = spot.region !== "dadaepo" || !item.precipitation || item.precipitation < 1;

  const checks = [
    { key: "wave", label: "파고", passed: wavePass, value: `${item.wave_height ?? "-"}m` },
    { key: "swell", label: "스웰", passed: swell.passed, value: swell.type },
    { key: "wind", label: "바람", passed: windPass, value: `${item.translated.wind_type} ${item.wind_speed_10m ?? "-"}m/s` },
    { key: "period", label: "주기", passed: periodPass, value: `${item.wave_period ?? "-"}s` },
    { key: "tide", label: "조위", passed: tide.passed, value: tide.type }
  ];

  if (spot.region === "dadaepo") {
    checks.push({ key: "rain", label: "비", passed: rainPass, value: `${item.precipitation ?? 0}mm` });
  }

  return checks;
}

function formatBestWindow(item) {
  if (!item) return "계산 중";
  return `${formatDay(item.date)} ${item.hour}`;
}

function buildVerdict(best) {
  if (!best) return "데이터 대기 중";
  if (best.translated.swell_type === "약다대뽕 스웰" && best.translated.rating !== "별로") {
    return "크기는 크지 않아도 다대포가 반응할 수 있는 약다대뽕 후보입니다. 현장 체감 확인 가치가 있습니다.";
  }
  if (best.translated.rating === "좋음") {
    return "한국 기준으로 체크할 만한 시간입니다. 파고, 스웰 방향, 바람 중 핵심 조건이 맞습니다.";
  }
  if (best.translated.rating === "보통") {
    return "완벽하진 않지만 들어갈 명분은 있습니다. 보드 선택과 현장 확인이 중요합니다.";
  }
  return "기대치를 낮추는 구간입니다. 바람, 방향, 타이드 중 한두 조건이 크게 맞지 않습니다.";
}

function renderStatus() {
  if (state.loading) {
    elements.statusArea.innerHTML = `
      <div class="notice">
        <i class="ph ph-spinner-gap"></i>
        <span>섭힙 인덱스 계산 중. 한국 기준으로 파고, 스웰, 바람, 조위를 묶는 중입니다.</span>
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
      <span>LIVE ${updatedAt} · 한국 스팟 기준 컨디션 스코어 · 조위는 Open-Meteo 참고값</span>
    </div>
  `;
}

function renderSpotSwitch() {
  const spots = state.data?.spots || [];
  elements.spotSwitch.innerHTML = spots
    .map((spot) => `
      <button class="spot-button ${spot.id === state.currentSpotId ? "is-active" : ""}" type="button" data-spot-id="${spot.id}">
        <span>${spot.short_name || spot.name}</span>
        <small>${spot.region.toUpperCase()}</small>
      </button>
    `)
    .join("");
}

function renderBestSummary() {
  const spot = getCurrentSpot();
  const overallBest = getOverallBestHour();

  if (state.loading || !spot || !overallBest) {
    elements.bestSummary.innerHTML = `
      <div class="summary-card">
        <p class="section-kicker">OVERALL BEST</p>
        <h2>전체 최고 추천 계산 중</h2>
        <p>7일 예보에서 가장 괜찮은 시간대를 찾고 있습니다.</p>
      </div>
    `;
    return;
  }

  elements.bestSummary.innerHTML = `
    <div class="summary-card">
      <div>
        <p class="section-kicker">OVERALL BEST</p>
        <h2>${formatBestWindow(overallBest)}</h2>
        <p>${overallBest.translated.rating}, 파고 ${overallBest.wave_height}m, 주기 ${overallBest.wave_period}s, ${overallBest.translated.swell_type}, 바람 ${overallBest.translated.wind_type}</p>
      </div>
      <div class="summary-score ${ratingClass(overallBest.translated.rating)}">
        <span>SCORE</span>
        <strong>${overallBest.translated.score}</strong>
      </div>
    </div>
  `;
}

function renderTodayCard() {
  const spot = getCurrentSpot();
  const best = getBestHourForSelectedDate();

  if (state.loading || !spot) {
    elements.todayCard.innerHTML = `<div class="hero-content"><p>예보 데이터를 준비하고 있습니다.</p></div>`;
    return;
  }

  if (!best) {
    elements.todayCard.innerHTML = `<div class="hero-content"><p>선택한 날짜에는 05:00~19:00 기준 추천 가능한 데이터가 없습니다.</p></div>`;
    return;
  }

  const pillClass = ratingClass(best.translated.rating);
  const heroTitle =
    best.translated.rating === "좋음"
      ? `${best.hour} GO`
      : best.translated.rating === "보통"
        ? `${best.hour} CHECK`
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
        <div class="metric"><span>SWELL</span><strong>${best.translated.swell_type}</strong></div>
        <div class="metric"><span>TIDE</span><strong>${best.translated.tide_type}</strong></div>
      </div>
    </div>
  `;
}

function renderCriteriaCard() {
  const spot = getCurrentSpot();
  const best = getBestHourForSelectedDate();
  if (!spot || !best) {
    elements.criteriaCard.innerHTML = "";
    return;
  }

  const checks = conditionChecks(best);
  const criteriaText =
    spot.region === "songjeong"
      ? "송정: 0.5m 이상 + 정스웰 + 5m/s 이하 바람을 우선. 긴 피리어드는 덤프 가능성으로 감점."
      : "다대포: 남스웰 + 1.0m 전후 이상 + 6m/s 이하 바람 + 포인트별 타이드 선호를 우선.";

  elements.criteriaCard.innerHTML = `
    <div class="criteria-head">
      <div>
        <p class="section-kicker">KOREA RULE</p>
        <h2>판정 기준</h2>
      </div>
      <p>${criteriaText}</p>
    </div>
    <div class="criteria-grid">
      ${checks
        .map((check) => `
          <div class="criteria-chip ${check.passed ? "pass" : "fail"}">
            <span>${check.label}</span>
            <strong>${check.value}</strong>
            <em>${check.passed ? "통과" : "주의"}</em>
          </div>
        `)
        .join("")}
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
    .map((day) => {
      const score = day.best_score ?? "-";
      return `
        <button class="date-button ${day.date === state.selectedDate ? "is-active" : ""}" type="button" data-date="${day.date}">
          <strong>${formatDay(day.date)}</strong>
          <span>${day.rating} · ${score}</span>
        </button>
      `;
    })
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
        <article class="hour-card signal-${item.translated.signal}">
          <div class="hour-time">${item.hour}</div>
          <div class="hour-main">
            <strong>${item.translated.summary}</strong>
            <span>${directionArrow(item.wave_direction)} 파향 ${item.wave_direction ?? "-"}° · ${directionArrow(item.wind_direction_10m)} 바람 ${item.wind_speed_10m ?? "-"}m/s · 조위 ${item.sea_level_height_msl ?? "-"}m</span>
            <div class="mini-checks">
              ${checks
                .map((check) => `<span class="${check.passed ? "pass" : "fail"}">${check.label} ${check.passed ? "통과" : "주의"}</span>`)
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
  const spot = getCurrentSpot();
  const best = getBestHourForSelectedDate();
  if (!spot || !best) {
    elements.detailGrid.innerHTML = "";
    return;
  }

  const cards = [
    {
      icon: "ph-map-pin",
      title: "스팟 메모",
      body: spot.note
    },
    {
      icon: "ph-waves",
      title: best.translated.swell_type,
      body: best.translated.swell_comment
    },
    {
      icon: "ph-wind",
      title: best.translated.wind_type,
      body: best.translated.wind_comment
    },
    {
      icon: "ph-anchor",
      title: `조위 ${best.translated.tide_type}`,
      body: `${best.translated.tide_comment} Open-Meteo 조위는 연안 정확도가 제한되어 참고값입니다.`
    },
    {
      icon: "ph-drop-half",
      title: "웻슈트",
      body: best.translated.suit_recommendation
    }
  ];

  if (spot.map_image) {
    cards.unshift({
      icon: "ph-image",
      title: "다대포 포인트 지도",
      body: `<img class="spot-map" src="${spot.map_image}" alt="다대포 포인트 안내">`
    });
  }

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

function assignTidePhases(hourly) {
  const byDate = hourly.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {});

  Object.values(byDate).forEach((items) => {
    const values = items
      .map((item) => item.sea_level_height_msl)
      .filter((value) => typeof value === "number");
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    items.forEach((item) => {
      if (typeof item.sea_level_height_msl !== "number") {
        item.tide_phase = "unknown";
        return;
      }

      const normalized = (item.sea_level_height_msl - min) / range;
      if (normalized >= 0.66) item.tide_phase = "high";
      else if (normalized <= 0.33) item.tide_phase = "low";
      else item.tide_phase = "mid";
    });
  });

  return hourly;
}

function buildDailySummaries(hourly) {
  const grouped = hourly.reduce((days, item) => {
    if (!days[item.date]) days[item.date] = [];
    days[item.date].push(item);
    return days;
  }, {});

  return Object.entries(grouped).map(([date, items]) => {
    const scoringItems = items.filter((item) => isSurfableHour(item.hour));
    const bestHour = scoringItems.reduce((best, item) => {
      if (!best || item.translated.score > best.translated.score) return item;
      return best;
    }, null);
    const avgScore = scoringItems.length
      ? Math.round(scoringItems.reduce((sum, item) => sum + item.translated.score, 0) / scoringItems.length)
      : null;

    return {
      date,
      best_time: bestHour?.hour || null,
      rating: bestHour?.translated.rating || "정보 없음",
      avg_score: avgScore,
      best_score: bestHour?.translated.score || null,
      summary: bestHour ? `${bestHour.hour} 전후가 가장 무난합니다. ${bestHour.translated.summary}` : "05:00~19:00 추천 데이터가 없습니다."
    };
  });
}

async function fetchSpotForecast(spot) {
  const marineUrl = `${MARINE_API_URL}?${buildQuery({
    latitude: spot.latitude,
    longitude: spot.longitude,
    hourly: "wave_height,wave_period,wave_direction,sea_surface_temperature,sea_level_height_msl",
    timezone: TIMEZONE,
    forecast_days: 7,
    cell_selection: "sea"
  })}`;
  const weatherUrl = `${WEATHER_API_URL}?${buildQuery({
    latitude: spot.latitude,
    longitude: spot.longitude,
    hourly: "wind_speed_10m,wind_direction_10m,precipitation",
    wind_speed_unit: "ms",
    timezone: TIMEZONE,
    forecast_days: 7
  })}`;

  const [marineResponse, windResponse] = await Promise.all([fetch(marineUrl), fetch(weatherUrl)]);
  if (!marineResponse.ok || !windResponse.ok) throw new Error("Open-Meteo 직접 호출 실패");

  const marine = await marineResponse.json();
  const wind = await windResponse.json();
  const marineHourly = marine.hourly || {};
  const windHourly = wind.hourly || {};

  const hourly = assignTidePhases(
    marineHourly.time.map((time, index) => ({
      time,
      date: time.slice(0, 10),
      hour: time.slice(11, 16),
      wave_height: at(marineHourly.wave_height, index),
      wave_period: at(marineHourly.wave_period, index),
      wave_direction: at(marineHourly.wave_direction, index),
      sea_surface_temperature: at(marineHourly.sea_surface_temperature, index),
      sea_level_height_msl: at(marineHourly.sea_level_height_msl, index),
      wind_speed_10m: at(windHourly.wind_speed_10m, index),
      wind_direction_10m: at(windHourly.wind_direction_10m, index),
      precipitation: at(windHourly.precipitation, index)
    }))
  );

  hourly.forEach((frame) => {
    frame.translated = translateFrame(frame, spot);
  });

  return {
    id: spot.id,
    region: spot.region,
    name: spot.name,
    short_name: spot.shortName,
    full_name: spot.fullName,
    note: spot.note,
    latitude: spot.latitude,
    longitude: spot.longitude,
    beach_facing_angle: spot.beachFacingAngle,
    ideal_swell_from: spot.idealSwellFrom,
    tide_preference: spot.tidePreference,
    map_image: spot.mapImage,
    hourly_units: {
      wave_height: "m",
      wave_period: "s",
      wave_direction: "deg",
      sea_surface_temperature: "°C",
      sea_level_height_msl: "m",
      wind_speed_10m: "m/s",
      wind_direction_10m: "deg"
    },
    hourly,
    daily: buildDailySummaries(hourly)
  };
}

async function fetchSurfData() {
  const spots = await Promise.all(SPOTS.map((spot) => fetchSpotForecast(spot)));

  return {
    updated_at: new Date().toISOString(),
    last_error: null,
    source: {
      marine: "Open-Meteo Marine API",
      weather: "Open-Meteo Weather Forecast API",
      tide_note: "sea_level_height_msl is model-based and coastal accuracy is limited"
    },
    spots
  };
}

async function loadSurfData() {
  setState({ loading: true, error: null });

  try {
    const data = await fetchSurfData();
    const currentSpot = data.spots.find((spot) => spot.id === state.currentSpotId) || data.spots[0];
    const selectedDate = state.selectedDate || getDefaultSelectedDate(currentSpot);

    setState({
      loading: false,
      data,
      currentSpotId: currentSpot?.id || state.currentSpotId,
      selectedDate
    });
  } catch (error) {
    setState({
      loading: false,
      error: `예보를 불러오지 못했습니다. ${error.message}`
    });
  }
}

elements.spotSwitch.addEventListener("click", (event) => {
  const button = event.target.closest("[data-spot-id]");
  if (!button || !state.data) return;

  const spot = state.data.spots.find((item) => item.id === button.dataset.spotId);
  setState({
    currentSpotId: button.dataset.spotId,
    selectedDate: getDefaultSelectedDate(spot)
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
  loadSurfData();
});

subscribe(render);
loadSurfData();
