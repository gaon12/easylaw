import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../client";
import { createTestAppDb } from "../testing";
import { createErrorEvent, listErrorEvents } from "./error-events";

let db: AppDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestAppDb());
});

afterEach(() => close());

const event = {
  publicCode: "EL-7AbC-xYz9",
  digest: "123456789",
  source: "server" as const,
  name: "Error",
  message: "데이터베이스를 읽지 못했습니다.",
  stack: "Error: 데이터베이스를 읽지 못했습니다.",
  requestPath: "/case/example",
  method: "GET",
  routePath: "/case/[caseNo]",
  routeType: "render",
};

describe("오류 추적 기록", () => {
  it("공개 번호와 실제 원인을 함께 저장한다", () => {
    createErrorEvent(db, event);
    expect(listErrorEvents(db, { limit: 10 })[0]).toMatchObject(event);
  });

  it("공개 번호로 같은 원인의 발생 기록만 찾는다", () => {
    createErrorEvent(db, event);
    createErrorEvent(db, { ...event, publicCode: "EL-1111-2222", digest: "other" });
    const rows = listErrorEvents(db, { publicCode: event.publicCode, limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.digest).toBe(event.digest);
  });
});
