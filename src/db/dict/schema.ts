import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * 사전 데이터베이스. `PRODUCT.md` §6.2 · [F-29]
 *
 * **세 번째 파일이다.** `corpus`(공개 판례)·`app`(올린 문서)과 따로 둔다.
 *
 * | 왜 | |
 * |---|---|
 * | 우리 자료가 아니다 | 밖에서 통째로 받아 통째로 갈아 끼운다. 지우고 다시 받아도 서비스 자료는 다치지 않는다 |
 * | 수명이 다르다 | 판례는 쌓이고 사전은 판이 바뀐다. 백업·복제 정책이 같을 이유가 없다 |
 * | 개인정보가 없다 | `app`과 섞을 이유가 전혀 없다. 파일이 갈리면 그 사실이 구조로 남는다 |
 * | 크다 | 표준국어대사전 전체가 40만 항목대다. 이것 때문에 판례 DB가 커지면 안 된다 |
 *
 * **여기 있는 뜻풀이는 생성물이 아니다.** 그것이 이 DB의 존재 이유다 — "과태료"의 뜻을
 * 모델이 지어내게 두면 틀려도 그럴듯해서 아무도 못 잡는다. 공식 정의를 찾아 **모델에게
 * 주고**, 모델은 그 뜻을 이 사건 문맥에 맞게 옮기기만 한다.
 */

/**
 * 표준국어대사전 뜻풀이 하나.
 *
 * 표제어 하나에 품사가 여럿, 품사 하나에 뜻이 여럿이라 **뜻 단위로 한 행**이다.
 * 표제어 단위로 묶으면 "법률 분야의 두 번째 뜻"만 꺼내는 일이 불가능해진다.
 */
const dictEntry = sqliteTable(
  "dict_entry",
  {
    /** `{표제어코드}-{뜻코드}`. 원본의 두 코드를 그대로 잇는다 — 다시 받아도 같은 id다. */
    id: text("id").primaryKey(),
    /**
     * 찾을 때 쓰는 표제어. 원본의 `^`(붙여 쓸 자리 표시)를 뺀 형태다.
     * 원본은 `가족^수당`처럼 오는데, 판결문에는 `가족수당`으로 적힌다.
     */
    word: text("word").notNull(),
    /** 원본 표기. `^`를 살려 둔다 — 화면에 띄어쓰기를 보여 줄 때 쓴다. */
    wordRaw: text("word_raw").notNull(),
    hanja: text("hanja"),
    /** 품사. `명사`·`동사`처럼 온다. */
    pos: text("pos"),
    /**
     * 전문 분야. `법률`·`의학`처럼 온다.
     *
     * **이 열이 이 사전을 쓸 만하게 만든다.** 판결문에 나온 낱말은 같은 글자라도 법률
     * 분야의 뜻을 골라야 한다 — "기각"의 일상 뜻과 법률 뜻은 다른 말이다.
     */
    category: text("category"),
    /** `일반어`·`전문어`. */
    senseType: text("sense_type"),
    definition: text("definition").notNull(),
    /** 원본에 실린 순서. 1번 뜻이 대개 가장 흔한 뜻이다. */
    senseOrder: integer("sense_order").notNull(),
  },
  (table) => [
    index("dict_entry_word_idx").on(table.word),
    /* 분야를 먼저 좁혀 찾는다 — "법률 분야의 이 낱말"이 가장 잦은 질의다. */
    index("dict_entry_category_idx").on(table.word, table.category),
  ],
);

/**
 * 법령용어. 법제처 열린 API에서 온다(`lib/law-api/parse-term.ts`).
 *
 * 표준국어대사전과 **따로 둔다.** 이쪽은 법령이 스스로 내린 정의라 근거가 더 세다 —
 * 찾을 때도 이쪽을 먼저 본다(`lookup.ts`). 한 낱말에 정의가 여럿일 수 있어(다른 법령이
 * 각자 정의한다) 여기서도 정의 단위로 한 행이다.
 */
const legalTerm = sqliteTable(
  "legal_term",
  {
    /** 법령용어일련번호. 없으면 `{용어}-{순번}`으로 만든다. */
    id: text("id").primaryKey(),
    term: text("term").notNull(),
    hanja: text("hanja"),
    definition: text("definition").notNull(),
    /* 어느 법령·예규에서 온 정의인가. **화면에 출처로 밝힌다.** */
    source: text("source"),
    /** 어느 용어사전인가(법령용어사전·행정규칙용어사전 등). */
    dictionary: text("dictionary"),
  },
  (table) => [index("legal_term_term_idx").on(table.term)],
);

/**
 * 어느 자료를 언제 받아 왔나. **주기적 업데이트가 이 표를 본다.**
 *
 * 원본이 밝힌 제작일(`builtAt`)을 함께 적는 이유는, 받은 날짜만으로는 **같은 판을 다시
 * 받았는지** 알 수 없기 때문이다. 표준국어대사전은 파일 이름에 제작일이 들어 있다.
 */
const dictSource = sqliteTable("dict_source", {
  /** `stdict` · `lstrm`. */
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  /** 원본이 밝힌 판. 표준국어대사전은 `20260806` 꼴. */
  builtAt: text("built_at"),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  entries: integer("entries").notNull().default(0),
});

const dictSchema = { dictEntry, legalTerm, dictSource };

export { dictEntry, dictSchema, dictSource, legalTerm };
