"use server";

import { revalidatePath } from "next/cache";
import { corpusDb } from "@/db/client";
import { findJudgmentByCaseNo, type Level } from "@/db/corpus/repository";
import { toCanonicalCaseNumber } from "@/lib/case-number/normalize";
import { generateRendition } from "@/server/generate";

/**
 * 설명 만들기. `PRODUCT.md` §5.1 · §5.3
 *
 * **서버 액션은 폼을 거치지 않고도 불린다**(Next 문서 "Security"). 그래서 사건번호를
 * 받은 그대로 믿지 않고 정규화한 뒤 코퍼스에서 찾는다 — 없는 판결문으로 생성을 걸면
 * 그것만으로 하루 상한을 갉아먹을 수 있다.
 *
 * 결과를 돌려주지 않고 화면을 다시 그리게 한다. 만들어졌으면 그 설명이, 이미 만들고
 * 있으면 그 안내가 나온다. 상태를 두 곳(액션의 반환값과 DB)에 두지 않는다.
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

  await generateRendition(judgment.id, rawLevel as Level);
  revalidatePath(`/case/${canonical}`);
}

export { requestGeneration };
