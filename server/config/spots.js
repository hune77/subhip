const SPOTS = [
  {
    id: "songjeong",
    name: "송정",
    fullName: "송정해수욕장",
    latitude: 35.1786,
    longitude: 129.1997,
    beachFacingAngle: 135,
    note: "초보 강습과 롱보드 입문자가 많이 찾는 부산 대표 서핑 스팟"
  },
  {
    id: "dadaepo",
    name: "다대포",
    fullName: "다대포해수욕장",
    latitude: 35.0471,
    longitude: 128.9673,
    beachFacingAngle: 180,
    note: "넓은 해변과 완만한 구간이 있어 바람과 조위 영향을 함께 봐야 하는 스팟"
  }
];

function findSpot(spotId) {
  return SPOTS.find((spot) => spot.id === spotId);
}

module.exports = {
  SPOTS,
  findSpot
};
