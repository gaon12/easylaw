/**
 * 사용자에게 보이는 모든 문자열.
 *
 * 한 곳에 모으는 이유는 두 가지다.
 * 1. 다국어([F-10])를 나중에 붙일 때 코드를 다시 뒤지지 않기 위해.
 * 2. 문체 규칙(`DESIGN.md` §9 — 해요체, 단정 금지, 챗봇 톤 금지)을 한 파일에서 감시하기 위해.
 *
 * 레벨별 본문 문구는 여기 두지 않는다. 그건 생성 결과이지 UI 카피가 아니다.
 *
 * 값이 끼어드는 문구에서는 **조사를 박아 두지 않는다**. `pickJosa`가 받침을 보고 고른다 —
 * `"도"는`과 `"가합"은`은 다르고, 사용자가 넣은 말이 무엇으로 끝날지는 알 수 없다.
 */

import { pickJosa } from "./korean";

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
  /** `level`은 히어로 데모의 단계와 같은 값이다. 카드와 데모가 같은 것을 가리켜야 한다. */
  audiences: [
    { level: "L1", title: "법조계", body: "쟁점과 법리를 근거와 함께 정리해 드려요." },
    { level: "L2", title: "일반인", body: "결론부터, 나에게 무슨 일이 생기는지 알려 드려요." },
    {
      level: "L3",
      title: "어린이",
      body: "무슨 일이 있었고 왜 그렇게 됐는지 이야기로 풀어 드려요.",
    },
    { level: "L4", title: "쉬운말", body: "짧은 문장과 그림으로, 다음에 할 일까지 알려 드려요." },
  ],

  /*
   * 이 서비스가 왜 필요한지. **여기 숫자와 날짜는 전부 확인된 사실이다**(`EASY-READ.md` §2·§5).
   * 판결문을 다루는 서비스가 근거 없는 수치를 랜딩에 걸면 그 순간 신뢰를 잃는다.
   */
  originTitle: "왜 만들었나요",
  originLead: "쉬운 판결문은 제도가 되었어요. 다만 아직 모두에게 오지는 않아요.",
  originBody: [
    "대법원은 2026년 1월 1일부터 「장애인·노인·임산부 등의 사법접근 및 사법지원에 관한 예규」를 시행해요. 이지리드(Easy-Read) 판결문은 이 예규가 정한 사법지원 유형 가운데 하나예요.",
    "다만 지원 여부는 재판장이 정해요. 그래서 이미 받으신 판결문, 지원 대상이 되지 못한 판결문은 여전히 읽기 어려운 채로 남아요. 그 사이를 메우려고 만들었어요.",
  ],
  originSource:
    "근거: 대법원 예규(2026. 1. 1. 시행) · 사법정책연구원 「장애인 등을 위한 이해하기 쉬운(Easy-Read) 판결서 작성방안」(2024)",
} as const;

/**
 * 업로드. `PAGES.md` §4
 *
 * 이 화면의 문구는 두 가지를 반드시 말한다.
 * 1. **개인정보를 가린다는 것** — 판결문에는 이름·주민번호·주소가 그대로 들어 있다.
 * 2. **쿠키를 지우면 문서를 되찾을 수 없다는 것** — 로그인이 없는 대가다.
 *    나중에 문서를 잃고 놀라는 것보다 지금 아는 편이 낫다.
 */
export const upload = {
  title: "판결문 올리기",
  intro: "받으신 판결문을 붙여 넣으면 개인정보를 가린 뒤 문장 단위로 정리해 드려요.",
  textLabel: "판결문 내용",
  textPlaceholder: "판결문 전체를 붙여 넣어 주세요.",
  fileLabel: "또는 텍스트 파일 고르기",
  fileHint: "지금은 글자로 된 파일(.txt)만 받아요. PDF는 아직 준비 중이에요.",
  fileChosen: (name: string) => `${name} 파일을 골랐어요. 붙여 넣으신 내용 대신 이 파일을 써요.`,
  titleLabel: "문서 이름 (안 적으셔도 돼요)",
  titlePlaceholder: "예: 우리 집 보증금 사건",
  caseNoLabel: "사건번호 (아시면 적어 주세요)",
  caseNoPlaceholder: "2019가단12345",
  retentionLabel: "얼마나 보관할까요?",
  /** 화면에 나오는 순서. 객체 키 순서에 기대지 않는다. */
  retentionOrder: ["7", "30", "90", "keep"],
  retentionDefault: "30",
  retentionOptions: {
    "7": "7일 뒤 자동 삭제",
    "30": "30일 뒤 자동 삭제",
    "90": "90일 뒤 자동 삭제",
    keep: "내가 지울 때까지",
  },
  submit: "올리고 정리하기",
  submitting: "정리하고 있어요…",
  privacyTitle: "올리기 전에 알아 두실 것",
  privacyPoints: [
    "이름·주민등록번호·전화번호·주소는 올리는 즉시 가려요. 가리기 전 원문은 저장하지 않아요.",
    "가리기는 완벽하지 않아요. 정리된 문서를 한 번 확인해 주세요.",
    "이 브라우저에서만 열 수 있어요. 쿠키를 지우거나 다른 기기로 옮기면 되찾을 수 없어요.",
  ],
  errors: {
    empty: "판결문 내용을 넣어 주세요.",
    too_short: "판결문이라기에는 너무 짧아요. 전체를 붙여 넣어 주셨는지 확인해 주세요.",
    too_long: "문서가 너무 길어요. 나눠서 올려 주시겠어요?",
    no_sentences: "문장을 찾지 못했어요. 글자가 제대로 붙여졌는지 확인해 주세요.",
    file_unreadable: "파일을 읽지 못했어요. 내용을 직접 붙여 넣어 주시겠어요?",
  },
  duplicateNotice: "이미 올리신 문서예요. 그 문서를 열었어요.",
} as const;

/**
 * 내 문서 뷰어. `PAGES.md` §5
 *
 * 공개 판례 뷰어와 문구를 나눠 둔다 — 여기서는 "내 문서"라고 부르고, 보관 기한과
 * 삭제가 항상 함께 보여야 한다.
 */
export const doc = {
  maskTitle: "가린 개인정보",
  maskEmpty: "가릴 개인정보를 찾지 못했어요. 문서를 한 번 확인해 주세요.",
  maskHint: "무엇을 몇 개 가렸는지만 알려 드려요. 가린 내용은 저장하지 않아요.",
  maskCount: (label: string, count: number) => `${label} ${count}개`,
  maskKinds: {
    resident_registration_number: "주민등록번호",
    phone: "전화번호",
    email: "이메일",
    account: "계좌번호",
    card: "카드번호",
    vehicle: "차량번호",
    address: "주소",
    name: "이름",
  },
  retentionKeep: "직접 지우실 때까지 보관해요.",
  retentionUntil: (date: string, days: number) => `${date}에 자동으로 지워요. ${days}일 남았어요.`,
  retentionToday: "오늘 중에 자동으로 지워요.",
  charCount: (count: number) => `${count.toLocaleString("ko-KR")}자`,
  metaSeparator: " · ",
  uploadedAt: (date: string) => `${date}에 올리셨어요.`,
  deleteTitle: "이 문서 지우기",
  deleteBody: "지우면 되돌릴 수 없어요. 문장과 가린 기록까지 모두 사라져요.",
  deleteSubmit: "지울게요",
  notFoundTitle: "문서를 찾을 수 없어요",
  notFoundBody:
    "주소가 잘못됐거나, 다른 브라우저에서 올리신 문서일 수 있어요. 쿠키를 지우면 되찾을 수 없어요.",
} as const;

/** 내 문서함. `PAGES.md` §15 */
export const cases = {
  title: "내 문서함",
  intro: "이 브라우저에서 올리신 문서예요.",
  emptyTitle: "아직 올리신 문서가 없어요",
  emptyBody: "받으신 판결문을 올리면 개인정보를 가린 뒤 정리해 드려요.",
  uploadCta: "판결문 올리기",
  open: "열어 보기",
  count: (count: number) => `문서 ${count}개`,
} as const;

/**
 * 히어로의 레벨 데모 문구. `PAGES.md` §2
 *
 * **예시 문장이지 실제 판결문이 아니다.** 화면에서도 그렇게 밝힌다 — 판결문을 다루는
 * 서비스가 예시를 진짜처럼 보이게 두면 그 자체로 사고다.
 *
 * 소재는 조사 문서(`EASY-READ.md` §4.1)의 실제 사건 유형을 따랐다. 지적장애인이 구청의
 * 장애정도 판정에 불복해 취소를 구한 행정 사건으로, 국내 이지리드 판결서가 처음 나온 자리다.
 *
 * 각 단계의 문장은 우리 린터(`rendition/lint.ts`)의 규칙을 그대로 지킨다 —
 * L4는 공백을 뺀 20자 이하, 2인칭 고정, 단정적 승패 표현 없음.
 */
export const demo = {
  title: "같은 판결, 다섯 가지 말",
  hint: "단계를 골라 보세요. 같은 내용이 어떻게 달라지는지 보여 드려요.",
  caption: "이해를 돕기 위한 예시예요. 실제 판결문이 아니에요.",
  groupLabel: "예시 단계 고르기",
  notes: {
    L0: "법원이 쓴 그대로예요.",
    L1: "쟁점과 법리를 근거와 함께 정리해요.",
    L2: "결론부터, 나에게 무슨 일이 생기는지 알려 드려요.",
    L3: "무슨 일이 있었고 왜 그렇게 됐는지 풀어서 이야기해요.",
    L4: "짧은 문장으로, 다음에 할 일까지 알려 드려요.",
  },
  bodies: {
    L0: [
      "피고가 2022. 3. 15. 원고에 대하여 한 장애정도 미해당 결정처분을 취소한다.",
      "소송비용은 피고가 부담한다.",
    ],
    L1: [
      "장애정도 판정 기준의 해석·적용에 위법이 있다고 보아 처분을 취소하였다.",
      "소송비용은 패소자인 피고가 부담한다.",
    ],
    L2: [
      "법원은 구청의 결정을 취소했어요.",
      "재판에 든 비용은 구청이 내요.",
      "구청이 항소하면 재판을 다시 해요.",
    ],
    L3: [
      "구청은 이 사람이 장애가 있는 정도에 해당하지 않는다고 했어요.",
      "법원은 구청이 잘못 판단했다고 봤어요.",
      "그래서 구청의 결정을 없던 일로 했어요.",
    ],
    L4: [
      "구청의 결정은 잘못됐어요.",
      "당신은 다시 신청할 수 있어요.",
      "구청이 항소하면 재판을 또 해요.",
    ],
  },
} as const;

/**
 * 가입·로그인. `PAGES.md` §17
 *
 * 이 화면의 문구가 반드시 말해야 하는 것: **가입하면 지금까지 올린 문서가 그대로
 * 따라온다는 것**, 그리고 **로그인은 그렇지 않다는 것**. 둘을 구분해 두지 않으면
 * 사용자는 문서가 사라졌다고 생각한다.
 *
 * 오류 문구는 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분하지 않는다.
 * 구분해 알려 주면 로그인 창이 가입 여부를 조회하는 도구가 된다.
 */
export const auth = {
  signUpTitle: "회원가입",
  signUpIntro:
    "이메일과 비밀번호만 있으면 돼요. 지금 이 브라우저에 올려 두신 문서는 그대로 따라와요.",
  signUpSubmit: "가입할게요",
  signUpSubmitting: "가입하고 있어요…",
  signUpDone: "가입했어요. 이제 다른 기기에서도 문서를 여실 수 있어요.",
  toLogin: "이미 가입하셨나요? 로그인",

  logInTitle: "로그인",
  logInIntro: "가입하실 때 쓰신 이메일과 비밀번호를 넣어 주세요.",
  logInSubmit: "로그인",
  logInSubmitting: "확인하고 있어요…",
  toSignUp: "아직 계정이 없으신가요? 회원가입",
  logInCarryOver:
    "가입 없이 이 브라우저에 올려 두신 문서가 있다면, 로그인 대신 회원가입을 하세요. 로그인은 다른 계정으로 갈아타는 것이라 그 문서는 따라오지 않아요.",

  emailLabel: "이메일",
  emailPlaceholder: "hong@example.com",
  passwordLabel: "비밀번호",
  passwordHint: (min: number) =>
    `${min}자 이상이면 돼요. 대문자나 특수문자는 요구하지 않아요 — 길수록 안전해요.`,

  logOut: "로그아웃",
  signedInAs: (email: string) => `${email} 계정으로 보고 있어요.`,

  whyTitle: "가입하면 무엇이 달라지나요",
  whyPoints: [
    "다른 기기에서도 올린 문서를 여실 수 있어요.",
    "쿠키를 지우셔도 문서를 되찾을 수 있어요.",
    "이메일과 비밀번호만 받아요. 이름이나 전화번호는 묻지 않아요.",
  ],

  errors: {
    email_required: "이메일을 넣어 주세요.",
    email_invalid: "이메일 형식이 아닌 것 같아요. 다시 확인해 주시겠어요?",
    email_taken: "이미 가입된 이메일이에요. 로그인해 주시겠어요?",
    password_required: "비밀번호를 넣어 주세요.",
    password_too_short: "비밀번호가 짧아요. 조금 더 길게 만들어 주세요.",
    password_too_long: "비밀번호가 너무 길어요. 조금 줄여 주시겠어요?",
    password_too_common: "너무 흔한 비밀번호예요. 다른 것으로 바꿔 주세요.",
    password_contains_email: "비밀번호에 이메일 앞부분이 들어 있어요. 다른 것으로 바꿔 주세요.",
    credentials_invalid: "이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주시겠어요?",
    too_many_attempts: "여러 번 틀리셨어요. 잠시 뒤에 다시 해 주시겠어요?",
  },
} as const;

export const search = {
  title: "검색 결과",
  searchedByCaseNumber: (canonical: string) => `${canonical} 사건번호로 찾아봤어요.`,
  resultsForKeyword: (query: string) =>
    `사건번호 형식이 아니라서 "${query}"${pickJosa(query, "으로/로")} 찾아봤어요.`,
  emptyQuery: "찾을 사건번호나 내용을 입력해 주세요.",
  notFoundTitle: "공개된 판결문 중에는 없어요",
  notFoundBody:
    "1심·2심 판결문은 대부분 공개되지 않아요. 받으신 판결문을 올리면 바로 쉽게 바꿔 드릴게요.",
  unknownCode: (code: string) =>
    `"${code}"${pickJosa(code, "은/는")} 저희가 아는 사건부호가 아니에요. 다시 확인해 주세요.`,
  yearOutOfRange: "사건번호의 연도가 맞지 않는 것 같아요. 다시 확인해 주세요.",
  codeHelpTitle: "사건번호는 이렇게 생겼어요",
  codeSeparator: " · ",
  codeHelpBody: "연도 + 사건부호 + 번호 순서예요. 예를 들면 2019도12345처럼요.",
  explanationReady: "설명 준비됨",
  retry: "사건번호 다시 확인하기",
  uploadCta: "판결문 올리기",
  apiUnavailableTitle: "지금은 판례를 찾아볼 수 없어요",
  apiUnavailableBody:
    "판례 조회 기능이 아직 연결되지 않았어요. 받으신 판결문을 올리면 바로 쉽게 바꿔 드릴게요.",
  apiErrorTitle: "판례를 가져오지 못했어요",
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
  sourceLabel: "출처:",
  seeSearchResult: "검색 결과 보기",
  sourceLinkLabel: "국가법령정보센터에서 원문 보기",
  notAvailableTitle: "이 사건의 판결문을 아직 볼 수 없어요",
  notAvailableBody: "공개된 판결문이 없거나 지금은 가져올 수 없어요.",
  generatorOffTitle: "설명 만들기가 아직 준비되지 않았어요",
  generatorOffBody: "지금은 원문만 보여 드릴 수 있어요. 설명 만들기는 곧 열어 드릴게요.",
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

/**
 * 오류 화면. `DESIGN.md` §9
 *
 * 오류는 **원인과 다음 단계를 함께** 적고 사용자를 막다른 곳에 두지 않는다.
 * 사과를 늘어놓지 않고, 느낌표를 쓰지 않고, 무엇을 하면 되는지를 말한다.
 *
 * 화면이 차갑지 않도록 그림을 하나 두되(`PaperFigure`) 문구는 담담하게 둔다 —
 * 판결문을 다루다 막힌 사람에게 명랑한 말투는 도움이 아니라 소음이다.
 */
export const errors = {
  notFoundTitle: "찾는 문서가 없어요",
  notFoundBody:
    "주소가 바뀌었거나 문서가 지워졌을 수 있어요. 올리신 문서라면 다른 브라우저에서 올리신 것일 수도 있어요.",
  genericTitle: "문제가 생겼어요",
  genericBody: "저희 쪽 문제예요. 잠시 뒤에 다시 해 보시면 될 때가 많아요.",
  /** 오류 식별자. 문의할 때 이 값이 있으면 서버 기록에서 바로 찾을 수 있다. */
  errorCode: (digest: string) => `오류 번호: ${digest}`,
  errorCodeHint: "문의하실 때 이 번호를 함께 알려 주시면 빨리 찾을 수 있어요.",
  backHome: "처음으로 가기",
  toSearch: "사건번호로 찾아보기",
  toUpload: "판결문 올리기",
  retry: "다시 해 보기",
} as const;
