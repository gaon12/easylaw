import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CorpusDb } from "../client";
import { createTestCorpusDb } from "../testing";
import { saveJudgmentText, upsertJudgment, upsertLawVersions } from "./repository";
import { corpusStats, listSampleJudgments } from "./stats";

let db: CorpusDb;
let close: () => void;

beforeEach(() => {
  const created = createTestCorpusDb();
  db = created.db;
  close = created.close;
});

afterEach(() => {
  close();
});

function addJudgment(caseNo: string, decidedAt: string, cached = true): string {
  const id = upsertJudgment(db, {
    caseNoCanonical: caseNo,
    caseNoDisplay: caseNo,
    caseName: `${caseNo} 사건`,
    court: "대법원",
    decidedAt: new Date(decidedAt),
    source: "law_go_kr",
  });
  if (cached) {
    saveJudgmentText(db, id, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 6, text: "판결문 본문." },
    ]);
  }
  return id;
}

describe("corpusStats", () => {
  it("빈 코퍼스는 모두 0건이다", () => {
    expect(corpusStats(db)).toEqual({ judgments: 0, lawVersions: 0 });
  });

  it("판례와 법령 판을 실제 저장 행으로 센다", () => {
    addJudgment("2024다1", "2024-01-01");
    addJudgment("2024다2", "2024-02-01", false);
    upsertLawVersions(db, [
      { lawId: "law-1", mst: "mst-1", name: "민법", effectiveAt: new Date("2024-01-01") },
      { lawId: "law-1", mst: "mst-2", name: "민법", effectiveAt: new Date("2025-01-01") },
    ]);

    expect(corpusStats(db)).toEqual({ judgments: 2, lawVersions: 2 });
  });
});

describe("listSampleJudgments", () => {
  it("본문이 있는 판례만 최신 판결일 순서와 상한에 맞춰 고른다", () => {
    addJudgment("2024다1", "2024-01-01");
    addJudgment("2024다2", "2024-03-01", false);
    addJudgment("2024다3", "2024-02-01");

    expect(listSampleJudgments(db, 1).map((row) => row.caseNoCanonical)).toEqual(["2024다3"]);
  });
});
