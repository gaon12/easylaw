"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { corpusDb } from "@/db/client";
import { findJudgmentByCaseNo, type Level } from "@/db/corpus/repository";
import { toCanonicalCaseNumber } from "@/lib/case-number/normalize";
import { beginGeneration, runGeneration } from "@/server/generate";
import { caseStore } from "@/server/pipeline-store";

/**
 * 설명 만들기. `PRODUCT.md` §5.1 · §5.3
 *
 * **서버 액션은 폼을 거치지 않고도 불린다**(Next 문서 "Security"). 그래서 사건번호를
 * 받은 그대로 믿지 않고 정규화한 뒤 코퍼스에서 찾는다 — 없는 판결문으로 생성을 걸면
 * 그것만으로 하루 상한을 갉아먹을 수 있다.
 *
 * 결과를 돌려주지 않고 화면을 다시 그리게 한다. 만들어졌으면 그 설명이, 이미 만들고
 * 있으면 그 안내가 나온다. 상태를 두 곳(액션의 반환값과 DB)에 두지 않는다.
 *
 * **자리를 잡는 것과 만드는 것을 나눈다.** 선점(`beginGeneration`)은 이 요청 안에서 끝내야
 * 화면이 곧바로 "만들고 있어요"를 그릴 수 있고, 수십 초 걸리는 일(`runGeneration`)은
 * `after()`로 응답 뒤에 이어 돌린다. 예전처럼 액션 안에서 끝까지 기다리면 그동안 브라우저는
 * 흰 화면을 들고 있고, 되돌아온 뒤에야 결과를 안다.
 */
async function requestGeneration(formData: FormData): Promise<void> {
  const rawCaseNo = formData.get("caseNo");
  const rawLevel = formData.get("level");
  if (typeof rawCaseNo !== "string" || typeof rawLevel !== "string") {
    return;
  }

  const canonical = toCanonicalCaseNumber(rawCaseNo);
  if (canonical === undefined) {
    return;
  }

  const levels: readonly string[] = ["L1", "L2", "L3", "L4"];
  if (!levels.includes(rawLevel)) {
    return;
  }

  const judgment = findJudgmentByCaseNo(corpusDb(), canonical);
  if (judgment === undefined) {
    return;
  }

  const level = rawLevel as Level;
  const store = caseStore(judgment.id);
  const begun = beginGeneration(store, level);
  if (begun.kind === "claimed") {
    /*
     * 응답을 보낸 뒤에 돌린다. 실패해도 여기서 붙잡지 않는다 — `runGeneration`이 어떤
     * 끝이든 작업을 닫고, 화면은 그 작업 상태를 보고 말한다.
     */
    after(async () => {
      await runGeneration(store, level, begun.jobId);
    });
  }

  revalidatePath(`/case/${canonical}`);
}

export { requestGeneration };
