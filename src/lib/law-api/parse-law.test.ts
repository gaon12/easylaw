import { describe, expect, it } from "vitest";
import { parseListPage } from "./envelope";
import lawDetail from "./fixtures/law-detail.json" with { type: "json" };
import lawDetail2019 from "./fixtures/law-detail-2019.json" with { type: "json" };
import lawSearch from "./fixtures/law-search.json" with { type: "json" };
import {
  circledToNumber,
  findArticle,
  findClause,
  parseArticleRef,
  parseLawDetailResponse,
  parseLawSummary,
} from "./parse-law";
import { TARGETS } from "./targets";

/**
 * 픽스처는 **실제 법제처 응답**이다(2026-09-03, 인증키만 지웠다). 본문은 조문이 229개라
 * 앞쪽 6개만 남기고 부칙·개정문을 덜어 냈다 — 파서가 보는 모양은 그대로다.
 */

describe("법령 목록", () => {
  it("항목과 총건수를 읽는다", () => {
    const page = parseListPage(lawSearch, TARGETS.law, parseLawSummary);

    expect(page.total).toBeGreaterThan(0);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0]?.name).toBe("도로교통법");
  });

  it("본문 조회 열쇠(법령일련번호)를 담는다 — 법령ID와 다르다", () => {
    const first = parseListPage(lawSearch, TARGETS.law, parseLawSummary).items[0];

    expect(first?.lawSerial).toMatch(/^\d+$/u);
    expect(first?.lawSerial).not.toBe(first?.lawId);
  });

  it("공포일·시행일을 Date로 바꾼다", () => {
    const first = parseListPage(lawSearch, TARGETS.law, parseLawSummary).items[0];

    expect(first?.promulgatedAt).toBeInstanceOf(Date);
    expect(first?.effectiveAt).toBeInstanceOf(Date);
  });
});

describe("법령 본문", () => {
  const detail = parseLawDetailResponse(lawDetail);

  it("기본 정보를 읽는다. 소관부처·법종구분은 객체로 와도 글자만 꺼낸다", () => {
    expect(detail.name).toBe("도로교통법");
    expect(detail.ministry).toBe("경찰청");
    expect(detail.kind).toBe("법률");
  });

  it("장 제목(조문여부=전문)을 조문으로 세지 않는다", () => {
    // 픽스처 6건 중 "제1장 총칙" 같은 전문이 섞여 있다. 그것까지 조문으로 세면
    // 실존 검증이 장 제목을 조문으로 착각한다.
    const raw = lawDetail.법령.조문.조문단위;
    expect(raw.length).toBeGreaterThan(detail.articles.length);
    expect(detail.articles.every((article) => article.number.length > 0)).toBe(true);
  });

  it("조를 번호로 찾는다", () => {
    const article = findArticle(detail, 3);

    expect(article).toBeDefined();
    expect(article?.title).toContain("신호기");
  });

  it("없는 조를 찾으면 undefined다 — 지어내지 않는다", () => {
    expect(findArticle(detail, 9999)).toBeUndefined();
  });

  it("항을 아라비아 숫자로도 동그라미 숫자로도 찾는다", () => {
    const article = findArticle(detail, 3);
    if (article === undefined) {
      throw new Error("제3조를 찾지 못했습니다.");
    }

    // 판결문은 `제1항`이라 쓰고 API는 `①`로 준다. 양쪽 다 통해야 한다.
    expect(findClause(article, 1)?.text).toContain("교통안전시설");
    expect(findClause(article, "①")?.text).toContain("교통안전시설");
    expect(findClause(article, 99)).toBeUndefined();
  });

  it("항 내용의 항 번호를 지우지 않는다 — 대조는 손대지 않은 글자로 한다", () => {
    const clause = findClause(findArticle(detail, 3) as never, 1);

    expect(clause?.text.startsWith("①")).toBe(true);
  });
});

describe("circledToNumber", () => {
  it("동그라미 숫자를 아라비아 숫자로 바꾼다", () => {
    expect(circledToNumber("①")).toBe("1");
    expect(circledToNumber("⑳")).toBe("20");
  });

  it("동그라미 숫자가 아니면 undefined다", () => {
    expect(circledToNumber("1")).toBeUndefined();
    expect(circledToNumber("가")).toBeUndefined();
    expect(circledToNumber("")).toBeUndefined();
  });
});

describe("가지 번호 (제4조의2)", () => {
  /** 2019-04-17 시행 도로교통법. 제4조와 제4조의2가 함께 있는 앞부분만 남겼다. */
  const detail = parseLawDetailResponse(lawDetail2019);

  it("조 번호가 같아도 가지 번호로 갈린다", () => {
    const plain = findArticle(detail, 4);
    const branch = findArticle(detail, 4, 2);

    expect(plain?.branchNumber).toBeUndefined();
    expect(branch?.branchNumber).toBe("2");
    expect(plain?.title).not.toBe(branch?.title);
  });

  it("제4조를 찾을 때 제4조의2가 나오지 않는다", () => {
    // 느슨하게 맞추면 조용히 틀린 조문을 돌려준다. [F-30]에서 가장 나쁜 오답이다.
    expect(findArticle(detail, 4)?.title).toContain("교통안전시설의 종류");
    expect(findArticle(detail, 4, 2)?.title).toContain("무인 교통단속용 장비");
  });

  it("없는 가지 번호는 undefined다", () => {
    expect(findArticle(detail, 4, 9)).toBeUndefined();
  });
});

describe("parseArticleRef", () => {
  it("판결문이 쓰는 표기를 조·가지로 나눈다", () => {
    expect(parseArticleRef("제3조")).toEqual({ number: "3" });
    expect(parseArticleRef("제4조의2")).toEqual({ number: "4", branchNumber: "2" });
    expect(parseArticleRef("도로교통법 제 44 조 의 2 를 위반하여")).toEqual({
      number: "44",
      branchNumber: "2",
    });
  });

  it("조문 표기가 없으면 undefined다", () => {
    expect(parseArticleRef("도로교통법에 따라")).toBeUndefined();
  });
});

describe("조문 머리 떼기", () => {
  const detail = parseLawDetailResponse(lawDetail);

  it("본문 앞의 `제N조(제목)`를 뗀다 — 화면이 제목을 따로 그린다", () => {
    // 항이 없는 조문은 조문내용에 제목까지 포함한 한 줄이 통째로 온다.
    for (const article of detail.articles) {
      expect(article.text ?? "").not.toMatch(new RegExp(`^제${article.number}조`, "u"));
    }
  });

  it("머리가 없으면 본문을 건드리지 않는다", () => {
    const article = findArticle(detail, 3);
    // 제3조는 항으로 나뉘어 있어 조문내용에 머리가 없다. 항은 그대로여야 한다.
    expect(findClause(article as never, 1)?.text.startsWith("①")).toBe(true);
  });
});
