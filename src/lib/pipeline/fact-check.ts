/**
 * 생성 문장의 결정론적 사실 대조. `PRODUCT.md` §5.5 [6a].
 *
 * 모델의 함의 판정 전에 날짜·금액·숫자를 글자로 맞춘다. 비교 범위는 문장에 연결된 원문
 * span뿐이다. 문서 다른 곳에 우연히 같은 값이 있어도 통과하지 않는다.
 */

import type { Claim } from "./entail";

type FactKind = "date" | "money" | "number";

interface FactAtom {
  readonly kind: FactKind;
  readonly key: string;
  readonly label: string;
}

interface DeterministicFactCheck {
  readonly orderIdx: number;
  readonly verdict: "pass" | "contradicted";
  readonly reason: string;
  readonly missing: readonly FactAtom[];
}

const FULL_DATE =
  /(?<!\d)(\d{4})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*(?:일|\.)?/gu;
const MONEY = /([0-9.,일이삼사오육칠팔구십백천만억조\s]+)원/gu;
const PLAIN_NUMBER =
  /(\d[\d,]*(?:\.\d+)?)\s*(퍼센트|개월|km|cm|mm|kg|m²|㎡|%|명|건|회|개|년|월|일|조|항|호|배|m|g)?\s*(이상|이하|초과|미만)?/giu;
const HAS_NUMERAL = /[0-9일이삼사오육칠팔구십백천만억조]/u;
const ARABIC_NUMBER = /^\d+$/u;
const ARABIC_TOKEN = /^\d+$/u;
const TOKEN = /\d+|[일이삼사오육칠팔구십백천만억조]/gu;
const TRAILING_ZEROES = /0+$/u;
const DECIMAL_WITH_UNIT = /^(\d+)\.(\d+)(천|만|억|조)?$/u;
const DECIMAL_BASE = 10n;

/** 캐시 식별자. 검사 규칙을 바꾸면 올려 과거 결과가 새 검사를 통과한 것처럼 보이지 않게 한다. */
const FACT_CHECK_VERSION = "fact-check-2026-09-09-v1";

const KOREAN_DIGIT: Readonly<Record<string, bigint>> = {
  일: 1n,
  이: 2n,
  삼: 3n,
  사: 4n,
  오: 5n,
  육: 6n,
  칠: 7n,
  팔: 8n,
  구: 9n,
};

const SMALL_UNIT: Readonly<Record<string, bigint>> = {
  십: 10n,
  백: 100n,
  천: 1000n,
};

const LARGE_UNIT: Readonly<Record<string, bigint>> = {
  만: 10_000n,
  억: 100_000_000n,
  조: 1_000_000_000_000n,
};

function validDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function dateAtoms(text: string): { atoms: FactAtom[]; masked: string } {
  const atoms: FactAtom[] = [];
  const masked = text.replace(FULL_DATE, (label, yearRaw, monthRaw, dayRaw) => {
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    if (validDate(year, month, day)) {
      atoms.push({ kind: "date", key: `date:${year}-${month}-${day}`, label });
    }
    return " ".repeat(label.length);
  });
  return { atoms, masked };
}

function sumNumberTokens(tokens: readonly string[]): bigint {
  let total = 0n;
  let section = 0n;
  let pending = 0n;
  for (const token of tokens) {
    if (ARABIC_TOKEN.test(token)) {
      pending = BigInt(token);
      continue;
    }

    const digit = KOREAN_DIGIT[token];
    if (digit !== undefined) {
      pending = digit;
      continue;
    }

    const small = SMALL_UNIT[token];
    if (small !== undefined) {
      section += (pending === 0n ? 1n : pending) * small;
      pending = 0n;
      continue;
    }

    const large = LARGE_UNIT[token];
    if (large !== undefined) {
      const group = section + pending;
      total += (group === 0n ? 1n : group) * large;
      section = 0n;
      pending = 0n;
    }
  }
  return total + section + pending;
}

function parseKoreanNumber(raw: string): bigint | null {
  const compact = raw.replace(/[\s,]/gu, "");
  if (!(compact.length > 0 && HAS_NUMERAL.test(compact))) {
    return null;
  }
  if (ARABIC_NUMBER.test(compact)) {
    return BigInt(compact);
  }

  const decimal = DECIMAL_WITH_UNIT.exec(compact);
  if (decimal) {
    const [, whole = "0", fraction = "", unit = ""] = decimal;
    const scale = DECIMAL_BASE ** BigInt(fraction.length);
    const multiplier = SMALL_UNIT[unit] ?? LARGE_UNIT[unit] ?? 1n;
    const scaled = (BigInt(whole) * scale + BigInt(fraction)) * multiplier;
    return scaled % scale === 0n ? scaled / scale : null;
  }

  const tokens = compact.match(TOKEN) ?? [];
  return tokens.join("") === compact ? sumNumberTokens(tokens) : null;
}

function moneyAtoms(text: string): { atoms: FactAtom[]; masked: string } {
  const atoms: FactAtom[] = [];
  const masked = text.replace(MONEY, (label, amountRaw) => {
    const amount = parseKoreanNumber(String(amountRaw));
    if (amount === null) {
      return label;
    }
    atoms.push({ kind: "money", key: `money:${amount}`, label: label.trim() });
    return " ".repeat(label.length);
  });
  return { atoms, masked };
}

function normalizedDecimal(raw: string): string {
  const compact = raw.replaceAll(",", "");
  if (!compact.includes(".")) {
    return BigInt(compact).toString();
  }
  const [whole = "0", fraction = ""] = compact.split(".");
  const significantFraction = fraction.replace(TRAILING_ZEROES, "");
  return significantFraction.length === 0
    ? BigInt(whole).toString()
    : `${BigInt(whole)}.${significantFraction}`;
}

function numberAtoms(text: string): FactAtom[] {
  return [...text.matchAll(PLAIN_NUMBER)].map(
    ([label, number = "0", unit = "", qualifier = ""]) => ({
      kind: "number",
      key: `number:${normalizedDecimal(number)}:${unit.toLowerCase()}:${qualifier}`,
      label: label.trim(),
    }),
  );
}

function factAtoms(text: string): FactAtom[] {
  const dates = dateAtoms(text);
  const money = moneyAtoms(dates.masked);
  return [...dates.atoms, ...money.atoms, ...numberAtoms(money.masked)];
}

function uniqueAtoms(atoms: readonly FactAtom[]): FactAtom[] {
  return [...new Map(atoms.map((atom) => [atom.key, atom])).values()];
}

function checkClaimFacts(claim: Claim): DeterministicFactCheck {
  const claimed = uniqueAtoms(factAtoms(claim.text));
  const supported = new Set(
    claim.sources.flatMap((source) => factAtoms(source).map((atom) => atom.key)),
  );
  const missing = claimed.filter((atom) => !supported.has(atom.key));
  return missing.length === 0
    ? { orderIdx: claim.orderIdx, verdict: "pass", reason: "", missing }
    : {
        orderIdx: claim.orderIdx,
        verdict: "contradicted",
        reason: `연결된 원문에서 ${missing.map((atom) => atom.label).join(", ")} 값을 확인할 수 없습니다.`,
        missing,
      };
}

function checkDeterministicFacts(claims: readonly Claim[]): DeterministicFactCheck[] {
  return claims.map(checkClaimFacts);
}

export { checkClaimFacts, checkDeterministicFacts, FACT_CHECK_VERSION, parseKoreanNumber };
export type { DeterministicFactCheck, FactAtom, FactKind };
