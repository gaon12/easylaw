"use server";

import { revalidatePath } from "next/cache";
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

export { refreshJudgmentText };
export type { RefreshState };
