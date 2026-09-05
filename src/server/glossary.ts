import "server-only";
import { and, eq } from "drizzle-orm";
import { dictDb } from "@/db/client";
import { dictEntry, legalTerm } from "@/db/dict/schema";
import { candidateTerms } from "@/lib/dict/terms";
import { lawApi } from "@/lib/law-api/client";

/**
 * 낱말의 뜻을 찾는다. [F-29] · `PRODUCT.md` §6.2
 *
 * **뜻풀이는 생성물이 아니다.** 이 파일이 있는 이유가 그것이다 — "과태료"의 뜻을 모델이
 * 지어내게 두면 틀려도 그럴듯해서 아무도 못 잡는다. 공식 정의를 찾아 **모델에게 주고**,
 * 모델은 그 뜻을 이 사건 문맥에 맞게 옮기기만 한다.
 *
 * ## 찾는 순서 — 근거가 센 것부터
 *
 * 1. **법령용어**(법제처). 법령이 스스로 내린 정의다. 근거가 가장 세다.
 * 2. **표준국어대사전의 법률 분야 뜻.** 같은 글자라도 법률 뜻을 골라야 한다 —
 *    "기각"의 일상 뜻과 법률 뜻은 다른 말이다.
 * 3. **표준국어대사전의 첫 뜻.** 법률 낱말이 아닌 것(예: 어린이가 모를 일상 낱말)까지
 *    풀어 줄 수 있어야 하므로 여기까지 내려간다.
 *
 * 하나도 없으면 **아무것도 돌려주지 않는다.** 그때는 모델에게 그 낱말의 뜻을 주지 않고,
 * 모델도 풀이를 쓰지 않는다. 없는 것을 지어내는 것보다 말하지 않는 편이 낫다.
 */

interface Gloss {
  readonly term: string;
  readonly definition: string;
  /* 어디서 온 뜻인가. **화면과 프롬프트에 그대로 밝힌다.** */
  readonly source: string;
  /** 법률 분야의 뜻인가. 아니면 일상 낱말 풀이다. */
  readonly legal: boolean;
}

/** 법령용어를 밖에서 받아 올 때의 여유. 생성 도중이라 오래 붙잡고 있을 수 없다. */
const API_TIMEOUT_MS = 5000;

/** 한 번에 얼마나 많은 낱말을 풀어 줄까. 프롬프트가 뜻풀이로 뒤덮이면 안 된다. */
const MAX_TERMS = 12;

function fromLegalCache(term: string): Gloss | undefined {
  const row = dictDb()
    .select()
    .from(legalTerm)
    .where(eq(legalTerm.term, term))
    .limit(1)
    .all()
    .at(0);

  return row === undefined
    ? undefined
    : {
        term,
        definition: row.definition,
        source: row.source ?? row.dictionary ?? "법령용어",
        legal: true,
      };
}

/**
 * 법제처에서 받아 사전 DB에 남긴다.
 *
 * **한 번 받으면 다시 묻지 않는다.** 판결문마다 같은 낱말이 되풀이해서 나오는데, 그때마다
 * 밖에 물으면 생성이 그만큼 느려지고 남의 서버도 두드린다.
 */
async function fetchLegal(term: string): Promise<Gloss | undefined> {
  const api = lawApi();
  if (api === undefined) {
    return;
  }

  const found = await api.searchTerms(term, AbortSignal.timeout(API_TIMEOUT_MS));
  const exact = found.items.find((item) => item.term === term);
  if (exact === undefined || exact.termIds.length === 0) {
    return;
  }

  const definitions = await api.fetchTerms(exact.termIds, AbortSignal.timeout(API_TIMEOUT_MS));
  const usable = definitions.filter((entry) => entry.definition.trim().length > 0);
  if (usable.length === 0) {
    return;
  }

  dictDb()
    .insert(legalTerm)
    .values(
      usable.map((entry, index) => ({
        id: entry.termId ?? `${term}-${index}`,
        term: entry.term.length > 0 ? entry.term : term,
        hanja: entry.hanja ?? null,
        definition: entry.definition,
        source: entry.source ?? null,
        dictionary: entry.dictionary ?? null,
      })),
    )
    .onConflictDoNothing()
    .run();

  const first = usable[0];
  return first === undefined
    ? undefined
    : {
        term,
        definition: first.definition,
        source: first.source ?? first.dictionary ?? "법령용어",
        legal: true,
      };
}

/** 표준국어대사전. 법률 분야를 먼저 보고, 없으면 첫 뜻을 쓴다. */
function fromDictionary(term: string): Gloss | undefined {
  const db = dictDb();
  const legal = db
    .select()
    .from(dictEntry)
    .where(and(eq(dictEntry.word, term), eq(dictEntry.category, "법률")))
    .orderBy(dictEntry.senseOrder)
    .limit(1)
    .all()
    .at(0);

  const row =
    legal ??
    db
      .select()
      .from(dictEntry)
      .where(eq(dictEntry.word, term))
      .orderBy(dictEntry.senseOrder)
      .limit(1)
      .all()
      .at(0);

  return row === undefined
    ? undefined
    : {
        term,
        definition: row.definition,
        source: "표준국어대사전",
        legal: row.category === "법률",
      };
}

/**
 * 낱말 하나의 뜻. 못 찾으면 `undefined`.
 *
 * 밖에 묻는 일이 실패해도 **던지지 않는다.** 뜻풀이를 못 붙이는 것은 설명을 못 만드는
 * 것보다 훨씬 가벼운 일이라, 여기서 생성 전체를 멈추게 두지 않는다.
 */
async function glossFor(term: string): Promise<Gloss | undefined> {
  const cached = fromLegalCache(term);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const fetched = await fetchLegal(term);
    if (fetched !== undefined) {
      return fetched;
    }
  } catch {
    // 법제처가 느리거나 키가 없다. 사전으로 내려간다.
  }

  return fromDictionary(term);
}

/**
 * 여러 낱말의 뜻을 한 번에. 찾은 것만 돌려준다.
 *
 * 순서를 지킨다 — 부르는 쪽이 "이 판결문에서 어려운 순서"로 넘기기 때문이다.
 */
async function glossesFor(terms: readonly string[]): Promise<Gloss[]> {
  const wanted = [...new Set(terms)].slice(0, MAX_TERMS);
  const found = await Promise.all(wanted.map((term) => glossFor(term)));
  return found.filter((gloss): gloss is Gloss => gloss !== undefined);
}

/**
 * 판결문 구조에서 **풀이가 필요한 낱말**만 골라 뜻을 붙인다.
 *
 * 후보를 뽑는 규칙은 `lib/dict/terms.ts`에 있고, 여기서는 그 후보를 사전에 물어본다.
 * **긴 형태부터 물어 처음 맞는 것에서 멈춘다** — 그래야 `과태`가 아니라 `과태료`가 잡힌다.
 *
 * 법령용어를 밖에서 받아 오는 일은 여기서 하지 않는다. 한 판결문에 후보가 수십 개인데
 * 그때마다 밖에 물으면 생성이 몇 배로 느려진다. **이미 받아 둔 것과 사전만 본다** —
 * 법령용어 캐시는 `glossFor`를 직접 부르는 자리(연결 시험·관리 화면)에서 채워진다.
 */
function glossesInText(text: string): Gloss[] {
  const found: Gloss[] = [];
  const seen = new Set<string>();

  for (const candidate of candidateTerms(text)) {
    if (found.length >= MAX_TERMS) {
      break;
    }
    for (const form of candidate.forms) {
      const gloss = fromLegalCache(form) ?? fromDictionary(form);
      /*
       * **법률 분야의 뜻만 붙인다.** 일상 낱말까지 풀면 "그만두다"에 뜻이 달리고, 정작
       * 어려운 낱말이 그 사이에 묻힌다. 어린이·쉬운말 단계에서 특히 그렇다.
       */
      if (gloss?.legal === true && !seen.has(gloss.term)) {
        seen.add(gloss.term);
        found.push(gloss);
        break;
      }
    }
  }

  return found;
}

export { glossesFor, glossesInText, glossFor };
export type { Gloss };
