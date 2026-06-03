const express = require("express");
const { getSurfData, refreshForecastCache } = require("../services/forecastService");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const data = await getSurfData(req.query.spot);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/refresh", async (req, res, next) => {
  try {
    await refreshForecastCache();
    const data = await getSurfData(req.query.spot);
    res.json({
      refreshed: true,
      ...data
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
