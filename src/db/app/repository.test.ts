import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../client";
import { createTestAppDb } from "../testing";
import {
  createUser,
  deleteExpiredUploads,
  deleteUpload,
  findUploadForOwner,
  findUserByOwnerKeyHash,
  listMaskCounts,
  listUploadSpans,
  listUploadsForOwner,
  saveUpload,
  type UploadInput,
} from "./repository";

let db: AppDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestAppDb());
});

afterEach(() => {
  close();
});

function uploadInput(userId: string, overrides: Partial<UploadInput> = {}): UploadInput {
  return {
    userId,
    title: "2019가단1234 판결문",
    filename: null,
    docHash: "hash-a",
    charCount: 42,
    caseNoCanonical: null,
    retentionUntil: null,
    spans: [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 10, text: "원고의 청구를 기각한다." },
      { paraIdx: 0, sentIdx: 1, charStart: 10, charEnd: 20, text: "소송비용은 원고가 부담한다." },
    ],
    maskCounts: { name: 2, phone: 1 },
    ...overrides,
  };
}

describe("사용자", () => {
  it("소유 토큰 해시로 찾는다", () => {
    const id = createUser(db, "hash-of-token");
    expect(findUserByOwnerKeyHash(db, "hash-of-token")?.id).toBe(id);
  });

  it("모르는 해시는 찾지 못한다", () => {
    createUser(db, "hash-of-token");
    expect(findUserByOwnerKeyHash(db, "other")).toBeUndefined();
  });
});

describe("saveUpload", () => {
  it("문서·문장·마스킹 요약을 함께 저장한다", () => {
    const userId = createUser(db, "k1");
    const { id, duplicate } = saveUpload(db, uploadInput(userId));

    expect(duplicate).toBe(false);
    expect(listUploadSpans(db, id)).toHaveLength(2);
    expect(listMaskCounts(db, id)).toEqual([
      { kind: "name", count: 2 },
      { kind: "phone", count: 1 },
    ]);
    expect(findUploadForOwner(db, id, userId)?.maskedAt).toBeInstanceOf(Date);
  });

  it("건수가 0인 종류는 저장하지 않는다", () => {
    const userId = createUser(db, "k1");
    const { id } = saveUpload(db, uploadInput(userId, { maskCounts: { name: 0 } }));
    expect(listMaskCounts(db, id)).toEqual([]);
  });

  it("같은 문서를 다시 올리면 기존 문서를 돌려준다", () => {
    const userId = createUser(db, "k1");
    const first = saveUpload(db, uploadInput(userId));
    const again = saveUpload(db, uploadInput(userId, { title: "다른 이름" }));

    expect(again).toEqual({ id: first.id, duplicate: true });
    expect(listUploadsForOwner(db, userId)).toHaveLength(1);
  });

  it("사용자가 다르면 같은 내용도 각자 저장한다", () => {
    const a = createUser(db, "k1");
    const b = createUser(db, "k2");
    saveUpload(db, uploadInput(a));
    const second = saveUpload(db, uploadInput(b));

    expect(second.duplicate).toBe(false);
    expect(listUploadsForOwner(db, a)).toHaveLength(1);
    expect(listUploadsForOwner(db, b)).toHaveLength(1);
  });
});

describe("소유자 격리", () => {
  it("남의 문서는 조회되지 않는다", () => {
    const owner = createUser(db, "k1");
    const stranger = createUser(db, "k2");
    const { id } = saveUpload(db, uploadInput(owner));

    expect(findUploadForOwner(db, id, owner)).toBeDefined();
    expect(findUploadForOwner(db, id, stranger)).toBeUndefined();
  });

  it("남의 문서는 지워지지 않는다", () => {
    const owner = createUser(db, "k1");
    const stranger = createUser(db, "k2");
    const { id } = saveUpload(db, uploadInput(owner));

    expect(deleteUpload(db, id, stranger)).toBe(false);
    expect(findUploadForOwner(db, id, owner)).toBeDefined();
  });

  it("목록에는 자기 문서만 나온다", () => {
    const owner = createUser(db, "k1");
    const stranger = createUser(db, "k2");
    saveUpload(db, uploadInput(owner));
    saveUpload(db, uploadInput(stranger, { docHash: "hash-b" }));

    const list = listUploadsForOwner(db, owner);
    expect(list).toHaveLength(1);
    expect(list[0]?.userId).toBe(owner);
  });
});

describe("삭제", () => {
  it("문서를 지우면 문장과 마스킹 요약도 사라진다", () => {
    const userId = createUser(db, "k1");
    const { id } = saveUpload(db, uploadInput(userId));

    expect(deleteUpload(db, id, userId)).toBe(true);
    expect(listUploadSpans(db, id)).toEqual([]);
    expect(listMaskCounts(db, id)).toEqual([]);
    expect(findUploadForOwner(db, id, userId)).toBeUndefined();
  });

  it("보관 기간이 지난 문서를 지운다", () => {
    const userId = createUser(db, "k1");
    const past = new Date("2020-01-01T00:00:00Z");
    const future = new Date("2999-01-01T00:00:00Z");

    const expired = saveUpload(db, uploadInput(userId, { retentionUntil: past }));
    const alive = saveUpload(db, uploadInput(userId, { docHash: "b", retentionUntil: future }));
    const forever = saveUpload(db, uploadInput(userId, { docHash: "c", retentionUntil: null }));

    expect(deleteExpiredUploads(db, new Date("2021-01-01T00:00:00Z"))).toBe(1);
    expect(findUploadForOwner(db, expired.id, userId)).toBeUndefined();
    // 기간을 정하지 않은 문서는 시간이 지나도 지우지 않는다. 사용자가 그렇게 골랐다.
    expect(findUploadForOwner(db, alive.id, userId)).toBeDefined();
    expect(findUploadForOwner(db, forever.id, userId)).toBeDefined();
  });

  it("지울 것이 없으면 아무것도 하지 않는다", () => {
    expect(deleteExpiredUploads(db, new Date())).toBe(0);
  });
});
