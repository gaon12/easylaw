import { describe, expect, it } from "vitest";
import { candidateTerms } from "./terms";

describe("candidateTerms", () => {
  /* 조사가 붙은 채로 잘리는 것이 정상이다. 떼는 일은 사전이 한다. */
  it("긴 형태부터 준다 — 그래야 `과태`가 아니라 `과태료`가 잡힌다", () => {
    const [first] = candidateTerms("과태료를 물릴 수 없다.");

    expect(first?.run).toBe("과태료를");
    expect(first?.forms.slice(0, 3)).toEqual(["과태료를", "과태료", "과태"]);
  });

  it("나온 순서를 지킨다", () => {
    const runs = candidateTerms("환송한다. 재항고인이 해태하였다.").map((entry) => entry.run);

    expect(runs[0]).toBe("환송한다");
    expect(runs.indexOf("재항고인이")).toBeLessThan(runs.indexOf("해태하였다"));
  });

  it("같은 덩어리를 두 번 내지 않는다 — 사전을 두드리는 횟수가 곧 비용이다", () => {
    const runs = candidateTerms("과태료 과태료 과태료").map((entry) => entry.run);

    expect(runs).toEqual(["과태료"]);
  });

  it("한 글자와 한글이 아닌 것은 후보가 아니다", () => {
    const runs = candidateTerms("제16조 제6항 및 A조").map((entry) => entry.run);

    expect(runs).not.toContain("및");
    expect(runs.every((run) => run.length >= 2)).toBe(true);
  });

  /* 누구나 아는 말에 풀이를 달면 정작 어려운 낱말이 그 사이에 묻힌다. */
  it("누구나 아는 말은 후보에서 뺀다", () => {
    const forms = candidateTerms("법원은 사건을 보았다.").flatMap((entry) => entry.forms);

    expect(forms).not.toContain("법원");
    expect(forms).not.toContain("사건");
  });
});
