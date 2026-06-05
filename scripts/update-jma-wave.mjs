import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const SOURCE_URL = "https://gga.kr/pds/w_.php";
const ROOT = process.cwd();
const OUTPUTS = [
  path.join(ROOT, "client", "data", "jma-wave.json"),
  path.join(ROOT, "docs", "data", "jma-wave.json")
];

const SPOT_PIXELS = {
  songjeong: { x: 348, y: 318, radius: 7 },
  dadaepo: { x: 341, y: 326, radius: 7 }
};

const WAVE_BANDS = [
  { key: "0-49cm", minM: 0, maxM: 0.49, valueM: 0.25, rgb: [0, 0, 0] },
  { key: "50-99cm", minM: 0.5, maxM: 0.99, valueM: 0.75, rgb: [0, 0, 96] },
  { key: "100-149cm", minM: 1, maxM: 1.49, valueM: 1.25, rgb: [0, 96, 192] },
  { key: "150-199cm", minM: 1.5, maxM: 1.99, valueM: 1.75, rgb: [0, 192, 192] },
  { key: "200-249cm", minM: 2, maxM: 2.49, valueM: 2.25, rgb: [0, 192, 0] },
  { key: "250-299cm", minM: 2.5, maxM: 2.99, valueM: 2.75, rgb: [192, 192, 0] },
  { key: "300-349cm", minM: 3, maxM: 3.49, valueM: 3.25, rgb: [192, 96, 0] },
  { key: "350-399cm", minM: 3.5, maxM: 3.99, valueM: 3.75, rgb: [192, 0, 192] },
  { key: "400-449cm", minM: 4, maxM: 4.49, valueM: 4.25, rgb: [96, 0, 192] },
  { key: "450cm+", minM: 4.5, maxM: null, valueM: 4.75, rgb: [255, 255, 255] }
];

function parseForecasts(html) {
  const forecasts = [];
  const regex =
    /<h3>\s*(\d{4})년\s+(\d{2})월\s+(\d{2})일\s+(\d{2})시[\s\S]*?<\/h3>\s*<img[^>]+src="([^"]+)"/g;
  let match;

  while ((match = regex.exec(html))) {
    const [, year, month, day, hour, src] = match;
    forecasts.push({
      time: `${year}-${month}-${day}T${hour}:00:00+09:00`,
      imageUrl: src.replace("http://", "https://")
    });
  }

  return forecasts;
}

function nearestBand(r, g, b) {
  let best = null;
  for (const band of WAVE_BANDS) {
    const [br, bg, bb] = band.rgb;
    const distance = Math.hypot(r - br, g - bg, b - bb);
    if (!best || distance < best.distance) best = { band, distance };
  }
  return best && best.distance <= 80 ? best.band : null;
}

function sampleSpot(png, point) {
  const counts = new Map();
  const samples = [];

  for (let y = point.y - point.radius; y <= point.y + point.radius; y += 1) {
    for (let x = point.x - point.radius; x <= point.x + point.radius; x += 1) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
      const index = (y * png.width + x) * 4;
      const r = png.data[index];
      const g = png.data[index + 1];
      const b = png.data[index + 2];
      const a = png.data[index + 3];
      if (a < 200) continue;

      const band = nearestBand(r, g, b);
      if (!band) continue;

      counts.set(band.key, (counts.get(band.key) || 0) + 1);
      samples.push({ key: band.key, valueM: band.valueM });
    }
  }

  if (!samples.length) {
    return {
      available: false,
      reason: "No wave-color pixels sampled near Busan coast"
    };
  }

  const [bestKey, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const band = WAVE_BANDS.find((item) => item.key === bestKey);

  return {
    available: true,
    heightM: band.valueM,
    band: band.key,
    sampleCount: samples.length,
    dominantCount: count,
    pixel: { x: point.x, y: point.y, radius: point.radius }
  };
}

async function fetchPng(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return PNG.sync.read(buffer);
}

async function main() {
  const sourceResponse = await fetch(SOURCE_URL);
  if (!sourceResponse.ok) throw new Error(`Failed to fetch ${SOURCE_URL}: ${sourceResponse.status}`);

  const html = await sourceResponse.text();
  const forecasts = parseForecasts(html);
  if (!forecasts.length) throw new Error("No JMA forecast images found");

  const frames = [];
  for (const forecast of forecasts) {
    const png = await fetchPng(forecast.imageUrl);
    const spots = {};
    for (const [spotKey, point] of Object.entries(SPOT_PIXELS)) {
      spots[spotKey] = sampleSpot(png, point);
    }

    frames.push({
      time: forecast.time,
      imageUrl: forecast.imageUrl,
      spots
    });
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    sourcePage: SOURCE_URL,
    method: "IMOC/JMA wave map color sampling near Busan coast. Values are coarse wave-height bands, not buoy readings.",
    forecastHours: frames
  };

  for (const output of OUTPUTS) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  console.log(`Wrote ${frames.length} JMA wave frames to ${OUTPUTS.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
