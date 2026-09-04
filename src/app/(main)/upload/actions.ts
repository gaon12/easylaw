"use server";

import { redirect } from "next/navigation";
import { appDb } from "@/db/client";
import { checkDocumentLength } from "@/lib/generation-limit";
import type { RejectReason } from "@/lib/text/prepare";
import { MAX_CHARS } from "@/lib/text/prepare";
import { type FileProblem, readUploadedFile } from "@/lib/text/upload-file";
import { currentOwnerId } from "@/server/owner";
import { ingestUpload, isRetentionChoice } from "@/server/upload";

/**
 * 업로드 서버 액션. `PAGES.md` §4
 *
 * 서버 액션은 폼을 거치지 않고도 호출될 수 있는 공개 진입점이다(Next 문서 "Security").
 * 그래서 들어오는 값을 전부 다시 검사한다 — 화면에서 select로 골랐다는 사실은 보증이 아니다.
 */

type ErrorCode = RejectReason | FileProblem | "sign_in_required" | "confirm_required";

interface UploadState {
  readonly error?: ErrorCode;
  /** 실패했을 때 붙여 넣은 내용을 돌려준다. 긴 글을 다시 붙여 넣게 하지 않는다. */
  readonly text?: string;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const DOCUMENT_CONFIRM_AFTER = 80_000;

async function createUpload(_previous: UploadState, formData: FormData): Promise<UploadState> {
  const pasted = field(formData, "text");
  const file = formData.get("file");

  let raw = pasted;
  let filename: string | null = null;

  if (file instanceof File && file.size > 0) {
    // 파일을 골랐으면 파일이 이긴다. 둘 다 채운 경우를 조용히 합치면 무엇이 저장됐는지 알 수 없다.
    const read = await readUploadedFile(file);
    if ("error" in read) {
      return { error: read.error, text: pasted };
    }
    raw = read.text;
    filename = file.name;
  }

  /*
   * 긴 문서는 저장 전에 비용을 알려야 한다. 이 검사는 화면의 글자 수 표시가 아니라
   * 서버가 다시 계산한 값이다. `confirmed`는 첫 제출에서만 생기는 확인란 값이므로,
   * 자바스크립트 없이도 첫 응답에서 확인 UI를 그리고 다음 제출에서 진행할 수 있다.
   */
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

  const retentionRaw = field(formData, "retention");
  const retention = isRetentionChoice(retentionRaw) ? retentionRaw : "30";

  /*
   * 로그인 확인을 **여기서 다시 한다.** 화면에 폼이 보였다는 것은 권한의 증거가 아니다 —
   * 서버 액션은 폼을 거치지 않고도 호출된다(Next 문서 "Security").
   */
  const ownerId = await currentOwnerId();
  if (ownerId === undefined) {
    return { error: "sign_in_required", text: pasted };
  }

  const result = ingestUpload(appDb(), {
    ownerId,
    raw,
    filename,
    title: field(formData, "title"),
    caseNo: field(formData, "caseNo"),
    retention,
  });

  if (result.kind === "rejected") {
    return { error: result.reason, text: pasted };
  }

  // redirect는 예외를 던져 흐름을 끊는다. try 안에 두지 않는다.
  redirect(result.duplicate ? `/doc/${result.docId}?again=1` : `/doc/${result.docId}`);
}

export { createUpload };
export type { ErrorCode, UploadState };
