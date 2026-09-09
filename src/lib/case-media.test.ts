import { describe, expect, it } from "vitest";
import { findCaseMedia, findCaseMediaPlacement } from "./case-media";

describe("판례 설명 이미지 배치", () => {
  it("설명 단계마다 의미 블록 네 곳에 이미지를 배치한다", () => {
    expect(findCaseMedia("2023다287663", "L1")).toHaveLength(4);
    expect(findCaseMedia("2023다287663", "L2")).toHaveLength(4);
    expect(findCaseMedia("2023다287663", "L3")).toHaveLength(4);
    expect(findCaseMedia("2023다287663", "L4")).toHaveLength(4);
  });

  it("같은 사실관계 그림을 레벨별로 다시 만들지 않는다", () => {
    const l1 = findCaseMedia("2023다287663", "L1");
    const l4 = findCaseMedia("2023다287663", "L4");

    expect(l1[0]?.assetId).toBe(l4[0]?.assetId);
    expect(l1[0]?.recipeKey).toBe("REHAB_SCHEDULED_PAYMENT_001");
    expect(l1[0]?.caption).not.toBe(l4[0]?.caption);
  });

  it("등록되지 않은 사건에는 임의 이미지를 붙이지 않는다", () => {
    expect(findCaseMedia("2024다000000", "L4")).toEqual([]);
  });

  it("배치 UUID에서 사건·단계·자산·레시피를 다시 찾는다", () => {
    const placement = findCaseMedia("2023다287663", "L4")[0];
    expect(placement).toBeDefined();
    expect(findCaseMediaPlacement(placement?.id ?? "")).toMatchObject({
      caseNo: "2023다287663",
      level: "L4",
      assetId: placement?.assetId,
      recipeKey: "REHAB_SCHEDULED_PAYMENT_001",
    });
    expect(findCaseMediaPlacement("unknown")).toBeUndefined();
  });
});
