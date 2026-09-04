"use server";

import { redirect } from "next/navigation";
import { hasAdmin, type RoleChangeResult, setUserRole } from "@/db/app/repository";
import { appDb } from "@/db/client";
import type { AuthProblem } from "./auth";
import { signIn, signUp } from "./auth";
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

interface AdminRoleState {
  readonly problem?: Exclude<RoleChangeResult, "updated" | "unchanged">;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** 2단계 — 관리자 계정. 만들면 곧바로 로그인 상태가 된다. */
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

  redirect("/setup/service");
}

/**
 * 2단계 — 이미 있는 관리자로 다시 들어오기.
 *
 * **설치를 하다 만 경우가 흔하다.** 관리자를 만들고 창을 닫았거나, 쿠키가 지워졌거나,
 * 다른 브라우저로 열었거나. 그때 마법사가 "관리자가 이미 있다"며 다음 단계로 보내면
 * 3단계는 관리자 세션이 없다고 1단계로 되돌리고, 거기서 무한히 돈다.
 * 설치가 끝나기 전에는 `/login`도 `/setup`으로 돌아가므로 **빠져나갈 길이 없다.**
 *
 * 그래서 마법사 안에 로그인을 둔다. 만드는 것과 들어오는 것은 다른 일이고,
 * 둘 중 하나는 언제나 가능해야 한다.
 */
async function signInAdmin(_previous: SetupState, formData: FormData): Promise<SetupState> {
  if (isSetupComplete(appDb())) {
    return { problem: "already_done" };
  }

  const email = field(formData, "email");
  const result = await signIn(email, field(formData, "password"));
  if (!result.ok) {
    return { problem: result.problem, email };
  }

  redirect("/setup/service");
}

/**
 * 3단계 — 서비스 환경(시간대·https).
 *
 * 체크박스는 **꺼져 있으면 폼에 아예 오지 않는다.** 그래서 "값이 없음"을 "끔"으로 읽어야
 * 한다 — 없다고 그냥 두면 한 번 켠 뒤로 영영 못 끄게 된다.
 */
async function saveService(formData: FormData): Promise<void> {
  const db = appDb();
  const session = await currentSession();
  if (isSetupComplete(db) || session?.role !== "admin") {
    return;
  }

  writeSettings(
    db,
    {
      time_zone: field(formData, "time_zone"),
      secure_cookies: formData.get("secure_cookies") === "true" ? "true" : "false",
    },
    session.userId,
  );

  redirect("/setup/connections");
}

/** 4단계 — 외부 연결. 비워 두면 그 기능만 꺼진 채로 넘어간다. */
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
 * 5단계 — 완료 표시.
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
    time_zone: field(formData, "time_zone"),
    secure_cookies: formData.get("secure_cookies") === "true" ? "true" : "false",
    law_api_oc: field(formData, "law_api_oc"),
    llm_base_url: field(formData, "llm_base_url"),
    llm_api_key: field(formData, "llm_api_key"),
    llm_model: field(formData, "llm_model"),
    generation_daily_limit: field(formData, "generation_daily_limit"),
  };

  /*
   * 빈 칸은 **지우기**다.
   *
   * 예전에는 "그대로 두기"였다. 비밀 항목의 값을 화면에 돌려주지 않아서 폼에도 빈 칸으로
   * 왔고, 그것을 그대로 저장하면 모델 이름 하나 고치려다 API 키가 날아갔기 때문이다.
   * 이제 관리자 화면이 저장된 값을 가린 채로 채워 주므로(`SecretField`), 폼이 비어 있다는
   * 것은 사람이 실제로 지웠다는 뜻이다. 규칙이 하나가 됐다 —
   * **칸에 보이는 것이 곧 저장될 값이다.**
   */
  writeSettings(appDb(), values, session.userId);
  redirect("/admin?saved=1");
}

/** 관리자 화면에서 기존 가입자를 관리자로 지정한다. 비밀번호를 다루지 않는다. */
async function setAdminRole(
  _previous: AdminRoleState,
  formData: FormData,
): Promise<AdminRoleState> {
  const session = await currentSession();
  const targetId = field(formData, "user_id");
  if (session?.role !== "admin") {
    return { problem: "forbidden" };
  }
  if (targetId.length === 0) {
    return { problem: "not_found" };
  }

  const result = setUserRole(appDb(), session.userId, targetId, "admin");
  if (result !== "updated" && result !== "unchanged") {
    return { problem: result };
  }
  redirect("/admin?saved=1");
}

export {
  createAdmin,
  finishSetup,
  saveConnections,
  saveService,
  saveSettings,
  setAdminRole,
  signInAdmin,
};
export type { AdminRoleState, SetupState };
