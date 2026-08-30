"use server";

import { redirect } from "next/navigation";
import { deleteUpload } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { currentOwnerId } from "@/server/owner";

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

export { deleteDoc };
