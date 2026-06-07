(function initSurfScoring(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SurfScoring = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildSurfScoring() {
  const SPOT_TYPES = {
    "songjeong-surfholic": "songjeong-surfholic",
    "songjeong-lastwave": "songjeong-lastwave",
    "dadaepo-morundae": "dadaepo-morundae",
    "dadaepo-mid": "dadaepo-mid",
    "dadaepo-songan": "dadaepo-songan",
    songjeong: "songjeong-surfholic",
    dadaepo: "dadaepo-mid"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roundWaveHeight(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }

  function normalize360(deg) {
    if (typeof deg !== "number" || Number.isNaN(deg)) return null;
    return ((deg % 360) + 360) % 360;
  }

  function angularDistance(a, b) {
    const aa = normalize360(a);
    const bb = normalize360(b);
    if (aa === null || bb === null) return 180;
    const diff = Math.abs(aa - bb);
    return Math.min(diff, 360 - diff);
  }

  function isDirectionBetween(deg, min, max) {
    const normalized = normalize360(deg);
    if (normalized === null) return false;
    return min <= max ? normalized >= min && normalized <= max : normalized >= min || normalized <= max;
  }

  function isCleanWind(speed) {
    return typeof speed === "number" && speed <= 4;
  }

  function isOkayWind(speed) {
    return typeof speed === "number" && speed > 4 && speed <= 6;
  }

  function classifySpotType(spot) {
    return SPOT_TYPES[spot?.id] || (spot?.region === "dadaepo" ? "dadaepo-mid" : "songjeong-surfholic");
  }

  function waveHeightUsed(frame) {
    return roundWaveHeight(frame?.combined_wave_height ?? frame?.wave_height);
  }

  function classifyWindForSpot(windDirection, windSpeed, spot) {
    const type = classifySpotType(spot);
    const deg = normalize360(windDirection);
    if (deg === null) {
      return {
        wind_class: "unknown",
        wind_label: "바람 정보 없음",
        score_delta: -2,
        flags: ["바람 방향 데이터 없음"]
      };
    }

    const isDadaepo = type.startsWith("dadaepo");
    const best = isDadaepo
      ? isDirectionBetween(deg, 330, 75)
      : isDirectionBetween(deg, 285, 20);
    const okay = isDadaepo
      ? isDirectionBetween(deg, 285, 330) || isDirectionBetween(deg, 75, 105)
      : isDirectionBetween(deg, 260, 285) || isDirectionBetween(deg, 20, 45);
    const onshore = isDadaepo
      ? isDirectionBetween(deg, 130, 240)
      : isDirectionBetween(deg, 120, 230);

    let scoreDelta = 0;
    const flags = [];
    let windClass = "neutral";
    let windLabel = "사이드 바람";

    if (best) {
      windClass = "offshore";
      windLabel = "오프쇼어";
      scoreDelta += isCleanWind(windSpeed) ? 14 : isOkayWind(windSpeed) ? 10 : 5;
    } else if (okay) {
      windClass = "cross_off";
      windLabel = "사이드오프";
      scoreDelta += isCleanWind(windSpeed) ? 10 : isOkayWind(windSpeed) ? 6 : 2;
    } else if (onshore) {
      windClass = "onshore";
      windLabel = "온쇼어";
      scoreDelta -= typeof windSpeed === "number" && windSpeed >= 5 ? 22 : 12;
      flags.push("온쇼어로 파도 면이 무너질 수 있음");
    }

    if (typeof windSpeed === "number") {
      if (windSpeed > 6) {
        scoreDelta -= windSpeed >= 10 ? 18 : 8;
        flags.push("바람 강함");
      }
      if (onshore && windSpeed >= 5) {
        flags.push("온쇼어 5m/s 이상");
      }
    }

    return { wind_class: windClass, wind_label: windLabel, score_delta: scoreDelta, flags };
  }

  function calculateTideTrend(prevLevel, currentLevel, nextLevel) {
    if (typeof currentLevel !== "number") return "unknown";
    if (typeof prevLevel !== "number" || typeof nextLevel !== "number") return "unknown";
    const prevDiff = currentLevel - prevLevel;
    const nextDiff = nextLevel - currentLevel;
    if (Math.abs(prevDiff) < 0.02 && Math.abs(nextDiff) < 0.02) return "turning";
    if (prevDiff >= 0 && nextDiff >= 0) return "rising";
    if (prevDiff <= 0 && nextDiff <= 0) return "falling";
    return "turning";
  }

  function calculateAdvancedTidePhase(frame, dailyStats) {
    const level = frame?.sea_level_height_msl;
    if (typeof level !== "number" || !dailyStats) return "unknown";
    const range = dailyStats.range || 1;
    const normalized = (level - dailyStats.min) / range;
    const trend = frame.tide_trend || "unknown";

    if (normalized <= 0.2) return trend === "rising" ? "low_rising" : "low";
    if (normalized <= 0.4) return "low_mid";
    if (normalized < 0.65) return trend === "falling" ? "mid_falling" : "mid_rising";
    if (normalized < 0.82) return trend === "falling" ? "high_falling" : "high_approach";
    return trend === "falling" ? "high_falling" : "high_approach";
  }

  function tideScoreForSpot(phase, spot) {
    const type = classifySpotType(spot);
    const tables = {
      "dadaepo-mid": { mid_falling: 16, low_mid: 14, low_rising: 10, low: 6, mid_rising: 4, high_approach: -10, high_falling: -2 },
      "dadaepo-morundae": { mid_falling: 14, low_mid: 12, low_rising: 8, low: 5, mid_rising: 3, high_approach: -8, high_falling: -2 },
      "dadaepo-songan": { low_mid: 14, low: 10, low_rising: 10, mid_falling: 8, mid_rising: 4, high_approach: -12, high_falling: -10 },
      "songjeong-surfholic": { mid_rising: 10, high_approach: 8, low_rising: 6 },
      "songjeong-lastwave": { mid_rising: 8, high_approach: 6, low_rising: 4 }
    };
    return tables[type]?.[phase] || 0;
  }

  function calculateForecastConfidence(frame) {
    const jmaHeight = frame?.jma_wave?.available ? frame.jma_wave.height_m : null;
    const openMeteoHeight = frame?.wave_height;
    const ignored = Boolean(frame?.jma_wave?.ignored);
    const flags = [];
    let confidence = "normal";
    let scoreCap = null;
    let waveSourceLabel = "Open-Meteo 단독";

    if (ignored && typeof jmaHeight === "number" && typeof openMeteoHeight === "number") {
      confidence = "low";
      waveSourceLabel = "Open-Meteo 우선";
      scoreCap = 78;
      flags.push("JMA 보정값이 Open-Meteo와 크게 달라 파고 보정 제외");
    } else if (typeof jmaHeight === "number" && typeof openMeteoHeight === "number") {
      const diff = Math.abs(jmaHeight - openMeteoHeight);
      waveSourceLabel = "Open-Meteo + JMA 보정";
      confidence = diff >= 0.6 ? "low" : diff >= 0.35 ? "medium" : "high";
      if (diff >= 0.35) flags.push("예보 불일치 있음");
      if (diff >= 0.6) {
        flags.push("Open-Meteo와 JMA 보정 파고 차이가 커서 현장 확인 우선");
        scoreCap = 78;
      }
    } else if (typeof jmaHeight === "number") {
      confidence = "medium";
      waveSourceLabel = "JMA 보정";
    }

    return { confidence, flags, score_cap: scoreCap, wave_source_label: waveSourceLabel };
  }

  function classifyDadaeppongGrade(frame, spot, windInfo) {
    if (!classifySpotType(spot).startsWith("dadaepo")) return null;
    const height = waveHeightUsed(frame);
    const period = frame?.wave_period;
    const dir = normalize360(frame?.wave_direction);
    const phase = frame?.tide_phase_advanced;
    const windSpeed = frame?.wind_speed_10m;
    const weakWind = isCleanWind(windSpeed) || isOkayWind(windSpeed);
    const offshoreWind = windInfo?.wind_class === "offshore" || windInfo?.wind_class === "cross_off";
    const cleanOffshore = (weakWind && offshoreWind) || (isCleanWind(windSpeed) && windInfo?.wind_class !== "onshore");
    const badWind = windInfo?.wind_class === "onshore" && typeof windSpeed === "number" && windSpeed >= 5;
    const sourceLift =
      (typeof frame?.jma_wave?.height_m === "number" && frame.jma_wave.height_m >= 0.9) ||
      (typeof frame?.wave_height === "number" && frame.wave_height >= 0.9);

    if (dir === null || typeof height !== "number" || typeof period !== "number") return null;

    const optimalSwell = isDirectionBetween(dir, 200, 250);
    const goodSwell = isDirectionBetween(dir, 170, 260);
    const southSwell = isDirectionBetween(dir, 165, 205);
    const weakSouthEast = isDirectionBetween(dir, 125, 165);
    const eastBlocked = isDirectionBetween(dir, 55, 115);
    const primeTide = ["mid_falling", "low_mid", "low_rising", "low"].includes(phase);
    const okayTide = primeTide || phase === "mid_rising";
    const highTide = phase === "high_approach" || phase === "high_falling";
    const heightWindow = height >= 0.8 && height <= 1.8;
    const funHeight = height >= 1.0 && height <= 1.8;

    if (height < 0.5 || period < 5 || (eastBlocked && height < 1.2)) return "비추천";

    const coreHits = [heightWindow, goodSwell, period >= 9, cleanOffshore, primeTide].filter(Boolean).length;
    if (
      heightWindow &&
      (optimalSwell || (goodSwell && period >= 11)) &&
      period >= 10 &&
      cleanOffshore &&
      primeTide &&
      coreHits >= 4
    ) {
      return "다대뽕";
    }

    if ((optimalSwell || southSwell) && funHeight && period >= 8 && (cleanOffshore || weakWind) && okayTide && !badWind) {
      return "남스웰 양호";
    }

    if ((goodSwell || weakSouthEast) && height >= 0.75 && period >= 7 && (weakWind || offshoreWind) && okayTide && !badWind) {
      return "약다대뽕";
    }

    // 6/2처럼 주기가 짧아도 사이즈, 약풍, 물때가 맞으면 약한 다대포 체감이 나올 수 있어
    // 완전 비추천으로 버리지 않고 낮은 상한의 약다대뽕 후보로 남긴다.
    if ((goodSwell || weakSouthEast) && height >= 0.8 && height <= 1.1 && period >= 5 && weakWind && okayTide && !highTide) {
      return "약다대뽕";
    }

    if ((weakSouthEast || eastBlocked) && height >= 0.85 && (period >= 7 || sourceLift) && !badWind) {
      return "애매하지만 체크";
    }

    if (height >= 0.7 && period >= 7 && weakWind && okayTide && !badWind) {
      return "탈만함";
    }

    if ((goodSwell || weakSouthEast) && height >= 0.8 && period >= 5.5 && weakWind && !highTide) {
      return "애매하지만 체크";
    }
    if (period < 6 || badWind) return "비추천";
    if (highTide) return null;
    return null;
  }

  function applyRainAfterRisk(score, frame, recentRainMm, flags) {
    let risk = null;
    let nextScore = score;
    const rain = typeof frame?.precipitation === "number" ? frame.precipitation : 0;
    const recent = typeof recentRainMm === "number" ? recentRainMm : 0;

    if (rain >= 5 || recent >= 15) {
      risk = "high";
      nextScore = Math.min(nextScore, 55);
      flags.push("비 직후 다대포는 하구 영향으로 탁도, 부유물, 유속 리스크가 큼");
    } else if (rain >= 1 || recent >= 5) {
      risk = "medium";
      nextScore -= 6;
      flags.push("약한 비 이후에도 현장 수질과 조류 확인 필요");
    }

    return { score: nextScore, risk };
  }

function applySongjeongCaps(score, frame, flags) {
    let nextScore = score;
    let beginnerWarning = false;
    const height = waveHeightUsed(frame);

    if (height < 0.4) {
      nextScore = Math.min(nextScore, 45);
      flags.push("송정 기준 파고가 너무 작음");
    } else if (height < 0.5) {
      nextScore = Math.min(nextScore, 58);
      flags.push("롱보드로도 약한 사이즈");
    } else if (height < 0.8) {
      nextScore = Math.min(nextScore, 70);
      flags.push("탈 수는 있지만 좋은 사이즈는 아님");
    }
    if (height >= 1.0 && frame?.wave_period >= 10) {
      nextScore = Math.min(nextScore, 72);
      flags.push("송정 장주기 덤프 가능성");
    }
    if (height >= 1.5) {
      nextScore = Math.min(nextScore, 78);
      beginnerWarning = true;
      flags.push("초보자 위험 사이즈");
    }

    return { score: nextScore, beginner_warning: beginnerWarning };
  }

  function applyDadaepoCaps(score, frame, spot, flags) {
    let nextScore = score;
    let beginnerWarning = false;
    let currentRisk = false;
    const height = waveHeightUsed(frame);

    if (height >= 1.8) {
      nextScore = Math.min(nextScore, 84);
      currentRisk = true;
      flags.push("조류와 라인업 거리 리스크");
    }
    if (height >= 2.2) {
      nextScore = Math.min(nextScore, 78);
      beginnerWarning = true;
      flags.push("과한 사이즈");
      flags.push("초중급 비추천");
    }
    if (classifySpotType(spot) === "dadaepo-songan") {
      nextScore = Math.min(nextScore, 80);
      currentRisk = true;
      beginnerWarning = true;
      flags.push("송안은 조류 대응 가능자 위주");
      flags.push("초보자 단독 입수 비추천");
      flags.push("라인업 거리와 유속 현장 확인 필요");
    }

    return { score: nextScore, current_risk: currentRisk, beginner_warning: beginnerWarning };
  }

  function scoreSongjeong(frame, spot, flags, windInfo) {
    const type = classifySpotType(spot);
    const height = waveHeightUsed(frame);
    const period = frame?.wave_period;
    const dir = normalize360(frame?.wave_direction);
    let score = 28;

    if (type === "songjeong-surfholic") {
      if (height >= 0.4 && height <= 1.2) score += 22;
      else if (height > 1.2 && height < 1.5) score += 10;
      else score -= 10;

      if (isDirectionBetween(dir, 105, 165)) score += 24;
      else if (isDirectionBetween(dir, 85, 105) && height >= 0.8) score += 10;
      else score -= 12;
    } else {
      if (height >= 0.5 && height <= 1.3) score += 22;
      else if (height > 1.3 && height < 1.5) score += 8;
      else score -= 12;

      if (isDirectionBetween(dir, 130, 180)) score += 24;
      else if (isDirectionBetween(dir, 85, 130) && height >= 0.9) score += 8;
      else score -= 14;
    }

    if (period >= 7 && period <= 12) score += 18;
    else if (period >= 6) score += 8;
    else score -= 12;

    score += windInfo.score_delta;
    score += tideScoreForSpot(frame?.tide_phase_advanced, spot);

    if (dir !== null && isDirectionBetween(dir, 35, 75)) {
      score = Math.min(score, 58);
      flags.push("NE 계열은 방파제 영향으로 차트보다 약할 수 있음");
    }

    const caps = applySongjeongCaps(score, frame, flags);
    return { score: caps.score, beginner_warning: caps.beginner_warning };
  }

  function scoreDadaepo(frame, spot, flags, windInfo) {
    const type = classifySpotType(spot);
    const heightRaw = waveHeightUsed(frame);
    const height = type === "dadaepo-morundae" && typeof heightRaw === "number" ? roundWaveHeight(heightRaw * 0.9) : heightRaw;
    const period = frame?.wave_period;
    const dir = normalize360(frame?.wave_direction);
    let score = 26;

    const target = {
      "dadaepo-morundae": [0.6, 1.4],
      "dadaepo-mid": [0.7, 1.8],
      "dadaepo-songan": [0.8, 1.8]
    }[type] || [0.7, 1.8];

    if (height >= 1.0 && height <= target[1]) score += 24;
    else if (height >= target[0] && height <= target[1]) score += 16;
    else if (height > target[1] && height < 2.0) score += 10;
    else score -= 10;

    if (isDirectionBetween(dir, 200, 250)) score += 28;
    else if (isDirectionBetween(dir, 170, 260)) score += 20;
    else if (isDirectionBetween(dir, 125, 170) && height >= 0.8) score += 6;
    else if (isDirectionBetween(dir, 55, 115)) score -= 22;
    else score -= 12;

    if (period >= 11) score += 30;
    else if (period >= 10) score += 26;
    else if (period >= 9) score += 22;
    else if (period >= 8) score += 15;
    else if (period >= 7) score += 8;
    else if (period >= 6) score -= 2;
    else score -= 14;

    score += windInfo.score_delta;
    score += tideScoreForSpot(frame?.tide_phase_advanced, spot);

    const grade = classifyDadaeppongGrade(frame, spot, windInfo);
    if (grade === "다대뽕") score = Math.min(Math.max(score, 82), 94);
    if (grade === "남스웰 양호") score = Math.min(Math.max(score, 74), 86);
    if (grade === "약다대뽕") {
      const weakCap = period < 6 ? 66 : period < 7 ? 70 : period < 8 ? 74 : 80;
      score = Math.min(Math.max(score, period < 6 ? 64 : 66), weakCap);
    }
    if (grade === "탈만함") score = Math.min(Math.max(score, 56), 68);
    if (grade === "애매하지만 체크") score = Math.min(Math.max(score, 52), 64);
    if (grade === "비추천") score = Math.min(score, 45);

    if (isDirectionBetween(dir, 55, 115)) {
      score = Math.min(score, height >= 1.2 && period >= 8 ? 58 : 48);
      flags.push("동해 계열 스웰은 다대포에서 힘이 죽을 수 있음");
    }
    if (period < 6 && grade !== "약다대뽕") {
      score = Math.min(score, 52);
      flags.push("다대포는 주기 6초 미만이면 겉보기보다 힘이 약할 수 있음");
    } else if (period < 8) {
      score = Math.min(score, grade === "약다대뽕" ? 72 : 68);
      flags.push("다대포는 주기 8초 미만이면 다대뽕 상한을 낮게 봄");
    }
    if (frame?.tide_phase_advanced === "high_approach" || frame?.tide_phase_advanced === "high_falling") {
      score = Math.min(score, 68);
      flags.push("다대포는 만조 부근에서 힘이 풀릴 수 있음");
    }

    const rain = applyRainAfterRisk(score, frame, frame?.recent_6h_precipitation, flags);
    const caps = applyDadaepoCaps(rain.score, frame, spot, flags);

    return {
      score: caps.score,
      current_risk: caps.current_risk || rain.risk === "high",
      beginner_warning: caps.beginner_warning,
      rain_risk: rain.risk,
      dadaeppong_grade: grade
    };
  }

  function ratingFromScore(score) {
    if (score >= 72) return "좋음";
    if (score >= 52) return "보통";
    return "별로";
  }

  function localCommentFor(type, result) {
    if (type === "dadaepo-songan") {
      return "송안은 점수가 좋아도 조류, 라인업 거리, 체력 확인이 먼저입니다.";
    }
    if (type.startsWith("dadaepo")) {
      return result.dadaeppong_grade === "다대뽕" || result.dadaeppong_grade === "약다대뽕"
        ? `다대포 ${result.dadaeppong_grade} 예보입니다. 파고만 보지 말고 조위와 비 직후 하구 리스크를 같이 보세요.`
        : "다대포는 파고보다 주기, SW~SSW 스웰, 썰물 타이밍, 북풍 계열 약풍을 함께 봅니다.";
    }
    return "송정은 장주기와 사이즈가 함께 커지면 덤프 가능성을 같이 봅니다.";
  }

  function calculateSurfScore(frame, spot) {
    const flags = [];
    const confidence = calculateForecastConfidence(frame);
    flags.push(...confidence.flags);

    const windInfo = classifyWindForSpot(frame?.wind_direction_10m, frame?.wind_speed_10m, spot);
    flags.push(...windInfo.flags);

    const type = classifySpotType(spot);
    const result = type.startsWith("dadaepo")
      ? scoreDadaepo(frame, spot, flags, windInfo)
      : scoreSongjeong(frame, spot, flags, windInfo);

    let score = result.score;
    if (confidence.score_cap) score = Math.min(score, confidence.score_cap);
    score = Math.round(clamp(score, 0, 100));

    return {
      score,
      rating: ratingFromScore(score),
      flags: [...new Set(flags)],
      confidence: confidence.confidence,
      dadaeppong_grade: type.startsWith("dadaepo") ? result.dadaeppong_grade || null : null,
      tide_phase_advanced: frame?.tide_phase_advanced || "unknown",
      tide_trend: frame?.tide_trend || "unknown",
      wave_height_used: waveHeightUsed(frame),
      wave_source_label: confidence.wave_source_label,
      current_risk: Boolean(result.current_risk),
      beginner_warning: Boolean(result.beginner_warning),
      rain_risk: result.rain_risk || null,
      local_comment: localCommentFor(type, result),
      wind_class: windInfo.wind_class,
      wind_label: windInfo.wind_label
    };
  }

  return {
    classifySpotType,
    classifyWindForSpot,
    calculateTideTrend,
    calculateAdvancedTidePhase,
    classifyDadaeppongGrade,
    calculateForecastConfidence,
    applySongjeongCaps,
    applyDadaepoCaps,
    applyRainAfterRisk,
    calculateSurfScore,
    ratingFromScore,
    tideScoreForSpot,
    waveHeightUsed,
    isDirectionBetween,
    angularDistance,
    normalize360
  };
});
