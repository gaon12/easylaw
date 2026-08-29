import { beforeEach, describe, expect, it } from "vitest";
import {
  createUser,
  findUploadForOwner,
  listMaskCounts,
  listUploadSpans,
} from "@/db/app/repository";
import type { AppDb } from "@/db/client";
import { createTestAppDb } from "@/db/testing";
import { ingestUpload, isRetentionChoice, purgeExpiredUploads } from "./upload";

let db: AppDb;
let ownerId: string;

const JUDGMENT = [
  "주문",
  "원고의 청구를 기각한다.",
  "",
  "이유",
  "원고 홍길동은 2019. 5. 3. 피고 김철수에게 3,000만 원을 빌려주었다.",
  "연락처는 010-1234-5678이고 주민등록번호는 900101-1234567이다.",
].join("\n");

function input(overrides: Partial<Parameters<typeof ingestUpload>[1]> = {}) {
  return {
    ownerId,
    raw: JUDGMENT,
    filename: null,
    title: "",
    caseNo: "",
    retention: "30" as const,
    ...overrides,
  };
}

beforeEach(() => {
  ({ db } = createTestAppDb());
  ownerId = createUser(db, "owner-key-hash");
});

describe("ingestUpload", () => {
  it("가리고 나눠서 저장한다", () => {
    const result = ingestUpload(db, input());
    if (result.kind !== "saved") {
      throw new Error(`거절됨: ${result.reason}`);
    }

    const row = findUploadForOwner(db, result.docId, ownerId);
    expect(row).toBeDefined();
    expect(listUploadSpans(db, result.docId).length).toBeGreaterThan(0);
    expect(listMaskCounts(db, result.docId)).toEqual(
      expect.arrayContaining([
        { kind: "resident_registration_number", count: 1 },
        { kind: "phone", count: 1 },
      ]),
    );
  });

  it("가리기 전 원문은 어디에도 저장하지 않는다", () => {
    const result = ingestUpload(db, input());
    if (result.kind !== "saved") {
      throw new Error(`거절됨: ${result.reason}`);
    }

    // 이 서비스에서 가장 큰 사고는 마스킹한 줄 알았는데 원문이 남는 것이다.
    const stored = listUploadSpans(db, result.docId)
      .map((span) => span.text)
      .join("\n");
    expect(stored).not.toContain("900101-1234567");
    expect(stored).not.toContain("010-1234-5678");
    expect(stored).toContain("[주민등록번호]");
  });

  it("이름을 안 적으면 파일명에서 만든다", () => {
    const result = ingestUpload(db, input({ filename: "2019가단1234 판결문.txt" }));
    if (result.kind !== "saved") {
      throw new Error(`거절됨: ${result.reason}`);
    }
    expect(findUploadForOwner(db, result.docId, ownerId)?.title).toBe("2019가단1234 판결문");
  });

  it("파일명도 없으면 올린 날짜로 이름을 만든다", () => {
    const result = ingestUpload(db, input(), new Date("2026-08-29T00:00:00Z"));
    if (result.kind !== "saved") {
      throw new Error(`거절됨: ${result.reason}`);
    }
    expect(findUploadForOwner(db, result.docId, ownerId)?.title).toContain("2026. 8. 29.");
  });

  it("사건번호를 적으면 정규형으로 보관한다", () => {
    const result = ingestUpload(db, input({ caseNo: "2019 가단 1234" }));
    if (result.kind !== "saved") {
      throw new Error(`거절됨: ${result.reason}`);
    }
    expect(findUploadForOwner(db, result.docId, ownerId)?.caseNoCanonical).toBe("2019가단1234");
  });

  it("사건번호가 형식에 안 맞으면 조용히 비운다 — 필수 정보가 아니다", () => {
    const result = ingestUpload(db, input({ caseNo: "우리 집 사건" }));
    if (result.kind !== "saved") {
      throw new Error(`거절됨: ${result.reason}`);
    }
    expect(findUploadForOwner(db, result.docId, ownerId)?.caseNoCanonical).toBeNull();
  });

  it("보관 기간을 날짜로 바꾼다", () => {
    const now = new Date("2026-08-29T00:00:00Z");
    const result = ingestUpload(db, input({ retention: "7" }), now);
    if (result.kind !== "saved") {
      throw new Error(`거절됨: ${result.reason}`);
    }
    expect(findUploadForOwner(db, result.docId, ownerId)?.retentionUntil).toEqual(
      new Date("2026-09-05T00:00:00Z"),
    );
  });

  it("직접 지울 때까지는 기한을 두지 않는다", () => {
    const result = ingestUpload(db, input({ retention: "keep" }));
    if (result.kind !== "saved") {
      throw new Error(`거절됨: ${result.reason}`);
    }
    // 먼 미래 날짜로 대신하면 "직접 지울 때까지"가 거짓말이 된다.
    expect(findUploadForOwner(db, result.docId, ownerId)?.retentionUntil).toBeNull();
  });

  it("짧은 입력은 이유와 함께 거절한다", () => {
    expect(ingestUpload(db, input({ raw: "판결문" }))).toEqual({
      kind: "rejected",
      reason: "too_short",
    });
  });

  it("같은 문서를 다시 올리면 기존 문서를 알려 준다", () => {
    const first = ingestUpload(db, input());
    const again = ingestUpload(db, input());
    if (first.kind !== "saved" || again.kind !== "saved") {
      throw new Error("저장에 실패했다");
    }
    expect(again).toEqual({ kind: "saved", docId: first.docId, duplicate: true });
  });
});

describe("isRetentionChoice", () => {
  it("아는 값만 통과시킨다 — 서버 액션은 폼을 거치지 않고도 호출된다", () => {
    expect(isRetentionChoice("30")).toBe(true);
    expect(isRetentionChoice("keep")).toBe(true);
    expect(isRetentionChoice("99999")).toBe(false);
    expect(isRetentionChoice("")).toBe(false);
  });
});

describe("purgeExpiredUploads", () => {
  it("기한이 지난 문서를 치운다", () => {
    const saved = ingestUpload(db, input({ retention: "7" }), new Date("2026-01-01T00:00:00Z"));
    if (saved.kind !== "saved") {
      throw new Error("저장에 실패했다");
    }

    expect(purgeExpiredUploads(db, new Date("2026-01-05T00:00:00Z"))).toBe(0);
    expect(purgeExpiredUploads(db, new Date("2026-01-09T00:00:00Z"))).toBe(1);
    expect(findUploadForOwner(db, saved.docId, ownerId)).toBeUndefined();
  });
});
