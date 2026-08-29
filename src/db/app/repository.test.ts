import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../client";
import { createTestAppDb } from "../testing";
import {
  attachCredentials,
  createAnonymousUser,
  createSession,
  deleteExpiredSessions,
  deleteExpiredUploads,
  deleteSession,
  deleteUpload,
  findLiveSession,
  findUploadForOwner,
  findUserByEmail,
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
  it("가입하지 않은 사용자를 만든다", () => {
    const id = createAnonymousUser(db);
    expect(findUserByEmail(db, "a@example.com")).toBeUndefined();
    expect(id).not.toBe("");
  });

  it("가입은 지금 계정에 이메일을 붙인다 — 새 사용자를 만들지 않는다", () => {
    // 새로 만들면 가입 전에 올린 문서가 남의 것이 된다.
    const id = createAnonymousUser(db);
    saveUpload(db, uploadInput(id));

    expect(attachCredentials(db, id, "a@example.com", "hash")).toBe(true);
    expect(findUserByEmail(db, "a@example.com")?.id).toBe(id);
    expect(listUploadsForOwner(db, id)).toHaveLength(1);
  });

  it("이미 쓰는 이메일이면 가입시키지 않는다", () => {
    const first = createAnonymousUser(db);
    const second = createAnonymousUser(db);
    attachCredentials(db, first, "a@example.com", "hash");

    expect(attachCredentials(db, second, "a@example.com", "hash2")).toBe(false);
    expect(findUserByEmail(db, "a@example.com")?.id).toBe(first);
  });
});

describe("세션", () => {
  const future = new Date("2999-01-01T00:00:00Z");

  it("살아 있는 세션을 토큰 해시로 찾는다", () => {
    const userId = createAnonymousUser(db);
    const id = createSession(db, userId, "token-hash", future);
    expect(findLiveSession(db, "token-hash")?.id).toBe(id);
  });

  it("만료된 세션은 찾지 못한다", () => {
    const userId = createAnonymousUser(db);
    createSession(db, userId, "old", new Date("2020-01-01T00:00:00Z"));
    expect(findLiveSession(db, "old")).toBeUndefined();
  });

  it("한 사용자가 기기마다 세션을 가질 수 있다", () => {
    // 사용자 행에 토큰 하나를 두면 다른 기기에서 로그인할 때마다 앞의 기기가 튕긴다.
    const userId = createAnonymousUser(db);
    createSession(db, userId, "phone", future);
    createSession(db, userId, "laptop", future);

    expect(findLiveSession(db, "phone")).toBeDefined();
    expect(findLiveSession(db, "laptop")).toBeDefined();
  });

  it("로그아웃은 그 기기의 세션만 닫는다", () => {
    const userId = createAnonymousUser(db);
    const phone = createSession(db, userId, "phone", future);
    createSession(db, userId, "laptop", future);

    deleteSession(db, phone);
    expect(findLiveSession(db, "phone")).toBeUndefined();
    expect(findLiveSession(db, "laptop")).toBeDefined();
  });

  it("만료된 세션을 치운다", () => {
    const userId = createAnonymousUser(db);
    createSession(db, userId, "old", new Date("2020-01-01T00:00:00Z"));
    createSession(db, userId, "live", future);

    expect(deleteExpiredSessions(db, new Date("2021-01-01T00:00:00Z"))).toBe(1);
    expect(findLiveSession(db, "live")).toBeDefined();
  });
});

describe("saveUpload", () => {
  it("문서·문장·마스킹 요약을 함께 저장한다", () => {
    const userId = createAnonymousUser(db);
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
    const userId = createAnonymousUser(db);
    const { id } = saveUpload(db, uploadInput(userId, { maskCounts: { name: 0 } }));
    expect(listMaskCounts(db, id)).toEqual([]);
  });

  it("같은 문서를 다시 올리면 기존 문서를 돌려준다", () => {
    const userId = createAnonymousUser(db);
    const first = saveUpload(db, uploadInput(userId));
    const again = saveUpload(db, uploadInput(userId, { title: "다른 이름" }));

    expect(again).toEqual({ id: first.id, duplicate: true });
    expect(listUploadsForOwner(db, userId)).toHaveLength(1);
  });

  it("사용자가 다르면 같은 내용도 각자 저장한다", () => {
    const a = createAnonymousUser(db);
    const b = createAnonymousUser(db);
    saveUpload(db, uploadInput(a));
    const second = saveUpload(db, uploadInput(b));

    expect(second.duplicate).toBe(false);
    expect(listUploadsForOwner(db, a)).toHaveLength(1);
    expect(listUploadsForOwner(db, b)).toHaveLength(1);
  });
});

describe("소유자 격리", () => {
  it("남의 문서는 조회되지 않는다", () => {
    const owner = createAnonymousUser(db);
    const stranger = createAnonymousUser(db);
    const { id } = saveUpload(db, uploadInput(owner));

    expect(findUploadForOwner(db, id, owner)).toBeDefined();
    expect(findUploadForOwner(db, id, stranger)).toBeUndefined();
  });

  it("남의 문서는 지워지지 않는다", () => {
    const owner = createAnonymousUser(db);
    const stranger = createAnonymousUser(db);
    const { id } = saveUpload(db, uploadInput(owner));

    expect(deleteUpload(db, id, stranger)).toBe(false);
    expect(findUploadForOwner(db, id, owner)).toBeDefined();
  });

  it("목록에는 자기 문서만 나온다", () => {
    const owner = createAnonymousUser(db);
    const stranger = createAnonymousUser(db);
    saveUpload(db, uploadInput(owner));
    saveUpload(db, uploadInput(stranger, { docHash: "hash-b" }));

    const list = listUploadsForOwner(db, owner);
    expect(list).toHaveLength(1);
    expect(list[0]?.userId).toBe(owner);
  });
});

describe("삭제", () => {
  it("문서를 지우면 문장과 마스킹 요약도 사라진다", () => {
    const userId = createAnonymousUser(db);
    const { id } = saveUpload(db, uploadInput(userId));

    expect(deleteUpload(db, id, userId)).toBe(true);
    expect(listUploadSpans(db, id)).toEqual([]);
    expect(listMaskCounts(db, id)).toEqual([]);
    expect(findUploadForOwner(db, id, userId)).toBeUndefined();
  });

  it("보관 기간이 지난 문서를 지운다", () => {
    const userId = createAnonymousUser(db);
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
