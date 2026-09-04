/**
 * 설치 마법사의 단계.
 *
 * 화면마다 숫자를 적으면 단계가 하나 늘 때 여러 곳을 고쳐야 하고, 한 곳을 빠뜨리면
 * "5단계 중 6단계" 같은 화면이 나온다.
 *
 * 순서에는 이유가 있다.
 * 1. 환경 점검 — 못 돌리는 서버라면 설정을 넣기 전에 알아야 한다.
 * 2. 관리자 계정 — 이후 단계는 관리자만 볼 수 있으므로 먼저 만든다.
 * 3. 서비스 환경 — 시간대·HTTPS처럼 이 서버가 놓인 자리에 관한 것.
 * 4. 외부 연결 — 바깥 서비스에 관한 것. 전부 선택이라 뒤에 둔다.
 * 5. 완료 — 무엇이 켜졌는지 확인하고 끝낸다.
 */
const SETUP_STEP = {
  environment: 1,
  account: 2,
  service: 3,
  connections: 4,
  done: 5,
} as const;

const SETUP_STEP_TOTAL = Object.keys(SETUP_STEP).length;

/** 화면 순서. 진행 표시줄이 이 순서로 그린다. */
const SETUP_ORDER = ["environment", "account", "service", "connections", "done"] as const;

type SetupStepName = (typeof SETUP_ORDER)[number];

export { SETUP_ORDER, SETUP_STEP, SETUP_STEP_TOTAL };
export type { SetupStepName };
