"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteAccount,
  deleteAllUploads,
  findUserById,
  updateRetention,
} from "@/db/app/repository";
import { appDb } from "@/db/client";
import { currentSession, endSession } from "@/server/owner";
import { verifyPassword } from "@/server/password";
import { isRetentionChoice, retentionUntil } from "@/server/upload";

/**
 * 내 자료 서버 액션. `PAGES.md` §17
 *
 * 여기 있는 것은 전부 **되돌릴 수 없다.** 그래서 두 가지를 지킨다.
 *
 * 1. **로그인 확인을 여기서 다시 한다.** 서버 액션은 폼을 거치지 않고도 불린다
 *    (Next 문서 "Security"). 화면이 폼을 감췄다는 사실은 아무것도 보증하지 않는다.
 * 2. **비밀번호를 다시 받는다.** 세션 쿠키만으로 계정을 없앨 수 있으면, 잠기지 않은
 *    화면 앞에 잠깐 앉은 사람이 그 일을 할 수 있다. 확인 문구를 받아 적게 하는 방법은
 *    손이 미끄러지는 것만 막고 그 경우는 못 막는다.
 */

type DataProblem = "sign_in_required" | "password_wrong" | "not_found";

interface DataState {
  readonly problem?: DataProblem;
  /** 무엇을 했는지 화면이 알리는 데 쓴다. */
  readonly done?: "retention" | "docs_deleted";
  /** 지운 문서 수. `docs_deleted`일 때만 있다. */
  readonly count?: number;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * 비밀번호를 다시 확인한다.
 *
 * **계정이 없거나 비밀번호가 없는 경우도 실패로 본다.** 가입 전 계정에는
 * `password_hash`가 null인데, 그때 "비밀번호가 비었으니 통과"가 되면 아무나 지울 수 있다.
 */
function passwordMatches(userId: string, password: string): boolean {
  const account = findUserById(appDb(), userId);
  if (account?.passwordHash == null || password.length === 0) {
    return false;
  }
  return verifyPassword(password, account.passwordHash);
}

/**
 * 문서 하나의 보관 기간을 바꾼다.
 *
 * 되돌릴 수 있는 동작이라 비밀번호를 묻지 않는다 — 언제든 다시 바꾸면 된다.
 * 기간을 **줄이는 것도 허용한다**(`repository.ts`).
 */
async function changeRetention(_previous: DataState, formData: FormData): Promise<DataState> {
  const session = await currentSession();
  if (session === undefined) {
    return { problem: "sign_in_required" };
  }

  const docId = field(formData, "docId");
  const choice = field(formData, "retention");
  if (docId.length === 0 || !isRetentionChoice(choice)) {
    return { problem: "not_found" };
  }

  // 저장소가 소유자 조건을 함께 건다. 남의 문서면 아무 일도 일어나지 않는다.
  const changed = updateRetention(
    appDb(),
    docId,
    session.userId,
    retentionUntil(choice, new Date()),
  );
  if (!changed) {
    return { problem: "not_found" };
  }

  // 문서함과 문서 화면이 보관 기한을 보여 준다.
  revalidatePath("/", "layout");
  return { done: "retention" };
}

/** 내 문서를 전부 지운다. 계정은 남는다. */
async function deleteAllDocs(_previous: DataState, formData: FormData): Promise<DataState> {
  const session = await currentSession();
  if (session === undefined) {
    return { problem: "sign_in_required" };
  }
  if (!passwordMatches(session.userId, field(formData, "password"))) {
    return { problem: "password_wrong" };
  }

  const count = deleteAllUploads(appDb(), session.userId);

  revalidatePath("/", "layout");
  return { done: "docs_deleted", count };
}

/**
 * 계정을 지운다.
 *
 * 지운 뒤 **쿠키를 치우고 첫 화면으로 보낸다.** 세션 행은 외래 키가 함께 가져가므로
 * 그대로 두어도 아무 데도 못 가지만, 죽은 쿠키를 브라우저에 남겨 둘 이유가 없다.
 */
async function deleteMyAccount(_previous: DataState, formData: FormData): Promise<DataState> {
  const session = await currentSession();
  if (session === undefined) {
    return { problem: "sign_in_required" };
  }
  if (!passwordMatches(session.userId, field(formData, "password"))) {
    return { problem: "password_wrong" };
  }

  deleteAccount(appDb(), session.userId);
  await endSession();

  // redirect는 예외를 던져 흐름을 끊는다. 뒤에 코드를 두지 않는다.
  redirect("/");
}

export { changeRetention, deleteAllDocs, deleteMyAccount };
export type { DataProblem, DataState };
