/* biome-ignore-all lint/correctness/noNodejsModules: 소스 파일을 읽어 호출 관계를 확인한다. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { glossesInText, isSafeAutomaticLegalTerm } from "./glossary";

/**
 * **올린 문서의 낱말을 밖으로 보내지 않는다.**
 *
 * 생성 파이프라인이 `glossesInText`를 부르는데, 그때 넘어오는 글은 사람이 올린 판결문일
 * 수 있다. 그 낱말을 법제처에 물으면 어떤 사건을 들고 왔는지가 남의 서버 로그에 남는다.
 *
 * 이 시험은 **호출 관계**를 지킨다. 값을 넣어 보는 시험으로는 "밖에 묻지 않았다"를
 * 증명할 수 없어서, 파이프라인이 밖에 묻는 함수를 부르지 않는다는 것을 소스에서 확인한다.
 */
describe("생성 경로는 밖에 묻지 않는다", () => {
  it("`generate.ts`는 사전만 보는 함수를 부른다", () => {
    const source = readFileSync("src/server/generate.ts", "utf8");

    expect(source).toContain("glossesInText");
    // 밖에 묻는 함수는 이름이 다르다. 파이프라인에서 부르면 안 된다.
    expect(source).not.toContain("glossFor");
    expect(source).not.toContain("glossesFor");
  });

  it("`glossesInText`는 법제처 API를 부르지 않는다", () => {
    const source = readFileSync("src/server/glossary.ts", "utf8");
    const from = source.indexOf("function glossesInText");
    const body = source.slice(from);

    expect(from).toBeGreaterThan(0);
    expect(body).not.toContain("fetchLegal");
    expect(body).not.toContain("lawApi(");
  });
});

describe("생성용 법률 용어 선택", () => {
  it("법률 분류가 빠진 변제의 표준 사전 뜻도 생성 입력에 포함한다", () => {
    expect(glossesInText("채무를 변제하였다.")).toContainEqual(
      expect.objectContaining({
        term: "변제",
        definition: "남에게 진 빚을 갚음.",
        source: "표준국어대사전",
        definitionId: expect.any(String),
        definitionSource: "stdict",
        legal: false,
      }),
    );
  });

  it("특정 법령에서만 맞는 정의를 자동 풀이 후보로 쓰지 않는다", () => {
    expect(
      isSafeAutomaticLegalTerm({
        definition: "간행물의 내용을 구성하는 파일을 의미한다.",
        source: "온라인간행물 발간 지침[국가데이터처예규 제1호]",
      }),
    ).toBe(false);
  });

  it("영어 번역만 있는 항목을 쉬운 한국어 풀이 후보로 쓰지 않는다", () => {
    expect(
      isSafeAutomaticLegalTerm({ definition: "original instance/court", source: "법령용어" }),
    ).toBe(false);
  });

  it("특정 법령에 묶이지 않은 한국어 정의는 보충 후보로 쓸 수 있다", () => {
    expect(
      isSafeAutomaticLegalTerm({ definition: "빚을 갚는 일을 말한다.", source: "법령용어" }),
    ).toBe(true);
  });
});
