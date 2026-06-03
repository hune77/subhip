const path = require("path");
const cron = require("node-cron");
const cors = require("cors");
const express = require("express");
const healthRouter = require("./routes/health");
const surfDataRouter = require("./routes/surfData");
const { getSurfData, refreshForecastCache } = require("./services/forecastService");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/surf-data", surfDataRouter);
app.get("/api/refresh", async (req, res, next) => {
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
app.use(express.static(path.join(__dirname, "../client")));

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    res.sendFile(path.join(__dirname, "../client/index.html"));
    return;
  }

  next();
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  console.error(err);

  res.status(status).json({
    error: true,
    message: err.message || "서버 오류가 발생했습니다."
  });
});

cron.schedule(
  "5 5,11,17,23 * * *",
  async () => {
    try {
      await refreshForecastCache();
      console.log("[cron] surf data refreshed");
    } catch (error) {
      console.error("[cron] refresh failed:", error.message);
    }
  },
  {
    timezone: "Asia/Seoul"
  }
);

app.listen(PORT, async () => {
  console.log(`Surf Forecast server running: http://localhost:${PORT}`);

  try {
    await refreshForecastCache();
    console.log("Initial surf data loaded");
  } catch (error) {
    console.error("Initial data load failed:", error.message);
  }
});
