import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CorpusDb } from "../client";
import { createTestCorpusDb } from "../testing";
import { saveJudgmentText, upsertJudgment } from "./repository";
import { searchJudgments, searchLawIds, toMatchQuery } from "./search";

let db: CorpusDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestCorpusDb());
});

afterEach(() => {
  close();
});

function seed(): string {
  const id = upsertJudgment(db, {
    caseNoCanonical: "2023다287663",
    caseNoDisplay: "2023다287663",
    caseName: "구상금 청구의 소",
    court: "대법원",
    source: "law_go_kr",
  });
  saveJudgmentText(db, id, [
    {
      paraIdx: 0,
      sentIdx: 0,
      charStart: 0,
      charEnd: 30,
      text: "원고는 도로교통법 위반으로 기소되었다.",
    },
    { paraIdx: 0, sentIdx: 1, charStart: 30, charEnd: 60, text: "법원은 피고의 항소를 기각한다." },
  ]);
  return id;
}

describe("toMatchQuery", () => {
  /*
   * FTS5의 `MATCH`는 그 자체가 문법이다. 입력을 그대로 넘기면 검색이 아니라
   * 질의 문법 주입이 된다(§7).
   */
  it("연산자를 흘려보내지 않는다", () => {
    expect(toMatchQuery("도로 OR 교통")).toBe('"도로"* "OR"* "교통"*');
    expect(toMatchQuery('중요 "구절"')).toBe('"중요"* "구절"*');
    expect(toMatchQuery("a* NEAR/2 b")).toBe('"a*"* "NEAR/2"* "b"*');
  });

  it("찾을 말이 없으면 질의를 만들지 않는다", () => {
    expect(toMatchQuery("")).toBeUndefined();
    expect(toMatchQuery('  ""  ')).toBeUndefined();
  });
});

describe("searchJudgments", () => {
  it("본문의 낱말로 판결문을 찾는다 — 사건번호를 몰라도 된다", () => {
    const id = seed();
    const hits = searchJudgments(db, "도로교통법");

    expect(hits).toHaveLength(1);
    expect(hits[0]?.judgmentId).toBe(id);
    expect(hits[0]?.caseNoDisplay).toBe("2023다287663");
  });

  it("사건명으로도 찾는다", () => {
    seed();
    expect(searchJudgments(db, "구상금")).toHaveLength(1);
  });

  it("접두사로도 찾는다 — 한국어는 띄어쓰기로만 잘리기 때문이다", () => {
    seed();
    expect(searchJudgments(db, "도로교")).toHaveLength(1);
  });

  it("한 판결문은 한 줄로만 나온다 — 문장 여러 개가 걸려도 결과가 한 사건으로 차면 안 된다", () => {
    seed();
    // "법원"과 "원고"가 각각 다른 문장에 있다.
    expect(searchJudgments(db, "기각")).toHaveLength(1);
  });

  it("걸린 자리를 잘라 온다", () => {
    seed();
    expect(searchJudgments(db, "도로교통법")[0]?.snippet).toContain("도로교통법");
  });

  it("없는 말은 빈 결과다", () => {
    seed();
    expect(searchJudgments(db, "존재하지않는낱말")).toEqual([]);
  });

  it("판결문을 지우면 색인에서도 사라진다", () => {
    const id = seed();
    db.run(`delete from judgment where id = '${id}'`);

    expect(searchJudgments(db, "도로교통법")).toEqual([]);
  });
});

describe("searchLawIds", () => {
  /*
   * 트라이그램 색인은 세 글자부터 걸린다. 그보다 짧으면 **색인으로 답할 수 없다**고
   * 알려서, 부르는 쪽이 예전 방식(전체 훑기)으로 넘어가게 한다.
   * 못 찾는 것보다는 느린 편이 낫다.
   */
  it("두 글자 이하는 색인이 답하지 않는다", () => {
    expect(searchLawIds(db, "소송")).toBeUndefined();
    expect(searchLawIds(db, "법")).toBeUndefined();
  });

  it("찾을 말이 없으면 빈 결과다", () => {
    expect(searchLawIds(db, "   ")).toEqual([]);
  });
});
