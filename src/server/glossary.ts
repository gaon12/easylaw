import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
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
 *
 * ## 어느 뜻으로 쓰였는지는 여기서 정하지 않는다
 *
 * 사전은 글자만 보고 찾으므로 `정상`처럼 **법률 뜻이 딸린 흔한 낱말**도 걸린다. 판결문의
 * `정상`은 대개 情狀이 아니라 "정상 수준"의 그 정상이고, 그때 법률 뜻을 달면 틀린 풀이가 된다.
 *
 * 그 판단은 **문장을 쓰는 쪽에 맡긴다.** 문맥을 보는 것은 거기뿐이고, 지시문이 "이 판결문에서
 * 쓰인 뜻과 다르면 풀이하지 말라"고 못박는다(`render-prompt.ts`). 나눠 두면 각자 잘하는 일을
 * 한다 — **뜻은 사전에서 오고, 쓸지 말지는 문맥이 정한다.** 우리가 순위를 매겨 걸러 보기도
 * 했는데, `해태`처럼 뜻이 여럿이면서 그 판결문의 핵심인 낱말이 잘려 나갔다.
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

/** 한 질의에 실을 낱말 수. SQLite의 바인딩 개수 한도에 여유를 둔다. */
const QUERY_CHUNK = 400;

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
 * 후보 형태들을 **한 번에** 물어 법률 뜻만 받아 온다.
 *
 * 예전에는 형태마다 따로 물었다. 60문장짜리 판결문 하나에 물어볼 형태가 306개였고
 * 185ms가 들었다 — 왕복이 곧 비용인데, 답은 두 번의 질의로 다 나온다.
 *
 * **법률 분야만 묻는다.** 어차피 그것만 쓴다(아래 `glossesInText` 참조). 조건을 SQL에
 * 실으면 509,138행에서 8,307행만 훑는다.
 */
function legalGlossesFor(forms: readonly string[]): Map<string, Gloss> {
  const found = new Map<string, Gloss>();
  if (forms.length === 0) {
    return found;
  }

  const db = dictDb();

  /*
   * 바인딩 개수 한도를 넘기지 않으려고 나눠 묻는다. 지금 자료로는 한 번에 끝나지만,
   * 판결문이 길어지면 후보가 늘어난다.
   */
  for (let at = 0; at < forms.length; at += QUERY_CHUNK) {
    const chunk = forms.slice(at, at + QUERY_CHUNK);

    /* 표준국어대사전을 먼저 담고 법령용어로 덮는다 — 법령이 내린 정의가 근거가 더 세다. */
    for (const row of db
      .select({ word: dictEntry.word, definition: dictEntry.definition })
      .from(dictEntry)
      .where(and(inArray(dictEntry.word, chunk), eq(dictEntry.category, "법률")))
      .orderBy(desc(dictEntry.senseOrder))
      .all()) {
      found.set(row.word, {
        term: row.word,
        definition: row.definition,
        source: "표준국어대사전",
        legal: true,
      });
    }

    for (const row of db
      .select({ term: legalTerm.term, definition: legalTerm.definition, source: legalTerm.source })
      .from(legalTerm)
      .where(inArray(legalTerm.term, chunk))
      .all()) {
      /* 법령이 스스로 내린 정의다. 다른 뜻과 헷갈릴 일이 가장 적으므로 맨 앞에 둔다. */
      found.set(row.term, {
        term: row.term,
        definition: row.definition,
        source: row.source ?? "법령용어",
        legal: true,
      });
    }
  }

  return found;
}

/**
 * 판결문 구조에서 **풀이가 필요한 낱말**만 골라 뜻을 붙인다.
 *
 * 후보를 뽑는 규칙은 `lib/dict/terms.ts`에 있고, 여기서는 그 후보를 사전에 물어본다.
 * **긴 형태부터 물어 처음 맞는 것에서 멈춘다** — 그래야 `과태`가 아니라 `과태료`가 잡힌다.
 *
 * ## 밖으로 한 글자도 내보내지 않는다
 *
 * **이 함수는 오직 우리 DB만 본다.** 생성 파이프라인이 이것을 부르는데, 그때 넘어오는 글은
 * 공개 판례일 수도 있지만 **사람이 올린 판결문**일 수도 있다(`docStore`). 올린 문서의
 * 낱말을 법제처에 물으면, 그 사람이 어떤 사건을 들고 왔는지가 남의 서버 로그에 남는다.
 * 그것은 이 서비스가 파일을 나눠 가며 지키려는 것과 정면으로 어긋난다(§6.1).
 *
 * 그래서 법령용어는 **이미 받아 둔 것만** 본다. 밖에 묻는 `glossFor`는 낱말 하나를 사람이
 * 직접 물을 때를 위한 것이고, 여기서 부르지 않는다. 이 구분을 지우지 말 것.
 */
function glossesInText(text: string): Gloss[] {
  const candidates = candidateTerms(text);
  const forms = [...new Set(candidates.flatMap((candidate) => candidate.forms))];
  const known = legalGlossesFor(forms);

  const found: Gloss[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (found.length >= MAX_TERMS) {
      break;
    }
    /* 긴 형태부터 본다 — 그래야 `과태`가 아니라 `과태료`가 잡힌다. */
    for (const form of candidate.forms) {
      const gloss = known.get(form);
      if (gloss !== undefined && !seen.has(gloss.term)) {
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
