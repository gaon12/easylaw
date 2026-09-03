import { describe, expect, it } from "vitest";
import { createLawNameIndex, detectCitations, formatCitation } from "./detect";

/**
 * 예문은 **실제 판결문**에서 가져왔다 — 대법원 2023다287663의 `참조조문`과 `판결요지`.
 * 지어낸 문장으로 시험하면 지어낸 형태만 통과한다.
 */
const index = createLawNameIndex([
  "민법",
  "민사소송법",
  "채무자 회생 및 파산에 관한 법률",
  "도로교통법",
  "도로교통법 시행령",
]);

function detect(text: string) {
  return detectCitations(text, index);
}

describe("법 이름 찾기", () => {
  it("공백이 든 이름을 통째로 잡는다", () => {
    // "제N조 앞의 한 낱말"로 잡으면 `법률 제193조`가 된다. 실제 판결문의 형태다.
    const [first] = detect("채무자 회생 및 파산에 관한 법률 제193조");

    expect(first?.lawName).toBe("채무자 회생 및 파산에 관한 법률");
    expect(first?.articleNo).toBe("193");
  });

  it("긴 이름을 먼저 맞춘다 — 시행령 인용이 법률로 가면 안 된다", () => {
    expect(detect("도로교통법 시행령 제10조")[0]?.lawName).toBe("도로교통법 시행령");
    expect(detect("도로교통법 제10조")[0]?.lawName).toBe("도로교통법");
  });

  it("낫표를 건너뛴다", () => {
    expect(detect("「도로교통법」 제3조")[0]?.lawName).toBe("도로교통법");
  });

  it("이름과 조문 사이의 괄호를 건너뛴다", () => {
    const text = "채무자 회생 및 파산에 관한 법률(이하 ‘채무자회생법’이라 한다) 제252조 제1항은";

    expect(detect(text)[0]?.lawName).toBe("채무자 회생 및 파산에 관한 법률");
  });

  it("모르는 이름이면 법을 비워 둔다 — 아무 법에나 붙이지 않는다", () => {
    const [first] = detect("듣도보도못한법 제1조");

    expect(first?.lawName).toBeUndefined();
    expect(first?.articleNo).toBe("1");
  });
});

describe("이름 없이 이어지는 인용", () => {
  it("바로 앞에서 말한 법을 잇는다", () => {
    // 참조조문은 이름을 한 번만 쓰고 조문을 나열한다. 버리면 절반을 놓친다.
    const found = detect("채무자 회생 및 파산에 관한 법률 제251조, 제252조 제1항");

    expect(found).toHaveLength(2);
    expect(found[1]?.lawName).toBe("채무자 회생 및 파산에 관한 법률");
    expect(found[1]?.named).toBe(false);
    expect(found[0]?.named).toBe(true);
  });

  it("새 이름이 나오면 그 뒤로는 새 법을 잇는다", () => {
    const found = detect("채무자 회생 및 파산에 관한 법률 제87조, 제193조, 민법 제105조, 제106조");

    expect(found.map((c) => c.lawName)).toEqual([
      "채무자 회생 및 파산에 관한 법률",
      "채무자 회생 및 파산에 관한 법률",
      "민법",
      "민법",
    ]);
  });

  it("앞에 아무 법도 없었으면 잇지 않는다 — 모른다고 두는 편이 낫다", () => {
    expect(detect("제5조에 따라 판단한다")[0]?.lawName).toBeUndefined();
  });
});

describe("조·항·호·가지", () => {
  it("항과 호를 함께 읽는다", () => {
    const [first] = detect("채무자 회생 및 파산에 관한 법률 제243조 제1항 제4호");

    expect(first?.articleNo).toBe("243");
    expect(first?.clauseNo).toBe("1");
    expect(first?.itemNo).toBe("4");
  });

  it("가지 조문을 읽는다", () => {
    const [first] = detect("도로교통법 제4조의2 제1항");

    expect(first?.articleNo).toBe("4");
    expect(first?.branchNo).toBe("2");
    expect(first?.clauseNo).toBe("1");
  });

  it("띄어 쓴 표기도 읽는다", () => {
    expect(detect("도로교통법 제 44 조 의 2")[0]?.branchNo).toBe("2");
  });

  it("다음 문장의 항을 앞 조문에 붙이지 않는다", () => {
    // 항·호는 조문에 **붙어 있을 때만** 그 조문의 것이다.
    const [first] = detect("민법 제105조. 제1항은 다른 이야기다");

    expect(first?.articleNo).toBe("105");
    expect(first?.clauseNo).toBeUndefined();
  });
});

describe("위치", () => {
  it("원문에서의 좌표를 준다 — 하이라이트를 여기에 건다", () => {
    const text = "이 사건은 민법 제105조에 따른다";
    const [first] = detect(text);

    expect(text.slice(first?.start, first?.end)).toBe("제105조");
  });
});

describe("formatCitation", () => {
  it("사람이 읽는 표기로 되돌린다", () => {
    const [first] = detect("채무자 회생 및 파산에 관한 법률 제243조 제1항 제4호");
    expect(first && formatCitation(first)).toBe("제243조 제1항 제4호");

    const [branch] = detect("도로교통법 제4조의2");
    expect(branch && formatCitation(branch)).toBe("제4조의2");
  });
});

describe("실제 참조조문 한 줄", () => {
  /** 대법원 2023다287663의 참조조문에서 그대로. */
  const line =
    "채무자 회생 및 파산에 관한 법률 제87조, 제193조, 제243조 제1항 제4호, 제252조 제1항, 민사소송법 제202조, 민법 제105조";

  it("여섯 건을 전부 찾고 각각 옳은 법에 붙인다", () => {
    const found = detect(line);

    expect(found.map((c) => `${c.lawName ?? "?"} ${formatCitation(c)}`)).toEqual([
      "채무자 회생 및 파산에 관한 법률 제87조",
      "채무자 회생 및 파산에 관한 법률 제193조",
      "채무자 회생 및 파산에 관한 법률 제243조 제1항 제4호",
      "채무자 회생 및 파산에 관한 법률 제252조 제1항",
      "민사소송법 제202조",
      "민법 제105조",
    ]);
  });
});
