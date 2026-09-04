/**
 * 법제처 응답의 공통 껍데기.
 *
 * biome-ignore-all lint/style/useNamingConvention: 응답 필드명이 한국어이거나 API가 정한
 * 이름이다. 스키마 키는 응답과 글자 그대로 같아야 하며, 바꾸면 파싱이 조용히 실패한다.
 *
 * 카테고리마다 봉투 이름과 항목 키가 다르지만(`targets.ts`), **껍데기를 다루는 방법은
 * 같다.** 그 같은 부분만 여기 모은다 — 카테고리를 하나 더 붙일 때 이 파일은 건드리지 않는다.
 */

import { z } from "zod";

/** 응답 필드는 문자열로도 숫자로도 오고, 아예 빠지기도 한다. */
const looseValue = z.union([z.string(), z.number()]).optional();

/**
 * 목록 응답의 공통 필드. 카테고리마다 있는 것과 없는 것이 갈려서 전부 선택으로 둔다.
 * (`prec`·`decc`에는 `resultCode`가 없고, `law`·`expc`에는 있다.)
 */
const listMetaSchema = z
  .object({
    totalCnt: looseValue,
    page: looseValue,
    resultCode: looseValue,
    resultMsg: z.string().optional(),
  })
  .loose();

interface ListPage<T> {
  readonly total: number;
  readonly items: readonly T[];
}

/**
 * 봉투를 연다. 이름이 다르면 던진다.
 *
 * 봉투 이름을 확인하는 이유는 **`decc`(행정심판례) 본문이 `PrecService`로 오기 때문**이다
 * (`targets.ts`). 이름이 겹치는 경우가 있는 이상, 이름이 다른 경우는 확실히 걸러야 한다.
 */
function openEnvelope(payload: unknown, envelope: string): Record<string, unknown> {
  if (payload === null || typeof payload !== "object") {
    throw new Error("응답이 객체가 아닙니다.");
  }
  const body = (payload as Record<string, unknown>)[envelope];
  if (body === null || body === undefined || typeof body !== "object") {
    const found = Object.keys(payload as Record<string, unknown>).join(", ");
    throw new Error(`응답에 ${envelope}이(가) 없습니다. 받은 키: ${found || "(없음)"}`);
  }
  return body as Record<string, unknown>;
}

/**
 * 하나여도 배열로 만든다.
 *
 * **이 API는 결과가 1건이면 배열이 아니라 객체 하나로 준다.** 배열이라고만 생각하고 짜면
 * 검색 결과가 딱 하나일 때만 터지는 버그가 되고, 그런 버그는 늦게 발견된다.
 */
function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/** 목록 응답을 항목 배열과 총건수로 나눈다. 항목 하나하나의 해석은 부르는 쪽이 한다. */
function parseListPage<T>(
  payload: unknown,
  spec: { listEnvelope: string; listItemKey: string },
  parseItem: (raw: unknown) => T,
): ListPage<T> {
  const body = openEnvelope(payload, spec.listEnvelope);
  const meta = listMetaSchema.parse(body);

  return {
    total: Number(meta.totalCnt ?? 0),
    items: asArray(body[spec.listItemKey]).map(parseItem),
  };
}

/** 빈 문자열과 없음을 같게 다룬다. 이 API는 값이 없을 때 `""`를 자주 준다. */
function optionalText(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) {
    return;
  }
  const text = String(raw).trim();
  return text.length > 0 ? text : undefined;
}

const DATE_WITH_DOTS = /^(\d{4})\.\s?(\d{1,2})\.\s?(\d{1,2})\.?$/u;
const DATE_COMPACT = /^(\d{4})(\d{2})(\d{2})$/u;

/**
 * 날짜를 Date로. 카테고리마다 `20260520`과 `2026.05.20` 두 형태가 섞여 온다.
 *
 * 시간대를 붙이지 않고 UTC 자정으로 고정한다 — 공포일·시행일은 날짜이지 시각이 아니다.
 */
function parseApiDate(raw: unknown): Date | undefined {
  const text = optionalText(raw);
  if (text === undefined) {
    return;
  }
  const matched = DATE_WITH_DOTS.exec(text) ?? DATE_COMPACT.exec(text);
  if (matched === null) {
    return;
  }
  const [, year, month, day] = matched;
  if (year === undefined || month === undefined || day === undefined) {
    return;
  }
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

export { asArray, looseValue, openEnvelope, optionalText, parseApiDate, parseListPage };
export type { ListPage };
