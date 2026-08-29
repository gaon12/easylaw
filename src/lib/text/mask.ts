/**
 * 개인정보 마스킹. `.dev/PRODUCT.md` §3.3 · `.dev/CONVENTIONS.md` §7
 *
 * **업로드 즉시**, 문장 분할보다 **먼저** 돌린다. 마스킹이 글자 수를 바꾸므로 순서가 뒤집히면
 * 근거 좌표가 통째로 어긋난다.
 *
 * 한계를 분명히 해 둔다. 정규식으로 잡을 수 있는 것은 **형식이 정해진 식별자**뿐이다.
 * 사람 이름은 형식이 없어서 앞뒤 단서(원고·피고인 같은 호칭)에 기대야 하고, 그래서 완전하지 않다.
 * 이 함수는 위험을 줄이는 장치이지 익명화 보증이 아니다 — 공유·공개 경로에서는
 * 사람이 한 번 더 확인하는 단계를 반드시 둔다.
 */

/**
 * 가리는 개인정보의 종류.
 *
 * 타입이 아니라 **값**으로 둔다. DB 스키마(`app`의 `upload_mask.kind`)가 이 목록을 그대로
 * 쓰기 때문이다. 두 곳에 따로 적으면 한쪽만 늘어난 채로 저장이 조용히 실패한다.
 */
const MASK_KINDS = [
  "resident_registration_number",
  "phone",
  "email",
  "account",
  "card",
  "vehicle",
  "address",
  "name",
] as const;

type MaskKind = (typeof MASK_KINDS)[number];

interface MaskRule {
  readonly kind: MaskKind;
  readonly pattern: RegExp;
  /** 매치 전체를 가릴지, 특정 캡처 그룹만 가릴지. 호칭은 남기고 이름만 가려야 문장이 읽힌다. */
  readonly group?: number;
}

interface MaskHit {
  readonly kind: MaskKind;
  readonly start: number;
  readonly end: number;
  readonly original: string;
}

interface MaskResult {
  readonly text: string;
  readonly hits: readonly MaskHit[];
}

/** 사람 이름 앞에 흔히 붙는 호칭. 이 단서가 없으면 이름을 추측하지 않는다. */
const NAME_PREFIXES = [
  "원고",
  "피고",
  "피고인",
  "피해자",
  "신청인",
  "피신청인",
  "청구인",
  "피청구인",
  "채권자",
  "채무자",
  "항소인",
  "피항소인",
  "상고인",
  "피상고인",
  "증인",
  "참고인",
].join("|");

/** 이름 뒤에 붙는 조사. 이름과 조사의 경계를 찾는 데 쓴다. */
const NAME_PARTICLES = [
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "와",
  "과",
  "에게서",
  "에게",
  "께서",
  "께",
  "도",
  "만",
  "라고",
  "이라",
].join("|");

const RULES: readonly MaskRule[] = [
  {
    kind: "resident_registration_number",
    // 주민등록번호는 형식이 고정돼 있어 오탐이 거의 없다.
    pattern: /\b\d{6}\s*-\s*\d{7}\b/gu,
  },
  {
    kind: "phone",
    pattern: /\b0\d{1,2}\s*-\s*\d{3,4}\s*-\s*\d{4}\b/gu,
  },
  {
    kind: "card",
    pattern: /\b\d{4}-\d{4}-\d{4}-\d{4}\b/gu,
  },
  {
    kind: "email",
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gu,
  },
  {
    kind: "vehicle",
    // 12가3456 / 서울12가3456 꼴.
    pattern: /\b(?:[가-힣]{2}\s?)?\d{2,3}[가-힣]\s?\d{4}\b/gu,
  },
  {
    kind: "account",
    // 계좌번호는 자릿수가 은행마다 달라 형태로만 잡는다. 사건번호와 겹치지 않도록 숫자만 본다.
    pattern: /\b\d{2,6}-\d{2,6}-\d{2,8}\b/gu,
  },
  {
    kind: "address",
    // 번지·호수까지 붙은 상세 주소만 가린다. `서울고법` 같은 기관명은 건드리지 않는다.
    pattern:
      /[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도)\s?[가-힣]+(?:시|군|구)\s?[가-힣0-9]+(?:읍|면|동|로|길)\s?[\d-]+(?:번지)?(?:\s?[\d-]+호)?/gu,
  },
  {
    kind: "name",
    /*
     * 호칭 뒤의 2~4자 한글만 이름 후보로 본다.
     *
     * 수량자를 게으르게(`{2,4}?`) 둔 것이 핵심이다. 욕심내면 "홍길동은"을 통째로 이름으로 삼아
     * 조사까지 지워 버리고, 그러면 "원고 ○○○ 피고 ○○○ 상대로"처럼 읽을 수 없는 문장이 남는다.
     * 게으른 수량자 + 조사 후보 목록 + "뒤에 한글이 없다"는 경계 조건으로 이름을 끊는다.
     * 경계를 공백·마침표로만 잡으면 `홍길동(900101-…)` 같은 괄호 표기를 놓친다.
     */
    pattern: new RegExp(
      `(?:${NAME_PREFIXES})\\s+([가-힣]{2,4}?)(?:${NAME_PARTICLES})?(?![가-힣])`,
      "gu",
    ),
    group: 1,
  },
];

/** 가린 자리에 넣는 표시. 무엇을 가렸는지 보이면 사용자가 문장을 이해할 수 있다. */
const PLACEHOLDERS: Readonly<Record<MaskKind, string>> = {
  resident_registration_number: "[주민등록번호]",
  phone: "[전화번호]",
  email: "[이메일]",
  account: "[계좌번호]",
  card: "[카드번호]",
  vehicle: "[차량번호]",
  address: "[주소]",
  name: "○○○",
};

function matchRule(source: string, rule: MaskRule): MaskHit[] {
  rule.pattern.lastIndex = 0;
  const hits: MaskHit[] = [];

  for (const match of source.matchAll(rule.pattern)) {
    const whole = match[0];
    const target = rule.group === undefined ? whole : match[rule.group];
    if (target === undefined) {
      continue;
    }
    // 캡처 그룹만 가릴 때는 매치 안에서의 상대 위치를 더해야 한다.
    const offset = rule.group === undefined ? 0 : whole.indexOf(target);
    hits.push({
      kind: rule.kind,
      start: match.index + offset,
      end: match.index + offset + target.length,
      original: target,
    });
  }
  return hits;
}

/** 겹치는 매치는 먼저 잡힌(더 확실한) 규칙 하나만 남긴다. 규칙 배열 순서가 곧 우선순위다. */
function dropOverlaps(hits: readonly MaskHit[]): MaskHit[] {
  const sorted = [...hits].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: MaskHit[] = [];
  let cursor = -1;

  for (const hit of sorted) {
    if (hit.start >= cursor) {
      kept.push(hit);
      cursor = hit.end;
    }
  }
  return kept;
}

function collectHits(source: string): MaskHit[] {
  return dropOverlaps(RULES.flatMap((rule) => matchRule(source, rule)));
}

/**
 * 개인정보를 가린 텍스트와 무엇을 가렸는지를 함께 돌려준다.
 *
 * 어떤 종류를 몇 건 가렸는지는 사용자에게 보여 준다 — 무엇이 가려졌는지 모르면
 * 사용자가 자기 문서를 신뢰할 수 없다.
 */
function maskPersonalData(source: string): MaskResult {
  const hits = collectHits(source);
  if (hits.length === 0) {
    return { text: source, hits: [] };
  }

  let out = "";
  let cursor = 0;
  for (const hit of hits) {
    out += source.slice(cursor, hit.start) + PLACEHOLDERS[hit.kind];
    cursor = hit.end;
  }
  out += source.slice(cursor);

  return { text: out, hits };
}

/** 종류별 건수. 업로드 결과 화면에 그대로 보여 준다. */
function summarizeHits(hits: readonly MaskHit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const hit of hits) {
    counts[hit.kind] = (counts[hit.kind] ?? 0) + 1;
  }
  return counts;
}

export { MASK_KINDS, maskPersonalData, summarizeHits };
export type { MaskHit, MaskKind, MaskResult };
