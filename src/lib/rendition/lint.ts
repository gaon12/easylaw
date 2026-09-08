/**
 * 변환 린터. `.dev/PRODUCT.md` §3.2 · §5.5 [6](c)
 *
 * 레벨별 작성 규칙을 **기계가** 검사한다. 사람이 눈으로 지키는 규칙은 지켜지지 않는다.
 *
 * 규칙의 출처는 조사 문서(`.dev/EASY-READ.md` §5)에서 전문가들이 실제 이지리드 판결문에
 * 지적한 결함들이다 — 단정 표현이 항소 가능성을 가리고, 호칭이 문서 중간에 바뀌고,
 * 다음 절차 안내가 빠졌다.
 */

type Level = "L1" | "L2" | "L3" | "L4";

/** 생성 결과를 바꿀 수 있는 기계 검사 규칙의 판. */
const RENDITION_RULES_VERSION = "rendition-rules-2026-09-08-v1";

type Severity =
  /** 렌더를 막는다. 사용자에게 보여선 안 되는 문제다. */
  | "error"
  /** 배지를 붙여 보여 준다. 사람이 판단할 문제다. */
  | "warning";

type RuleId =
  | "sentence_too_long"
  | "assertive_outcome"
  | "inconsistent_address"
  | "missing_section"
  | "figurative_language"
  | "empty_rendition";

interface LintIssue {
  readonly rule: RuleId;
  readonly severity: Severity;
  readonly message: string;
  /** 문제가 있는 문장의 순서. 문서 전체 문제면 undefined. */
  readonly orderIdx?: number;
}

interface RenditionSentence {
  readonly orderIdx: number;
  readonly role: "heading" | "body" | "gloss";
  readonly text: string;
}

interface LevelRules {
  /** 문장 최대 길이(글자). undefined면 제한 없음. */
  readonly maxSentenceLength: number | undefined;
  /** 문서에 반드시 있어야 하는 섹션 제목. 하나라도 없으면 error다. */
  readonly requiredSections: readonly string[];
  /** 독자를 사건 당사자로 가정하는 2인칭 호칭을 금지하는가. */
  readonly banAssumedReaderRole: boolean;
  /** 비유·은유를 금지하는가. */
  readonly banFigurative: boolean;
}

const RULES: Readonly<Record<Level, LevelRules>> = {
  L1: {
    maxSentenceLength: undefined,
    requiredSections: [],
    banAssumedReaderRole: false,
    banFigurative: false,
  },
  L2: {
    maxSentenceLength: 60,
    requiredSections: ["다음 절차"],
    banAssumedReaderRole: true,
    banFigurative: false,
  },
  L3: {
    maxSentenceLength: 35,
    requiredSections: ["다음에는 어떻게 되나요"],
    banAssumedReaderRole: true,
    banFigurative: false,
  },
  L4: {
    maxSentenceLength: 20,
    requiredSections: ["그래서 어떻게 되나요", "이해 확인"],
    banAssumedReaderRole: true,
    banFigurative: true,
  },
};

/**
 * 확정적 승패 표현.
 *
 * 2026년 실제 이지리드 판결문의 "당신이 이겼습니다"가 전문가 평가에서 정확히 이 이유로
 * 지적됐다 — 1심 판결은 확정된 것이 아닌데 단정하면 항소 가능성을 가린다.
 */
const ASSERTIVE_PATTERNS: readonly { pattern: RegExp; hint: string }[] = [
  { pattern: /이겼(습니다|어요|다)/u, hint: "이겼" },
  { pattern: /졌(습니다|어요|다)/u, hint: "졌" },
  { pattern: /승소했(습니다|어요|다)/u, hint: "승소했" },
  { pattern: /패소했(습니다|어요|다)/u, hint: "패소했" },
  { pattern: /끝났(습니다|어요|다)/u, hint: "끝났" },
  { pattern: /확정됐(습니다|어요)|확정되었습니다/u, hint: "확정됐" },
];

/** 비유 표지. 완전하지 않지만 흔한 형태는 잡는다. */
const FIGURATIVE_PATTERNS: readonly RegExp[] = [/처럼/u, /같이\s/u, /마치/u, /비유하면/u];

const SECOND_PERSON = "당신";

function checkSentenceLength(
  sentence: RenditionSentence,
  limit: number | undefined,
): LintIssue | undefined {
  if (limit === undefined || sentence.role === "heading") {
    return;
  }
  // 공백을 뺀 글자 수로 센다. 띄어쓰기 습관 때문에 규칙이 흔들리면 안 된다.
  const length = sentence.text.replace(/\s/gu, "").length;
  if (length <= limit) {
    return;
  }
  return {
    rule: "sentence_too_long",
    severity: "warning",
    message: `문장이 ${length}자입니다. 이 단계는 ${limit}자 이하로 씁니다.`,
    orderIdx: sentence.orderIdx,
  };
}

function checkAssertive(sentence: RenditionSentence): LintIssue | undefined {
  const found = ASSERTIVE_PATTERNS.find((entry) => entry.pattern.test(sentence.text));
  if (found === undefined) {
    return;
  }
  return {
    rule: "assertive_outcome",
    severity: "error",
    message: `"${found.hint}"처럼 단정하면 항소 가능성을 가립니다. 아직 확정되지 않았다는 것을 함께 적습니다.`,
    orderIdx: sentence.orderIdx,
  };
}

function checkFigurative(sentence: RenditionSentence): LintIssue | undefined {
  if (!FIGURATIVE_PATTERNS.some((pattern) => pattern.test(sentence.text))) {
    return;
  }
  return {
    rule: "figurative_language",
    severity: "warning",
    message: "비유는 이 단계에서 쓰지 않습니다. 있는 그대로 적습니다.",
    orderIdx: sentence.orderIdx,
  };
}

/**
 * 호칭 일관성.
 *
 * 공개 판례나 업로드 문서의 독자가 실제 당사자라고 단정할 수 없다. 가족·조력자·연구자가
 * 읽을 수도 있으므로, 기본 설명은 확인된 사건 역할로만 부르고 독자를 "당신"으로 사건에
 * 집어넣지 않는다.
 */
function checkAddressConsistency(sentences: readonly RenditionSentence[]): LintIssue[] {
  return sentences.flatMap((sentence) =>
    sentence.text.includes(SECOND_PERSON)
      ? [
          {
            rule: "inconsistent_address" as const,
            severity: "error" as const,
            message: `독자가 사건 당사자인지 알 수 없습니다. "${SECOND_PERSON}" 대신 원고·피고처럼 확인된 역할을 씁니다.`,
            orderIdx: sentence.orderIdx,
          },
        ]
      : [],
  );
}

/**
 * 필수 섹션.
 *
 * "다음 절차 안내가 부족하다"는 조사 문서의 지적을 규칙으로 옮긴 것이다.
 * 없으면 error다 — 불복 기한을 모르는 채로 문서를 덮는 것이 이 제품에서 가장 큰 실패다.
 */
function checkRequiredSections(
  sentences: readonly RenditionSentence[],
  required: readonly string[],
): LintIssue[] {
  const headings = sentences
    .filter((sentence) => sentence.role === "heading")
    .map((sentence) => sentence.text.replace(/\s/gu, ""));

  return required
    .filter((section) => !headings.some((heading) => heading.includes(section.replace(/\s/gu, ""))))
    .map((section) => ({
      rule: "missing_section" as const,
      severity: "error" as const,
      message: `"${section}" 섹션이 없습니다. 이 단계에서는 반드시 있어야 합니다.`,
    }));
}

/**
 * 변환본 하나를 검사한다.
 *
 * `error`가 하나라도 있으면 사용자에게 보여주지 않는다(`PRODUCT.md` 원칙 P2·P3).
 * `warning`은 문장에 "확인 필요" 배지를 붙이는 근거가 된다.
 */
function lintRendition(level: Level, sentences: readonly RenditionSentence[]): LintIssue[] {
  const rules = RULES[level];

  if (sentences.length === 0) {
    return [
      {
        rule: "empty_rendition",
        severity: "error",
        message: "변환본이 비어 있습니다.",
      },
    ];
  }

  const issues: LintIssue[] = [];

  for (const sentence of sentences) {
    const tooLong = checkSentenceLength(sentence, rules.maxSentenceLength);
    if (tooLong !== undefined) {
      issues.push(tooLong);
    }

    if (level !== "L1") {
      const assertive = checkAssertive(sentence);
      if (assertive !== undefined) {
        issues.push(assertive);
      }
    }

    if (rules.banFigurative) {
      const figurative = checkFigurative(sentence);
      if (figurative !== undefined) {
        issues.push(figurative);
      }
    }
  }

  if (rules.banAssumedReaderRole) {
    issues.push(...checkAddressConsistency(sentences));
  }
  issues.push(...checkRequiredSections(sentences, rules.requiredSections));

  return issues;
}

/** 렌더를 막아야 하는가. */
function hasBlockingIssue(issues: readonly LintIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

export { hasBlockingIssue, lintRendition, RENDITION_RULES_VERSION, RULES as LEVEL_RULES };
export type { Level, LintIssue, RenditionSentence, RuleId, Severity };
