/**
 * 날짜 표시.
 *
 * 시간대를 **한 곳으로 고정한다.** 서버가 어디에서 돌든 사용자가 보는 "오늘"은 하나여야
 * 하고, 자동 삭제 안내처럼 날짜가 곧 약속인 화면에서는 시간대에 따라 하루가 밀리면 안 된다.
 *
 * 어느 시간대인지는 설치할 때 정한다(`server/settings.ts`의 `siteTimeZone`). 이 모듈은
 * 설정을 읽지 않고 인자로 받는다 — 그래야 데이터베이스를 모르는 채로 테스트할 수 있고,
 * 클라이언트에서도 안전하다.
 */

/** 인자를 주지 않았을 때. 이 서비스가 다루는 것이 한국 판결문이다. */
const DEFAULT_TIME_ZONE = "Asia/Seoul";

/**
 * 시간대마다 포맷터를 하나씩 만들어 둔다.
 *
 * `Intl.DateTimeFormat` 생성은 싸지 않은데 목록 화면은 날짜를 수십 번 그린다.
 * 시간대 수는 몇 개 되지 않으므로 지도에 담아 두는 편이 낫다.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }
  const created = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  });
  formatters.set(timeZone, created);
  return created;
}

function formatDate(value: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return formatterFor(timeZone).format(value);
}

/** 하루를 밀리초로. 24 × 60 × 60 × 1000. */
const DAY_MS = 86_400_000;

const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * 그 시간대의 자정으로 내린 값. 남은 날짜를 "몇 밤 남았나"로 세기 위한 것이다.
 * 시각까지 넣어 빼면 오후 11시와 오전 1시의 "1일 남음"이 달라진다.
 */
function startOfDay(value: Date, timeZone: string): number {
  // ko-KR 포맷은 "2026. 8. 29." 꼴이라 그대로 Date로 읽을 수 없다. ISO와 같은 모양을
  // 주는 로케일로 부분값을 얻어 조합한다.
  let formatter = dayKeyFormatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
    dayKeyFormatters.set(timeZone, formatter);
  }
  return Date.parse(`${formatter.format(value)}T00:00:00Z`);
}

/** 오늘부터 그날까지 남은 날. 오늘이면 0, 이미 지났으면 음수. */
function daysUntil(
  target: Date,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  return Math.round((startOfDay(target, timeZone) - startOfDay(now, timeZone)) / DAY_MS);
}

export { DAY_MS, daysUntil, DEFAULT_TIME_ZONE, formatDate };
