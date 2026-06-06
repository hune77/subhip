const SPOTS = [
  {
    id: "songjeong-surfholic",
    region: "songjeong",
    name: "서프홀릭",
    shortName: "서프홀릭",
    fullName: "송정 서프홀릭 앞",
    latitude: 35.1795,
    longitude: 129.2015,
    beachFacingAngle: 135,
    idealSwellFrom: 160,
    tidePreference: "mid-high",
    beginnerRiskHeight: 1.5,
    note: "송정 중앙 라인업 기준. S~SE 스웰, 약한 W~N 계열 오프쇼어, 중물에서 만조 접근 구간을 좋게 봅니다."
  },
  {
    id: "songjeong-lastwave",
    region: "songjeong",
    name: "라스트웨이브",
    shortName: "라스트",
    fullName: "송정 라스트웨이브 앞",
    latitude: 35.1768,
    longitude: 129.198,
    beachFacingAngle: 135,
    idealSwellFrom: 160,
    tidePreference: "mid-high",
    beginnerRiskHeight: 1.5,
    note: "송정 우측 라인업 기준. SE~SSE 스웰을 우선하고, E 계열은 사이즈가 받쳐줄 때만 가점합니다."
  },
  {
    id: "dadaepo-morundae",
    region: "dadaepo",
    name: "몰운대",
    shortName: "몰운대",
    fullName: "다대포 몰운대 포인트",
    latitude: 35.0464,
    longitude: 128.9647,
    beachFacingAngle: 180,
    idealSwellFrom: 180,
    tidePreference: "mid-high",
    beginnerRiskHeight: 1.6,
    note: "세 포인트 중 비교적 작게 들어오는 좌측 포인트. 남스웰과 중물 이후를 좋게 봅니다.",
    mapImage: "./assets/dadaepo-points.jpg"
  },
  {
    id: "dadaepo-mid",
    region: "dadaepo",
    name: "미드",
    shortName: "미드",
    fullName: "다대포 미드 포인트",
    latitude: 35.0469,
    longitude: 128.9687,
    beachFacingAngle: 180,
    idealSwellFrom: 180,
    tidePreference: "mid-high",
    beginnerRiskHeight: 1.6,
    note: "다대포 메인 체크 포인트. 남스웰, 약한 북서풍, 중물 상승에서 만조 접근 구간을 가장 강하게 봅니다.",
    mapImage: "./assets/dadaepo-points.jpg"
  },
  {
    id: "dadaepo-songan",
    region: "dadaepo",
    name: "송안",
    shortName: "송안",
    fullName: "다대포 송안 포인트",
    latitude: 35.0479,
    longitude: 128.9725,
    beachFacingAngle: 180,
    idealSwellFrom: 180,
    tidePreference: "low-mid",
    beginnerRiskHeight: 1.4,
    note: "라인업이 멀고 조류 대응이 필요합니다. 초보자 단독 입수는 비추천하며 Low~Mid 구간을 우선합니다.",
    mapImage: "./assets/dadaepo-points.jpg"
  }
];

const SPOT_ALIASES = {
  songjeong: "songjeong-surfholic",
  dadaepo: "dadaepo-mid"
};

function findSpot(spotId) {
  const normalizedId = SPOT_ALIASES[spotId] || spotId;
  return SPOTS.find((spot) => spot.id === normalizedId);
}

module.exports = {
  SPOTS,
  findSpot
};
