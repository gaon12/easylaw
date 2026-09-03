import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../client";
import { createTestAppDb } from "../testing";
import {
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteExpiredUploads,
  deleteSession,
  deleteUpload,
  findLiveSession,
  findUploadForOwner,
  findUserByEmail,
  findUserById,
  listMaskCounts,
  listUploadSpans,
  listUploadsForOwner,
  saveUpload,
  type UploadInput,
  updateNickname,
} from "./repository";
import { auditLog } from "./schema";

let db: AppDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestAppDb());
  userSeq = 0;
});

afterEach(() => {
  close();
});

let userSeq = 0;

/** 테스트용 계정 하나. 이메일은 매번 다르게 만든다. */
function makeUser(): string {
  userSeq += 1;
  const id = createUser(db, { email: `user${userSeq}@example.com`, passwordHash: "hash" });
  if (id === undefined) {
    throw new Error("계정을 만들지 못했다");
  }
  return id;
}

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

describe("계정", () => {
  it("이메일로 계정을 만들고 찾는다", () => {
    const id = createUser(db, { email: "hong@example.com", passwordHash: "hash" });
    expect(findUserByEmail(db, "hong@example.com")?.id).toBe(id);
  });

  it("이미 쓰는 이메일이면 만들지 않는다", () => {
    const first = createUser(db, { email: "hong@example.com", passwordHash: "hash" });
    expect(createUser(db, { email: "hong@example.com", passwordHash: "hash2" })).toBeUndefined();
    // 기존 계정의 비밀번호가 덮이면 안 된다.
    expect(findUserByEmail(db, "hong@example.com")?.id).toBe(first);
    expect(findUserByEmail(db, "hong@example.com")?.passwordHash).toBe("hash");
  });
});

describe("세션", () => {
  const future = new Date("2999-01-01T00:00:00Z");

  it("살아 있는 세션을 토큰 해시로 찾는다", () => {
    const userId = makeUser();
    const id = createSession(db, userId, "token-hash", future);
    expect(findLiveSession(db, "token-hash")?.id).toBe(id);
  });

  it("만료된 세션은 찾지 못한다", () => {
    const userId = makeUser();
    createSession(db, userId, "old", new Date("2020-01-01T00:00:00Z"));
    expect(findLiveSession(db, "old")).toBeUndefined();
  });

  it("한 사용자가 기기마다 세션을 가질 수 있다", () => {
    // 사용자 행에 토큰 하나를 두면 다른 기기에서 로그인할 때마다 앞의 기기가 튕긴다.
    const userId = makeUser();
    createSession(db, userId, "phone", future);
    createSession(db, userId, "laptop", future);

    expect(findLiveSession(db, "phone")).toBeDefined();
    expect(findLiveSession(db, "laptop")).toBeDefined();
  });

  it("로그아웃은 그 기기의 세션만 닫는다", () => {
    const userId = makeUser();
    const phone = createSession(db, userId, "phone", future);
    createSession(db, userId, "laptop", future);

    deleteSession(db, phone);
    expect(findLiveSession(db, "phone")).toBeUndefined();
    expect(findLiveSession(db, "laptop")).toBeDefined();
  });

  it("만료된 세션을 치운다", () => {
    const userId = makeUser();
    createSession(db, userId, "old", new Date("2020-01-01T00:00:00Z"));
    createSession(db, userId, "live", future);

    expect(deleteExpiredSessions(db, new Date("2021-01-01T00:00:00Z"))).toBe(1);
    expect(findLiveSession(db, "live")).toBeDefined();
  });
});

describe("saveUpload", () => {
  it("문서·문장·마스킹 요약을 함께 저장한다", () => {
    const userId = makeUser();
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
    const userId = makeUser();
    const { id } = saveUpload(db, uploadInput(userId, { maskCounts: { name: 0 } }));
    expect(listMaskCounts(db, id)).toEqual([]);
  });

  it("같은 문서를 다시 올리면 기존 문서를 돌려준다", () => {
    const userId = makeUser();
    const first = saveUpload(db, uploadInput(userId));
    const again = saveUpload(db, uploadInput(userId, { title: "다른 이름" }));

    expect(again).toEqual({ id: first.id, duplicate: true });
    expect(listUploadsForOwner(db, userId)).toHaveLength(1);
  });

  it("사용자가 다르면 같은 내용도 각자 저장한다", () => {
    const a = makeUser();
    const b = makeUser();
    saveUpload(db, uploadInput(a));
    const second = saveUpload(db, uploadInput(b));

    expect(second.duplicate).toBe(false);
    expect(listUploadsForOwner(db, a)).toHaveLength(1);
    expect(listUploadsForOwner(db, b)).toHaveLength(1);
  });
});

describe("소유자 격리", () => {
  it("남의 문서는 조회되지 않는다", () => {
    const owner = makeUser();
    const stranger = makeUser();
    const { id } = saveUpload(db, uploadInput(owner));

    expect(findUploadForOwner(db, id, owner)).toBeDefined();
    expect(findUploadForOwner(db, id, stranger)).toBeUndefined();
  });

  it("남의 문서는 지워지지 않는다", () => {
    const owner = makeUser();
    const stranger = makeUser();
    const { id } = saveUpload(db, uploadInput(owner));

    expect(deleteUpload(db, id, stranger)).toBe(false);
    expect(findUploadForOwner(db, id, owner)).toBeDefined();
  });

  it("목록에는 자기 문서만 나온다", () => {
    const owner = makeUser();
    const stranger = makeUser();
    saveUpload(db, uploadInput(owner));
    saveUpload(db, uploadInput(stranger, { docHash: "hash-b" }));

    const list = listUploadsForOwner(db, owner);
    expect(list).toHaveLength(1);
    expect(list[0]?.userId).toBe(owner);
  });
});

describe("삭제", () => {
  it("문서를 지우면 문장과 마스킹 요약도 사라진다", () => {
    const userId = makeUser();
    const { id } = saveUpload(db, uploadInput(userId));

    expect(deleteUpload(db, id, userId)).toBe(true);
    expect(listUploadSpans(db, id)).toEqual([]);
    expect(listMaskCounts(db, id)).toEqual([]);
    expect(findUploadForOwner(db, id, userId)).toBeUndefined();
  });

  it("보관 기간이 지난 문서를 지운다", () => {
    const userId = makeUser();
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

describe("updateNickname", () => {
  it("이름을 바꾸고 감사 로그를 남긴다", () => {
    const id = createUser(db, { email: "hong@example.com", passwordHash: "hash" }) as string;

    updateNickname(db, id, "법돌이");

    expect(findUserById(db, id)?.nickname).toBe("법돌이");
    const log = db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "user.nickname_changed"))
      .all();
    expect(log).toHaveLength(1);
    // 옛 이름을 함께 남겨야 "누가 무엇을 무엇으로 바꿨나"를 되짚을 수 있다.
    expect(log[0]?.meta).toEqual({ from: null, to: "법돌이" });
  });

  it("가입할 때 넣은 이름을 바꾸면 옛 이름이 로그에 남는다", () => {
    const id = createUser(db, {
      email: "kim@example.com",
      passwordHash: "hash",
      nickname: "처음이름",
    }) as string;

    updateNickname(db, id, "바꾼이름");

    expect(findUserById(db, id)?.nickname).toBe("바꾼이름");
    const log = db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "user.nickname_changed"))
      .all();
    expect(log[0]?.meta).toEqual({ from: "처음이름", to: "바꾼이름" });
  });

  it("같은 이름을 여럿이 쓸 수 있다 — 호칭이지 식별자가 아니다", () => {
    const first = createUser(db, { email: "a@example.com", passwordHash: "hash" }) as string;
    const second = createUser(db, { email: "b@example.com", passwordHash: "hash" }) as string;

    updateNickname(db, first, "법돌이");
    updateNickname(db, second, "법돌이");

    expect(findUserById(db, first)?.nickname).toBe("법돌이");
    expect(findUserById(db, second)?.nickname).toBe("법돌이");
  });
});
