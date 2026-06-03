const cache = {
  spots: {},
  updatedAt: null,
  lastError: null,
  isRefreshing: false
};

function getCacheSnapshot() {
  return {
    spots: cache.spots,
    updatedAt: cache.updatedAt,
    lastError: cache.lastError,
    isRefreshing: cache.isRefreshing
  };
}

function hasForecastData() {
  return Object.keys(cache.spots).length > 0;
}

function setRefreshing(value) {
  cache.isRefreshing = value;
}

function setForecastData(spots) {
  cache.spots = spots;
  cache.updatedAt = new Date().toISOString();
  cache.lastError = null;
}

function setLastError(error) {
  cache.lastError = {
    message: error.message || "알 수 없는 오류가 발생했습니다.",
    at: new Date().toISOString()
  };
}

module.exports = {
  getCacheSnapshot,
  hasForecastData,
  setRefreshing,
  setForecastData,
  setLastError
};
