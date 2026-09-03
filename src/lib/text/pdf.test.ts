/**
 * biome-ignore-all lint/correctness/noNodejsModules: 픽스처 PDF를 파일에서 읽는다.
 * 테스트는 Node에서만 돌고, PDF를 문자열로 소스에 박아 둘 수는 없다.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractPdfText, MIN_TEXT_LENGTH } from "./pdf";

/**
 * 픽스처는 **손으로 만든 최소 PDF**다(`scratchpad/make-pdf.mjs`로 한 번 만들었다).
 * 실제 판결문 PDF를 저장소에 둘 수는 없다 — 개인정보가 들어 있고, 연구보고서는 `.dev/`에
 * 있어 CI에 없다. 파서가 보는 모양은 같다.
 */
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}

describe("extractPdfText", () => {
  it("글자가 든 PDF에서 본문을 꺼낸다", async () => {
    const result = await extractPdfText(fixture("text.pdf"));

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.pages).toBe(1);
    expect(result.text).toContain("Seoul Central District Court");
    expect(result.text).toContain("dismissed");
  });

  it("줄을 나눠서 낸다 — 한 장이 한 문장이 되면 안 된다", async () => {
    const result = await extractPdfText(fixture("text.pdf"));
    if (result.kind !== "ok") {
      throw new Error("본문을 꺼내지 못했다");
    }

    /*
     * pdfjs는 글자를 화면에 그리는 조각 단위로 준다. `hasEOL`을 무시하고 이어 붙이면
     * 판결문 한 장이 한 문장이 되고, 문장 분할이 손쓸 도리가 없어진다.
     */
    expect(result.text.split("\n").filter((line) => line.trim().length > 0).length).toBeGreaterThan(
      1,
    );
  });

  it("글자가 없으면 스캔본으로 본다 — '빈 파일'이라고 하지 않는다", async () => {
    // 이때 "빈 파일"이라고 하면 사용자는 무엇이 잘못됐는지 모른 채 같은 파일을 다시 올린다.
    const result = await extractPdfText(fixture("scanned.pdf"));

    expect(result.kind).toBe("no_text");
    expect(result.kind === "no_text" && result.pages).toBe(1);
  });

  it("PDF가 아니면 읽을 수 없다고 한다", async () => {
    const result = await extractPdfText(new TextEncoder().encode("이건 그냥 글자입니다"));

    expect(result.kind).toBe("unreadable");
    expect(result.kind === "unreadable" && result.reason.length > 0).toBe(true);
  });

  it("스캔본 판정 기준을 상수로 둔다", () => {
    // 표지만 있는 문서도 이보다는 나온다.
    expect(MIN_TEXT_LENGTH).toBeGreaterThan(0);
  });
});
