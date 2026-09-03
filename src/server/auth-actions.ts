"use server";

import { redirect } from "next/navigation";
import { type AuthProblem, signIn, signOut, signUp } from "./auth";

/**
 * 가입·로그인·로그아웃 서버 액션. `PAGES.md` §17
 *
 * 페이지 폴더가 아니라 `src/server`에 둔다 — 헤더(사이트 셸)도 로그아웃 액션을 쓰기
 * 때문이다. 화면 하나에 매인 것이 아니면 화면 폴더에 두지 않는다.
 *
 * 세 가지를 한 파일에 두는 이유는 셋이 같은 상태 모양을 쓰기 때문이다. 화면은 둘이지만
 * 실패했을 때 돌려주는 것은 똑같이 "무엇이 문제였나"와 "다시 채워 넣을 이메일"이다.
 *
 * **비밀번호는 절대 돌려주지 않는다.** 실패 상태는 클라이언트로 직렬화되므로,
 * 편의를 위해 담아 보내면 그 순간 비밀번호가 HTML에 실린다.
 */

interface AuthState {
  readonly problem?: AuthProblem;
  /** 실패했을 때 다시 채워 줄 값. 비밀번호는 절대 넣지 않는다. */
  readonly email?: string;
  readonly nickname?: string;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function createAccount(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email");
  const nickname = field(formData, "nickname");
  const result = await signUp(email, field(formData, "password"), "member", nickname);

  if (!result.ok) {
    // 실패하면 이메일과 닉네임을 다시 채워 준다. 비밀번호는 돌려주지 않는다.
    return { problem: result.problem, email, nickname };
  }

  // redirect는 예외를 던져 흐름을 끊는다. try 안에 두지 않는다.
  redirect("/cases");
}

async function logIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email");
  const result = await signIn(email, field(formData, "password"));

  if (!result.ok) {
    return { problem: result.problem, email };
  }
  redirect("/cases");
}

async function logOut(): Promise<void> {
  await signOut();
  redirect("/");
}

export { createAccount, logIn, logOut };
export type { AuthState };
