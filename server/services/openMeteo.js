const axios = require("axios");

const MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine";
const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEZONE = "Asia/Seoul";

const http = axios.create({
  timeout: 12000,
  headers: {
    "User-Agent": "surf-forecast-app/1.0"
  }
});

async function fetchMarineForecast(spot) {
  try {
    const response = await http.get(MARINE_API_URL, {
      params: {
        latitude: spot.latitude,
        longitude: spot.longitude,
        hourly: "wave_height,wave_period,wave_direction,sea_surface_temperature",
        timezone: TIMEZONE,
        forecast_days: 7,
        cell_selection: "sea"
      }
    });

    return response.data;
  } catch (error) {
    throw new Error(`Marine API 호출 실패(${spot.name}): ${error.message}`);
  }
}

async function fetchWindForecast(spot) {
  try {
    const response = await http.get(WEATHER_API_URL, {
      params: {
        latitude: spot.latitude,
        longitude: spot.longitude,
        hourly: "wind_speed_10m,wind_direction_10m",
        wind_speed_unit: "ms",
        timezone: TIMEZONE,
        forecast_days: 7
      }
    });

    return response.data;
  } catch (error) {
    throw new Error(`Weather API 호출 실패(${spot.name}): ${error.message}`);
  }
}

async function fetchOpenMeteoForecast(spot) {
  const [marine, wind] = await Promise.all([
    fetchMarineForecast(spot),
    fetchWindForecast(spot)
  ]);

  return {
    marine,
    wind
  };
}

module.exports = {
  fetchOpenMeteoForecast
};
