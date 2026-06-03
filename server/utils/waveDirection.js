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
      break_comment: "파도 방향 데이터가 비어 있어 좌우 브레이크를 판단하지 않았습니다."
    };
  }

  const absDiff = Math.abs(angleDiff);

  if (absDiff <= 15) {
    return {
      angle_diff: angleDiff,
      break_type: "A프레임",
      break_comment: "파도가 정면으로 들어올 가능성이 있어 좌우로 갈라지는 구간을 기대할 수 있습니다."
    };
  }

  if (angleDiff < -15 && angleDiff >= -70) {
    return {
      angle_diff: angleDiff,
      break_type: "레프트 성향",
      break_comment: "오른쪽에서 먼저 부서지는 흐름입니다. 초보자는 사람이 적은 완만한 구간을 고르세요."
    };
  }

  if (angleDiff > 15 && angleDiff <= 70) {
    return {
      angle_diff: angleDiff,
      break_type: "라이트 성향",
      break_comment: "왼쪽에서 먼저 부서지는 흐름입니다. 라인업 진입 전 흐름을 꼭 확인하세요."
    };
  }

  return {
    angle_diff: angleDiff,
    break_type: "방향 불리",
    break_comment: "해변이 바라보는 방향과 파도 방향이 많이 어긋나 차피하거나 힘이 약할 수 있습니다."
  };
}

module.exports = {
  normalizeAngle,
  classifyWaveBreak
};
