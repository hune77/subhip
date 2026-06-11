const MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine";
const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";
const JMA_WAVE_DATA_URL = "./data/jma-wave.json";
const TIMEZONE = "Asia/Seoul";
const JMA_BLEND_WEIGHT = 0.4;
const JMA_MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;
const JMA_FETCH_TIMEOUT_MS = 5000;
const MARINE_FETCH_TIMEOUT_MS = 12000;
const WEATHER_FETCH_TIMEOUT_MS = 6000;
const surfScoring = globalThis.SurfScoring || null;

const SPOTS = [
  {
    id: "songjeong-lastwave",
    region: "songjeong",
    name: "라스트웨이브",
    shortName: "라스트",
    fullName: "송정 라스트웨이브 앞",
    latitude: 35.1768,
    longitude: 129.1980,
    beachFacingAngle: 135,
    idealSwellFrom: 160,
    tidePreference: "mid-high",
    beginnerRiskHeight: 1.5,
    note: "송정 남측 라인업, 라스트웨이브 앞바다 포인트입니다. 남동~남서 스웰에 반응하며, 중물 때 가장 컨디션이 좋습니다.",
    mapImage: "./assets/songjeong-lastwave-map.png"
  },
  {
    id: "songjeong-surfholic",
    region: "songjeong",
    name: "서프홀릭",
    shortName: "서프홀릭",
    fullName: "송정 서프홀릭 앞",
    latitude: 35.1795,
    longitude: 129.2015,
    beachFacingAngle: 135,
    idealSwellFrom: 160,
    tidePreference: "mid-high",
    beginnerRiskHeight: 1.5,
    note: "송정 중앙~우측 라인업, 서프홀릭 앞바다 포인트입니다. 남동~남서 스웰에 반응하며, 중물 상승~만조 전이 좋습니다.",
    mapImage: "./assets/songjeong-surfholic-map.png"
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
    tidePreference: "low-mid",
    beginnerRiskHeight: 1.6,
    note: "Left breaking 성향. 세 포인트 중 비교적 작게 들어오며, SW~SSW 스웰과 중썰물~간조 전후를 우선합니다.",
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
    tidePreference: "low-mid",
    beginnerRiskHeight: 1.6,
    note: "가장 많은 서퍼가 타는 구간. SW~SSW 스웰, 8초 이상 주기, 북풍 계열 약풍, 중썰물~간조 전후를 강하게 봅니다.",
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

function roundWaveHeight(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : null;
}

function spotJmaKey(spot) {
  return spot.region === "dadaepo" ? "dadaepo" : "songjeong";
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

function isDirectionBetween(deg, min, max) {
  if (deg === null || deg === undefined) return false;
  const normalized = ((deg % 360) + 360) % 360;
  return min <= max ? normalized >= min && normalized <= max : normalized >= min || normalized <= max;
}

function isSongjeongOptimalSwellDirection(deg) {
  return isDirectionBetween(deg, 105, 180);
}

function isSongjeongEastSwellDirection(deg) {
  return isDirectionBetween(deg, 70, 110);
}

function isSongjeongBlockedSwellDirection(deg) {
  return isDirectionBetween(deg, 25, 65);
}

function isSongjeongOffshoreWind(deg) {
  return angularDistance(deg, 270) <= 35 || angularDistance(deg, 315) <= 35;
}

function isSongjeongOnshoreWind(deg) {
  return isDirectionBetween(deg, 80, 175);
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

function scoreWaveHeight(frame) {
  return frame.combined_wave_height ?? frame.wave_height;
}

function combineWaveHeights(openMeteoHeight, jmaHeight) {
  if (typeof openMeteoHeight !== "number") return roundWaveHeight(jmaHeight);
  if (typeof jmaHeight !== "number") return roundWaveHeight(openMeteoHeight);
  return roundWaveHeight(openMeteoHeight * (1 - JMA_BLEND_WEIGHT) + jmaHeight * JMA_BLEND_WEIGHT);
}

function shouldUseJmaCorrection(openMeteoHeight, jmaHeight) {
  if (typeof jmaHeight !== "number") return false;
  if (typeof openMeteoHeight !== "number") return true;
  return Math.abs(jmaHeight - openMeteoHeight) < 0.8;
}

function findNearestJmaFrame(jmaData, timeText, spot) {
  const frames = jmaData?.forecastHours || [];
  if (!frames.length) return null;

  const targetTime = new Date(`${timeText}+09:00`).getTime();
  const key = spotJmaKey(spot);
  let best = null;

  for (const frame of frames) {
    const spotData = frame.spots?.[key];
    if (!spotData?.available) continue;

    const diff = Math.abs(new Date(frame.time).getTime() - targetTime);
    if (diff > JMA_MATCH_WINDOW_MS) continue;
    if (!best || diff < best.diff) best = { frame, spotData, diff };
  }

  return best;
}

function applyJmaWaveData(hourly, spot, jmaData) {
  return hourly.map((frame) => {
    const match = findNearestJmaFrame(jmaData, frame.time, spot);

    if (!match) {
      frame.jma_wave = {
        available: false,
        source_label: "Open-Meteo 단독",
        reason: "JMA/IMOC 3일 예보 범위 밖이거나 매칭되는 이미지가 없습니다."
      };
      frame.combined_wave_height = roundWaveHeight(frame.wave_height);
      return frame;
    }

    const useJmaCorrection = shouldUseJmaCorrection(frame.wave_height, match.spotData.heightM);

    frame.jma_wave = {
      available: true,
      source_label: useJmaCorrection ? "JMA 보정" : "JMA 불일치 제외",
      ignored: !useJmaCorrection,
      time: match.frame.time,
      height_m: match.spotData.heightM,
      band: match.spotData.band,
      image_url: match.frame.imageUrl,
      reason: useJmaCorrection
        ? null
        : "Open-Meteo와 JMA 색상 보정 파고 차이가 커서 점수 계산에서는 Open-Meteo를 우선합니다."
    };
    frame.combined_wave_height = !useJmaCorrection
      ? roundWaveHeight(frame.wave_height)
      : combineWaveHeights(frame.wave_height, match.spotData.heightM);
    return frame;
  });
}

function waveSourceText(item) {
  if (item?.jma_wave?.ignored) {
    return "Open-Meteo 우선";
  }
  if (item?.jma_wave?.available) {
    return `JMA ${item.jma_wave.band} 보정`;
  }
  return "Open-Meteo 단독";
}

function compactWaveSourceText(label) {
  if (!label) return "Open-Meteo";
  if (label.startsWith("JMA")) return "JMA 보정";
  if (label.includes("JMA")) return "Open-Meteo+JMA";
  return "Open-Meteo";
}

function formatNumber(value, digits = 1) {
  return typeof value === "number" ? value.toFixed(digits) : "-";
}

function weatherCodeLabel(code) {
  const labels = {
    0: "맑음",
    1: "대체로 맑음",
    2: "부분 흐림",
    3: "흐림",
    45: "안개",
    48: "서리 안개",
    51: "약한 이슬비",
    53: "이슬비",
    55: "강한 이슬비",
    61: "약한 비",
    63: "비",
    65: "강한 비",
    80: "소나기",
    81: "강한 소나기",
    82: "매우 강한 소나기",
    95: "뇌우",
    96: "우박 동반 뇌우",
    99: "강한 우박 뇌우"
  };
  return labels[code] || "날씨 정보";
}

function rainStatus(frame) {
  const hasRain = typeof frame.precipitation === "number";
  const hasCode = typeof frame.weather_code === "number";
  if (!hasRain && !hasCode) return { label: "비 정보 없음", detail: "날씨 API 지연" };

  const rain = hasRain ? frame.precipitation : 0;
  const code = frame.weather_code;
  if ([95, 96, 99].includes(code)) return { label: "뇌우 주의", detail: `${weatherCodeLabel(code)} · ${rain}mm` };
  if (rain >= 5 || [65, 82].includes(code)) return { label: "강한 비", detail: `${weatherCodeLabel(code)} · ${rain}mm` };
  if (rain >= 1 || [51, 53, 55, 61, 63, 80, 81].includes(code)) return { label: "비 가능", detail: `${weatherCodeLabel(code)} · ${rain}mm` };
  return { label: "비 없음", detail: weatherCodeLabel(code) };
}

function tidePhaseLabel(phase) {
  const labels = {
    low: "간조권",
    low_rising: "간조 뒤 밀물",
    low_mid: "간조~중물",
    mid_rising: "중물 상승",
    high_approach: "만조 접근",
    high_falling: "만조 이후",
    mid_falling: "중물 하강",
    unknown: "조위 미상"
  };
  return labels[phase] || phase || "조위 미상";
}

function stormRisk(frame) {
  const hasWeather =
    typeof frame.wind_speed_10m === "number" ||
    typeof frame.wind_gusts_10m === "number" ||
    typeof frame.precipitation === "number" ||
    typeof frame.weather_code === "number";
  if (!hasWeather) return { label: "정보 없음", detail: "날씨 API 지연" };

  const wind = typeof frame.wind_speed_10m === "number" ? frame.wind_speed_10m : 0;
  const gust = typeof frame.wind_gusts_10m === "number" ? frame.wind_gusts_10m : wind;
  const rain = typeof frame.precipitation === "number" ? frame.precipitation : 0;
  const code = frame.weather_code;

  if (gust >= 25 || wind >= 17 || rain >= 20 || [95, 96, 99].includes(code)) {
    return { label: "위험 신호", detail: "공식 특보 확인 필요" };
  }
  if (gust >= 14 || wind >= 10 || rain >= 5) {
    return { label: "주의", detail: "강풍·폭우 가능성 체크" };
  }
  return { label: "특이 신호 없음", detail: "공식 특보는 별도 확인" };
}

function gearRecommendation(frame) {
  const air = frame.temperature_2m;
  const feels = frame.apparent_temperature;
  const sea = frame.sea_surface_temperature;
  const rain = rainStatus(frame);
  const wind = typeof frame.wind_speed_10m === "number" ? frame.wind_speed_10m : 0;
  const waterGear = getSuitRecommendation(sea);
  const airLabel = typeof feels === "number" ? `${formatNumber(feels)}°C 체감` : typeof air === "number" ? `${formatNumber(air)}°C 기온` : "기온 정보 없음";
  const extras = [];
  const hasRainSignal = rain.label !== "비 없음" && rain.label !== "비 정보 없음";

  if (hasRainSignal) extras.push("방수 자켓·여벌 옷");
  if (wind >= 7) extras.push("바람막이");
  if (typeof air === "number" && air <= 12) extras.push("입수 전후 보온");
  let label = waterGear;
  if (hasRainSignal && typeof sea === "number" && sea <= 22) {
    label = "3/2mm 풀슈트 권장";
    extras.push("비 오면 체감 낮음");
  }

  return {
    label,
    detail: `${airLabel}${extras.length ? ` · ${extras.join(", ")}` : ""}`
  };
}

function boardRecommendation(frame, spot) {
  const height = frame.translated?.wave_height_used ?? scoreWaveHeight(frame);
  const period = frame.wave_period;
  const wind = frame.translated?.wind_type || "";
  const isClean = wind.includes("오프") || (typeof frame.wind_speed_10m === "number" && frame.wind_speed_10m <= 4);

  if (height < 0.5) {
    return { label: "롱보드/스펀지", detail: "작아서 부력 큰 보드가 유리" };
  }
  if (height < 0.8 || period < 7) {
    return { label: "롱보드", detail: "작거나 주기가 짧아 긴 보드가 편함" };
  }
  if (height < 1.2) {
    return { label: "롱보드·미드보드", detail: spot.region === "dadaepo" ? "다대포는 미드도 체크 가능" : "송정은 롱보드가 안정적" };
  }
  if (height >= 1.2 && period >= 8 && isClean) {
    return { label: "미드보드·숏보드", detail: "면이 깨끗하면 짧은 보드도 가능" };
  }
  return { label: "미드보드", detail: "사이즈는 있지만 면 상태 확인 필요" };
}

function beginnerWindText(frame) {
  const wind = frame.translated?.wind_type || "";
  if (wind.includes("정보 없음")) return "바람 데이터가 잠시 비어 있습니다. 파도 면 상태는 현장 캠이나 실시간 바람을 같이 확인하세요.";
  if (wind.includes("오프")) return "오프쇼어는 해변에서 바다로 부는 바람. 약하면 파도 면이 깔끔해집니다.";
  if (wind.includes("온")) return "온쇼어는 바다에서 해변으로 부는 바람. 강하면 파도가 빨리 무너집니다.";
  return "사이드 바람은 옆으로 가르는 바람. 약하면 괜찮고 강하면 라인 잡기가 어렵습니다.";
}

function beginnerSwellText(frame, spot) {
  if (spot.region === "dadaepo") {
    return "스웰은 먼바다에서 들어오는 파도 방향. 다대포는 SW~SSW가 베스트, 남스웰은 가능, 동해 계열은 힘이 죽기 쉽습니다.";
  }
  return "스웰은 먼바다에서 들어오는 파도 방향. 송정은 S~SE가 안정적이고 E/ENE도 사이즈와 주기가 맞으면 열어둡니다.";
}

function windSummaryText(windType) {
  return windType?.includes("정보 없음") ? "바람 정보 없음" : `바람 ${windType || "-"}`;
}

function todayBeginnerSummary(frame, spot) {
  const height = frame.translated?.wave_height_used ?? scoreWaveHeight(frame);
  const board = boardRecommendation(frame, spot);
  const rain = rainStatus(frame);
  const rainGuide = rain.label === "비 없음"
    ? "비 걱정은 낮은 편"
    : rain.label === "비 정보 없음"
      ? "비 정보가 비어 있어 입수 전 확인이 필요"
      : `${rain.label}라 입수 전 확인 필요`;
  return `초보자식으로 풀면: 파고 ${height ?? "-"}m, 주기 ${frame.wave_period ?? "-"}초라 ${board.label} 쪽이 편하고, ${rainGuide}입니다.`;
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
  const waveHeight = scoreWaveHeight(frame);

  if (spot.region === "dadaepo") {
    const height = scoreWaveHeight(frame);

    if (isDirectionBetween(frame.wave_direction, 200, 250)) {
      return {
        type: "SW~SSW 다대뽕 스웰",
        passed: true,
        diff: angularDistance(frame.wave_direction, 225),
        dadaeppong: true,
        weakDadaeppong: false,
        comment: "다대포 로컬들이 가장 좋아하는 남서~남남서 계열입니다. 주기와 물때가 맞으면 벽이 서는 후보입니다."
      };
    }

    if (isDirectionBetween(frame.wave_direction, 165, 200) || isDirectionBetween(frame.wave_direction, 250, 260)) {
      return {
        type: "남스웰",
        passed: true,
        diff: Math.min(angularDistance(frame.wave_direction, 180), angularDistance(frame.wave_direction, 245)),
        dadaeppong: true,
        weakDadaeppong: false,
        comment: "남쪽 계열이라 다대포에서 가능성은 있습니다. SW보다 약하게 보고 주기와 물때를 같이 확인합니다."
      };
    }

    if (isDirectionBetween(frame.wave_direction, 125, 165) && height >= 0.75) {
      return {
        type: "남동 약스웰",
        passed: true,
        diff: angularDistance(frame.wave_direction, 145),
        dadaeppong: false,
        weakDadaeppong: true,
        comment: "정석 다대뽕 방향은 아니지만, 사이즈·약풍·썰물 타이밍이 맞으면 약다대뽕 후보로 남깁니다."
      };
    }

    if (isDirectionBetween(frame.wave_direction, 55, 115)) {
      return {
        type: "동해 계열 역스웰",
        passed: false,
        diff: angularDistance(frame.wave_direction, 90),
        dadaeppong: false,
        weakDadaeppong: false,
        comment: "E~ENE 계열은 다대포에서 각도가 맞지 않아 차트보다 힘이 죽을 가능성이 큽니다."
      };
    }

    return {
      type: "다대포 비주류 스웰",
      passed: false,
      diff: angularDistance(frame.wave_direction, 225),
      dadaeppong: false,
      weakDadaeppong: false,
      comment: "다대포 기준 정석 각도는 아닙니다. 파고가 보여도 주기와 현장 체감을 보수적으로 봅니다."
    };
  }

  if (spot.region === "songjeong") {
    if (isSongjeongOptimalSwellDirection(frame.wave_direction)) {
      return {
        type: "송정 정스웰",
        passed: waveHeight >= 0.5,
        diff: angularDistance(frame.wave_direction, 160),
        comment: "송정이 안정적으로 받기 쉬운 S~SE 계열입니다. 사이즈와 주기가 받쳐주면 메인 라인업이 살아날 가능성이 높습니다."
      };
    }

    if (isSongjeongEastSwellDirection(frame.wave_direction)) {
      return {
        type: "E/ENE 체크 스웰",
        passed: waveHeight >= 0.8,
        diff: angularDistance(frame.wave_direction, 90),
        comment: "커뮤니티 체감상 송정에서 열릴 수 있는 동~동북동 계열입니다. 다만 실제 체감은 사이즈와 주기, 물때를 같이 봅니다."
      };
    }

    if (isSongjeongBlockedSwellDirection(frame.wave_direction)) {
      return {
        type: "북동 스웰",
        passed: false,
        diff: angularDistance(frame.wave_direction, 45),
        comment: "NE 계열은 차트보다 약하거나 힘 없이 들어올 수 있습니다. 6/8 현장 후기처럼 작고 물이 빠지면 라이딩이 짧을 수 있습니다."
      };
    }

    return {
      type: "송정 비주류 스웰",
      passed: false,
      diff: angularDistance(frame.wave_direction, 160),
      comment: "송정 메인 라인업 기준으로는 방향 메리트가 약합니다. 파고가 보여도 주기와 실제 힘을 보수적으로 봅니다."
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
      passed: waveHeight >= 0.8,
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

  if (spot.region === "dadaepo") {
    const phase = frame.tide_phase_advanced || "unknown";
    const prime = ["mid_falling", "low_mid", "low_rising", "low"].includes(phase);
    const okay = prime || phase === "mid_rising";
    return {
      type: tidePhaseLabel(phase),
      passed: okay,
      comment: prime
        ? "다대포 로컬 기준 중썰물~간조 전후로 sand bar가 드러나며 브레이크가 선명해질 수 있습니다."
        : "다대포는 만조 부근보다 미들~로우/썰물 흐름을 더 우선해서 봅니다."
    };
  }

  if (spot.region === "songjeong") {
    const phase = frame.tide_phase_advanced || "unknown";
    const good = phase === "mid_rising" || phase === "high_approach";
    const lowWater = phase === "low" || phase === "low_mid" || phase === "mid_falling";
    return {
      type: tidePhaseLabel(phase),
      passed: good,
      comment: good
        ? "송정은 들물 중반~만조 전 흐름을 우선합니다. 작은 파도도 조금 더 길게 밀릴 수 있습니다."
        : lowWater
          ? "물이 빠진 시간대라 작은 파도는 힘이 약하고 라이딩이 짧을 수 있습니다."
          : "송정은 다대포처럼 썰물을 무조건 좋게 보지 않고, 물이 차는 흐름을 더 봅니다."
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
    if (height < 0.5) return "송정 기준으로 많이 작습니다. 라이딩보다는 패들 연습이나 밀어타기 정도로 보세요.";
    if (height < 0.6) return "송정 기준 작고 힘이 약한 사이즈입니다. 롱보드로도 길게 타기 어려울 수 있습니다.";
    if (height < 0.8) return "롱보드 가능성은 있지만 좋은 날은 아닙니다. 물이 빠지면 라이딩이 짧아질 수 있습니다.";
    if (height < 1.0) return "송정 기준 기본 사이즈입니다. 주기와 바람이 맞으면 롱보드/미드렝스는 체크할 만합니다.";
    if (height < 1.5) return "송정 기준 재밌을 수 있는 사이즈입니다. 짧은 주기와 간조 덤프만 같이 확인하세요.";
    if (height < 1.8) return "송정 기준 큰 편입니다. 초보자는 조심하고 덤프/클로즈아웃을 확인하세요.";
    return "송정 기준 과한 사이즈입니다. 덤프나 클로즈아웃 가능성이 커집니다.";
  }

  if (height < 0.7) return "다대포 기준 작습니다. 포인트와 타이드가 받쳐줘야 합니다.";
  if (height < 1.0) return "다대포 기준 애매한 사이즈입니다. 주기, 스웰 방향, 썰물 타이밍이 받쳐줘야 롱보드 가능성이 있습니다.";
  if (height < 1.8) return "다대포 기준 체크할 만한 사이즈입니다. 주기와 썰물 타이밍이 맞으면 기대할 수 있습니다.";
  return "다대포 기준 큽니다. 조류와 라인업 거리까지 고려해야 합니다.";
}

function translateWavePeriod(period, spot) {
  if (period === null || period === undefined) return "주기 데이터가 아직 없습니다.";

  if (spot.region === "songjeong") {
    if (period >= 11) return "송정 기준 긴 주기입니다. 1m 이상이면 좋은 벽과 덤프 가능성을 같이 봅니다.";
    if (period >= 9) return "송정에서 기대감이 붙는 주기입니다. 파고와 바람이 맞으면 좋은 날 후보입니다.";
    if (period >= 8) return "송정 기준 괜찮은 주기입니다. 롱보드/미드렝스가 재미있을 수 있습니다.";
    if (period >= 7) return "송정 기준 최소권 주기입니다. 파고가 작으면 힘이 부족할 수 있습니다.";
    if (period >= 5) return "파고가 있어 보여도 주기가 짧아 힘이 약하거나 짧게 닫힐 수 있습니다.";
    return "주기가 짧아 라이딩보다는 패들 연습에 가까울 수 있습니다.";
  }

  if (period >= 11) return "다대포 기준 다대뽕 후보 주기입니다. SW~SSW 스웰과 썰물 타이밍이면 강하게 봅니다.";
  if (period >= 9) return "다대포에서 재밌어질 수 있는 주기입니다. 파고보다 이 주기를 더 중요하게 봅니다.";
  if (period >= 8) return "다대포 기준 괜찮은 주기입니다. 남스웰과 북풍이면 체크 가치가 있습니다.";
  if (period >= 7) return "다대포 기준 탈만한 최소권 주기입니다. 다른 조건이 좋아야 합니다.";
  if (period >= 6) return "다대포 기준 힘이 약할 수 있습니다. 사이즈가 보여도 뻥파도일 수 있습니다.";
  return "다대포 기준 주기가 짧아 힘이 부족할 가능성이 큽니다.";
}

function getSuitRecommendation(temp) {
  if (temp === null || temp === undefined) return "수온 확인 후 웻슈트를 결정하세요.";
  if (temp <= 14) return "5/4mm 풀슈트 + 부츠 + 글러브";
  if (temp <= 18) return "3/2mm 풀슈트";
  if (temp <= 22) return "스프링슈트 또는 얇은 풀슈트";
  return "보드숏 또는 래시가드";
}

function calculateSongjeongSurfScore(frame) {
  const waveHeight = scoreWaveHeight(frame);
  const windSpeedKmh = typeof frame.wind_speed_10m === "number" ? frame.wind_speed_10m * 3.6 : null;
  let score = 0;

  if (isSongjeongOptimalSwellDirection(frame.wave_direction)) score += 30;
  else if (isSongjeongEastSwellDirection(frame.wave_direction)) score += 15;
  else if (isSongjeongBlockedSwellDirection(frame.wave_direction)) score -= 10;

  if (frame.wave_period >= 8) score += 40;
  else if (frame.wave_period >= 6) score += 20;

  if (windSpeedKmh !== null && windSpeedKmh <= 5) score += 30;
  else if (isSongjeongOffshoreWind(frame.wind_direction_10m)) score += 30;
  else if (isSongjeongOnshoreWind(frame.wind_direction_10m)) score -= 20;

  if (waveHeight < 0.4) score = Math.min(score, 45);
  else if (waveHeight < 0.5) score = Math.min(score, 58);
  else if (waveHeight < 0.8) score = Math.min(score, 76);
  else score += 6;

  if (waveHeight >= 1.5) score = Math.min(score, 78);
  if (frame.wave_period >= 10 && waveHeight >= 1.0) score = Math.min(score, 72);
  if (frame.wind_speed_10m >= 10) score = Math.min(score, 45);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function calculateDadaepoSurfScore(frame, spot, wind, swell, tide) {
  const waveHeight = scoreWaveHeight(frame);
  const windSpeed = typeof frame.wind_speed_10m === "number" ? frame.wind_speed_10m : null;
  const rain = typeof frame.precipitation === "number" ? frame.precipitation : null;
  let score = 28;

  if (waveHeight >= 0.7 && waveHeight < 0.9) score += 8;
  else if (waveHeight >= 0.9 && waveHeight < 1.3) score += 20;
  else if (waveHeight >= 1.3 && waveHeight < 1.8) score += 24;
  else if (waveHeight >= 1.8 && waveHeight < 2.2) score += 14;
  else if (waveHeight >= 2.2) score += 6;

  if (swell.dadaeppong && !swell.weakDadaeppong) score += 22;
  else if (swell.weakDadaeppong) score += 12;
  else score -= 16;

  if (frame.wave_period >= 7 && frame.wave_period <= 10) score += 14;
  else if (frame.wave_period >= 6) score += 8;
  else score -= 8;

  if (windSpeed === null) score -= 4;
  else if (windSpeed <= 4) score += 12;
  else if (windSpeed <= 6) score += 8;
  else if (windSpeed <= 8) score += 2;
  else score -= 12;

  if (windSpeed !== null && wind.wind_type === "오프쇼어") score += windSpeed <= 7 ? 8 : 3;
  if (windSpeed !== null && wind.wind_type === "온쇼어") score -= windSpeed >= 6 ? 20 : 10;
  if (tide.passed) score += 8;
  if (rain !== null && rain >= 1) score -= 6;
  if (rain !== null && rain >= 5) score -= 20;

  if (waveHeight < 0.9) score = Math.min(score, 62);
  if (!swell.dadaeppong && !swell.weakDadaeppong) score = Math.min(score, 58);
  if (swell.weakDadaeppong) score = Math.min(score, waveHeight >= 0.9 ? 76 : 70);
  if (
    swell.weakDadaeppong &&
    waveHeight >= 0.9 &&
    waveHeight <= 1.1 &&
    (wind.wind_type === "오프쇼어" || wind.wind_type === "사이드 바람") &&
    windSpeed !== null &&
    windSpeed <= 8 &&
    tide.passed &&
    (rain === null || rain < 0.5)
  ) {
    score = Math.max(score, 70);
  }
  if (waveHeight >= 1.8) score = Math.min(score, 84);
  if (waveHeight >= 2.2) score = Math.min(score, 78);
  if (frame.jma_wave?.available && frame.wave_height < 1.0 && waveHeight >= 1.6) score = Math.min(score, 78);
  if (wind.wind_type === "온쇼어" && frame.wind_speed_10m >= 6) score = Math.min(score, 58);
  if (windSpeed !== null && windSpeed >= 8) score = Math.min(score, 70);
  if (windSpeed !== null && windSpeed >= 10) score = Math.min(score, 45);
  if (rain !== null && rain >= 5) score = Math.min(score, 55);
  if (spot.id === "dadaepo-songan") score = Math.min(score, 80);

  return Math.max(0, Math.min(92, Math.round(score)));
}

function scoreHour(frame, spot) {
  const wind = classifyWind(frame.wind_direction_10m, spot.beachFacingAngle);
  const swell = classifySwell(frame, spot);
  const tide = classifyTide(frame, spot);
  const waveHeight = scoreWaveHeight(frame);
  let score = 42;

  if (spot.region === "songjeong") {
    score = calculateSongjeongSurfScore(frame);
  } else if (spot.region === "dadaepo") {
    return calculateDadaepoSurfScore(frame, spot, wind, swell, tide);
  } else {
    if (waveHeight >= 0.75) score += 10;
    if (waveHeight >= 0.9) score += 18;
    if (waveHeight >= 1.0) score += 16;
    if (waveHeight >= 1.8) score -= 8;
    if (swell.type === "남스웰") score += 24;
    else if (swell.type === "약다대뽕 스웰") score += 18;
    else if (swell.type === "애매한 다대포 스웰") score += 10;
    else score -= 16;
    if (frame.wave_period >= 7) score += 14;
    else if (frame.wave_period >= 6) score += 5;
    else if (swell.weakDadaeppong && waveHeight >= 0.8) score -= 2;
    else score -= 10;
  }

  if (spot.region !== "songjeong" && wind.wind_type === "오프쇼어") score += frame.wind_speed_10m <= 5 ? 16 : 8;
  if (spot.region !== "songjeong" && wind.wind_type === "온쇼어") score -= frame.wind_speed_10m >= 6 ? 24 : 12;
  if (spot.region !== "songjeong" && frame.wind_speed_10m <= 5) score += 6;
  if (frame.wind_speed_10m >= 10) score -= 24;
  if (tide.passed) score += spot.region === "dadaepo" ? 10 : 4;
  if (spot.region === "dadaepo" && frame.precipitation >= 1) score -= 6;
  if (spot.region === "dadaepo" && frame.precipitation >= 5) score -= 20;

  const weakDadaeppongWindow =
    spot.region === "dadaepo" &&
    swell.weakDadaeppong &&
    waveHeight >= 0.78 &&
    waveHeight <= 1.1 &&
    (wind.wind_type === "오프쇼어" || wind.wind_type === "사이드 바람") &&
    frame.wind_speed_10m <= 8 &&
    tide.passed &&
    (!frame.precipitation || frame.precipitation < 1);

  if (weakDadaeppongWindow) {
    score = Math.max(score, 68);
    if (waveHeight >= 0.9) score = Math.max(score, 72);
  }

  if (waveHeight < 0.5 && spot.region === "songjeong") score = Math.min(score, 58);
  if (waveHeight < 0.9 && spot.region === "dadaepo") score = Math.min(score, 62);
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
  const localScore = surfScoring?.calculateSurfScore(frame, spot) || null;
  const score = localScore?.score ?? scoreHour(frame, spot);
  const rating = localScore?.rating ?? ratingFromScore(score);
  const waveHeight = localScore?.wave_height_used ?? scoreWaveHeight(frame);
  const sourceSuffix = frame.jma_wave?.available ? " · JMA 보정" : " · Open-Meteo 단독";

  return {
    score,
    rating,
    signal: signalColor(score),
    wave_height_text: translateWaveHeight(waveHeight, spot),
    wave_period_text: translateWavePeriod(frame.wave_period, spot),
    water_temperature_text: frame.sea_surface_temperature === null ? "수온 데이터가 아직 없습니다." : "수온 기준 웻슈트 선택을 참고하세요.",
    suit_recommendation: getSuitRecommendation(frame.sea_surface_temperature),
    wind_type: wind.wind_type,
    wind_comment: wind.wind_comment,
    swell_type: swell.type,
    swell_comment: swell.comment,
    tide_type: tide.type,
    tide_comment: tide.comment,
    flags: localScore?.flags || [],
    confidence: localScore?.confidence || "normal",
    dadaeppong_grade: localScore?.dadaeppong_grade || null,
    tide_phase_advanced: localScore?.tide_phase_advanced || frame.tide_phase_advanced || "unknown",
    tide_trend: localScore?.tide_trend || frame.tide_trend || "unknown",
    wave_height_used: waveHeight,
    wave_source_label: localScore?.wave_source_label || waveSourceText(frame),
    current_risk: Boolean(localScore?.current_risk),
    beginner_warning: Boolean(localScore?.beginner_warning),
    dump_risk: localScore?.dump_risk || null,
    dump_risk_score: localScore?.dump_risk_score || 0,
    songjeong_level: localScore?.songjeong_level || null,
    local_comment: localScore?.local_comment || "",
    summary: `${rating}: 파고 ${waveHeight ?? "-"}m, 주기 ${frame.wave_period ?? "-"}초, ${swell.type}, ${windSummaryText(wind.wind_type)}${sourceSuffix}`
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
  const waveHeight = item.translated?.wave_height_used ?? scoreWaveHeight(item);
  const wavePass = spot.region === "songjeong" ? waveHeight >= 0.8 : waveHeight >= 0.8;
  const periodPass = item.wave_period >= 8;
  const windPass = spot.region === "songjeong"
    ? (item.wind_speed_10m ?? 99) * 3.6 <= 5 || isSongjeongOffshoreWind(item.wind_direction_10m)
    : item.wind_speed_10m <= 5 || (item.translated.wind_type === "오프쇼어" && item.wind_speed_10m <= 7);
  const rainPass = spot.region !== "dadaepo" || !item.precipitation || item.precipitation < 1;

  const checks = [
    { key: "wave", label: "파고", passed: wavePass, value: `${waveHeight ?? "-"}m` },
    { key: "swell", label: "스웰", passed: swell.passed, value: swell.type },
    { key: "wind", label: "바람", passed: windPass, value: `${item.translated.wind_type} ${item.wind_speed_10m ?? "-"}m/s` },
    { key: "period", label: "주기", passed: periodPass, value: `${item.wave_period ?? "-"}s` },
    { key: "tide", label: "조위", passed: tide.passed, value: tide.type }
  ];

  if (spot.region === "dadaepo") {
    checks.push({ key: "rain", label: "비", passed: rainPass, value: `${item.precipitation ?? 0}mm` });
    if (item.translated?.dadaeppong_grade === "다대뽕" || item.translated?.dadaeppong_grade === "약다대뽕") {
      checks.push({ key: "grade", label: "등급", passed: item.translated.dadaeppong_grade !== "비추천", value: item.translated.dadaeppong_grade });
    }
  }

  if (spot.region === "songjeong") {
    const dumpRisk = item.translated?.dump_risk || "none";
    const dumpLabel = {
      none: "낮음",
      low: "힘/길이 주의",
      medium: "덤프 주의",
      high: "덤프 높음",
      unknown: "정보 부족"
    }[dumpRisk] || dumpRisk;
    checks.push({ key: "dump", label: "덤프/힘", passed: dumpRisk === "none", value: dumpLabel });
    if (item.translated?.songjeong_level) {
      checks.push({ key: "level", label: "레벨", passed: item.translated.songjeong_level !== "패들연습", value: item.translated.songjeong_level });
    }
  }

  return checks;
}

function formatBestWindow(item) {
  if (!item) return "계산 중";
  return `${formatDay(item.date)} ${item.hour}`;
}

function buildVerdict(best) {
  if (!best) return "데이터 대기 중";
  if (best.translated?.songjeong_level === "패들연습") {
    return "송정 현장 후기 기준으로는 라이딩보다 패들 연습이나 밀어타기에 가까운 구간입니다.";
  }
  if (best.translated?.dump_risk === "high" || best.translated?.dump_risk === "medium") {
    return "사이즈가 있어도 덤프나 닫힘 가능성이 있습니다. 물이 조금 차는 시간대를 다시 확인하세요.";
  }
  if (best.translated?.songjeong_level === "송정 좋은 날") {
    return "송정 기준 좋은 날에 가까운 조합입니다. 면이 열리면 롱보드와 미드보드 모두 기대할 수 있습니다.";
  }
  if (best.translated?.songjeong_level === "펀웨이브") {
    return "송정 기준 꽤 탈 만한 조건입니다. 롱보드와 미드렝스가 재미있을 가능성이 있습니다.";
  }
  if (best.translated?.dadaeppong_grade === "다대뽕") {
    return "다대뽕 조건이 겹친 시간입니다. SW~SSW 계열, 긴 주기, 약한 북풍, 썰물 타이밍이면 다대포 메인 체크 우선입니다.";
  }
  if (best.translated?.dadaeppong_grade === "약다대뽕") {
    return "완전 다대뽕은 아니지만 다대포가 반응할 수 있는 약다대뽕 후보입니다. 현장 체감 확인 가치가 있습니다.";
  }
  if (best.translated.rating === "좋음") {
    return "한국 기준으로 체크할 만한 시간입니다. 파고, 스웰 방향, 바람 중 핵심 조건이 맞습니다.";
  }
  if (best.translated.rating === "보통") {
    return "완벽하진 않지만 들어갈 명분은 있습니다. 보드 선택과 현장 확인이 중요합니다.";
  }
  return "기대치를 낮추는 구간입니다. 바람, 방향, 타이드 중 한두 조건이 크게 맞지 않습니다.";
}

function todayImpactSignal(best, spot) {
  if (spot?.region !== "dadaepo") return null;
  const grade = best?.translated?.dadaeppong_grade;

  if (grade === "다대뽕") {
    return {
      className: "is-dadaeppong",
      title: "다대뽕 ON",
      label: "다대뽕",
      copy: "오늘 다대 찍을 명분이 있습니다. 주기와 물때가 받쳐주는 시간대라 미드/송안은 안전거리까지 같이 체크하세요."
    };
  }

  if (grade === "약다대뽕") {
    return {
      className: "is-weak-dadaeppong",
      title: "약다대뽕 CHECK",
      label: "약다대뽕",
      copy: "사이즈나 주기 중 하나는 아쉽지만 다대포가 반응할 수 있는 하한 조건입니다. 롱보드·미드렝스로 현장 확인 가치가 있습니다."
    };
  }

  return null;
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
  const dataWarning = state.data?.last_error ? ` · ${state.data.last_error}` : "";

  elements.statusArea.innerHTML = `
    <div class="notice">
      <i class="ph ph-pulse"></i>
      <span>LIVE ${updatedAt} · 앞 3일은 JMA/IMOC 파고 색상 보정 · 4일째부터는 Open-Meteo 단독${dataWarning}</span>
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
        <p>${overallBest.translated.rating}, 파고 ${scoreWaveHeight(overallBest)}m, 주기 ${overallBest.wave_period}s, ${overallBest.translated.swell_type}, ${windSummaryText(overallBest.translated.wind_type)} · ${waveSourceText(overallBest)}</p>
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
  const rain = rainStatus(best);
  const storm = stormRisk(best);
  const gear = gearRecommendation(best);
  const board = boardRecommendation(best, spot);
  const sourceLabel = best.translated.wave_source_label || waveSourceText(best);
  const impact = todayImpactSignal(best, spot);
  const heroTitle = impact?.title ||
    (best.translated.rating === "좋음"
      ? `${best.hour} GO`
      : best.translated.rating === "보통"
        ? `${best.hour} CHECK`
        : `${best.hour} SKIP`);
  const pillLabel = impact ? `${impact.label} ${best.translated.score}` : `${best.translated.rating} ${best.translated.score}`;
  const heroCopy = impact?.copy || best.translated.wave_height_text;

  elements.todayCard.innerHTML = `
    <div class="hero-content ${impact?.className || ""}">
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
          ${pillLabel}
        </span>
      </div>
      <p class="hero-copy">${heroCopy}</p>
      <p class="hero-signal"><span>SUBHIP SIGNAL</span>${buildVerdict(best)}</p>
      <p class="hero-beginner">${todayBeginnerSummary(best, spot)}</p>
      <div class="metric-row">
        <div class="metric is-wave"><span>파도/주기</span><strong>${best.translated.wave_height_used ?? scoreWaveHeight(best) ?? "-"}m · ${best.wave_period ?? "-"}초</strong><em>${board.detail}</em></div>
        <div class="metric is-swell"><span>스웰</span><strong>${best.translated.swell_type}</strong><em>먼바다에서 들어오는 파도 방향</em></div>
        <div class="metric is-wind"><span>바람</span><strong>${best.translated.wind_type}</strong><em>${best.wind_speed_10m ?? "-"}m/s · 돌풍 ${best.wind_gusts_10m ?? "-"}m/s</em></div>
        <div class="metric is-tide"><span>조위</span><strong>${best.translated.tide_type}</strong><em>${tidePhaseLabel(best.translated.tide_phase_advanced || best.tide_phase_advanced)}</em></div>
        <div class="metric is-weather"><span>비/강풍·태풍성</span><strong>${rain.label} · ${storm.label}</strong><em>기온 ${formatNumber(best.temperature_2m)}° · 수온 ${formatNumber(best.sea_surface_temperature)}°</em></div>
        <div class="metric is-gear"><span>보드/옷</span><strong>${board.label}</strong><em>${gear.label}</em></div>
      </div>
      <div class="hero-mini-guide">
        <span><strong>스웰</strong>${beginnerSwellText(best, spot)}</span>
        <span><strong>바람</strong>${beginnerWindText(best)}</span>
        <span><strong>출처</strong>${compactWaveSourceText(sourceLabel)}: Open-Meteo는 예보 API, JMA는 앞 3일 파고 보정</span>
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
      ? "송정: 0.8m 이상, 8~10초 주기, W/NW 약풍, 들물 중반~만조 전을 우선. 작은 파도+간조는 힘 없음, 1m 이상+짧은 주기는 덤프를 경고."
      : "다대포: 파고보다 주기 우선. SW~SSW 스웰, 9초 이상 주기, N/NNE/NE 약풍, 중썰물~간조 전후를 강하게 봅니다.";

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
          <span>${day.rating} · ${score} · ${compactWaveSourceText(day.source_label)}</span>
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

  const flags = best.translated.flags || [];
  const localNotes = [
    best.translated.local_comment,
    best.translated.dadaeppong_grade === "다대뽕" || best.translated.dadaeppong_grade === "약다대뽕"
      ? `다대포 시그널: ${best.translated.dadaeppong_grade}`
      : null,
    best.translated.confidence ? `예보 신뢰도: ${best.translated.confidence}` : null,
    best.translated.wave_source_label ? `파고 소스: ${best.translated.wave_source_label}` : null,
    flags.length ? `주의: ${flags.join(" / ")}` : null
  ].filter(Boolean);

  if (localNotes.length) {
    cards.splice(1, 0, {
      icon: "ph-flag",
      title: "현장형 보정",
      body: localNotes.join("<br>")
    });
  }

  if (spot.map_image) {
    const mapTitle = spot.region === "songjeong" ? "송정 포인트 지도" : "다대포 포인트 지도";
    cards.unshift({
      icon: "ph-image",
      title: mapTitle,
      body: `<img class="spot-map" src="${spot.map_image}" alt="${mapTitle}">`
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
        item.tide_trend = "unknown";
        item.tide_phase_advanced = "unknown";
        return;
      }

      const normalized = (item.sea_level_height_msl - min) / range;
      if (normalized >= 0.66) item.tide_phase = "high";
      else if (normalized <= 0.33) item.tide_phase = "low";
      else item.tide_phase = "mid";
    });

    items.forEach((item, index) => {
      const prevLevel = items[index - 1]?.sea_level_height_msl;
      const nextLevel = items[index + 1]?.sea_level_height_msl;
      item.tide_trend = surfScoring?.calculateTideTrend(prevLevel, item.sea_level_height_msl, nextLevel) || "unknown";
      item.tide_phase_advanced =
        surfScoring?.calculateAdvancedTidePhase(item, { min, max, range }) || item.tide_phase;
    });
  });

  hourly.forEach((item, index) => {
    const recent = hourly.slice(Math.max(0, index - 5), index + 1);
    item.recent_6h_precipitation = Math.round(
      recent.reduce((sum, frame) => sum + (typeof frame.precipitation === "number" ? frame.precipitation : 0), 0) * 10
    ) / 10;
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
      source_label: bestHour ? bestHour.translated?.wave_source_label || waveSourceText(bestHour) : "Open-Meteo 단독",
      summary: bestHour ? `${bestHour.hour} 전후가 가장 무난합니다. ${bestHour.translated.summary}` : "05:00~19:00 추천 데이터가 없습니다."
    };
  });
}

async function fetchJsonWithTimeout(url, label, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    const reason = error.name === "AbortError" ? `${timeoutMs / 1000}초 timeout` : error.message;
    throw new Error(`${label} 요청 실패: ${reason}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchOptionalJson(url, label, timeoutMs) {
  try {
    return { data: await fetchJsonWithTimeout(url, label, timeoutMs), error: null };
  } catch (error) {
    console.warn(error.message);
    return { data: null, error: error.message };
  }
}

async function fetchJmaWaveData() {
  const result = await fetchOptionalJson(`${JMA_WAVE_DATA_URL}?v=${Date.now()}`, "JMA 파고 보정", JMA_FETCH_TIMEOUT_MS);
  return result.data;
}

async function fetchSpotForecast(spot, jmaData) {
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
    hourly: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation",
    wind_speed_unit: "ms",
    timezone: TIMEZONE,
    forecast_days: 7
  })}`;

  const [marine, weatherResult] = await Promise.all([
    fetchJsonWithTimeout(marineUrl, `${spot.name} 파고`, MARINE_FETCH_TIMEOUT_MS),
    // Weather API가 가끔 연결을 오래 붙잡아도 파고 예보는 먼저 보여준다.
    fetchOptionalJson(weatherUrl, `${spot.name} 날씨/바람`, WEATHER_FETCH_TIMEOUT_MS)
  ]);

  const wind = weatherResult.data || { hourly: {} };
  const marineHourly = marine.hourly || {};
  const windHourly = wind.hourly || {};

  const hourly = applyJmaWaveData(assignTidePhases(
    marineHourly.time.map((time, index) => ({
      time,
      date: time.slice(0, 10),
      hour: time.slice(11, 16),
      wave_height: at(marineHourly.wave_height, index),
      wave_period: at(marineHourly.wave_period, index),
      wave_direction: at(marineHourly.wave_direction, index),
      sea_surface_temperature: at(marineHourly.sea_surface_temperature, index),
      sea_level_height_msl: at(marineHourly.sea_level_height_msl, index),
      temperature_2m: at(windHourly.temperature_2m, index),
      apparent_temperature: at(windHourly.apparent_temperature, index),
      weather_code: at(windHourly.weather_code, index),
      wind_speed_10m: at(windHourly.wind_speed_10m, index),
      wind_direction_10m: at(windHourly.wind_direction_10m, index),
      wind_gusts_10m: at(windHourly.wind_gusts_10m, index),
      precipitation: at(windHourly.precipitation, index)
    }))
  ), spot, jmaData);

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
    weather_error: weatherResult.error,
    hourly_units: {
      wave_height: "m",
      wave_period: "s",
      wave_direction: "deg",
      sea_surface_temperature: "°C",
      sea_level_height_msl: "m",
      temperature_2m: "°C",
      apparent_temperature: "°C",
      weather_code: "wmo",
      wind_speed_10m: "m/s",
      wind_direction_10m: "deg",
      wind_gusts_10m: "m/s",
      precipitation: "mm"
    },
    hourly,
    daily: buildDailySummaries(hourly)
  };
}

async function fetchSurfData() {
  const jmaData = await fetchJmaWaveData();
  const spots = await Promise.all(SPOTS.map((spot) => fetchSpotForecast(spot, jmaData)));
  const weatherErrors = spots.filter((spot) => spot.weather_error).map((spot) => `${spot.short_name}: ${spot.weather_error}`);

  return {
    updated_at: new Date().toISOString(),
    last_error: weatherErrors.length ? `날씨/바람 API 일부 지연. 파고 예보 우선 표시 중 (${weatherErrors.length}개 스팟).` : null,
    source: {
      marine: "Open-Meteo Marine API",
      weather: weatherErrors.length ? "Open-Meteo Weather Forecast API 일부 실패, 파고 데이터 우선" : "Open-Meteo Weather Forecast API",
      jma_wave: jmaData ? "IMOC/JMA wave map color-sampled correction for about 3 days" : "JMA correction unavailable",
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
