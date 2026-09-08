import { describe, expect, it } from "vitest";
import { createLawNameIndex, detectCitations, formatCitation } from "./detect";

/**
 * 예문은 **실제 판결문**에서 가져왔다 — 대법원 2023다287663의 `참조조문`과 `판결요지`.
 * 지어낸 문장으로 시험하면 지어낸 형태만 통과한다.
 */
const index = createLawNameIndex([
  { lawId: "001", name: "민법" },
  { lawId: "002", name: "민사소송법" },
  { lawId: "003", name: "채무자 회생 및 파산에 관한 법률", shortName: "채무자회생법" },
  { lawId: "004", name: "도로교통법" },
  { lawId: "005", name: "도로교통법 시행령" },
  { lawId: "006", name: "대한민국헌법" },
  // 약칭이 다른 법의 정식명과 겹치는 경우. 정식명이 이겨야 한다.
  { lawId: "007", name: "총포ㆍ도검ㆍ화약류 등의 안전관리에 관한 법률", shortName: "민법" },
  // 같은 약칭이 두 법을 가리키면 버려야 한다.
  { lawId: "008", name: "가나다법", shortName: "모호법" },
  { lawId: "009", name: "라마바법", shortName: "모호법" },
]);

function detect(text: string) {
  return detectCitations(text, index);
}

describe("법 이름 찾기", () => {
  it("공백이 든 이름을 통째로 잡는다", () => {
    // "제N조 앞의 한 낱말"로 잡으면 `법률 제193조`가 된다. 실제 판결문의 형태다.
    const [first] = detect("채무자 회생 및 파산에 관한 법률 제193조");

    expect(first?.law?.name).toBe("채무자 회생 및 파산에 관한 법률");
    expect(first?.articleNo).toBe("193");
  });

  it("긴 이름을 먼저 맞춘다 — 시행령 인용이 법률로 가면 안 된다", () => {
    expect(detect("도로교통법 시행령 제10조")[0]?.law?.name).toBe("도로교통법 시행령");
    expect(detect("도로교통법 제10조")[0]?.law?.name).toBe("도로교통법");
  });

  it("낫표를 건너뛴다", () => {
    expect(detect("「도로교통법」 제3조")[0]?.law?.name).toBe("도로교통법");
  });

  it("이름과 조문 사이의 괄호를 건너뛴다", () => {
    const text = "채무자 회생 및 파산에 관한 법률(이하 ‘채무자회생법’이라 한다) 제252조 제1항은";

    expect(detect(text)[0]?.law?.name).toBe("채무자 회생 및 파산에 관한 법률");
  });

  it("모르는 이름이면 법을 비워 둔다 — 아무 법에나 붙이지 않는다", () => {
    const [first] = detect("듣도보도못한법 제1조");

    expect(first?.law?.name).toBeUndefined();
    expect(first?.articleNo).toBe("1");
  });
});

describe("이름 없이 이어지는 인용", () => {
  it("법령 본문은 현재 법을 문맥으로 받아 이름 없는 조문도 연결한다", () => {
    const [first] = detectCitations("제5조에 따른다", index, {
      lawId: "004",
      matched: "도로교통법",
      name: "도로교통법",
    });

    expect(first?.law?.lawId).toBe("004");
    expect(first?.named).toBe(false);
  });

  it("법령 본문의 외부 법 인용 뒤에 설명이 끼면 다시 현재 법으로 돌아온다", () => {
    const found = detectCitations(
      "민법 제10조에 따른 권리와 이 법에서 정한 제20조를 함께 본다",
      index,
      { lawId: "004", matched: "도로교통법", name: "도로교통법" },
    );

    expect(found.map((citation) => citation.law?.lawId)).toEqual(["001", "004"]);
  });

  it("괄호 제목과 접속사로 바로 이은 조문은 앞의 외부 법을 유지한다", () => {
    const found = detectCitations("민법 제10조(첫 조문) 및 제11조를 준용한다", index, {
      lawId: "004",
      matched: "도로교통법",
      name: "도로교통법",
    });

    expect(found.map((citation) => citation.law?.lawId)).toEqual(["001", "001"]);
  });

  it("모호한 법 이름을 현재 법으로 잘못 연결하지 않는다", () => {
    const found = detectCitations("모호법 제1조", index, {
      lawId: "004",
      matched: "도로교통법",
      name: "도로교통법",
    });

    expect(found[0]?.law).toBeUndefined();
  });

  it("바로 앞에서 말한 법을 잇는다", () => {
    // 참조조문은 이름을 한 번만 쓰고 조문을 나열한다. 버리면 절반을 놓친다.
    const found = detect("채무자 회생 및 파산에 관한 법률 제251조, 제252조 제1항");

    expect(found).toHaveLength(2);
    expect(found[1]?.law?.name).toBe("채무자 회생 및 파산에 관한 법률");
    expect(found[1]?.named).toBe(false);
    expect(found[0]?.named).toBe(true);
  });

  it("새 이름이 나오면 그 뒤로는 새 법을 잇는다", () => {
    const found = detect("채무자 회생 및 파산에 관한 법률 제87조, 제193조, 민법 제105조, 제106조");

    expect(found.map((c) => c.law?.name)).toEqual([
      "채무자 회생 및 파산에 관한 법률",
      "채무자 회생 및 파산에 관한 법률",
      "민법",
      "민법",
    ]);
  });

  it("앞에 아무 법도 없었으면 잇지 않는다 — 모른다고 두는 편이 낫다", () => {
    expect(detect("제5조에 따라 판단한다")[0]?.law?.name).toBeUndefined();
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

    expect(found.map((c) => `${c.law?.name ?? "?"} ${formatCitation(c)}`)).toEqual([
      "채무자 회생 및 파산에 관한 법률 제87조",
      "채무자 회생 및 파산에 관한 법률 제193조",
      "채무자 회생 및 파산에 관한 법률 제243조 제1항 제4호",
      "채무자 회생 및 파산에 관한 법률 제252조 제1항",
      "민사소송법 제202조",
      "민법 제105조",
    ]);
  });
});

describe("약칭·별칭·표기 차이", () => {
  it("약칭으로 인용해도 정식명으로 잇는다", () => {
    // 실측(2026-09-03) 약칭 2,676개 중 모호한 것은 8개뿐이라 그대로 쓸 수 있다.
    const [first] = detect("채무자회생법 제252조");

    expect(first?.law?.name).toBe("채무자 회생 및 파산에 관한 법률");
    expect(first?.law?.lawId).toBe("003");
    // 원문에 적힌 표기도 함께 들고 있다.
    expect(first?.law?.matched).toBe("채무자회생법");
  });

  it("정식명이 약칭을 이긴다", () => {
    /*
     * 어떤 법의 약칭이 다른 법의 정식명과 같은 경우가 842건 있었다(실측).
     * `민법`은 총포화약류법의 약칭이기도 하지만, 정식명 `민법`이 맞다.
     */
    expect(detect("민법 제105조")[0]?.law?.lawId).toBe("001");
  });

  it("한 약칭이 두 법을 가리키면 버린다 — 반쯤 맞는 링크보다 없는 편이 낫다", () => {
    expect(detect("모호법 제1조")[0]?.law).toBeUndefined();
  });

  it("가운뎃점 종류가 달라도 맞춘다", () => {
    // 코퍼스에도 `·`가 4,405건, `ㆍ`가 4,488건 섞여 있었다.
    const withDot = detect("총포·도검·화약류 등의 안전관리에 관한 법률 제1조")[0];
    expect(withDot?.law?.lawId).toBe("007");
  });

  it("띄어쓰기가 달라도 맞춘다", () => {
    expect(detect("채무자  회생 및  파산에 관한 법률 제1조")[0]?.law?.lawId).toBe("003");
  });

  it("헌법으로 인용하면 대한민국헌법에 잇는다", () => {
    /*
     * 판결문은 `헌법 제21조`라고 쓰는데 법령명은 `대한민국헌법`이고 공식 약칭이 없다.
     * 손으로 적은 별칭 표에 있는 유일한 항목이다.
     */
    const [first] = detect("헌법 제21조 제4항");

    expect(first?.law?.name).toBe("대한민국헌법");
    expect(first?.clauseNo).toBe("4");
  });
});

describe("같은 법 시행령", () => {
  it("`같은 법 시행령`을 시행령으로 잇는다 — 법률로 가면 안 된다", () => {
    /*
     * 참조조문이 자주 쓰는 형태다. 앞의 법을 그대로 이으면 조문 번호는 있는데 다른 법의
     * 조문을 가리키게 된다 — 없는 링크보다 나쁘다. 그럴듯하게 틀리기 때문이다.
     */
    const found = detect("「도로교통법」 제44조의2 제1항, 같은 법 시행령 제10조");

    expect(found[0]?.law?.name).toBe("도로교통법");
    expect(found[1]?.law?.name).toBe("도로교통법 시행령");
    expect(found[1]?.law?.lawId).toBe("005");
  });

  it("`같은 법`은 앞의 법을 그대로 잇는다", () => {
    expect(detect("도로교통법 제3조, 같은 법 제5조")[1]?.law?.name).toBe("도로교통법");
  });

  it("시행령이 사전에 없으면 잇지 않는다 — 지어내지 않는다", () => {
    // 민법 시행령은 사전에 없다.
    expect(detect("민법 제105조, 같은 법 시행령 제1조")[1]?.law).toBeUndefined();
  });
});

describe("이어 적은 항·호", () => {
  /**
   * `제5조 제2항·제3항`은 실제 판결문 표기다. 예전에는 첫 항만 링크가 되고 `제3항`은
   * 맨 글자로 남았다 — 읽는 사람에게 두 항은 같은 무게인데 하나만 눌렸다.
   */
  it("가운뎃점으로 이어진 항을 각각 링크한다", () => {
    const cites = detectCitations("민법 제5조 제2항·제3항에 따라", index);

    expect(cites.map((c) => [c.articleNo, c.clauseNo, c.text])).toEqual([
      ["5", "2", "제5조 제2항"],
      ["5", "3", "제3항"],
    ]);
    expect(cites[1]?.law?.name).toBe("민법");
    expect(cites[1]?.named).toBe(false);
  });

  it("`및`·`내지`·쉼표·`과`도 이어짐으로 본다", () => {
    for (const joiner of ["·", " 및 ", " 내지 ", ", ", "과 "]) {
      const cites = detectCitations(`민법 제5조 제2항${joiner}제3항`, index);
      expect(cites, joiner).toHaveLength(2);
      expect(cites[1]?.clauseNo, joiner).toBe("3");
    }
  });

  it("이어진 호는 앞 항의 호다", () => {
    const cites = detectCitations("민법 제10조 제1항 제2호·제3호", index);

    expect(cites.map((c) => [c.clauseNo, c.itemNo])).toEqual([
      ["1", "2"],
      ["1", "3"],
    ]);
  });

  it("항이 이어지면 앞의 호는 물려주지 않는다", () => {
    // `제3항 제2호`는 글에 없다. 물려주면 있지도 않은 조문을 가리킨다.
    const cites = detectCitations("민법 제10조 제1항 제2호, 제3항", index);

    expect(cites.at(-1)).toMatchObject({ clauseNo: "3", itemNo: undefined });
  });

  it("조가 이어지는 것은 이어짐이 아니다 — 각자 하나의 인용이다", () => {
    const cites = detectCitations("민법 제251조, 제252조 제1항", index);

    expect(cites.map((c) => c.articleNo)).toEqual(["251", "252"]);
  });
});
