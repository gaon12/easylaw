"use server";

import { revalidatePath } from "next/cache";
import { updateNickname } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { type CredentialProblem, validateNickname } from "@/lib/credentials";
import { currentSession } from "@/server/owner";

/**
 * 계정 설정 서버 액션. `PAGES.md` §17
 *
 * **서버 액션은 폼을 거치지 않고도 불린다**(Next 문서 "Security"). 그래서 로그인 여부를
 * 여기서 다시 본다 — 화면이 막았다는 사실은 아무것도 보장하지 않는다.
 */

interface AccountState {
  readonly problem?: CredentialProblem;
  /** 저장했다는 것을 화면이 알리는 데 쓴다. */
  readonly saved?: boolean;
  /** 실패했을 때 고치던 값을 그대로 돌려준다. */
  readonly nickname?: string;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function changeNickname(_previous: AccountState, formData: FormData): Promise<AccountState> {
  const session = await currentSession();
  if (session === undefined) {
    // 로그인이 풀린 뒤 폼만 남아 있는 경우다. 조용히 아무 일도 하지 않는다.
    return {};
  }

  const raw = field(formData, "nickname");
  const validated = validateNickname(raw);
  if (!validated.ok) {
    return { problem: validated.problem, nickname: raw };
  }

  updateNickname(appDb(), session.userId, validated.nickname);

  /*
   * 헤더가 이름과 아바타를 보여 주므로 **모든 화면**을 다시 그려야 한다.
   * 이 화면만 갱신하면 다른 화면으로 넘어갈 때까지 옛 이름이 남는다.
   */
  revalidatePath("/", "layout");
  return { saved: true, nickname: validated.nickname };
}

export { changeNickname };
export type { AccountState };
