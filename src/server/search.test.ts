import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lawApi: vi.fn(),
  lookupCase: vi.fn(),
  searchByKeyword: vi.fn(),
  searchLawVersions: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ corpusDb: () => ({}) }));
vi.mock("@/db/corpus/repository", () => ({
  searchLawVersions: mocks.searchLawVersions,
}));
vi.mock("@/lib/law-api/client", () => ({ lawApi: mocks.lawApi }));
vi.mock("@/server/lookup", () => ({ lookupCase: mocks.lookupCase }));

import { searchEverything } from "./search";

function precedent(precedentId: string, caseName: string) {
  return {
    precedentId,
    caseNo: `2024도${precedentId}`,
    caseName,
    court: "대법원",
    decidedAt: undefined,
    caseTypeName: "형사",
    sourceName: "대법원",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lawApi.mockReturnValue({ searchByKeyword: mocks.searchByKeyword });
  mocks.searchByKeyword.mockResolvedValue([]);
  mocks.searchLawVersions.mockReturnValue([]);
});

describe("searchEverything", () => {
  it("초성은 확장한 낱말로 법령과 판례를 함께 찾는다", async () => {
    mocks.searchByKeyword.mockResolvedValue([precedent("1", "소액 사건")]);
    mocks.searchLawVersions.mockReturnValue([
      {
        lawId: "000001",
        name: "소액사건심판법",
        shortName: null,
        kind: "법률",
        ministry: "법무부",
        effectiveAt: new Date("2024-01-01"),
      },
    ]);

    const result = await searchEverything("ㅅㅇ");

    expect(mocks.searchByKeyword).toHaveBeenCalledExactlyOnceWith("소액", undefined);
    expect(mocks.searchLawVersions).toHaveBeenCalledExactlyOnceWith({}, "소액");
    expect(result.query).toBe("ㅅㅇ");
    expect(result.laws.map((law) => law.name)).toEqual(["소액사건심판법"]);
    expect(result.precedents.map((item) => item.caseName)).toEqual(["소액 사건"]);
  });

  it("일반 검색어는 바꾸지 않고 기존처럼 한 번만 찾는다", async () => {
    await searchEverything(" 도로교통 ");

    expect(mocks.searchByKeyword).toHaveBeenCalledExactlyOnceWith("도로교통", undefined);
    expect(mocks.searchLawVersions).toHaveBeenCalledExactlyOnceWith({}, "도로교통");
  });

  it("여러 초성 후보의 중복 결과는 첫 순서를 보존해 하나로 합친다", async () => {
    mocks.searchByKeyword.mockImplementation((query: string) => {
      if (query === "가소") {
        return Promise.resolve([precedent("1", "첫 결과")]);
      }
      return Promise.resolve([precedent("1", "중복 결과"), precedent("2", "둘째 결과")]);
    });
    mocks.searchLawVersions.mockImplementation((_db: unknown, query: string) => [
      {
        lawId: query === "가소" ? "law-1" : "law-2",
        name: query,
        shortName: null,
        kind: null,
        ministry: null,
        effectiveAt: null,
      },
    ]);

    const result = await searchEverything("ㄱㅅ");

    expect(mocks.searchByKeyword.mock.calls.map(([query]) => query)).toEqual([
      "가소",
      "가사",
      "가사비송",
      "가사신청",
    ]);
    expect(result.precedents.map((item) => item.caseName)).toEqual(["첫 결과", "둘째 결과"]);
    expect(result.laws.map((law) => law.lawId)).toEqual(["law-1", "law-2"]);
  });
});
