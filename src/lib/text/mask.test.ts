import { describe, expect, it } from "vitest";
import { maskPersonalData, summarizeHits } from "./mask";

describe("maskPersonalData", () => {
  it("주민등록번호를 가린다", () => {
    const { text, hits } = maskPersonalData("원고의 주민등록번호는 900101-1234567 이다.");
    expect(text).toBe("원고의 주민등록번호는 [주민등록번호] 이다.");
    expect(hits[0]?.kind).toBe("resident_registration_number");
  });

  it("전화번호와 이메일을 가린다", () => {
    const { text } = maskPersonalData("연락처는 010-1234-5678, 이메일은 hong@example.com 이다.");
    expect(text).toBe("연락처는 [전화번호], 이메일은 [이메일] 이다.");
  });

  it("계좌번호와 카드번호를 가린다", () => {
    expect(maskPersonalData("계좌 123-456-789012 로 송금하였다.").text).toBe(
      "계좌 [계좌번호] 로 송금하였다.",
    );
    expect(maskPersonalData("카드 1234-5678-9012-3456 을 사용했다.").text).toBe(
      "카드 [카드번호] 을 사용했다.",
    );
  });

  it("상세 주소를 가린다", () => {
    const { text } = maskPersonalData("피고는 서울특별시 양천구 목동 123-45 에 거주한다.");
    expect(text).toBe("피고는 [주소] 에 거주한다.");
  });

  it("호칭 뒤의 이름만 가리고 호칭은 남긴다", () => {
    // 호칭을 함께 지우면 문장이 읽히지 않는다. 누가 한 일인지는 남아야 한다.
    const { text } = maskPersonalData("원고 홍길동은 피고 김철수를 상대로 소를 제기하였다.");
    expect(text).toBe("원고 ○○○은 피고 ○○○를 상대로 소를 제기하였다.");
  });

  it("법원명·기관명을 주소로 오인하지 않는다", () => {
    const source = "서울고법 2023. 9. 20. 선고 2023나2014894 판결";
    expect(maskPersonalData(source).text).toBe(source);
  });

  it("사건번호를 가리지 않는다 — 조회 키가 사라지면 서비스가 무너진다", () => {
    const source = "대법원 2019도12345 판결을 인용한다.";
    expect(maskPersonalData(source).text).toBe(source);
  });

  it("가릴 것이 없으면 원문을 그대로 돌려준다", () => {
    const source = "원고의 청구를 기각한다.";
    const result = maskPersonalData(source);
    expect(result.text).toBe(source);
    expect(result.hits).toEqual([]);
  });

  it("겹치는 후보는 더 확실한 규칙 하나만 적용한다", () => {
    // 주민등록번호는 계좌번호 형태로도 읽힐 수 있다. 두 번 가려 문장이 깨지면 안 된다.
    const { text } = maskPersonalData("900101-1234567");
    expect(text).toBe("[주민등록번호]");
  });

  it("무엇을 몇 건 가렸는지 알려 준다", () => {
    const { hits } = maskPersonalData("원고 홍길동의 연락처는 010-1234-5678, 010-9999-8888 이다.");
    expect(summarizeHits(hits)).toEqual({ name: 1, phone: 2 });
  });

  it("여러 종류가 섞여 있어도 위치가 밀리지 않는다", () => {
    const { text } = maskPersonalData("원고 홍길동(900101-1234567)은 010-1234-5678로 연락하였다.");
    expect(text).toBe("원고 ○○○([주민등록번호])은 [전화번호]로 연락하였다.");
  });
});
