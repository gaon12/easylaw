/**
 * 법령용어 파서. [F-29] · `PRODUCT.md` §6.2 `term_gloss`
 *
 * biome-ignore-all lint/style/useNamingConvention: 응답 필드명이 한국어다.
 *
 * **용어의 일반 정의는 만들지 않고 가져온다.** `term_gloss.genericDef`는 공식 데이터이지
 * 생성물이 아니다 — "선고"나 "기각"의 뜻을 모델이 지어내게 두면, 틀려도 그럴듯해서
 * 아무도 못 잡는다. LLM은 `contextualDef`("이 판결에서의 뜻")만 만든다.
 *
 * ## 이 응답만 모양이 다르다
 *
 * 다른 카테고리는 `[{a,b},{a,b}]`처럼 **행 방향**으로 오는데, 법령용어 본문은
 * `{a:[1,2], b:[1,2]}`처럼 **열 방향**으로 온다. 본문 조회가 `trmSeqs=5068618,4887619`처럼
 * 여러 개를 한 번에 받기 때문이다. 그래서 여기서 다시 행으로 묶는다 —
 * 열 방향인 채로 위로 올리면 부르는 쪽마다 인덱스를 맞추게 되고, 언젠가 한 칸 밀린다.
 */

import { z } from "zod";
import { asArray, openEnvelope, optionalText } from "./envelope";
import { TARGETS } from "./targets";

interface TermSummary {
  /**
   * 본문 조회에 쓰는 열쇠들. **한 용어에 여러 개가 달린다.**
   *
   * 실제 응답에서 `"법령용어ID": "5068618,4887619"`처럼 쉼표로 이어져 왔다 — 같은 낱말에
   * 사전 항목이 여러 개 있다는 뜻이고, 그래서 본문 응답도 그 수만큼 열이 늘어난다.
   * 하나라고 보고 짜면 "경과실"의 두 번째 정의가 조용히 사라진다.
   */
  readonly termIds: readonly string[];
  readonly term: string;
}

interface TermDefinition {
  readonly termId: string | undefined;
  readonly term: string;
  readonly hanja: string | undefined;
  /** 공식 정의. 이 값이 `term_gloss.genericDef`가 된다. */
  readonly definition: string;
  /** 어느 법령·예규에서 온 정의인가. 화면에 출처로 밝힌다. */
  readonly source: string | undefined;
  readonly dictionary: string | undefined;
}

const summarySchema = z
  .object({
    법령용어ID: z.union([z.string(), z.number()]),
    법령용어명: z.string().default(""),
  })
  .loose();

function parseTermSummary(raw: unknown): TermSummary {
  const parsed = summarySchema.parse(raw);
  const ids = String(parsed.법령용어ID)
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return { termIds: ids, term: parsed.법령용어명.trim() };
}

/** 열 방향 응답. 값이 하나면 배열이 아니라 낱값으로 온다. */
const detailSchema = z
  .object({
    법령용어일련번호: z.unknown().optional(),
    법령용어명_한글: z.unknown().optional(),
    법령용어명_한자: z.unknown().optional(),
    법령용어정의: z.unknown().optional(),
    출처: z.unknown().optional(),
    법령용어코드명: z.unknown().optional(),
  })
  .loose();

/**
 * 열 방향을 행 방향으로 뒤집는다.
 *
 * 길이는 **가장 긴 열**에 맞춘다. 정의가 비어 있는 용어가 섞이면 그 열만 짧아지는데,
 * 짧은 쪽에 맞추면 뒤쪽 용어가 통째로 사라진다. 없는 칸은 undefined로 둔다.
 */
function parseTermDetailResponse(payload: unknown): TermDefinition[] {
  const body = openEnvelope(payload, TARGETS.lstrm.detailEnvelope);
  const parsed = detailSchema.parse(body);

  const ids = asArray(parsed.법령용어일련번호);
  const names = asArray(parsed.법령용어명_한글);
  const hanja = asArray(parsed.법령용어명_한자);
  const definitions = asArray(parsed.법령용어정의);
  const sources = asArray(parsed.출처);
  const dictionaries = asArray(parsed.법령용어코드명);

  const length = Math.max(ids.length, names.length, definitions.length);

  const rows: TermDefinition[] = [];
  for (let index = 0; index < length; index += 1) {
    const term = optionalText(names[index]);
    const definition = optionalText(definitions[index]);
    // 이름도 뜻도 없는 칸은 데이터가 아니다. 빈 용어를 사전에 넣지 않는다.
    if (term === undefined || definition === undefined) {
      continue;
    }
    rows.push({
      termId: optionalText(ids[index]),
      term,
      hanja: optionalText(hanja[index]),
      definition,
      source: optionalText(sources[index]),
      dictionary: optionalText(dictionaries[index]),
    });
  }
  return rows;
}

/** 본문 조회 열쇠. `trmSeqs`는 쉼표로 여러 개를 받는다. */
function termSeqParam(termIds: readonly string[]): string {
  return termIds.join(",");
}

export { parseTermDetailResponse, parseTermSummary, termSeqParam };
export type { TermDefinition, TermSummary };
