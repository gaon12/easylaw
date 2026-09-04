"use server";

import { appDb } from "@/db/client";
import { createLawApi } from "@/lib/law-api/client";
import { createLlmClient } from "@/lib/llm/client";
import { type ProbeResult, probeLawApi, probeLlm } from "./connection-test";
import { currentSession } from "./owner";
import { isSetupComplete } from "./settings";

interface SetupConnectionProbeState {
  readonly law?: ProbeResult;
  readonly llm?: ProbeResult;
  readonly denied?: boolean;
}

function value(formData: FormData, name: string): string {
  const item = formData.get(name);
  return typeof item === "string" ? item.trim() : "";
}

/** 설치 중 입력한 값만 시험한다. 시험 자체가 설정을 저장하지는 않는다. */
async function probeSetupConnections(
  _previous: SetupConnectionProbeState,
  formData: FormData,
): Promise<SetupConnectionProbeState> {
  const session = await currentSession();
  if (isSetupComplete(appDb()) || session?.role !== "admin") {
    return { denied: true };
  }

  const lawKey = value(formData, "law_api_oc");
  const baseUrl = value(formData, "llm_base_url");
  const apiKey = value(formData, "llm_api_key");
  const model = value(formData, "llm_model") || "claude-sonnet-5";

  const law = await probeLawApi(lawKey.length === 0 ? undefined : createLawApi(lawKey));
  const llm =
    baseUrl.length === 0 || apiKey.length === 0
      ? await probeLlm(undefined)
      : await probeLlm(createLlmClient({ baseUrl, apiKey, model }));

  return { law, llm };
}

export { probeSetupConnections };
export type { SetupConnectionProbeState };
