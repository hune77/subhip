const { SPOTS, findSpot } = require("../config/spots");
const {
  getCacheSnapshot,
  hasForecastData,
  setForecastData,
  setLastError,
  setRefreshing
} = require("./cache");
const { fetchOpenMeteoForecast } = require("./openMeteo");
const { translateSurfFrame } = require("../utils/translator");
const { classifyWaveBreak } = require("../utils/waveDirection");
const SurfScoring = require("../../shared/surfScoring");

function at(list, index) {
  return Array.isArray(list) ? list[index] : null;
}

function toDateKey(isoTime) {
  return isoTime.slice(0, 10);
}

function isSurfableHour(hourText) {
  const hour = Number(String(hourText).slice(0, 2));
  return hour >= 5 && hour <= 19;
}

function waveSourceText(item) {
  return item?.jma_wave?.available ? "JMA 보정" : "Open-Meteo 단독";
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

    if (!values.length) {
      items.forEach((item) => {
        item.tide_phase = "unknown";
        item.tide_trend = "unknown";
        item.tide_phase_advanced = "unknown";
      });
      return;
    }

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
      item.tide_trend = SurfScoring.calculateTideTrend(prevLevel, item.sea_level_height_msl, nextLevel);
      item.tide_phase_advanced = SurfScoring.calculateAdvancedTidePhase(item, { min, max, range });
    });
  });

  hourly.forEach((item, index) => {
    const recent = hourly.slice(Math.max(0, index - 5), index + 1);
    item.recent_6h_precipitation =
      Math.round(
        recent.reduce((sum, frame) => sum + (typeof frame.precipitation === "number" ? frame.precipitation : 0), 0) * 10
      ) / 10;
  });

  return hourly;
}

function buildHourlyFrames(spot, openMeteoData) {
  const marineHourly = openMeteoData.marine.hourly || {};
  const windHourly = openMeteoData.wind.hourly || {};

  const frames = (marineHourly.time || []).map((time, index) => ({
    time,
    date: toDateKey(time),
    hour: time.slice(11, 16),
    wave_height: at(marineHourly.wave_height, index),
    combined_wave_height: at(marineHourly.wave_height, index),
    wave_period: at(marineHourly.wave_period, index),
    wave_direction: at(marineHourly.wave_direction, index),
    sea_surface_temperature: at(marineHourly.sea_surface_temperature, index),
    sea_level_height_msl: at(marineHourly.sea_level_height_msl, index),
    wind_speed_10m: at(windHourly.wind_speed_10m, index),
    wind_direction_10m: at(windHourly.wind_direction_10m, index),
    precipitation: at(windHourly.precipitation, index),
    jma_wave: {
      available: false,
      source_label: "Open-Meteo 단독",
      reason: "서버 API는 Open-Meteo 단독 예보를 사용합니다. GitHub Pages 정적 화면은 JMA 3일 보정을 별도로 반영합니다."
    }
  }));

  assignTidePhases(frames);

  return frames.map((frame) => {
    const breakInfo = classifyWaveBreak(frame.wave_direction, spot.beachFacingAngle);
    const translated = translateSurfFrame(frame, spot);

    return {
      ...frame,
      translated,
      break_type: breakInfo.break_type,
      break_comment: breakInfo.break_comment,
      angle_diff: breakInfo.angle_diff
    };
  });
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
      best_time: bestHour ? bestHour.hour : null,
      rating: bestHour ? bestHour.translated.rating : "정보 없음",
      avg_score: avgScore,
      best_score: bestHour ? bestHour.translated.score : null,
      source_label: bestHour ? bestHour.translated.wave_source_label || waveSourceText(bestHour) : "Open-Meteo 단독",
      summary: bestHour ? `${bestHour.hour} 전후가 가장 무난합니다. ${bestHour.translated.summary}` : "05:00~19:00 추천 데이터가 없습니다."
    };
  });
}

async function buildSpotForecast(spot) {
  const openMeteoData = await fetchOpenMeteoForecast(spot);
  const hourly = buildHourlyFrames(spot, openMeteoData);
  const daily = buildDailySummaries(hourly);

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
      combined_wave_height: "m",
      wave_period: "s",
      wave_direction: "deg",
      sea_surface_temperature: "C",
      sea_level_height_msl: "m",
      wind_speed_10m: "m/s",
      wind_direction_10m: "deg",
      precipitation: "mm"
    },
    hourly,
    daily
  };
}

async function refreshForecastCache() {
  const current = getCacheSnapshot();

  if (current.isRefreshing) {
    return current;
  }

  setRefreshing(true);

  try {
    const results = await Promise.all(SPOTS.map((spot) => buildSpotForecast(spot)));
    const spotsById = results.reduce((acc, spotForecast) => {
      acc[spotForecast.id] = spotForecast;
      return acc;
    }, {});

    setForecastData(spotsById);
    return getCacheSnapshot();
  } catch (error) {
    setLastError(error);
    throw error;
  } finally {
    setRefreshing(false);
  }
}

async function ensureForecastCache() {
  if (!hasForecastData()) {
    await refreshForecastCache();
  }
  return getCacheSnapshot();
}

async function getSurfData(spotId) {
  const snapshot = await ensureForecastCache();

  if (spotId) {
    const spot = findSpot(spotId);
    if (!spot) {
      const known = SPOTS.map((item) => item.id).join(", ");
      const error = new Error(`지원하지 않는 스팟입니다. 사용 가능: ${known}`);
      error.status = 404;
      throw error;
    }

    return {
      updated_at: snapshot.updatedAt,
      last_error: snapshot.lastError,
      source: {
        marine: "Open-Meteo Marine API",
        weather: "Open-Meteo Weather Forecast API",
        tide_note: "sea_level_height_msl은 모델 기반이라 실제 해변 조위와 차이가 있을 수 있습니다.",
        jma_wave: "서버 API는 Open-Meteo 단독입니다. 정적 GitHub Pages 화면은 별도 JMA 3일 보정 데이터를 사용합니다."
      },
      spots: [snapshot.spots[spot.id]].filter(Boolean)
    };
  }

  return {
    updated_at: snapshot.updatedAt,
    last_error: snapshot.lastError,
    source: {
      marine: "Open-Meteo Marine API",
      weather: "Open-Meteo Weather Forecast API",
      tide_note: "sea_level_height_msl은 모델 기반이라 실제 해변 조위와 차이가 있을 수 있습니다.",
      jma_wave: "서버 API는 Open-Meteo 단독입니다. 정적 GitHub Pages 화면은 별도 JMA 3일 보정 데이터를 사용합니다."
    },
    spots: SPOTS.map((spot) => snapshot.spots[spot.id]).filter(Boolean)
  };
}

module.exports = {
  getSurfData,
  refreshForecastCache
};
