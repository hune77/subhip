const express = require("express");
const { getCacheSnapshot, hasForecastData } = require("../services/cache");

const router = express.Router();

router.get("/", (req, res) => {
  const snapshot = getCacheSnapshot();

  res.json({
    ok: true,
    cache_ready: hasForecastData(),
    updated_at: snapshot.updatedAt,
    refreshing: snapshot.isRefreshing,
    last_error: snapshot.lastError
  });
});

module.exports = router;
