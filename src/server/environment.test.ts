import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkEnvironment, hasBlockingIssue, MIN_NODE_MAJOR, MIN_NODE_MINOR } from "./environment";

describe("checkEnvironment", () => {
  it("모든 검사가 이유와 값을 함께 돌려준다", () => {
    // "실패"만 알려 주는 점검은 점검이 아니다. 무엇을 봤고 왜 보는지가 함께 와야 한다.
    for (const check of checkEnvironment()) {
      expect(check.label.length).toBeGreaterThan(0);
      expect(check.value.length).toBeGreaterThan(0);
      expect(check.note.length).toBeGreaterThan(0);
    }
  });

  it("검사 식별자가 겹치지 않는다", () => {
    const ids = checkEnvironment().map((check) => check.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("이 서버에서는 Node 버전 검사를 통과한다", () => {
    // 테스트가 도는 환경 자체가 최소 버전을 만족해야 한다.
    const node = checkEnvironment().find((check) => check.id === "node");
    expect(node?.level).toBe("ok");
  });

  it("데이터베이스가 두 파일로 나뉘어 있다", () => {
    const separation = checkEnvironment().find((check) => check.id === "database_separation");
    expect(separation?.level).toBe("ok");
  });
});

describe("hasBlockingIssue", () => {
  it("fail이 하나라도 있으면 막는다", () => {
    const base = { id: "x", label: "ㄱ", value: "ㄴ", note: "ㄷ" } as const;
    expect(hasBlockingIssue([{ ...base, level: "ok" }])).toBe(false);
    expect(hasBlockingIssue([{ ...base, level: "warn" }])).toBe(false);
    expect(
      hasBlockingIssue([
        { ...base, level: "warn" },
        { ...base, level: "fail" },
      ]),
    ).toBe(true);
  });

  it("경고만으로는 막지 않는다", () => {
    // 개발 모드나 적은 디스크는 알릴 일이지 설치를 세울 일이 아니다.
    const warnings = checkEnvironment().filter((check) => check.level === "warn");
    expect(hasBlockingIssue(warnings)).toBe(false);
  });
});

describe("최소 Node 버전", () => {
  it("package.json의 engines와 같다", () => {
    /*
     * 두 곳에 적힌 값이 갈리면 "설치는 통과했는데 실행이 안 되는" 상태가 된다.
     * 한쪽만 올리는 실수를 여기서 잡는다.
     */
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      engines?: { node?: string };
    };
    const required = pkg.engines?.node ?? "";
    expect(required).toBe(`>=${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0`);
  });
});
