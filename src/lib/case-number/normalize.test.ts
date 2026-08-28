import { describe, expect, it } from "vitest";
import { parseCaseNumber, toCanonicalCaseNumber } from "./normalize";

const NOW = new Date("2026-08-28T00:00:00Z");

describe("parseCaseNumber", () => {
  it("붙여 쓴 사건번호를 파싱한다", () => {
    const result = parseCaseNumber("2019도12345", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.canonical).toBe("2019도12345");
    expect(result.year).toBe(2019);
    expect(result.code).toBe("도");
    expect(result.serial).toBe(12345);
    expect(result.meta.category).toBe("criminal");
    expect(result.meta.instance).toBe("final");
  });

  it("공백이 섞여도 같은 조회 키를 만든다", () => {
    expect(toCanonicalCaseNumber("2019 도 12345", NOW)).toBe("2019도12345");
    expect(toCanonicalCaseNumber("  2019도12345  ", NOW)).toBe("2019도12345");
  });

  it("법원명과 '판결'이 붙어 있어도 사건번호만 뽑는다", () => {
    expect(toCanonicalCaseNumber("대법원 2019도12345 판결", NOW)).toBe("2019도12345");
    expect(toCanonicalCaseNumber("서울행정법원 2026구합12345 판결문", NOW)).toBe("2026구합12345");
  });

  it("일련번호 앞의 0을 제거해 같은 사건을 하나의 키로 모은다", () => {
    expect(toCanonicalCaseNumber("2019도0012345", NOW)).toBe("2019도12345");
    expect(toCanonicalCaseNumber("2026구합00001", NOW)).toBe("2026구합1");
  });

  it("두 글자 이상인 사건부호를 자르지 않는다", () => {
    expect(toCanonicalCaseNumber("2026구합12345", NOW)).toBe("2026구합12345");
    expect(toCanonicalCaseNumber("2019헌바123", NOW)).toBe("2019헌바123");
    expect(toCanonicalCaseNumber("2020고단1234", NOW)).toBe("2020고단1234");
    expect(toCanonicalCaseNumber("2020즈기123", NOW)).toBe("2020즈기123");
  });

  it("사용자가 입력한 원문을 display로 보존한다", () => {
    const result = parseCaseNumber("  대법원 2019 도 12345  ", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.display).toBe("대법원 2019 도 12345");
    expect(result.canonical).toBe("2019도12345");
  });

  it("빈 입력을 구분해서 알린다", () => {
    expect(parseCaseNumber("", NOW)).toEqual({ ok: false, reason: "empty" });
    expect(parseCaseNumber("   ", NOW)).toEqual({ ok: false, reason: "empty" });
  });

  it("사건번호 꼴이 아니면 no_pattern으로 알린다", () => {
    expect(parseCaseNumber("장애인복지법 판례 찾아줘", NOW)).toEqual({
      ok: false,
      reason: "no_pattern",
    });
  });

  it("날짜 표현을 사건번호로 오인하지 않는다", () => {
    // `2019년 12월`은 `(\\d{4})(한글)(\\d+)` 꼴에 걸리지만 `년`은 사건부호가 아니다.
    const result = parseCaseNumber("2019년 12월에 있었던 사건", NOW);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe("unknown_code");
    expect(result.code).toBe("년");
  });

  it("모르는 부호는 그 부호를 함께 돌려준다", () => {
    const result = parseCaseNumber("2019쨍12345", NOW);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe("unknown_code");
    expect(result.code).toBe("쨍");
  });

  it("있을 수 없는 연도를 거른다", () => {
    expect(parseCaseNumber("1800도123", NOW)).toEqual({
      ok: false,
      reason: "year_out_of_range",
    });
    expect(parseCaseNumber("2099도123", NOW)).toEqual({
      ok: false,
      reason: "year_out_of_range",
    });
  });

  it("연말 접수를 막지 않도록 다음 해까지는 허용한다", () => {
    expect(toCanonicalCaseNumber("2027도1", NOW)).toBe("2027도1");
  });

  it("문장 안에 섞인 사건번호도 찾아낸다", () => {
    expect(toCanonicalCaseNumber("제가 받은 판결문이 2026구합12345 인데요", NOW)).toBe(
      "2026구합12345",
    );
  });

  it("앞의 후보가 부호 표에 없으면 뒤의 진짜 사건번호를 찾는다", () => {
    expect(toCanonicalCaseNumber("2019년 사건인 2019도12345", NOW)).toBe("2019도12345");
  });

  it("여러 사건번호가 있으면 첫 번째를 쓴다", () => {
    expect(toCanonicalCaseNumber("2019도12345, 2019도12346", NOW)).toBe("2019도12345");
  });
});
