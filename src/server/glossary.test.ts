/* biome-ignore-all lint/correctness/noNodejsModules: 소스 파일을 읽어 호출 관계를 확인한다. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
