/** 뷰어의 5단계. L0(원문)은 생성물이 아니라 원문 그 자체다. */
const LEVEL_ORDER = ["L0", "L1", "L2", "L3", "L4"] as const;

type ViewLevel = (typeof LEVEL_ORDER)[number];
type SimplifiedViewLevel = Extract<ViewLevel, "L3" | "L4">;

/** 쿼리스트링을 레벨로 읽는다. 모르는 값이면 원문으로 되돌린다. */
function toLevel(raw: string | string[] | undefined): ViewLevel {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return LEVEL_ORDER.find((level) => level === value) ?? "L0";
}

function isSimplifiedLevel(level: ViewLevel): level is SimplifiedViewLevel {
  return level === "L3" || level === "L4";
}

/** 법령 본문 조회 쿼리는 건드리지 않고, 상세 화면 주소에만 읽기 맥락을 잇는다. */
function withReadingLevel(query: URLSearchParams, level: ViewLevel): URLSearchParams {
  const next = new URLSearchParams(query);
  if (isSimplifiedLevel(level)) {
    next.set("level", level);
  }
  return next;
}

export { isSimplifiedLevel, LEVEL_ORDER, toLevel, withReadingLevel };
export type { SimplifiedViewLevel, ViewLevel };
