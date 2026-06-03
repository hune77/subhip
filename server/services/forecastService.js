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

function at(list, index) {
  return Array.isArray(list) ? list[index] : null;
}

function toDateKey(isoTime) {
  return isoTime.slice(0, 10);
}

function buildHourlyFrames(spot, openMeteoData) {
  const marineHourly = openMeteoData.marine.hourly || {};
  const windHourly = openMeteoData.wind.hourly || {};

  return marineHourly.time.map((time, index) => {
    const frame = {
      time,
      date: toDateKey(time),
      hour: time.slice(11, 16),
      wave_height: at(marineHourly.wave_height, index),
      wave_period: at(marineHourly.wave_period, index),
      wave_direction: at(marineHourly.wave_direction, index),
      sea_surface_temperature: at(marineHourly.sea_surface_temperature, index),
      wind_speed_10m: at(windHourly.wind_speed_10m, index),
      wind_direction_10m: at(windHourly.wind_direction_10m, index)
    };

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
    if (!days[item.date]) {
      days[item.date] = [];
    }
    days[item.date].push(item);
    return days;
  }, {});

  return Object.entries(grouped).map(([date, items]) => {
    const bestHour = items.reduce((best, item) => {
      if (!best || item.translated.score > best.translated.score) {
        return item;
      }
      return best;
    }, null);

    const avgScore = Math.round(
      items.reduce((sum, item) => sum + item.translated.score, 0) / items.length
    );

    return {
      date,
      best_time: bestHour ? bestHour.hour : null,
      rating: bestHour ? bestHour.translated.rating : "정보 없음",
      avg_score: avgScore,
      best_score: bestHour ? bestHour.translated.score : null,
      summary: bestHour
        ? `${bestHour.hour} 전후가 가장 무난합니다. ${bestHour.translated.summary}`
        : "예보 데이터가 없습니다."
    };
  });
}

async function buildSpotForecast(spot) {
  const openMeteoData = await fetchOpenMeteoForecast(spot);
  const hourly = buildHourlyFrames(spot, openMeteoData);
  const daily = buildDailySummaries(hourly);

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
        weather: "Open-Meteo Weather Forecast API"
      },
      spots: [snapshot.spots[spotId]]
    };
  }

  return {
    updated_at: snapshot.updatedAt,
    last_error: snapshot.lastError,
    source: {
      marine: "Open-Meteo Marine API",
      weather: "Open-Meteo Weather Forecast API"
    },
    spots: SPOTS.map((spot) => snapshot.spots[spot.id]).filter(Boolean)
  };
}

module.exports = {
  getSurfData,
  refreshForecastCache
};
