"use server";

import { redirect } from "next/navigation";
import { hasAdmin } from "@/db/app/repository";
import { appDb } from "@/db/client";
import type { AuthProblem } from "./auth";
import { signUp } from "./auth";
import { currentSession } from "./owner";
import { isSetupComplete, markSetupComplete, type SettingKey, writeSettings } from "./settings";

/**
 * 설치 마법사 서버 액션. `PAGES.md` §17
 *
 * **모든 액션이 설치 완료 여부를 다시 확인한다.** 서버 액션은 폼을 거치지 않고도 호출되는
 * 공개 진입점이라(Next 문서 "Security"), 화면이 닫혔다는 사실은 아무것도 보장하지 않는다.
 * 이 액션들은 관리자를 만들고 서비스 설정을 바꾸므로, 설치가 끝난 뒤에 한 번이라도
 * 통하면 그것으로 서버를 빼앗긴다.
 */

interface SetupState {
  readonly problem?: AuthProblem | "already_done";
  readonly email?: string;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** 1단계 — 관리자 계정. 만들면 곧바로 로그인 상태가 된다. */
async function createAdmin(_previous: SetupState, formData: FormData): Promise<SetupState> {
  const db = appDb();
  if (isSetupComplete(db) || hasAdmin(db)) {
    // 이미 관리자가 있으면 두 번째 관리자를 만들 수 없다. 첫 사람만 관리자다.
    return { problem: "already_done" };
  }

  const email = field(formData, "email");
  const result = await signUp(email, field(formData, "password"), "admin");
  if (!result.ok) {
    return { problem: result.problem, email };
  }

  redirect("/setup/connections");
}

/** 2단계 — 외부 연결. 비워 두면 그 기능만 꺼진 채로 넘어간다. */
async function saveConnections(formData: FormData): Promise<void> {
  const db = appDb();
  const session = await currentSession();
  if (isSetupComplete(db) || session?.role !== "admin") {
    return;
  }

  const values: Partial<Record<SettingKey, string>> = {
    law_api_oc: field(formData, "law_api_oc"),
    llm_base_url: field(formData, "llm_base_url"),
    llm_api_key: field(formData, "llm_api_key"),
    llm_model: field(formData, "llm_model"),
    generation_daily_limit: field(formData, "generation_daily_limit"),
  };
  writeSettings(db, values, session.userId);

  redirect("/setup/done");
}

/**
 * 3단계 — 완료 표시.
 *
 * 이 값이 찍히는 순간 마법사는 영영 닫힌다. 그래서 자동으로 찍지 않고 사람이 버튼을
 * 누르게 한다 — 되돌릴 수 없는 동작을 화면 이동만으로 일으키지 않는다.
 */
async function finishSetup(): Promise<void> {
  const db = appDb();
  const session = await currentSession();
  if (isSetupComplete(db) || session?.role !== "admin") {
    return;
  }

  markSetupComplete(db, session.userId);
  redirect("/");
}

/** 설치 뒤 관리자 화면에서 설정을 고친다. */
async function saveSettings(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (session?.role !== "admin") {
    return;
  }

  const values: Partial<Record<SettingKey, string>> = {
    law_api_oc: field(formData, "law_api_oc"),
    llm_base_url: field(formData, "llm_base_url"),
    llm_api_key: field(formData, "llm_api_key"),
    llm_model: field(formData, "llm_model"),
    generation_daily_limit: field(formData, "generation_daily_limit"),
  };

  /*
   * 비밀 항목은 화면에 값을 되돌려 주지 않으므로 폼에도 빈 칸으로 온다.
   * 빈 칸을 그대로 저장하면 "저장" 한 번에 키가 지워진다 — 빈 칸은 "그대로 두기"로 읽는다.
   * 지우고 싶을 때는 공백을 넣으라고 화면에서 안내한다.
   */
  if (values.law_api_oc === "") {
    values.law_api_oc = undefined;
  }
  if (values.llm_api_key === "") {
    values.llm_api_key = undefined;
  }

  writeSettings(appDb(), values, session.userId);
  redirect("/admin?saved=1");
}

export { createAdmin, finishSetup, saveConnections, saveSettings };
export type { SetupState };
