const SurfScoring = require("../../shared/surfScoring");
const { normalizeAngle } = require("./waveDirection");

function valueLabel(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${value}${unit}`;
}

function translateWaveHeight(height, spot = {}) {
  if (height === null || height === undefined) {
    return "파고 데이터가 아직 없습니다.";
  }

  if (spot.region === "songjeong") {
    if (height < 0.4) return "송정 기준으로는 작습니다. 롱보드로도 재미가 약할 수 있습니다.";
    if (height < 0.5) return "작지만 정스웰과 약한 바람이면 롱보드 체크는 가능합니다.";
    if (height < 0.8) return "송정에서 탈 만한 기본 사이즈입니다. 방향과 바람이 중요합니다.";
    if (height < 1.5) return "송정 기준 좋은 사이즈입니다. 장주기면 덤프 가능성도 같이 봐야 합니다.";
    return "송정 기준 강한 사이즈입니다. 초보자는 위험할 수 있습니다.";
  }

  if (height < 0.5) return "다대포 기준으로 작습니다. 스팟과 물때가 받쳐줘야 합니다.";
  if (height < 0.8) return "다대포에서는 애매하지만 주기, 스웰 방향, 물때가 받쳐주면 체크할 만합니다.";
  if (height < 1.4) return "다대포 기준 체크할 만한 사이즈입니다. 주기와 썰물 타이밍이 맞으면 기대할 수 있습니다.";
  if (height < 1.8) return "다대포에서 힘 있는 사이즈입니다. 조류와 라인업 거리를 확인하세요.";
  return "다대포 기준 강한 사이즈입니다. 조류, 유속, 초중급 안전 리스크를 먼저 봐야 합니다.";
}

function translateWaterTemperature(temp) {
  if (temp === null || temp === undefined) {
    return "수온 데이터가 아직 없습니다.";
  }
  if (temp <= 14) return "수온이 낮습니다. 5/4mm 웻슈트와 부츠, 글러브를 권장합니다.";
  if (temp <= 18) return "3/2mm 웻슈트가 무난합니다.";
  if (temp <= 22) return "스프링슈트나 얇은 웻슈트를 고려하세요.";
  return "보드숏이나 래시가드도 가능한 따뜻한 수온입니다.";
}

function translateWavePeriod(period, spot = {}) {
  if (period === null || period === undefined) {
    return "주기 데이터가 아직 없습니다.";
  }

  if (spot.region === "songjeong") {
    if (period >= 10) return "송정은 장주기와 1m 이상 파고가 만나면 덤프 성향이 생길 수 있습니다.";
    if (period >= 7) return "송정에서 힘이 붙는 주기입니다. 정스웰이면 체크 가치가 있습니다.";
    if (period >= 6) return "탈 수는 있지만 힘이 약할 수 있습니다.";
    return "주기가 짧아 파도가 급하고 힘이 약할 수 있습니다.";
  }

  if (period >= 11) return "다대포 기준 다대뽕 후보 주기입니다. SW~SSW 스웰과 썰물 타이밍이면 강하게 봅니다.";
  if (period >= 9) return "다대포에서 재밌어질 수 있는 주기입니다. 파고보다 이 주기를 더 중요하게 봅니다.";
  if (period >= 8) return "다대포 기준 괜찮은 주기입니다. 남스웰과 북풍이면 체크 가치가 있습니다.";
  if (period >= 7) return "다대포 기준 탈만한 최소권 주기입니다. 다른 조건이 좋아야 합니다.";
  if (period >= 6) return "다대포 기준 힘이 약할 수 있습니다. 사이즈가 보여도 뻥파도일 수 있습니다.";
  return "주기가 짧아 다대포에서도 힘이 부족할 수 있습니다.";
}

function classifyWind(windDirection, beachFacingAngle) {
  if (windDirection === null || windDirection === undefined) {
    return {
      wind_type: "바람 정보 없음",
      wind_comment: "바람 방향 데이터가 없어 파도 면 상태를 판단하지 않습니다."
    };
  }

  const onshoreDiff = Math.abs(normalizeAngle(windDirection - beachFacingAngle));
  const offshoreDiff = Math.abs(normalizeAngle(windDirection - ((beachFacingAngle + 180) % 360)));

  if (offshoreDiff <= 60) {
    return {
      wind_type: "오프쇼어",
      wind_comment: "해변에서 바다로 부는 바람입니다. 약하면 파도 면이 정리될 가능성이 높습니다."
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
    wind_comment: "해변을 비스듬히 가르는 바람입니다. 약하면 무난하지만 강하면 라인 유지가 어려울 수 있습니다."
  };
}

function windCommentFromScore(localScore) {
  if (localScore.wind_class === "offshore") {
    return "오프쇼어 또는 크로스오프 성향이라 약하면 파도 면 정리에 유리합니다.";
  }
  if (localScore.wind_class === "cross_off") {
    return "사이드오프 성향입니다. 약하면 괜찮지만 강하면 라인 유지가 어려울 수 있습니다.";
  }
  if (localScore.wind_class === "onshore") {
    return "온쇼어 성향입니다. 5m/s 이상이면 파도가 빨리 무너질 수 있습니다.";
  }
  return "바람 방향 메리트는 크지 않습니다. 풍속이 약한지가 더 중요합니다.";
}

function tideLabel(phase) {
  const labels = {
    low: "간조권",
    low_rising: "간조 이후 밀물",
    low_mid: "간조-중물",
    mid_rising: "중물 상승",
    high_approach: "만조 접근",
    high_falling: "만조 이후",
    mid_falling: "중물 하강",
    unknown: "조위 미상"
  };
  return labels[phase] || phase || "조위 미상";
}

function classifyLocalSwell(frame, spot = {}) {
  const dir = frame.wave_direction;
  const height = SurfScoring.waveHeightUsed(frame);
  if (typeof dir !== "number") return "스웰 정보 없음";

  if (spot.region === "dadaepo") {
    const grade = SurfScoring.classifyDadaeppongGrade(frame, spot, SurfScoring.classifyWindForSpot(frame.wind_direction_10m, frame.wind_speed_10m, spot));
    if (grade) return grade;
    if (SurfScoring.isDirectionBetween(dir, 200, 250)) return "SW~SSW 다대뽕 스웰";
    if (SurfScoring.isDirectionBetween(dir, 165, 200) || SurfScoring.isDirectionBetween(dir, 250, 260)) return "남스웰";
    if (SurfScoring.isDirectionBetween(dir, 125, 165) && height >= 0.75) return "남동 약스웰";
    if (SurfScoring.isDirectionBetween(dir, 55, 115)) return "동해 계열 역스웰";
    return "다대포 비주류 스웰";
  }

  if (SurfScoring.isDirectionBetween(dir, 105, 180)) return "송정 정스웰";
  if (SurfScoring.isDirectionBetween(dir, 85, 105) && height >= 0.8) return "동스웰 체크";
  if (SurfScoring.isDirectionBetween(dir, 35, 75)) return "NE 차단 스웰";
  return "송정 비주류 스웰";
}

function getSuitRecommendation(temp) {
  if (temp === null || temp === undefined) return "수온 확인 후 웻슈트를 결정하세요.";
  if (temp <= 14) return "5/4mm 웻슈트 + 부츠 + 글러브";
  if (temp <= 18) return "3/2mm 웻슈트";
  if (temp <= 22) return "스프링슈트 또는 얇은 웻슈트";
  return "보드숏 또는 래시가드";
}

function ratingFromScore(score) {
  return SurfScoring.ratingFromScore(score);
}

function scoreHour(frame, spotOrBeachFacingAngle) {
  const spot =
    typeof spotOrBeachFacingAngle === "object"
      ? spotOrBeachFacingAngle
      : { id: "custom", region: "songjeong", beachFacingAngle: spotOrBeachFacingAngle || 135 };
  return SurfScoring.calculateSurfScore(frame, spot).score;
}

function translateSurfFrame(frame, spot) {
  const localScore = SurfScoring.calculateSurfScore(frame, spot);
  const waveHeight = localScore.wave_height_used ?? frame.wave_height;
  const wind = classifyWind(frame.wind_direction_10m, spot.beachFacingAngle);
  const windType = localScore.wind_label || wind.wind_type;
  const tideType = tideLabel(localScore.tide_phase_advanced);
  const swellType = classifyLocalSwell(frame, spot);

  return {
    score: localScore.score,
    rating: localScore.rating,
    wave_height_text: translateWaveHeight(waveHeight, spot),
    wave_period_text: translateWavePeriod(frame.wave_period, spot),
    water_temperature_text: translateWaterTemperature(frame.sea_surface_temperature),
    suit_recommendation: getSuitRecommendation(frame.sea_surface_temperature),
    wind_type: windType,
    wind_comment: windCommentFromScore(localScore),
    swell_type: swellType,
    tide_type: tideType,
    flags: localScore.flags || [],
    confidence: localScore.confidence,
    dadaeppong_grade: localScore.dadaeppong_grade,
    tide_phase_advanced: localScore.tide_phase_advanced,
    tide_trend: localScore.tide_trend,
    wave_height_used: waveHeight,
    wave_source_label: localScore.wave_source_label,
    current_risk: localScore.current_risk,
    beginner_warning: localScore.beginner_warning,
    rain_risk: localScore.rain_risk,
    local_comment: localScore.local_comment,
    summary: `${localScore.rating}: 파고 ${valueLabel(waveHeight, "m")}, 주기 ${valueLabel(frame.wave_period, "초")}, ${swellType}, 바람 ${windType}`
  };
}

module.exports = {
  classifyWind,
  getSuitRecommendation,
  ratingFromScore,
  scoreHour,
  translateSurfFrame
};
