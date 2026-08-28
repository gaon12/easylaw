/**
 * 사용자에게 보이는 모든 문자열.
 *
 * 한 곳에 모으는 이유는 두 가지다.
 * 1. 다국어([F-10])를 나중에 붙일 때 코드를 다시 뒤지지 않기 위해.
 * 2. 문체 규칙(`DESIGN.md` §9 — 해요체, 단정 금지, 챗봇 톤 금지)을 한 파일에서 감시하기 위해.
 *
 * 레벨별 본문 문구는 여기 두지 않는다. 그건 생성 결과이지 UI 카피가 아니다.
 */

export const site = {
  name: "EasyLaw",
  tagline: "판결문을 읽는 사람에 맞게 바꿔 드려요",
  skipToContent: "본문으로 건너뛰기",
  nav: {
    home: "홈",
    cases: "내 문서함",
    settings: "화면 설정",
    help: "이용 안내",
  },
} as const;

/**
 * 푸터 고지. **닫을 수 없고 모든 페이지에 나온다.**
 * 판결문을 다루는 서비스가 관공서처럼 보이면 사용자가 공적 효력을 오인한다(`DESIGN.md` §2).
 */
export const disclaimer = {
  notGovernment:
    "EasyLaw는 정부 기관이나 법원이 아니에요. 법적 효력이 있는 것은 법원이 보낸 원본 판결문이에요.",
  aiGenerated:
    "이 설명은 AI가 만들었어요. 중요한 결정을 하기 전에는 원본과 함께 확인하고, 변호사나 대한법률구조공단에 물어보세요.",
  privacy: "개인정보 처리방침",
  terms: "이용 안내",
  openSource: "오픈소스 라이선스",
} as const;

export const home = {
  heroTitle: "판결문, 읽을 수 있게 바꿔 드려요",
  heroBody:
    "사건번호를 넣으면 판결문을 찾아서 쉬운 말로 설명해 드려요. 판결문을 갖고 계시면 올려도 돼요.",
  searchLabel: "사건번호로 찾기",
  searchPlaceholder: "2019도12345",
  searchHint: "사건번호를 모르시면 사건 내용을 적어도 돼요.",
  searchSubmit: "찾기",
  uploadTitle: "판결문을 갖고 계신가요?",
  uploadBody:
    "1심·2심 판결문은 대부분 공개되지 않아요. 받으신 판결문을 올리면 바로 쉽게 바꿔 드릴게요.",
  uploadCta: "판결문 올리기",
  privacyTitle: "올린 판결문은 이렇게 다뤄요",
  privacyPoints: [
    "이름·주민등록번호·주소 같은 개인정보는 올리는 즉시 가려요.",
    "보관 기간은 직접 정할 수 있고, 언제든 지울 수 있어요.",
    "올린 문서는 나만 볼 수 있어요. 공개 판례와 따로 보관해요.",
  ],
  audienceTitle: "누구를 위한 서비스인가요",
  audiences: [
    { title: "법조계", body: "쟁점과 법리를 근거와 함께 정리해 드려요." },
    { title: "일반인", body: "결론부터, 나에게 무슨 일이 생기는지 알려 드려요." },
    { title: "어린이", body: "무슨 일이 있었고 왜 그렇게 됐는지 이야기로 풀어 드려요." },
    { title: "쉬운말", body: "짧은 문장과 그림으로, 다음에 할 일까지 알려 드려요." },
  ],
} as const;

export const search = {
  title: "검색 결과",
  resultsForCaseNumber: (canonical: string) => `${canonical} 사건을 찾았어요.`,
  resultsForKeyword: (query: string) => `사건번호 형식이 아니라서 "${query}"로 찾아봤어요.`,
  emptyQuery: "찾을 사건번호나 내용을 입력해 주세요.",
  notFoundTitle: "공개된 판결문 중에는 없어요",
  notFoundBody:
    "1심·2심 판결문은 대부분 공개되지 않아요. 받으신 판결문을 올리면 바로 쉽게 바꿔 드릴게요.",
  unknownCode: (code: string) => `"${code}"는 저희가 아는 사건부호가 아니에요. 다시 확인해 주세요.`,
  yearOutOfRange: "사건번호의 연도가 맞지 않는 것 같아요. 다시 확인해 주세요.",
  codeHelpTitle: "사건번호는 이렇게 생겼어요",
  codeHelpBody: "연도 + 사건부호 + 번호 순서예요. 예를 들면 2019도12345처럼요.",
  explanationReady: "설명 준비됨",
  retry: "사건번호 다시 확인하기",
} as const;

export const viewer = {
  levels: {
    L0: "원문",
    L1: "법조",
    L2: "일반",
    L3: "어린이",
    L4: "쉬운말",
  },
  levelGroupLabel: "설명 단계 고르기",
  levelChanged: (label: string) => `${label} 단계로 바꿨어요.`,
  originalPanel: "원문",
  renditionPanel: "쉬운 설명",
  evidence: "근거 보기",
  evidenceOf: (order: number) => `${order}번째 문장의 근거 보기`,
  confidence: {
    grounded: "근거 있음",
    needs_check: "확인 필요",
    ungrounded: "근거 없음",
  },
  needsCheckHint: "원문과 대조해 보세요.",
  generateCta: "설명 만들기",
  generateHint: "아직 아무도 만들지 않았어요. 만들면 다음 사람도 바로 볼 수 있어요.",
  generating: "설명을 만들고 있어요.",
  generatingByOther: "이미 만들고 있어요. 곧 보여 드릴게요.",
  generateFailed: "설명을 만들지 못했어요.",
  regenerate: "다시 시도",
  outdated: "더 나은 설명으로 다시 만들기",
  outdatedHint: (generatedAt: string) => `${generatedAt}에 만든 설명이에요.`,
  blockedForKids: "이 사건은 어린이용 설명을 제공하지 않아요.",
  summaryTitle: "판결 한눈에 보기",
  fields: {
    caseNo: "사건번호",
    court: "법원",
    decidedAt: "선고일",
    caseType: "사건 종류",
    parties: "당사자",
    outcome: "결과",
  },
} as const;

export const outcomes = {
  won: "원고가 이겼어요",
  partially_won: "원고가 일부 이겼어요",
  lost: "원고가 졌어요",
  dismissed_procedural: "법원이 판단하지 않고 소송을 끝냈어요",
  criminal_guilty: "유죄로 판단했어요",
  criminal_not_guilty: "무죄로 판단했어요",
  criminal_appeal_dismissed: "항소를 받아들이지 않았어요",
  unknown: "결과를 아직 확인하지 못했어요",
} as const;

export const errors = {
  notFoundTitle: "찾는 문서가 없어요",
  notFoundBody: "주소가 바뀌었거나 문서가 지워졌을 수 있어요.",
  genericTitle: "문제가 생겼어요",
  genericBody: "잠시 뒤에 다시 해 보시겠어요? 계속 안 되면 알려 주세요.",
  backHome: "처음으로 가기",
  retry: "다시 시도",
} as const;
