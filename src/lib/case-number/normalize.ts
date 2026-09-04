/**
 * 사건번호 정규화. `PRODUCT.md` §5.2
 *
 * 입력은 제각각이다 — `2019도12345`, `2019 도 12345`, `대법원 2019도12345 판결`.
 * 조회 키로 쓸 `canonical`과 사용자가 입력한 `display`를 함께 돌려준다.
 */

import { CASE_CODES_BY_LENGTH_DESC, type CaseCode, findCaseCode } from "./codes";

interface ParsedCaseNumber {
  /** 조회 키. `{연도}{부호}{일련번호}` — 공백 없음, 일련번호 앞 0 제거. */
  readonly canonical: string;
  /** 사용자가 입력한 원문(앞뒤 공백만 정리). 화면에 되돌려 보여 줄 때 쓴다. */
  readonly display: string;
  readonly year: number;
  readonly code: string;
  readonly serial: number;
  readonly meta: CaseCode;
}

type ParseFailureReason =
  /** 입력이 비었다. */
  | "empty"
  /** `연도 + 부호 + 번호` 꼴을 찾지 못했다. */
  | "no_pattern"
  /** 꼴은 맞지만 아는 사건부호가 아니다. 오탈자이거나 우리 표가 낡았다. */
  | "unknown_code"
  /** 연도가 사건번호로 볼 수 없는 값이다. */
  | "year_out_of_range";

type ParseResult =
  | ({ readonly ok: true } & ParsedCaseNumber)
  | {
      readonly ok: false;
      readonly reason: ParseFailureReason;
      /** `unknown_code`일 때만 채워진다. 사용자에게 "이 부호를 모릅니다"라고 말해 주기 위한 값. */
      readonly code?: string;
    };

/** 사건번호에 쓰이는 가장 이른 연도. 이보다 앞선 값은 오인식으로 본다. */
const MIN_YEAR = 1945;

/** 미래 연도 허용 폭. 연말에 접수된 다음 해 사건번호를 막지 않기 위한 여유. */
const FUTURE_YEAR_SLACK = 1;

const CANDIDATE = /(\d{4})\s*([가-힣]{1,3})\s*(\d{1,7})/gu;

/**
 * 후보 문자열에서 알려진 사건부호를 떼어 낸다.
 *
 * `2019초기123`처럼 부호가 두 글자 이상인 경우가 있어 긴 부호부터 맞춰 본다.
 * 정규식이 `초기`를 통째로 잡았더라도, 표에 `초`만 있다면 남은 글자는 부호가 아니므로 실패로 본다.
 */
function splitCode(raw: string): string | undefined {
  for (const code of CASE_CODES_BY_LENGTH_DESC) {
    if (raw === code) {
      return code;
    }
  }
  return;
}

function parseCaseNumber(input: string, now: Date = new Date()): ParseResult {
  const display = input.trim();
  if (display.length === 0) {
    return { ok: false, reason: "empty" };
  }

  const maxYear = now.getFullYear() + FUTURE_YEAR_SLACK;
  let sawPattern = false;
  let unknownCode: string | undefined;

  CANDIDATE.lastIndex = 0;
  for (const match of display.matchAll(CANDIDATE)) {
    const [, yearText, rawCode, serialText] = match;
    if (yearText === undefined || rawCode === undefined || serialText === undefined) {
      continue;
    }

    sawPattern = true;
    const code = splitCode(rawCode);
    if (code === undefined) {
      unknownCode ??= rawCode;
      continue;
    }

    const year = Number(yearText);
    if (year < MIN_YEAR || year > maxYear) {
      return { ok: false, reason: "year_out_of_range" };
    }

    const serial = Number(serialText);
    const meta = findCaseCode(code);
    if (meta === undefined) {
      continue;
    }

    return {
      ok: true,
      canonical: `${year}${code}${serial}`,
      display,
      year,
      code,
      serial,
      meta,
    };
  }

  if (unknownCode !== undefined) {
    return { ok: false, reason: "unknown_code", code: unknownCode };
  }
  return { ok: false, reason: sawPattern ? "unknown_code" : "no_pattern" };
}

/**
 * 조회 키만 필요할 때 쓰는 축약형.
 *
 * 파싱에 실패하면 `undefined`를 돌려준다 — 실패를 조용히 문자열로 흘려보내면
 * 잘못된 키로 캐시가 오염된다.
 */
function toCanonicalCaseNumber(input: string, now?: Date): string | undefined {
  const parsed = parseCaseNumber(input, now);
  return parsed.ok ? parsed.canonical : undefined;
}

/**
 * 사람이 읽기 좋은 형태. 저장은 `canonical`로 하되 화면에는 이 값을 쓴다.
 * 지금은 canonical과 같지만, 나중에 자릿수 구분 같은 표기 규칙이 붙을 자리다.
 */
function formatCaseNumber(parsed: ParsedCaseNumber): string {
  return parsed.canonical;
}

export { formatCaseNumber, parseCaseNumber, toCanonicalCaseNumber };
export type { ParsedCaseNumber, ParseFailureReason, ParseResult };
