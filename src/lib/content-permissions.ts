import type { UserRole } from "@/db/app/repository";

/** 콘텐츠 작업실을 볼 수 있는 역할. 일반 이용자 계정은 공개 서비스만 사용한다. */
function canAccessContentWorkspace(
  role: UserRole | undefined,
): role is Exclude<UserRole, "viewer"> {
  return role === "contributor" || role === "reviewer" || role === "publisher" || role === "admin";
}

/** 공개 포인터를 바꾸는 권한. 검수 열람과 실제 게시를 분리한다. */
function canPublishContent(
  role: UserRole | undefined,
): role is Extract<UserRole, "publisher" | "admin"> {
  return role === "publisher" || role === "admin";
}

function canReviewContent(
  role: UserRole | undefined,
): role is Extract<UserRole, "reviewer" | "admin"> {
  return role === "reviewer" || role === "admin";
}

function canRequestContentReview(
  role: UserRole | undefined,
): role is Extract<UserRole, "contributor" | "admin"> {
  return role === "contributor" || role === "admin";
}

function canEditContent(
  role: UserRole | undefined,
): role is Extract<UserRole, "contributor" | "admin"> {
  return role === "contributor" || role === "admin";
}

function isAdministrator(role: UserRole | undefined): boolean {
  return role === "admin";
}

export {
  canAccessContentWorkspace,
  canEditContent,
  canPublishContent,
  canRequestContentReview,
  canReviewContent,
  isAdministrator,
};
