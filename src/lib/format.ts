/**
 * 날짜 표시.
 *
 * 시간대를 **한국 시간으로 고정**한다. 서버가 어디에서 돌든 사용자가 보는 "오늘"은 하나여야
 * 하고, 자동 삭제 안내처럼 날짜가 곧 약속인 화면에서는 시간대에 따라 하루가 밀리면 안 된다.
 */

const TIME_ZONE = "Asia/Seoul";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: TIME_ZONE,
});

function formatDate(value: Date): string {
  return dateFormatter.format(value);
}

/** 하루를 밀리초로. 24 × 60 × 60 × 1000. */
const DAY_MS = 86_400_000;

/**
 * 한국 시간 기준 자정으로 내린 값. 남은 날짜를 "몇 밤 남았나"로 세기 위한 것이다.
 * 시각까지 넣어 빼면 오후 11시와 오전 1시의 "1일 남음"이 달라진다.
 */
function startOfDayInSeoul(value: Date): number {
  // ko-KR 포맷은 "2026. 8. 29." 꼴이라 그대로 Date로 읽을 수 없다. 부분값을 직접 조합한다.
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).format(value);
  return Date.parse(`${parts}T00:00:00Z`);
}

/** 오늘부터 그날까지 남은 날. 오늘이면 0, 이미 지났으면 음수. */
function daysUntil(target: Date, now: Date = new Date()): number {
  return Math.round((startOfDayInSeoul(target) - startOfDayInSeoul(now)) / DAY_MS);
}

export { DAY_MS, daysUntil, formatDate };
