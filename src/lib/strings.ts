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
  /** 스켈레톤이 떠 있는 동안 스크린리더에 알리는 이름. */
  loading: "불러오는 중이에요",
  nav: {
    menuLabel: "주요 메뉴",
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
  openSource: "오픈소스 라이선스와 출처",
  /**
   * KRDS 출처 표기. `DESIGN.md` §13.1의 이용 조건이 요구하는 **유일한 의무**다.
   * §2가 "KRDS라는 이름은 푸터 attribution에만"이라고 정했으므로 자리도 여기다.
   */
  attribution:
    "화면 디자인은 범정부 디자인시스템(KRDS)의 공개 규격을 참고했어요. EasyLaw는 정부 서비스가 아니에요.",
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
  signInTitle: "판결문을 올리려면 로그인이 필요해요",
  signInBody:
    "판결문에는 이름·주민등록번호·주소가 그대로 들어 있어요. 그 문서를 누가 올렸고 누구만 볼 수 있는지가 확실해야 해서, 계정을 만들어 주셔야 해요.",
  privacyTitle: "올리기 전에 알아 두실 것",
  privacyPoints: [
    "이름·주민등록번호·전화번호·주소는 올리는 즉시 가려요. 가리기 전 원문은 저장하지 않아요.",
    "가리기는 완벽하지 않아요. 정리된 문서를 한 번 확인해 주세요.",
    "올리신 문서는 내 계정에서만 보여요. 다른 기기에서 로그인하셔도 그대로 있어요.",
  ],
  errors: {
    empty: "판결문 내용을 넣어 주세요.",
    too_short: "판결문이라기에는 너무 짧아요. 전체를 붙여 넣어 주셨는지 확인해 주세요.",
    too_long: "문서가 너무 길어요. 나눠서 올려 주시겠어요?",
    no_sentences: "문장을 찾지 못했어요. 글자가 제대로 붙여졌는지 확인해 주세요.",
    file_unreadable: "파일을 읽지 못했어요. 내용을 직접 붙여 넣어 주시겠어요?",
    sign_in_required: "로그인이 풀렸어요. 다시 로그인하시면 넣으신 내용 그대로 올려 드릴게요.",
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
  notFoundBody: "주소가 잘못됐거나, 다른 계정으로 올리신 문서일 수 있어요.",
} as const;

/** 내 문서함. `PAGES.md` §15 */
export const cases = {
  title: "내 문서함",
  intro: "올리신 판결문이에요.",
  signInTitle: "로그인하시면 올리신 문서를 보실 수 있어요",
  signInBody: "문서는 계정에 저장돼요. 로그인하시면 어느 기기에서든 그대로 열려요.",
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
  signUpIntro: "이메일과 비밀번호만 있으면 돼요. 이름이나 전화번호는 묻지 않아요.",
  signUpSubmit: "가입할게요",
  signUpSubmitting: "가입하고 있어요…",
  signUpDone: "가입했어요. 이제 다른 기기에서도 문서를 여실 수 있어요.",
  toLogin: "이미 가입하셨나요? 로그인",

  logInTitle: "로그인",
  logInIntro: "가입하실 때 쓰신 이메일과 비밀번호를 넣어 주세요.",
  logInSubmit: "로그인",
  logInSubmitting: "확인하고 있어요…",
  toSignUp: "아직 계정이 없으신가요? 회원가입",

  emailLabel: "이메일",
  emailPlaceholder: "hong@example.com",
  passwordLabel: "비밀번호",
  passwordHint: (min: number) =>
    `${min}자 이상이면 돼요. 대문자나 특수문자는 요구하지 않아요 — 길수록 안전해요.`,

  logOut: "로그아웃",
  signedInAs: (email: string) => `${email} 계정으로 보고 있어요.`,

  whyTitle: "가입하면 무엇이 달라지나요",
  whyPoints: [
    "받으신 판결문을 올려서 쉬운 말로 바꿔 보실 수 있어요.",
    "다른 기기에서 로그인하셔도 올리신 문서가 그대로 있어요.",
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

/**
 * 화면 설정. `PAGES.md` §17 · `DESIGN.md` §10
 *
 * 컨트롤 구성은 KRDS가 자기 사이트에서 쓰는 "글자·화면 표시 설정" 패널을 그대로 따랐다.
 * 이 화면의 1차 사용자는 글자가 작아 못 읽거나 대비가 낮아 못 읽는 사람이다.
 * 그래서 **저장 버튼을 누르기 전에 이미 바뀌어 있어야 한다** — 바뀐 것을 보고 고르는
 * 화면이지, 고른 뒤에 확인하는 화면이 아니다.
 */
export const settings = {
  title: "화면 설정",
  intro: "이 브라우저에만 저장돼요. 로그인하지 않으셔도 쓰실 수 있어요.",
  liveHint: "고르시면 바로 화면에 적용돼요.",

  textSizeLabel: "글자 크기",
  /** 크기 견본에 쓰는 글자. 다국어에서는 그 언어의 대표 글자로 바뀐다. */
  sampleGlyph: "가",
  textSizes: {
    s: "작게",
    m: "보통",
    l: "조금 크게",
    xl: "크게",
    xxl: "가장 크게",
  },

  displayLabel: "화면 표시 모드",
  displays: {
    light: "기본",
    more: "선명하게",
    system: "시스템 설정",
  },
  displayHints: {
    light: "밝은 배경에 검은 글씨예요.",
    more: "어두운 배경에 흰 글씨로 또렷하게 보여 드려요.",
    system: "쓰시는 기기의 설정을 따라가요.",
  },

  previewLabel: "이렇게 보여요",
  previewSentences: ["구청의 결정은 잘못됐어요.", "당신은 다시 신청할 수 있어요."],
  previewNote: "쉬운말 단계의 글자 크기예요. 가장 크게 보여 드리는 단계예요.",

  reset: "처음 설정으로 되돌리기",
  resetDone: "처음 설정으로 되돌렸어요.",

  laterTitle: "곧 더해질 설정",
  laterPoints: ["기본으로 열 단계 고르기", "음성으로 읽어 주기와 읽는 속도", "난독증 지원 글꼴"],
  laterNote: "아직 준비 중이에요. 준비되면 여기에 더해 드릴게요.",
} as const;

/**
 * 이용 안내. `PAGES.md` §20 — **쉬운 말 버전을 함께 제공한다.**
 *
 * 도움말이 어려우면 도움말이 아니다. 이 서비스가 판결문에 대고 하는 일을 이 서비스의
 * 안내문에도 그대로 한다 — 같은 내용을 두 가지 말로 적고, 읽는 사람이 고른다.
 *
 * `plain` 쪽 문장은 L4 규칙을 지킨다(공백 제외 20자 이하, 2인칭 고정, 비유 없음).
 * 테스트가 우리 린터로 이 문장들을 검사한다.
 */
export const help = {
  title: "이용 안내",
  intro: "EasyLaw가 무엇을 하고, 무엇을 하지 않는지 적어 두었어요.",
  toggleLabel: "설명 방식 고르기",
  modes: {
    full: "자세한 설명",
    plain: "쉬운 말",
  },

  full: [
    {
      heading: "무엇을 하는 서비스인가요",
      body: [
        "판결문은 법률 전문가를 독자로 삼아 쓰인 문서예요. 그래서 정작 그 판결을 받은 사람이 자기 사건의 결과를 이해하지 못하는 일이 생겨요.",
        "EasyLaw는 판결문을 읽는 사람에 맞춰 다시 써 드려요. 원문은 그대로 두고, 그 옆에 법조계·일반인·어린이·쉬운말 네 가지 설명을 나란히 놓아요.",
      ],
    },
    {
      heading: "어떻게 쓰나요",
      body: [
        "첫째, 사건번호로 찾기. 2019도12345처럼 사건번호를 넣으면 공개된 판례를 찾아 드려요. 다만 1심·2심 판결문은 대부분 공개되지 않아요.",
        "둘째, 판결문 올리기. 받으신 판결문을 직접 올리시면 돼요. 이 경우에는 로그인이 필요해요. 판결문에는 개인정보가 그대로 들어 있어서, 그 문서의 주인이 누구인지가 확실해야 하기 때문이에요.",
      ],
    },
    {
      heading: "네 가지 설명은 어떻게 다른가요",
      body: [
        "법조계 단계는 쟁점과 법리를 근거와 함께 정리해요. 일반인 단계는 결론부터 말하고 나에게 무슨 일이 생기는지 알려 드려요.",
        "어린이 단계는 무슨 일이 있었고 왜 그렇게 됐는지 풀어서 이야기해요. 쉬운말 단계는 짧은 문장으로, 다음에 할 일까지 알려 드려요.",
      ],
    },
    {
      heading: "조심하셔야 할 것",
      body: [
        "설명은 AI가 만들어요. 사람이 하나하나 확인한 것이 아니에요. 중요한 결정을 하시기 전에는 반드시 원문과 함께 보시고, 변호사나 대한법률구조공단에 물어보세요.",
        "법적 효력이 있는 것은 법원이 보낸 원본 판결문이에요. 여기 설명은 참고 자료예요.",
        "특히 항소·상고 기한은 놓치면 되돌릴 수 없어요. 기한은 반드시 원문과 법원 안내로 확인해 주세요.",
      ],
    },
    {
      heading: "개인정보는 어떻게 다루나요",
      body: [
        "올리신 판결문에서 이름·주민등록번호·전화번호·주소 같은 개인정보는 올리는 즉시 가려요. 가리기 전 원문은 저장하지 않아요.",
        "다만 가리기가 완벽하지는 않아요. 호칭 없이 나오는 이름처럼 형태만으로 알아볼 수 없는 것은 놓칠 수 있어요. 정리된 문서를 한 번 확인해 주세요.",
        "자세한 내용은 개인정보 처리방침에 적어 두었어요.",
      ],
    },
  ],

  plain: [
    {
      heading: "이게 뭐예요",
      body: [
        "판결문은 어려운 말로 쓰여 있어요.",
        "우리는 그걸 쉬운 말로 바꿔 드려요.",
        "원래 판결문도 함께 보여 드려요.",
      ],
    },
    {
      heading: "어떻게 써요",
      body: [
        "사건번호를 넣으면 찾아 드려요.",
        "판결문이 있으면 올려도 돼요.",
        "올리려면 먼저 로그인을 해요.",
      ],
    },
    {
      heading: "조심할 것",
      body: [
        "설명은 기계가 만들어요.",
        "틀릴 수 있어요.",
        "중요한 일은 변호사에게 물어보세요.",
        "진짜 힘이 있는 것은 법원 판결문이에요.",
      ],
    },
    {
      heading: "그래서 어떻게 되나요",
      body: [
        "다음에 할 일이 있을 수 있어요.",
        "날짜를 넘기면 되돌릴 수 없어요.",
        "날짜는 판결문에서 꼭 확인하세요.",
      ],
    },
    {
      heading: "내 정보는요",
      body: ["이름과 주소는 바로 가려요.", "가리기 전 글은 두지 않아요.", "언제든 지울 수 있어요."],
    },
  ],
} as const;

/**
 * 개인정보 처리방침. `PAGES.md` §20
 *
 * **여기 적힌 것은 전부 코드가 실제로 하는 일이다.** 처리방침은 약속이지 소개문이 아니라서,
 * 코드와 어긋나는 문장을 한 줄이라도 넣으면 나머지 전부를 믿을 수 없게 된다.
 * 저장 항목은 `src/db/app/schema.ts`, 마스킹은 `src/lib/text/mask.ts`,
 * 외부 전송은 `src/lib/law-api`가 근거다. 그 파일들이 바뀌면 이 문서도 같은 커밋에서 바꾼다.
 */
export const privacy = {
  title: "개인정보 처리방침",
  intro: "무엇을 받고, 어디에 두고, 언제 지우는지 적어 두었어요.",
  updatedAt: "2026년 8월 30일부터 적용해요.",
  sections: [
    {
      heading: "받는 것",
      body: [
        "계정을 만드실 때 이메일과 비밀번호를 받아요. 비밀번호는 되돌릴 수 없는 형태로 바꿔 저장하고, 원래 비밀번호는 어디에도 두지 않아요.",
        "올리신 판결문은 개인정보를 가린 뒤 문장 단위로 저장해요. 무엇을 몇 개 가렸는지도 함께 저장하지만, 가린 내용 자체는 저장하지 않아요.",
        "로그인 상태를 유지하려고 쿠키 하나를 써요. 문서를 올리거나 지우신 시각도 기록에 남겨요.",
      ],
    },
    {
      heading: "받지 않는 것",
      body: [
        "이름, 전화번호, 주소, 생년월일, 결제 정보는 받지 않아요.",
        "방문자를 따라다니며 기록하는 분석 도구나 광고 추적기를 쓰지 않아요.",
      ],
    },
    {
      heading: "개인정보를 가리는 방법",
      body: [
        "판결문을 올리시면 저장하기 전에 주민등록번호·전화번호·계좌번호·카드번호·차량번호·이메일·상세 주소, 그리고 호칭 뒤의 이름을 가려요. 가리기 전 원문은 저장하지 않아요.",
        "다만 가리기가 완벽하지는 않아요. 형식이 정해진 번호는 잘 찾지만, 호칭 없이 나오는 이름처럼 형태만으로 알아볼 수 없는 것은 놓칠 수 있어요. 이 기능은 위험을 줄이는 장치이지 완전한 익명화 보증이 아니에요.",
      ],
    },
    {
      heading: "얼마나 보관하나요",
      body: [
        "문서를 올리실 때 7일·30일·90일·직접 지울 때까지 중에서 고르실 수 있어요. 고르신 기간이 지나면 자동으로 지워요.",
        "문서를 지우시면 그 문장과 가린 기록도 함께 사라져요. 되돌릴 수 없어요.",
        "언제 무엇이 지워졌는지는 기록으로 남겨요. 문서 내용은 그 기록에 들어가지 않아요.",
      ],
    },
    {
      heading: "밖으로 나가는 정보",
      body: [
        "올리신 판결문은 밖으로 보내지 않아요. 다른 곳에 팔거나 넘기지 않아요.",
        "공개된 판례를 찾으실 때는 법제처 국가법령정보 시스템에 사건번호를 보내요. 이때 보내는 것은 사건번호뿐이고, 올리신 문서는 함께 보내지 않아요.",
        "AI가 설명을 만드는 기능은 아직 연결돼 있지 않아요. 연결할 때는 어디로 무엇을 보내는지 이 문서에 먼저 적을게요.",
      ],
    },
    {
      heading: "지우고 싶으실 때",
      body: [
        "문서함에서 문서를 하나씩 지우실 수 있어요. 문서를 여시면 그 화면에서도 지울 수 있어요.",
        "계정 전체를 지우는 기능은 아직 준비 중이에요. 준비될 때까지는 문서를 지우시면 저장된 내용이 남지 않아요.",
      ],
    },
    {
      heading: "이 문서가 바뀌면",
      body: ["받는 정보나 보관 기간이 바뀌면 이 문서를 먼저 고치고 적용 날짜를 새로 적어요."],
    },
  ],
} as const;

/**
 * 오픈소스와 출처. `DESIGN.md` §13
 *
 * KRDS 출처 표기는 이용 조건이 요구하는 **의무**다(§13.1). 나머지는 의무가 아닌 것도 있지만
 * 무엇 위에 서 있는지 밝히는 편이 맞다. 버전과 라이선스는 `node_modules`에서 확인한 값이다.
 */
export const legal = {
  title: "오픈소스 라이선스와 출처",
  intro: "이 서비스가 무엇 위에 만들어졌는지 적어 두었어요.",
  sourcesTitle: "자료 출처",
  sources: [
    {
      name: "국가법령정보 공동활용 (법제처)",
      body: "공개된 판례의 사건 정보와 원문을 이곳에서 가져와요. 원문의 저작권과 정확성은 제공 기관에 있어요.",
    },
    {
      name: "범정부 디자인시스템 (KRDS)",
      body: "색·글자 크기·간격 같은 화면 규격을 참고했어요. 저작권법 제24조의2에 따라 출처를 밝히고 쓰고 있어요. EasyLaw는 정부 서비스가 아니고, 정부 상징이나 표식은 쓰지 않아요.",
    },
    {
      name: "사법정책연구원 「장애인 등을 위한 이해하기 쉬운(Easy-Read) 판결서 작성방안」(2024)",
      body: "쉬운 말 단계의 작성 규칙을 이 연구에서 가져왔어요.",
    },
  ],
  licensesTitle: "쓰고 있는 오픈소스",
  licenses: [
    { name: "Pretendard", version: "글꼴", license: "SIL Open Font License 1.1" },
    { name: "Next.js", version: "16.3.3", license: "MIT" },
    { name: "React", version: "19.2.8", license: "MIT" },
    { name: "Drizzle ORM", version: "0.45.2", license: "Apache-2.0" },
    { name: "better-sqlite3", version: "13.0.3", license: "MIT" },
    { name: "es-hangul", version: "2.4.0", license: "MIT" },
    { name: "Zod", version: "4.4.3", license: "MIT" },
  ],
  licenseLine: (version: string, license: string) => `${version} · ${license}`,
  licenseNote: "각 라이선스 전문은 해당 프로젝트의 저장소에서 보실 수 있어요.",
} as const;

/**
 * 설치 마법사. 서버를 처음 띄운 사람이 보는 화면이다.
 *
 * 읽는 사람이 다르다 — 여기까지 온 사람은 이 서비스를 **설치하는 사람**이지 판결문을
 * 읽으러 온 사람이 아니다. 그래도 문체는 같게 간다(해요체). 화면마다 목소리가 달라지면
 * 같은 서비스로 보이지 않는다.
 *
 * 건너뛸 수 있는 것과 없는 것을 분명히 나눈다. 관리자 계정은 없으면 아무것도 못 하므로
 * 필수, 외부 연결은 없어도 서비스가 돌아가므로 선택이다.
 */
export const setup = {
  title: "EasyLaw 설치",
  /** 설치 화면의 머리말. 여기 온 사람은 서비스 이용자가 아니라 서버를 세우는 사람이다. */
  chromeLabel: "설치",
  chromeNote: "이 서버를 처음 세우는 중이에요. 설치를 마치면 이 화면은 닫혀요.",
  stepLabel: (current: number, total: number) => `${total}단계 중 ${current}단계`,
  /** 단계 이름. 진행 표시줄과 스크린리더가 같은 이름을 쓴다. */
  stepNames: {
    environment: "환경 점검",
    account: "관리자 계정",
    service: "서비스 환경",
    connections: "외부 연결",
    done: "완료",
  },
  stepsLabel: "설치 단계",
  stepDone: "끝난 단계",
  stepCurrent: "지금 단계",

  environmentTitle: "서버를 먼저 살펴봤어요",
  environmentIntro:
    "이 서버가 EasyLaw를 돌릴 수 있는 상태인지 확인했어요. 설정을 다 넣은 뒤에 문제를 발견하면 어디가 잘못됐는지 찾기 어려워서, 시작하기 전에 먼저 봐요.",
  environmentOk: "모두 확인했어요. 다음으로 넘어가셔도 돼요.",
  environmentWarn:
    "몇 가지 알아 두실 것이 있어요. 지금 설치를 이어 가셔도 되지만, 아래 내용을 한 번 읽어 주세요.",
  environmentFail:
    "먼저 해결하셔야 하는 것이 있어요. 아래 빨간 항목을 고치신 뒤 이 화면을 새로 고쳐 주세요.",
  environmentRecheckBody:
    "이 검사는 화면을 열 때마다 다시 해요. 무언가 고치신 뒤에는 아래 '다시 검사하기'를 눌러 주세요.",
  environmentRecheck: "다시 검사하기",
  environmentSubmit: "확인했어요, 다음으로",
  levels: {
    ok: "좋아요",
    warn: "확인해 주세요",
    fail: "고쳐야 해요",
  },

  serviceTitle: "이 서버의 환경을 알려 주세요",
  serviceIntro:
    "날짜를 어떻게 보여 드릴지, 주소가 https인지에 관한 설정이에요. 둘 다 나중에 관리자 화면에서 바꾸실 수 있어요.",
  serviceSubmit: "저장하고 다음으로",

  timeZoneTitle: "시간대",
  timeZoneBody:
    "판결 선고일, 문서를 올리신 날, 자동 삭제까지 남은 날을 셀 때 쓰는 기준이에요. 서버가 어디에 놓여 있든 이용하시는 분들이 보는 '오늘'은 하나여야 해서, 나라나 지역이 아니라 이 서비스의 기준 시간대를 고르시는 거예요.",
  timeZoneLabel: "기준 시간대",
  timeZoneHint: "한국에서 쓰신다면 Asia/Seoul 그대로 두시면 돼요.",

  httpsTitle: "주소가 https인가요",
  httpsBody:
    "https로 서비스하시면 로그인 쿠키에 '암호화된 연결에서만 보내기' 표시를 붙여요. 그러면 중간에서 쿠키를 가로채기 어려워져요.",
  /**
   * 예전에는 "http에서 켜면 로그인이 막힌다"고 적혀 있었다. 이제는 막히지 않는다 —
   * http 요청에는 `Secure`를 붙이지 않는다(`server/request.ts`). 문구도 그에 맞춘다.
   * 코드가 하는 일과 다른 안내는 없느니만 못하다.
   */
  httpsWarn:
    "http로 접속하시는 동안에는 이 설정이 적용되지 않아요. http 요청에 https 전용 쿠키를 붙이면 브라우저가 버려서 로그인이 풀리기 때문이에요. https로 서비스하실 거라면 켜 두세요.",
  httpsLabel: "https로 서비스해요",

  accountTitle: "관리자 계정을 만들어 주세요",
  accountIntro:
    "이 서버를 관리할 계정이에요. 서비스 설정을 바꾸고, 나중에 다른 사람의 문서를 다루는 기능이 생기면 그 권한도 여기에 붙어요. 처음 만드는 계정 하나만 관리자가 돼요 — 설치가 끝나면 이 화면이 닫히기 때문에, 이 계정의 이메일과 비밀번호는 꼭 기억해 주세요.",
  accountSubmit: "계정 만들고 다음으로",
  accountSubmitting: "만들고 있어요…",

  connectionsTitle: "외부 연결을 설정해 주세요",
  connectionsIntro:
    "지금 넣지 않으셔도 돼요. 나중에 관리자 화면에서 넣으실 수 있어요. 넣지 않으면 그 기능만 꺼진 채로 서비스가 돌아가요.",
  connectionsSubmit: "저장하고 다음으로",
  connectionsSubmitting: "저장하고 있어요…",

  lawApiTitle: "판례 조회",
  lawApiBody:
    "법제처 국가법령정보 공동활용에서 받은 인증키(OC)예요. 없으면 사건번호로 공개 판례를 찾는 기능이 꺼져요. 올린 판결문을 보는 기능은 그대로 동작해요.",
  lawApiLabel: "법제처 인증키(OC)",
  lawApiPlaceholder: "발급받으신 OC 값",

  llmTitle: "설명 만들기",
  llmBody:
    "판결문을 쉬운 말로 바꾸는 데 쓰는 AI 연결이에요. 없으면 원문만 보여 드리고 설명 만들기 버튼이 꺼져요.",
  llmBaseUrlLabel: "API 주소",
  llmBaseUrlPlaceholder: "https://api.example.com/v1",
  llmApiKeyLabel: "API 키",
  llmModelLabel: "모델 이름",
  limitLabel: "하루 설명 생성 상한",
  limitHint: "설명 만들기 버튼은 곧 지출이에요. 하루에 몇 번까지 허용할지 정해요.",

  /**
   * 관리자가 이미 있는데 그 사람으로 들어와 있지 않을 때. 흔한 상태다 —
   * 계정만 만들고 창을 닫았거나, 쿠키가 지워졌거나, 다른 브라우저로 열었거나.
   */
  accountSignInTitle: "관리자로 다시 들어와 주세요",
  accountSignInIntro: "설치를 이어서 하려면 먼저 관리자 계정으로 들어와야 해요.",
  accountSignInSubmit: "들어가기",
  accountSignInSubmitting: "확인하고 있어요…",
  accountExistsTitle: "관리자 계정은 이미 만들어져 있어요",
  accountExistsBody:
    "관리자는 처음 한 번만 만들어져요. 만드신 계정으로 들어오시면 다음 단계로 이어져요.",

  doneTitle: "설치가 끝났어요",
  doneIntro: "이제 서비스를 쓰실 수 있어요. 아래 설정은 관리자 화면에서 언제든 바꾸실 수 있어요.",
  doneSubmit: "시작하기",
  configured: "설정됨",
  notConfigured: "설정 안 됨",
  optionalNote: "선택 항목이에요. 비워 두시면 그 기능만 꺼져요.",

  /** 설정 항목의 사람이 읽는 이름. 저장소 키를 화면에 그대로 내보내지 않는다. */
  settingNames: {
    time_zone: "기준 시간대",
    secure_cookies: "https 전용 쿠키",
    law_api_oc: "법제처 인증키",
    llm_base_url: "AI API 주소",
    llm_api_key: "AI API 키",
    llm_model: "AI 모델",
    generation_daily_limit: "하루 생성 상한",
  },
  closedTitle: "설치는 이미 끝났어요",
  closedBody: "설치 마법사는 처음 한 번만 열려요. 설정을 바꾸시려면 관리자 화면으로 가세요.",
  toAdmin: "관리자 화면으로",
} as const;

/**
 * 관리자 화면. 설치 뒤에 설정을 바꾸는 유일한 통로다.
 *
 * 마법사에서 넣은 값을 나중에 못 고치면, 오타 하나가 서버를 다시 설치해야 하는 이유가 된다.
 */
export const admin = {
  title: "관리자 설정",
  intro: "서비스 설정을 바꾸실 수 있어요. 이 화면은 관리자만 볼 수 있어요.",
  save: "저장",
  saving: "저장하고 있어요…",
  saved: "저장했어요.",
  /**
   * 예전에는 비밀 항목의 값을 아예 돌려주지 않고 "설정됨/설정 안 됨"만 알렸다. 그러면
   * 무엇이 들어 있는지 확인할 방법이 없어서 오타를 눈으로 잡을 수 없었다. 이제 값을
   * 채워 두고 가려 놓는다 — 규칙도 함께 단순해졌다.
   */
  secretShow: "보기",
  secretHide: "가리기",
  secretHint: "저장된 값이 가려진 채로 들어 있어요. 비우고 저장하시면 지워져요.",
  deniedTitle: "관리자만 볼 수 있어요",
  deniedBody: "이 화면은 서버를 설치한 계정으로만 들어오실 수 있어요.",
} as const;

/**
 * 연결 시험 화면.
 *
 * 넣은 키가 맞는지 **그 자리에서** 알려 준다. 저장한 뒤 판례를 하나 찾아보고 안 나오면,
 * 키가 틀린 건지 그 판례가 공개되지 않은 건지(`PRODUCT.md` §5.4) 구분할 방법이 없다.
 */
export const adminTest = {
  title: "연결 시험",
  intro: "저장된 설정으로 실제로 한 번씩 불러 봤어요.",
  back: "관리자 설정으로 돌아가기",
  run: "다시 시험하기",
  lawLabel: "법제처 판례 조회",
  llmLabel: "AI 연결",

  okTitle: "잘 통했어요",
  failedTitle: "통하지 않았어요",
  notConfiguredTitle: "아직 설정하지 않으셨어요",
  notConfiguredBody: "이 기능은 꺼진 채로 동작해요. 관리자 설정에서 값을 넣으시면 켜져요.",

  elapsed: (ms: number) => `${ms}ms 걸렸어요.`,
  lawOk: (caseNo: string, count: number) => `${caseNo} 조회에 ${count}건이 왔어요.`,
  /**
   * 0건도 성공이다 — 키가 맞아야 목록 응답 자체가 온다. 인증이 틀리면 JSON 대신 HTML
   * 안내가 와서 오류로 떨어진다. 이 시험이 보는 것은 "판례가 있는가"가 아니라
   * "우리 키로 말이 통하는가"다.
   */
  lawZeroNote: "0건이어도 키는 맞아요. 인증이 틀리면 응답 자체가 오지 않아요.",
  llmOk: (model: string, answer: string) =>
    `${model}${pickJosa(model, "이/가")} "${answer}"라고 답했어요.`,
  llmEmpty: "모델이 빈 응답을 보냈어요.",
  unknownError: "알 수 없는 이유로 실패했어요.",
} as const;

/**
 * 로그인 뒤 첫 화면.
 *
 * 랜딩의 문구를 다시 쓰지 않는다. 이미 들어온 사람에게 "이게 뭔지"를 다시 설명하는 것은
 * 자리 낭비다. 필요한 것은 하던 일로 돌아가는 길이다.
 */
export const workspace = {
  title: "내 작업",
  greeting: (email: string | null) =>
    email === null ? "다시 오셨네요" : `${email}님, 다시 오셨네요`,
  intro: "사건번호로 판례를 찾거나, 받으신 판결문을 올려 쉬운 말로 바꿔 보세요.",
  docsTitle: "최근 올린 판결문",
  seeAll: (count: number) => (count > 0 ? `문서함 전체 보기 (${count}개)` : "문서함 열기"),
  untitled: "이름 없는 문서",
  emptyBody: "아직 올리신 판결문이 없어요. 받으신 판결문을 올리면 쉬운 말로 바꿔 드려요.",
  uploadTitle: "판결문 올리기",
  uploadBody: "받으신 판결문을 올리면 개인정보를 가린 뒤 쉬운 말로 바꿔 드려요.",
  uploadCta: "판결문 올리기",
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

/**
 * 법령 화면.
 *
 * **판결 당시의 법**을 보여 준다는 사실을 화면에서 분명히 말한다. 현행법으로 착각하면
 * 지금 상황에 그대로 적용해 버릴 수 있고, 그건 이 서비스가 가장 피해야 할 오해다.
 */
export const law = {
  effectiveAt: "이 판의 시행일",
  articleCount: "조문 수",
  articles: (count: number) => `${count}개`,
  source: "출처",
  sourceName: "국가법령정보센터",
  asOfNote:
    "이 판결이 선고될 때 시행 중이던 법이에요. 지금 시행 중인 법과 다를 수 있으니, 현재 상황에 적용하시려면 최신 법을 다시 확인해 주세요.",
  /** 조 제목을 괄호에 넣는다. 리터럴을 화면 코드에 흩지 않는다(§9). */
  articleTitle: (title: string) => `(${title})`,
  articleLabel: (articleNo: string, branchNo: string) =>
    branchNo.length > 0 ? `제${articleNo}조의${branchNo}` : `제${articleNo}조`,

  problems: {
    unknown_law: {
      title: "이 법을 아직 몰라요",
      body: "저희가 가진 법령 목록에 없어요. 이름이 조금 다르거나, 아직 받아 오지 않았을 수 있어요.",
    },
    not_in_force: {
      title: "그때는 아직 없던 법이에요",
      body: "이 법은 판결이 선고된 뒤에 만들어졌거나 시행됐어요.",
    },
    api_unavailable: {
      title: "법령 본문을 가져올 수 없어요",
      body: "법제처 연결이 아직 설정되지 않았어요.",
    },
    api_error: {
      title: "법령 본문을 가져오지 못했어요",
      body: "잠시 뒤에 다시 열어 봐 주세요.",
    },
  },
} as const;

export const viewer = {
  /** 인용 링크의 툴팁. 어디로 가는지 미리 알려 준다. */
  citationHint: (lawName: string, article: string) => `${lawName} ${article} 보기`,

  levels: {
    L0: "원문",
    L1: "법조",
    L2: "일반",
    L3: "어린이",
    L4: "쉬운말",
  },
  /**
   * 단계마다 어떤 말로 쓰는지. 랜딩 데모와 뷰어가 **같은 문구를 쓴다** —
   * 첫 화면에서 본 설명과 실제 화면의 설명이 다르면 고른 단계를 믿을 수 없다.
   */
  levelNotes: {
    L0: "법원이 쓴 그대로예요.",
    L1: "쟁점과 법리를 근거와 함께 정리해요.",
    L2: "결론부터, 나에게 무슨 일이 생기는지 알려 드려요.",
    L3: "무슨 일이 있었고 왜 그렇게 됐는지 풀어서 이야기해요.",
    L4: "짧은 문장으로, 다음에 할 일까지 알려 드려요.",
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
  generateHint: "아직 아무도 만들지 않았어요",
  generateBody: "이 판결의 설명을 만들면 다음에 오는 사람도 바로 볼 수 있어요.",
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
  /**
   * 생성된 설명 화면.
   *
   * **원본이 아니라는 고지를 본문 위에 둔다**(P1). 아래에 두면 다 읽은 뒤에야 보인다.
   */
  notOriginal:
    "이 설명은 AI가 만든 것이고 원본 판결서가 아니에요. 법적 효력이 있는 것은 법원이 보낸 원본이에요.",
  needsCheckSummary: (count: number) =>
    `${count}개 문장은 원문만으로 확인하기 어려웠어요. 그 문장에 표시해 두었어요.`,
  generateWait: "수십 초 걸려요.",

  generatorOffTitle: "설명 만들기가 아직 준비되지 않았어요",
  generatorOffBody: "지금은 원문만 보여 드릴 수 있어요. 설명 만들기는 곧 열어 드릴게요.",
  /** 결과 배지 옆 라벨. 색이 아니라 글자가 의미를 전한다(`DESIGN.md` §10). */
  outcomeLabel: "이 재판의 결과",
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
    "주소가 바뀌었거나 문서가 지워졌을 수 있어요. 올리신 문서를 찾고 계시다면 로그인하셨는지 확인해 주세요.",
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
