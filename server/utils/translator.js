const { normalizeAngle } = require("./waveDirection");

function valueLabel(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${value}${unit}`;
}

function translateWaveHeight(height) {
  if (height === null || height === undefined) {
    return "파고 데이터가 아직 없습니다.";
  }
  if (height < 0.4) {
    return "너무 작습니다. 서핑보다는 패들, 테이크오프 연습 정도로 보는 날입니다.";
  }
  if (height < 0.8) {
    return "작은 파도입니다. 롱보드나 소프트보드로 가볍게 놀 수는 있지만 좋은 날로 보긴 어렵습니다.";
  }
  if (height < 1.0) {
    return "탈 수는 있지만 아직 약간 아쉽습니다. 바람과 주기가 좋아야 재미가 납니다.";
  }
  if (height <= 1.5) {
    return "서핑하기 좋은 크기입니다. 면이 깨끗하면 충분히 즐길 만한 컨디션입니다.";
  }
  if (height <= 1.8) {
    return "힘 있는 파도입니다. 중급 이상에게는 좋을 수 있지만 라인업과 안전을 확인하세요.";
  }
  return "큰 파도입니다. 경험자 기준에서도 컨디션과 안전 확인이 먼저입니다.";
}

function translateWaterTemperature(temp) {
  if (temp === null || temp === undefined) {
    return "수온 데이터가 아직 없습니다.";
  }
  if (temp <= 14) {
    return "수온이 낮습니다. 5/4mm 풀슈트와 부츠, 글러브를 권장합니다.";
  }
  if (temp <= 18) {
    return "3/2mm 풀슈트를 추천합니다. 오래 타면 체온 관리가 필요합니다.";
  }
  if (temp <= 22) {
    return "스프링슈트나 얇은 풀슈트가 무난합니다.";
  }
  return "보드숏이나 래시가드도 고려할 수 있는 따뜻한 수온입니다.";
}

function translateWavePeriod(period) {
  if (period === null || period === undefined) {
    return "주기 데이터가 아직 없습니다.";
  }
  if (period >= 9) {
    return "주기가 좋아 파도가 힘 있게 밀고 들어올 가능성이 큽니다.";
  }
  if (period >= 7) {
    return "주기가 무난합니다. 파고가 받쳐주면 충분히 탈 만합니다.";
  }
  if (period >= 6) {
    return "주기가 짧은 편입니다. 파도가 빨리 무너질 수 있습니다.";
  }
  return "주기가 짧아 파도가 힘 없이 부서질 가능성이 큽니다.";
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

function getSuitRecommendation(temp) {
  if (temp === null || temp === undefined) {
    return "수온 확인 후 웻슈트를 결정하세요.";
  }
  if (temp <= 14) {
    return "5/4mm 풀슈트 + 부츠 + 글러브";
  }
  if (temp <= 18) {
    return "3/2mm 풀슈트";
  }
  if (temp <= 22) {
    return "스프링슈트 또는 얇은 풀슈트";
  }
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

  if (windSpeed === null || windSpeed === undefined) {
    return score;
  }

  if (windSpeed <= 3) score += 8;
  else if (windSpeed <= 6) score += 2;
  else if (windSpeed <= 9) score -= 8;
  else score -= 18;

  return score;
}

function applyRealityCaps(score, frame, windType) {
  let cappedScore = score;

  if (frame.wave_height !== null && frame.wave_height !== undefined) {
    if (frame.wave_height < 0.7) cappedScore = Math.min(cappedScore, 49);
    else if (frame.wave_height < 0.9) cappedScore = Math.min(cappedScore, 62);
    else if (frame.wave_height < 1.0) cappedScore = Math.min(cappedScore, 73);
  }

  if (frame.wave_period !== null && frame.wave_period !== undefined && frame.wave_period < 6) {
    cappedScore = Math.min(cappedScore, 72);
  }

  if (frame.wave_period !== null && frame.wave_period !== undefined && frame.wave_period < 7) {
    cappedScore = Math.min(cappedScore, 73);
  }

  if (windType !== "오프쇼어") {
    cappedScore = Math.min(cappedScore, 78);
  }

  if (windType !== "오프쇼어" && frame.wave_period !== null && frame.wave_period < 7) {
    cappedScore = Math.min(cappedScore, 68);
  }

  if (windType === "온쇼어" && frame.wind_speed_10m !== null && frame.wind_speed_10m >= 4) {
    cappedScore = Math.min(cappedScore, 70);
  }

  return cappedScore;
}

function scoreHour(frame, beachFacingAngle) {
  const wind = classifyWind(frame.wind_direction_10m, beachFacingAngle);
  let score = 44;

  score += getWaveHeightScore(frame.wave_height);
  score += getPeriodScore(frame.wave_period);
  score += getWindScore(wind.wind_type, frame.wind_speed_10m);
  score = applyRealityCaps(score, frame, wind.wind_type);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function ratingFromScore(score) {
  if (score >= 74) return "좋음";
  if (score >= 52) return "보통";
  return "별로";
}

function translateSurfFrame(frame, spot) {
  const wind = classifyWind(frame.wind_direction_10m, spot.beachFacingAngle);
  const score = scoreHour(frame, spot.beachFacingAngle);
  const rating = ratingFromScore(score);

  return {
    score,
    rating,
    wave_height_text: translateWaveHeight(frame.wave_height),
    wave_period_text: translateWavePeriod(frame.wave_period),
    water_temperature_text: translateWaterTemperature(frame.sea_surface_temperature),
    suit_recommendation: getSuitRecommendation(frame.sea_surface_temperature),
    wind_type: wind.wind_type,
    wind_comment: wind.wind_comment,
    summary: `${rating}: 파고 ${valueLabel(frame.wave_height, "m")}, 주기 ${valueLabel(frame.wave_period, "초")}, 바람 ${wind.wind_type}`
  };
}

module.exports = {
  classifyWind,
  getSuitRecommendation,
  ratingFromScore,
  scoreHour,
  translateSurfFrame
};
