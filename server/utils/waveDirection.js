function normalizeAngle(angle) {
  if (typeof angle !== "number" || Number.isNaN(angle)) {
    return null;
  }

  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

function classifyWaveBreak(waveDirection, beachFacingAngle) {
  const angleDiff = normalizeAngle(waveDirection - beachFacingAngle);

  if (angleDiff === null) {
    return {
      angle_diff: null,
      break_type: "방향 정보 없음",
      break_comment: "파도 방향 데이터가 없어 브레이크 성향을 판단하지 않습니다."
    };
  }

  const absDiff = Math.abs(angleDiff);

  if (absDiff <= 15) {
    return {
      angle_diff: angleDiff,
      break_type: "A프레임",
      break_comment: "파도가 정면으로 들어오는 편이라 좌우로 갈라지는 구간을 기대할 수 있습니다."
    };
  }

  if (angleDiff < -15 && angleDiff >= -70) {
    return {
      angle_diff: angleDiff,
      break_type: "레프트 성향",
      break_comment: "오른쪽에서 먼저 서며 레프트 라이딩 성향이 생길 수 있습니다."
    };
  }

  if (angleDiff > 15 && angleDiff <= 70) {
    return {
      angle_diff: angleDiff,
      break_type: "라이트 성향",
      break_comment: "왼쪽에서 먼저 서며 라이트 라이딩 성향이 생길 수 있습니다."
    };
  }

  return {
    angle_diff: angleDiff,
    break_type: "방향 불리",
    break_comment: "해변 정면과 파도 방향이 크게 어긋나 체감 파고가 약하거나 지저분할 수 있습니다."
  };
}

module.exports = {
  normalizeAngle,
  classifyWaveBreak
};
