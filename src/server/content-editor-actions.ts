"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/db/app/repository";
import { appDb, corpusDb } from "@/db/client";
import { createEditedRendition } from "@/db/corpus/repository";
import { canEditContent } from "@/lib/content-permissions";
import { currentSession } from "./owner";

interface EditRenditionState {
  readonly problem?: string;
}

const EDIT_PROBLEMS = {
  not_found: "판결문이나 편집할 설명을 찾을 수 없어요.",
  stale: "원문이 바뀌었어요. 현재 원문으로 만든 설명을 다시 열어 주세요.",
  invalid_sentences: "모든 문장을 확인해 주세요. 사전 뜻풀이는 이 화면에서 바꿀 수 없어요.",
} as const;

/** 기존 설명은 보존하고, 화면에서 고친 문장으로 새 검수 초안을 만든다. */
async function saveEditedRendition(
  _previous: EditRenditionState,
  formData: FormData,
): Promise<EditRenditionState> {
  const session = await currentSession();
  if (session === undefined || !canEditContent(session.role)) {
    return { problem: "작성자 또는 관리자만 설명을 고칠 수 있어요." };
  }

  const judgmentId = String(formData.get("judgment_id") ?? "").trim();
  const baseRenditionId = String(formData.get("base_rendition_id") ?? "").trim();
  const sentenceIds = formData.getAll("sentence_id").map((value) => String(value).trim());
  const sentenceTexts = formData.getAll("sentence_text").map((value) => String(value));
  if (
    judgmentId.length === 0 ||
    baseRenditionId.length === 0 ||
    sentenceIds.length !== sentenceTexts.length
  ) {
    return { problem: EDIT_PROBLEMS.invalid_sentences };
  }

  const result = createEditedRendition(corpusDb(), {
    judgmentId,
    baseRenditionId,
    sentences: sentenceIds.map((id, index) => ({ id, text: sentenceTexts[index] ?? "" })),
  });
  if (!result.ok) {
    return { problem: EDIT_PROBLEMS[result.reason] };
  }

  recordAuditEvent(appDb(), {
    actorId: session.userId,
    action: "content.rendition_edited",
    targetId: result.renditionId,
    meta: { judgmentId, baseRenditionId },
  });
  revalidatePath(`/admin/content/judgments/${judgmentId}`);
  redirect(`/admin/content/judgments/${judgmentId}?edited=1`);
}

export { saveEditedRendition };
export type { EditRenditionState };
