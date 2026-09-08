"use server";

import { revalidatePath } from "next/cache";
import { corpusDb } from "@/db/client";
import {
  findJudgmentById,
  publishRendition,
  type ReleaseMutationResult,
  restoreContentRelease,
  withdrawPublishedRendition,
} from "@/db/corpus/repository";
import { LEVELS } from "@/db/corpus/schema";
import { ensureJudgmentText } from "./lookup";
import { currentSession } from "./owner";

/**
 * 관리자가 화면에서 시키는 일들. 값을 바꾸는 것은 `setup-actions.ts`가, 이미 있는 것을
 * 다시 만드는 것은 여기가 맡는다.
 *
 * **권한을 여기서도 본다.** 화면은 레이아웃이 막지만, 서버 액션은 화면을 거치지 않고
 * 직접 불릴 수 있다 — 화면을 못 보게 하는 것과 못 시키게 하는 것은 다른 일이다.
 */

interface RefreshState {
  readonly done?: string;
  readonly problem?: string;
}

interface ReleaseState {
  readonly done?: string;
  readonly problem?: string;
}

const RELEASE_PROBLEMS = {
  not_found: "판결문이나 설명을 찾을 수 없어요.",
  no_source_revision: "공개할 원문판이 없어요.",
  stale: "현재 원문판으로 만든 설명만 게시할 수 있어요.",
  empty: "문장이 없는 설명은 게시할 수 없어요.",
  ungrounded: "근거 없음 문장이 있어 게시할 수 없어요.",
} as const;

function runReleaseMutation(
  operation: string,
  input: {
    judgmentId: string;
    level: string;
    renditionId: string;
    releaseId: string;
    actorId: string;
  },
): ReleaseMutationResult | undefined {
  const db = corpusDb();
  if (operation === "publish") {
    return publishRendition(db, {
      judgmentId: input.judgmentId,
      renditionId: input.renditionId,
      actorId: input.actorId,
    });
  }
  if (operation === "withdraw") {
    return withdrawPublishedRendition(db, {
      judgmentId: input.judgmentId,
      level: input.level as (typeof LEVELS)[number],
      actorId: input.actorId,
    });
  }
  if (operation === "restore") {
    return restoreContentRelease(db, {
      judgmentId: input.judgmentId,
      releaseId: input.releaseId,
      actorId: input.actorId,
    });
  }
}

function releaseDone(operation: string, level: string, changed: boolean): string {
  if (!changed) {
    return "이미 같은 상태예요.";
  }
  if (operation === "publish") {
    return `${level} 설명을 게시했어요.`;
  }
  if (operation === "withdraw") {
    return `${level} 설명을 철회했어요.`;
  }
  return "선택한 설명 릴리스로 복원했어요.";
}

/**
 * 판례 원문을 법제처에서 **다시** 받는다.
 *
 * 한 번 받은 원문은 다시 받지 않는 것이 기본이다(확정된 판결문은 바뀌지 않는다). 그래서
 * 잘못 들어간 본문이 그대로 굳는다 — 시드가 넣은 잘린 픽스처가 실제로 그랬다. 사람이
 * "이 판례는 이상하다"고 판단했을 때 고칠 수 있는 길이 이것 하나다.
 */
async function refreshJudgmentText(
  _previous: RefreshState,
  formData: FormData,
): Promise<RefreshState> {
  const session = await currentSession();
  if (session?.role !== "admin") {
    return { problem: "관리자만 다시 받을 수 있어요." };
  }

  const caseNo = String(formData.get("case_no") ?? "").trim();
  if (caseNo.length === 0) {
    return { problem: "사건번호가 없어요." };
  }

  const result = await ensureJudgmentText(caseNo, undefined, { refresh: true });
  if (!result.ok) {
    return { problem: result.reason };
  }

  /*
   * 판결문 화면은 문장을 그대로 캐시한다. 다시 받아 놓고 화면을 비우지 않으면, 관리자는
   * 성공 메시지를 보고 화면에서는 옛 본문을 계속 본다.
   */
  revalidatePath("/admin/content");
  revalidatePath("/case/[caseNo]", "page");

  return { done: `${result.spanCount}문장으로 다시 받았어요.` };
}

/** 공개 설명 묶음의 포인터를 바꾼다. 게시와 철회 모두 새 불변 릴리스를 남긴다. */
async function manageJudgmentRelease(
  _previous: ReleaseState,
  formData: FormData,
): Promise<ReleaseState> {
  const session = await currentSession();
  if (session?.role !== "admin") {
    return { problem: "관리자만 공개 상태를 바꿀 수 있어요." };
  }

  const judgmentId = String(formData.get("judgment_id") ?? "").trim();
  const operation = String(formData.get("operation") ?? "");
  const level = String(formData.get("level") ?? "");
  const levels: readonly string[] = LEVELS;
  if (judgmentId.length === 0) {
    return { problem: "요청한 판결문이나 설명 단계를 확인할 수 없어요." };
  }
  if ((operation === "publish" || operation === "withdraw") && !levels.includes(level)) {
    return { problem: "요청한 판결문이나 설명 단계를 확인할 수 없어요." };
  }

  const db = corpusDb();
  const judgment = findJudgmentById(db, judgmentId);
  if (judgment === undefined) {
    return { problem: RELEASE_PROBLEMS.not_found };
  }

  const result = runReleaseMutation(operation, {
    judgmentId,
    level,
    renditionId: String(formData.get("rendition_id") ?? ""),
    releaseId: String(formData.get("release_id") ?? ""),
    actorId: session.userId,
  });
  if (result === undefined) {
    return { problem: "알 수 없는 공개 상태 변경 요청이에요." };
  }
  if (!result.ok) {
    return { problem: RELEASE_PROBLEMS[result.reason] };
  }

  revalidatePath(`/admin/content/judgments/${judgmentId}`);
  revalidatePath(`/case/${judgment.caseNoCanonical}`);
  revalidatePath(`/case/${judgment.caseNoCanonical}/braille`);
  return { done: releaseDone(operation, level, result.changed) };
}

export { manageJudgmentRelease, refreshJudgmentText };
export type { RefreshState, ReleaseState };
