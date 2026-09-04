"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { deleteUpload, findUploadForOwner } from "@/db/app/repository";
import { appDb } from "@/db/client";
import type { Level } from "@/db/corpus/repository";
import { beginGeneration, runGeneration } from "@/server/generate";
import { currentOwnerId } from "@/server/owner";
import { docStore } from "@/server/pipeline-store";

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
      await runGeneration(store, level, begun.jobId);
    });
  }

  revalidatePath(`/doc/${docId}`);
}

export { deleteDoc, requestDocGeneration };
