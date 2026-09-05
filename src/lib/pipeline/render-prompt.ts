/**
 * 레벨별 렌더링 지시. `PRODUCT.md` §3 · §5.5 [5] · `EASY-READ.md`
 *
 * **지시문은 린터(`rendition/lint.ts`)가 검사하는 것과 같은 규칙을 말해야 한다.**
 * 다르면 모델이 성실히 따른 결과가 우리 검사에 걸려 통째로 재생성된다. 그건 돈과
 * 시간을 쓰면서 아무것도 나아지지 않는 낭비다. 그래서 규칙을 여기 손으로 옮겨 적지 않고
 * **린터의 표에서 만들어 낸다** — 한쪽만 고치는 일이 생기지 않게.
 */

import { LEVEL_RULES, type Level } from "@/lib/rendition/lint";

/** 레벨이 무엇을 위한 것인지. `PRODUCT.md` §3의 표를 그대로 옮겼다. */
interface LevelBrief {
  readonly reader: string;
  readonly question: string;
  readonly shape: string;
  readonly plan: readonly string[];
}

const LEVEL_BRIEF: Readonly<Record<Level, LevelBrief>> = {
  L1: {
    reader: "변호사·법무담당·연구자",
    question: "이 판결의 법리는 무엇인가",
    shape:
      "판결 요지와 결론을 먼저 제시한 뒤 사실관계, 쟁점, 당사자 주장, 적용 법리와 인용 조문, 판단 이유를 논리 순서대로 씁니다. 법률 용어를 정확하게 씁니다.",
    plan: ["판결 요지", "사실관계", "쟁점", "당사자 주장", "법원의 판단", "결론과 의미"],
  },
  L2: {
    reader: "이 사건의 당사자인 성인",
    question: "나에게 무슨 일이 일어났나",
    shape:
      "결론을 먼저 제시한 뒤 사건의 경과, 서로의 주장, 법원이 그렇게 판단한 이유, 당사자에게 미치는 효과, 다음 절차 순서로 씁니다.",
    plan: [
      "먼저 보는 결론",
      "무슨 일이 있었나요",
      "서로 무엇을 주장했나요",
      "법원은 왜 이렇게 판단했나요",
      "나에게 어떤 영향이 있나요",
      "다음 절차",
    ],
  },
  L3: {
    reader: "초등학교 고학년~중학생",
    question: "무슨 일이었고 왜 그렇게 됐나",
    shape:
      "초등 고학년~중학생이 아는 일상 낱말을 씁니다. 사건을 시간 순서와 인물의 흐름으로 설명합니다. 피할 수 없는 법률 용어는 쓴 뒤 바로 다음 짧은 문장에서 그 용어의 문맥상 뜻만 풀이합니다.",
    plan: [
      "무슨 일이 있었나요",
      "사람들은 무엇을 말했나요",
      "법원은 무엇을 살펴봤나요",
      "법원은 왜 그렇게 정했나요",
      "다음에는 어떻게 되나요",
    ],
  },
  L4: {
    reader: "발달장애인",
    question: "나에게 무슨 일이 일어났나",
    shape:
      '한 문장에 한 가지 정보만 담습니다. 읽는 사람을 "당신"이라고 부릅니다. 법률 용어를 쓰면 바로 다음 별도 문장에서 그 용어의 문맥상 뜻만 풀이합니다. 마지막에는 이해 확인 질문을 넣습니다.',
    plan: [
      "먼저 알아둘 것",
      "무슨 일이 있었나요",
      "법원은 어떻게 정했나요",
      "왜 그런가요",
      "그래서 어떻게 되나요",
      "이해 확인",
    ],
  },
};

/** 린터의 표에서 지시문 줄을 만든다. 규칙이 두 곳에 적히지 않게 한다. */
function ruleLines(level: Level): string[] {
  const rules = LEVEL_RULES[level];
  const lines: string[] = [];

  if (rules.maxSentenceLength !== undefined) {
    lines.push(`- 한 문장은 **${rules.maxSentenceLength}자 이내**입니다. 길면 문장을 나눕니다.`);
  }
  if (rules.requiredSections.length > 0) {
    lines.push(
      `- 다음 제목을 **반드시** 넣습니다(role을 "heading"으로): ${rules.requiredSections
        .map((section) => `"${section}"`)
        .join(", ")}`,
    );
  }
  if (rules.fixedSecondPerson) {
    lines.push(
      '- 읽는 사람을 **"당신"** 이라고 부릅니다. "원고"·"피고"·"피고인" 같은 말을 쓰지 않습니다.',
    );
  }
  if (rules.banFigurative) {
    lines.push('- 비유를 쓰지 않습니다. "~처럼", "마치", "비유하면" 같은 표현을 쓰지 않습니다.');
  }
  return lines;
}

/**
 * 모든 레벨에 공통인 금지.
 *
 * 단정 표현은 2026년 실제 이지리드 판결문이 전문가에게 지적받은 바로 그 결함이다
 * (`EASY-READ.md` §5) — 1심 판결은 확정된 것이 아닌데 "이겼습니다"라고 하면 항소
 * 가능성을 가린다. 린터가 막지만, 막힌 뒤 다시 만드는 것보다 처음부터 안 쓰는 편이 싸다.
 */
const COMMON_RULES = [
  '- **승패를 단정하지 않습니다.** "이겼습니다", "졌습니다", "승소했습니다", "패소했습니다",',
  '  "끝났습니다", "확정됐습니다" 를 쓰지 않습니다. 아직 다툴 수 있는 단계일 수 있습니다.',
  "- **구조에 적힌 것만 씁니다.** 일반적인 법 지식으로 빈칸을 메우지 않습니다.",
  "- **당사자의 주장과 법원의 판단을 섞지 않습니다.** `원고 측의 주장`·`피고 측의 주장`·",
  "  `검사의 주장`·`그 밖의 당사자의 주장`은 그 주체가 그렇게 주장한 것이고,",
  "  `법원의 판단과 이유`만 법원이 그렇게 판단한 것입니다.",
];

function styleLine(level: Level): string {
  if (level === "L1") {
    return "- 법률 문서에서 쓰는 간결한 **평서체(-다)**로 씁니다.";
  }
  if (level === "L2") {
    return "- 일반 성인에게 설명하는 단계입니다. 정중한 **-합니다**체로 씁니다.";
  }
  return "- **-어요**체로 씁니다.";
}

/**
 * 출력 예시. **이 레벨이 반드시 넣어야 하는 제목을 예시에 그대로 적는다.**
 *
 * 규칙 목록에 "이 제목을 넣으세요"라고 써 두는 것만으로는 모자랐다 — Gemma가 L4에서
 * 제목을 빼먹어 `"그래서 어떻게 되나요" 섹션이 없습니다`로 통째로 버려졌다. 추출 단계에서
 * 배운 것과 같다: **모델은 예시를 베낀다.** 규칙에 있고 예시에 없으면 예시가 이긴다.
 */
function outputExample(level: Level): string {
  const sections = LEVEL_RULES[level].requiredSections;
  const lines = [
    '  {"role": "body", "text": "…", "from": "n0"}',
    ...sections.map(
      (section) =>
        `  {"role": "heading", "text": "${section}"},\n  {"role": "body", "text": "…", "from": "n1"}`,
    ),
  ];

  return ['{"sentences": [', lines.join(",\n"), "]}"].join("\n");
}

/**
 * 지시문을 만든다.
 *
 * **원문을 주지 않는다.** 모델이 보는 것은 [4]가 뽑은 구조뿐이다(§5.5 [5] —
 * "원문에서 직접 요약하지 않음"). 원문을 함께 주면 모델이 그쪽을 베끼고, 그러면
 * 문장이 어느 노드에서 나왔는지가 흐려져 근거 추적이 끊긴다.
 */
function renderInstruction(level: Level): string {
  const brief = LEVEL_BRIEF[level];

  return [
    `당신은 판결문을 ${brief.reader}에게 설명하는 도구입니다. JSON만 출력합니다.`,
    "",
    `읽는 사람이 답을 얻고 싶은 질문: "${brief.question}"`,
    "",
    "## 받는 것",
    "",
    "판결문에서 뽑아낸 구조입니다. 각 줄은 `[n0] 한국어 라벨: 내용` 형태입니다.",
    "주장은 `원고 측의 주장`·`피고 측의 주장`처럼 **누가 한 말인지 라벨에 표시**됩니다.",
    "사실의 날짜는 알 수 있을 때 `사실관계(발생일: YYYY-MM-DD)`처럼 표시됩니다.",
    "인용 법령은 법령명, 조, 항, 호 순서로 표시됩니다.",
    "**원문은 주지 않습니다. 이 구조에 적힌 것만 가지고 씁니다.**",
    "",
    "## 쓰는 법",
    "",
    `- ${brief.shape}`,
    `- 권장 흐름: ${brief.plan.map((section) => `\`${section}\``).join(" → ")}`,
    "- 구조에 해당 정보가 있으면 권장 흐름의 제목을 달아 충분히 설명합니다.",
    "  해당 정보가 전혀 없으면 내용을 지어내거나 빈 제목을 만들지 않습니다.",
    "- 결론 몇 문장만 쓰고 끝내지 않습니다. 입력의 모든 사실·쟁점·주장·판단·결론 노드를",
    "  본문에서 최소 한 번씩 다룹니다. 법조계 단계는 인용 법령 노드도 모두 다룹니다.",
    "- 서로 다른 쟁점과 판단 이유를 한 문장으로 뭉개지 않습니다. 한 노드가 복잡하면",
    "  같은 `from`을 단 여러 문장으로 나누어 배경, 판단 이유, 효과를 차례로 설명합니다.",
    "- 같은 말을 늘여 쓰거나 근거 없는 일반론으로 분량을 채우지 않습니다.",
    ...ruleLines(level),
    ...COMMON_RULES,
    styleLine(level),
    "",
    "## 근거",
    "",
    "- 본문 문장마다 `from`에 그 내용이 나온 노드 이름(`n0` 같은)을 적습니다.",
    "- 제목에는 `from`을 적지 않아도 됩니다.",
    "- 어느 노드에서 나왔는지 댈 수 없는 문장은 **쓰지 않습니다.**",
    "",
    "## 출력 형태",
    "",
    "칸 이름은 아래와 똑같이 씁니다. 값만 이 판결문의 내용으로 채웁니다.",
    "",
    outputExample(level),
  ].join("\n");
}

/**
 * 프롬프트 버전. **문장을 고치면 반드시 올린다.**
 * `rendition`·`generation_job`의 유일 키에 들어간다(§6.4).
 */
const RENDER_PROMPT_VERSION = "render-2026-09-05-v5";

export { LEVEL_BRIEF, RENDER_PROMPT_VERSION, renderInstruction };
