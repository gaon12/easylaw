import { describe, expect, it } from "vitest";
import {
  canAccessContentWorkspace,
  canEditContent,
  canPublishContent,
  canRequestContentReview,
  canReviewContent,
  isAdministrator,
} from "./content-permissions";

describe("콘텐츠 역할", () => {
  it("작성자부터 콘텐츠 작업실을 볼 수 있다", () => {
    expect(canAccessContentWorkspace("viewer")).toBe(false);
    expect(canAccessContentWorkspace("contributor")).toBe(true);
    expect(canAccessContentWorkspace("reviewer")).toBe(true);
    expect(canAccessContentWorkspace("publisher")).toBe(true);
    expect(canAccessContentWorkspace("admin")).toBe(true);
  });

  it("공개 포인터는 게시자와 관리자만 바꾼다", () => {
    expect(canPublishContent("contributor")).toBe(false);
    expect(canPublishContent("reviewer")).toBe(false);
    expect(canPublishContent("publisher")).toBe(true);
    expect(canPublishContent("admin")).toBe(true);
  });

  it("작성 요청과 검수 결정을 서로 다른 역할에 둔다", () => {
    expect(canRequestContentReview("contributor")).toBe(true);
    expect(canRequestContentReview("reviewer")).toBe(false);
    expect(canReviewContent("contributor")).toBe(false);
    expect(canReviewContent("reviewer")).toBe(true);
    expect(canReviewContent("publisher")).toBe(false);
    expect(canReviewContent("admin")).toBe(true);
  });

  it("작성자와 관리자만 새 설명 초안을 편집한다", () => {
    expect(canEditContent("contributor")).toBe(true);
    expect(canEditContent("admin")).toBe(true);
    expect(canEditContent("reviewer")).toBe(false);
    expect(canEditContent("publisher")).toBe(false);
  });

  it("시스템 관리 권한은 관리자에게만 있다", () => {
    expect(isAdministrator("publisher")).toBe(false);
    expect(isAdministrator("admin")).toBe(true);
  });
});
