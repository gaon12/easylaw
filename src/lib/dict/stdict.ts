/**
 * 표준국어대사전 JSON 파서. [F-29]
 *
 * biome-ignore-all lint/style/useNamingConvention: 원본 필드명이 snake_case다.
 *
 * 국립국어원이 내려 주는 zip 안에는 `{channel: {item: [...5000]}}` 꼴의 JSON이 88개 들어
 * 있다. 한 항목은 **표제어 하나**이고, 그 안에서 품사 → 문형 → 뜻으로 세 겹 겹쳐 있다.
 *
 * **뜻 단위로 펴서 돌려준다.** 표제어 단위로 두면 "이 낱말의 법률 분야 뜻"만 꺼내는 일이
 * 불가능해지는데, 우리가 쓰려는 것이 정확히 그것이다 — "기각"의 일상 뜻과 법률 뜻은
 * 다른 말이고, 판결문을 읽는 사람에게 필요한 것은 뒤엣것이다.
 *
 * **원본을 손대지 않는다.** 뜻풀이는 받은 그대로 넣는다. 여기서 다듬으면 그 순간
 * "국립국어원의 정의"가 아니라 우리가 고친 문장이 되고, 출처를 밝힐 수 없게 된다.
 */

import { z } from "zod";

interface StdictEntry {
  readonly id: string;
  /** 찾을 때 쓰는 형태. 표기 부호를 뺀다. */
  readonly word: string;
  /** 원본 표기. 부호를 살려 둔다. */
  readonly wordRaw: string;
  readonly hanja: string | undefined;
  readonly pos: string | undefined;
  readonly category: string | undefined;
  readonly senseType: string | undefined;
  readonly definition: string;
  readonly senseOrder: number;
}

/**
 * 표기 부호를 뺀다.
 *
 * 원본은 `가족^수당`(띄어 쓸 자리), `-스럽다`(접사 경계), `사과0`(동형어 번호)처럼 적는다.
 * 판결문에는 `가족수당`으로 나오므로 그대로 두면 영영 못 찾는다. **부호만 뺀다** —
 * 글자는 하나도 바꾸지 않는다.
 */
const MARKS = /[\^\-\u2010-\u2015]/gu;
const HOMONYM_NUMBER = /\d+$/u;

function plainWord(raw: string): string {
  return raw.replace(MARKS, "").replace(HOMONYM_NUMBER, "").trim();
}

const senseSchema = z
  .object({
    definition: z.string().default(""),
    sense_code: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    cat_info: z.array(z.object({ cat: z.string().optional() }).loose()).optional(),
  })
  .loose();

const itemSchema = z
  .object({
    target_code: z.union([z.string(), z.number()]),
    word_info: z
      .object({
        word: z.string().default(""),
        original_language_info: z
          .array(z.object({ original_language: z.string().optional() }).loose())
          .optional(),
        pos_info: z
          .array(
            z
              .object({
                pos: z.string().optional(),
                comm_pattern_info: z
                  .array(z.object({ sense_info: z.array(senseSchema).optional() }).loose())
                  .optional(),
              })
              .loose(),
          )
          .optional(),
      })
      .loose(),
  })
  .loose();

const fileSchema = z
  .object({ channel: z.object({ item: z.array(z.unknown()).default([]) }).loose() })
  .loose();

/** 한자 표기. 여러 개면 첫 것만 쓴다 — 화면에 괄호로 한 번 보여 주는 용도다. */
function firstHanja(item: z.infer<typeof itemSchema>): string | undefined {
  const value = item.word_info.original_language_info?.[0]?.original_language?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

/** 전문 분야. `없음`으로 오는 경우가 있어 그때는 분야가 없는 것으로 본다. */
function category(sense: z.infer<typeof senseSchema>): string | undefined {
  const value = sense.cat_info?.[0]?.cat?.trim();
  return value === undefined || value.length === 0 || value === "없음" ? undefined : value;
}

function toEntries(raw: unknown): StdictEntry[] {
  const item = itemSchema.parse(raw);
  const wordRaw = item.word_info.word.trim();
  const word = plainWord(wordRaw);
  if (word.length === 0) {
    return [];
  }

  const hanja = firstHanja(item);
  const entries: StdictEntry[] = [];

  for (const pos of item.word_info.pos_info ?? []) {
    for (const pattern of pos.comm_pattern_info ?? []) {
      for (const sense of pattern.sense_info ?? []) {
        const definition = sense.definition.trim();
        if (definition.length === 0) {
          continue;
        }
        entries.push({
          id: `${item.target_code}-${sense.sense_code ?? entries.length}`,
          word,
          wordRaw,
          hanja,
          pos: pos.pos?.trim(),
          category: category(sense),
          senseType: sense.type?.trim(),
          definition,
          /* 같은 표제어 안에서 몇 번째 뜻인가. 1번 뜻이 대개 가장 흔한 뜻이다. */
          senseOrder: entries.length + 1,
        });
      }
    }
  }

  return entries;
}

/** JSON 파일 하나를 뜻 목록으로. 항목 하나가 깨져도 나머지는 살린다. */
function parseStdictFile(text: string): StdictEntry[] {
  const parsed = fileSchema.parse(JSON.parse(text));
  return parsed.channel.item.flatMap((item) => toEntries(item));
}

export { parseStdictFile, plainWord };
export type { StdictEntry };
