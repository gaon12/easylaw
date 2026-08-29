"use server";

import { redirect } from "next/navigation";
import { appDb } from "@/db/client";
import type { RejectReason } from "@/lib/text/prepare";
import { currentOwnerId } from "@/server/owner";
import { ingestUpload, isRetentionChoice } from "@/server/upload";

/**
 * 업로드 서버 액션. `PAGES.md` §4
 *
 * 서버 액션은 폼을 거치지 않고도 호출될 수 있는 공개 진입점이다(Next 문서 "Security").
 * 그래서 들어오는 값을 전부 다시 검사한다 — 화면에서 select로 골랐다는 사실은 보증이 아니다.
 */

type ErrorCode = RejectReason | "file_unreadable" | "sign_in_required";

interface UploadState {
  readonly error?: ErrorCode;
  /** 실패했을 때 붙여 넣은 내용을 돌려준다. 긴 글을 다시 붙여 넣게 하지 않는다. */
  readonly text?: string;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function createUpload(_previous: UploadState, formData: FormData): Promise<UploadState> {
  const pasted = field(formData, "text");
  const file = formData.get("file");

  let raw = pasted;
  let filename: string | null = null;

  if (file instanceof File && file.size > 0) {
    try {
      // 파일을 골랐으면 파일이 이긴다. 둘 다 채운 경우를 조용히 합치면 무엇이 저장됐는지 알 수 없다.
      raw = await file.text();
      filename = file.name;
    } catch {
      return { error: "file_unreadable", text: pasted };
    }
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
