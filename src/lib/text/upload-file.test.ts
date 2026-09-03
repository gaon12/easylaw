/**
 * biome-ignore-all lint/correctness/noNodejsModules: 픽스처 PDF를 파일에서 읽는다.
 * 테스트는 Node에서만 돌고, PDF를 문자열로 소스에 박아 둘 수는 없다.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { looksLikePdf, MAX_FILE_BYTES, readUploadedFile } from "./upload-file";

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}

/** `File`이 없어도 되게, 필요한 두 가지만 흉내 낸다. */
function fakeFile(bytes: Uint8Array) {
  return {
    size: bytes.byteLength,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(0) as ArrayBuffer),
  };
}

describe("looksLikePdf", () => {
  it("확장자가 아니라 매직바이트로 본다", () => {
    // 이름이 `.txt`인 PDF도, `.pdf`인 글자 파일도 올라온다.
    expect(looksLikePdf(fixture("text.pdf"))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("%PDF-1.4 로 시작하지 않음"))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("판결문 내용입니다"))).toBe(false);
    expect(looksLikePdf(new Uint8Array([0x25, 0x50]))).toBe(false);
  });
});

describe("readUploadedFile", () => {
  it("PDF에서 글자를 꺼낸다", async () => {
    const read = await readUploadedFile(fakeFile(fixture("text.pdf")));

    expect("text" in read && read.text).toContain("Seoul Central District Court");
  });

  it("스캔본은 '읽을 수 없다'가 아니라 '스캔본'이라고 한다", async () => {
    // 사용자가 잘못한 것이 없다. 우리가 아직 못 하는 일이라고 말해야 다시 안 올린다.
    const read = await readUploadedFile(fakeFile(fixture("scanned.pdf")));

    expect(read).toEqual({ error: "pdf_scanned" });
  });

  it("UTF-8 글자 파일을 읽는다", async () => {
    const read = await readUploadedFile(
      fakeFile(new TextEncoder().encode("원고의 청구를 기각한다.")),
    );

    expect("text" in read && read.text).toBe("원고의 청구를 기각한다.");
  });

  it("CP949로 저장된 한글도 읽는다", async () => {
    /*
     * 관공서에서 받은 파일이 CP949인 경우가 흔하다. UTF-8만 시도하고 실패하면
     * 사용자는 멀쩡한 파일을 못 올린다.
     */
    const cp949 = new Uint8Array([
      0xbf, 0xf8, 0xb0, 0xed, 0xc0, 0xc7, 0x20, 0xc3, 0xbb, 0xb1, 0xb8,
    ]);
    const read = await readUploadedFile(fakeFile(cp949));

    expect("text" in read && read.text).toBe("원고의 청구");
  });

  it("너무 큰 파일은 읽기 전에 막는다", async () => {
    const read = await readUploadedFile({
      size: MAX_FILE_BYTES + 1,
      arrayBuffer: () => Promise.reject(new Error("여기까지 오면 안 된다")),
    });

    expect(read).toEqual({ error: "file_too_large" });
  });

  it("PDF처럼 시작하지만 깨진 파일은 읽을 수 없다고 한다", async () => {
    const read = await readUploadedFile(fakeFile(new TextEncoder().encode("%PDF-1.4 깨짐")));

    expect(read).toEqual({ error: "file_unreadable" });
  });
});
