/**
 * 설치 마법사의 단계 번호.
 *
 * 화면마다 숫자를 적으면 단계가 하나 늘 때 세 곳을 고쳐야 하고, 한 곳을 빠뜨리면
 * "3단계 중 4단계" 같은 화면이 나온다.
 */
const SETUP_STEP = {
  account: 1,
  connections: 2,
  done: 3,
} as const;

const SETUP_STEP_TOTAL = Object.keys(SETUP_STEP).length;

export { SETUP_STEP, SETUP_STEP_TOTAL };
