"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { deleteUpload, findUploadForOwner } from "@/db/app/repository";
import { appDb } from "@/db/client";
import type { Level } from "@/db/corpus/repository";
import { checkDocumentLength } from "@/lib/generation-limit";
import type { RejectReason } from "@/lib/text/prepare";
import { MAX_CHARS } from "@/lib/text/prepare";
import { type FileProblem, readUploadedFile } from "@/lib/text/upload-file";
import { beginGeneration, runGeneration } from "@/server/generate";
import { currentOwnerId } from "@/server/owner";
import { docStore } from "@/server/pipeline-store";
import { ingestUploadRevision } from "@/server/upload";

type ReplaceError =
  | RejectReason
  | FileProblem
  | "sign_in_required"
  | "not_found"
  | "confirm_required";
interface ReplaceState {
  readonly error?: ReplaceError;
  readonly success?: "created" | "same";
  readonly text?: string;
}

const DOCUMENT_CONFIRM_AFTER = 80_000;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * 문서 삭제. `PAGES.md` §15 · §17
 *
 * 되돌릴 수 없는 동작이라 소유자 확인을 여기서 다시 한다. 화면에 버튼이 보였다는 것은
 * 권한의 증거가 아니다 — 서버 액션은 폼을 거치지 않고도 호출된다(Next 문서 "Security").
 */
async function deleteDoc(formData: FormData): Promise<void> {
  const docId = formData.get("docId");
  if (typeof docId !== "string" || docId.length === 0) {
    return;
  }

  const ownerId = await currentOwnerId();
  if (ownerId === undefined) {
    return;
  }

  // 주인이 아니면 아무 일도 일어나지 않는다. 저장소가 소유자 조건을 함께 건다.
  deleteUpload(appDb(), docId, ownerId);

  redirect("/cases");
}

/** 같은 문서의 새 원문판. 과거 판과 그 설명은 보존하고 현재 포인터만 바꾼다. */
async function replaceDocRevision(
  _previous: ReplaceState,
  formData: FormData,
): Promise<ReplaceState> {
  const docId = field(formData, "docId");
  const pasted = field(formData, "text");
  const file = formData.get("file");
  let raw = pasted;

  if (file instanceof File && file.size > 0) {
    const read = await readUploadedFile(file);
    if ("error" in read) {
      return { error: read.error, text: pasted };
    }
    raw = read.text;
  }

  const length = checkDocumentLength({
    charCount: raw.length,
    confirmAfter: DOCUMENT_CONFIRM_AFTER,
    maxChars: MAX_CHARS,
    confirmed: field(formData, "confirmLongDocument") === "on",
  });
  if (length.kind === "too_long") {
    return { error: "too_long", text: pasted };
  }
  if (length.kind === "confirm") {
    return { error: "confirm_required", text: pasted };
  }

  const ownerId = await currentOwnerId();
  if (ownerId === undefined) {
    return { error: "sign_in_required", text: pasted };
  }
  const result = ingestUploadRevision(appDb(), { ownerId, uploadId: docId, raw });
  if (result.kind === "rejected") {
    return { error: result.reason, text: pasted };
  }
  if (result.kind === "not_found") {
    return { error: "not_found", text: pasted };
  }

  revalidatePath(`/doc/${docId}`);
  return { success: result.created ? "created" : "same" };
}

/**
 * 올린 판결문의 설명 만들기. `PRODUCT.md` §5.1 · §5.3
 *
 * 공개 판례 쪽(`case/[caseNo]/actions.ts`)과 같은 흐름이고, **다른 것은 소유자 확인**
 * 하나다. 서버 액션은 폼을 거치지 않고도 불리므로(Next 문서 "Security") 문서 id를
 * 받은 그대로 믿지 않고 주인의 문서인지 먼저 본다 — 남의 문서로 생성을 걸면 그 사람의
 * 판결문이 모델로 나간다.
 *
 * 자리를 잡는 것(`beginGeneration`)은 이 요청 안에서 끝내고, 수십 초 걸리는 일은
 * `after()`로 응답 뒤에 이어 돌린다.
 */
async function requestDocGeneration(formData: FormData): Promise<void> {
  const docId = formData.get("docId");
  const rawLevel = formData.get("level");
  if (typeof docId !== "string" || typeof rawLevel !== "string") {
    return;
  }

  const levels: readonly string[] = ["L1", "L2", "L3", "L4"];
  if (!levels.includes(rawLevel)) {
    return;
  }

  const ownerId = await currentOwnerId();
  if (ownerId === undefined) {
    return;
  }
  if (findUploadForOwner(appDb(), docId, ownerId) === undefined) {
    return;
  }

  const level = rawLevel as Level;
  const store = docStore(docId);
  const begun = beginGeneration(store, level);
  if (begun.kind === "claimed") {
    after(async () => {
      await runGeneration(store, level, begun.jobId, { runtime: begun.runtime });
    });
  }

  revalidatePath(`/doc/${docId}`);
}

export { deleteDoc, replaceDocRevision, requestDocGeneration };
export type { ReplaceError, ReplaceState };
