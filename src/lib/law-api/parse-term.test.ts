/**
 * 픽스처는 실제 응답이다(2026-09-03). `과실`로 찾은 결과.
 *
 * biome-ignore-all lint/style/useNamingConvention: 손으로 만든 응답의 키가 한국어다.
 * 실제 API 필드명과 글자 그대로 같아야 파서를 시험하는 의미가 있다.
 */

import { describe, expect, it } from "vitest";
import { parseListPage } from "./envelope";
import termDetail from "./fixtures/term-detail.json" with { type: "json" };
import termSearch from "./fixtures/term-search.json" with { type: "json" };
import { parseTermDetailResponse, parseTermSummary, termSeqParam } from "./parse-term";
import { TARGETS } from "./targets";

describe("법령용어 목록", () => {
  it("용어와 본문 열쇠를 읽는다", () => {
    const page = parseListPage(termSearch, TARGETS.lstrm, parseTermSummary);

    expect(page.total).toBeGreaterThan(0);
    expect(page.items[0]?.term.length).toBeGreaterThan(0);
    expect(page.items[0]?.termIds.every((id) => /^\d+$/u.test(id))).toBe(true);
  });

  it("한 용어에 열쇠가 여럿 달린 것을 쪼갠다 — 같은 낱말에 사전 항목이 여럿이다", () => {
    const page = parseListPage(termSearch, TARGETS.lstrm, parseTermSummary);
    const light = page.items.find((item) => item.term === "경과실");

    // 실제 응답이 `"5068618,4887619"`로 왔다. 하나로 보면 두 번째 정의가 사라진다.
    expect(light?.termIds).toHaveLength(2);
  });
});

describe("법령용어 본문", () => {
  it("열 방향 응답을 용어별 행으로 되묶는다", () => {
    const terms = parseTermDetailResponse(termDetail);

    expect(terms.length).toBeGreaterThan(0);
    for (const term of terms) {
      // 되묶기가 한 칸 밀리면 여기서 잡힌다 — 뜻만 있고 이름이 없는 행이 생긴다.
      expect(term.term.length).toBeGreaterThan(0);
      expect(term.definition.length).toBeGreaterThan(0);
    }
  });

  it("이름과 뜻이 같은 용어끼리 짝지어진다", () => {
    const terms = parseTermDetailResponse(termDetail);
    const light = terms.find((term) => term.term === "경과실");

    expect(light).toBeDefined();
    expect(light?.definition).toContain("경미한");
  });

  it("출처를 함께 담는다 — 어느 법령의 정의인지 밝혀야 한다", () => {
    const terms = parseTermDetailResponse(termDetail);

    expect(terms.some((term) => term.source !== undefined)).toBe(true);
  });

  it("값이 하나면 배열이 아니라 낱값으로 오는 것도 읽는다", () => {
    const singleValue = {
      LsTrmService: {
        법령용어일련번호: "1",
        법령용어명_한글: "선고",
        법령용어정의: "법원이 판결을 알리는 것",
        출처: "형사소송법",
      },
    };

    expect(parseTermDetailResponse(singleValue)).toEqual([
      {
        termId: "1",
        term: "선고",
        hanja: undefined,
        definition: "법원이 판결을 알리는 것",
        source: "형사소송법",
        dictionary: undefined,
      },
    ]);
  });

  it("이름이나 뜻이 빠진 칸은 버린다 — 빈 용어를 사전에 넣지 않는다", () => {
    const withHoles = {
      LsTrmService: {
        법령용어일련번호: ["1", "2"],
        법령용어명_한글: ["선고", ""],
        법령용어정의: ["법원이 판결을 알리는 것", "  "],
      },
    };

    expect(parseTermDetailResponse(withHoles)).toHaveLength(1);
  });
});

describe("termSeqParam", () => {
  it("여러 열쇠를 쉼표로 잇는다 — 본문 조회가 한 번에 여러 개를 받는다", () => {
    expect(termSeqParam(["5068618", "4887619"])).toBe("5068618,4887619");
  });
});
