import { describe, expect, it } from "vitest";
import { isSimplifiedLevel, toLevel, withReadingLevel } from "./levels";

describe("읽기 단계 주소", () => {
  it("외부 입력은 다섯 단계만 허용한다", () => {
    expect(toLevel("L4")).toBe("L4");
    expect(toLevel("<script>")).toBe("L0");
  });

  it.each(["L3", "L4"] as const)("%s만 법령 상세 주소에 이어 붙인다", (level) => {
    const query = new URLSearchParams({ id: "법령ID", 조: "105" });
    const next = withReadingLevel(query, level);

    expect(next.get("level")).toBe(level);
    expect(next.get("id")).toBe("법령ID");
    expect(query.has("level")).toBe(false);
    expect(isSimplifiedLevel(level)).toBe(true);
  });

  it("일반 단계는 같은 법령의 중복 주소를 만들지 않는다", () => {
    expect(withReadingLevel(new URLSearchParams({ 조: "105" }), "L2").has("level")).toBe(false);
  });
});
