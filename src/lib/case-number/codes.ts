/**
 * 사건부호 표.
 *
 * `PRODUCT.md` §5.2 — 부호 표는 하드코딩이 아니라 **데이터**로 둔다. 새 부호가 생기면
 * 이 배열에 한 줄을 더할 뿐 파서를 고치지 않는다.
 */

type CaseCategory =
  | "civil"
  | "criminal"
  | "administrative"
  | "family"
  | "patent"
  | "rehabilitation"
  | "constitutional"
  | "execution"
  | "other";

/** 심급. `final`은 대법원(상고심), `other`는 신청·집행처럼 심급 개념이 흐린 사건. */
type CaseInstance = "first" | "appeal" | "final" | "other";

interface CaseCode {
  /** 사건부호 그 자체. 예: `도` */
  readonly code: string;
  readonly category: CaseCategory;
  readonly instance: CaseInstance;
  /** 사람이 읽는 설명. 검색 도움말과 용어 사전에 그대로 쓴다. */
  readonly label: string;
}

const CASE_CODES: readonly CaseCode[] = [
  // 민사
  { code: "가소", category: "civil", instance: "first", label: "민사 소액사건" },
  { code: "가단", category: "civil", instance: "first", label: "민사 1심 단독" },
  { code: "가합", category: "civil", instance: "first", label: "민사 1심 합의" },
  { code: "나", category: "civil", instance: "appeal", label: "민사 항소" },
  { code: "다", category: "civil", instance: "final", label: "민사 상고" },
  { code: "머", category: "civil", instance: "other", label: "민사조정" },
  { code: "자", category: "civil", instance: "other", label: "민사조정 이의" },
  { code: "차", category: "civil", instance: "other", label: "지급명령(독촉)" },
  { code: "차전", category: "civil", instance: "other", label: "지급명령 이송" },
  { code: "카단", category: "civil", instance: "other", label: "민사신청 단독" },
  { code: "카합", category: "civil", instance: "other", label: "민사신청 합의" },
  { code: "카기", category: "civil", instance: "other", label: "민사 기타신청" },
  { code: "카명", category: "civil", instance: "other", label: "재산명시" },
  { code: "그", category: "civil", instance: "other", label: "민사 항고" },
  { code: "마", category: "civil", instance: "appeal", label: "민사 항고" },
  { code: "라", category: "civil", instance: "appeal", label: "민사 항고(고등)" },

  // 형사
  { code: "고약", category: "criminal", instance: "first", label: "형사 약식" },
  { code: "고정", category: "criminal", instance: "first", label: "형사 1심 정식(약식 정식재판)" },
  { code: "고단", category: "criminal", instance: "first", label: "형사 1심 단독" },
  { code: "고합", category: "criminal", instance: "first", label: "형사 1심 합의" },
  { code: "노", category: "criminal", instance: "appeal", label: "형사 항소" },
  { code: "도", category: "criminal", instance: "final", label: "형사 상고" },
  { code: "초기", category: "criminal", instance: "other", label: "형사 기타신청" },
  { code: "로", category: "criminal", instance: "other", label: "형사 준항고" },
  { code: "모", category: "criminal", instance: "other", label: "형사 재항고" },
  { code: "보", category: "criminal", instance: "other", label: "보호처분" },
  { code: "전고", category: "criminal", instance: "first", label: "전자장치 부착 1심" },
  { code: "전노", category: "criminal", instance: "appeal", label: "전자장치 부착 항소" },
  { code: "전도", category: "criminal", instance: "final", label: "전자장치 부착 상고" },

  // 행정
  { code: "구단", category: "administrative", instance: "first", label: "행정 1심 단독" },
  { code: "구합", category: "administrative", instance: "first", label: "행정 1심 합의" },
  { code: "누", category: "administrative", instance: "appeal", label: "행정 항소" },
  { code: "두", category: "administrative", instance: "final", label: "행정 상고" },
  { code: "아", category: "administrative", instance: "other", label: "행정 신청" },
  { code: "부", category: "administrative", instance: "other", label: "행정 기타" },

  // 가사
  { code: "드단", category: "family", instance: "first", label: "가사 1심 단독" },
  { code: "드합", category: "family", instance: "first", label: "가사 1심 합의" },
  { code: "르", category: "family", instance: "appeal", label: "가사 항소" },
  { code: "므", category: "family", instance: "final", label: "가사 상고" },
  { code: "느단", category: "family", instance: "first", label: "가사비송 단독" },
  { code: "느합", category: "family", instance: "first", label: "가사비송 합의" },
  { code: "즈단", category: "family", instance: "other", label: "가사신청 단독" },
  { code: "즈합", category: "family", instance: "other", label: "가사신청 합의" },
  { code: "즈기", category: "family", instance: "other", label: "가사 기타신청" },
  { code: "브", category: "family", instance: "appeal", label: "가사비송 항고" },
  { code: "스", category: "family", instance: "other", label: "가사비송 재항고" },

  // 특허
  { code: "허", category: "patent", instance: "first", label: "특허 1심(특허법원)" },
  { code: "후", category: "patent", instance: "final", label: "특허 상고" },

  // 도산
  { code: "회단", category: "rehabilitation", instance: "other", label: "회생 단독" },
  { code: "회합", category: "rehabilitation", instance: "other", label: "회생 합의" },
  { code: "하단", category: "rehabilitation", instance: "other", label: "파산 단독" },
  { code: "하합", category: "rehabilitation", instance: "other", label: "파산 합의" },
  { code: "개회", category: "rehabilitation", instance: "other", label: "개인회생" },
  { code: "개확", category: "rehabilitation", instance: "other", label: "개인회생 확정" },

  // 집행
  { code: "타경", category: "execution", instance: "other", label: "부동산 경매" },
  { code: "타채", category: "execution", instance: "other", label: "채권 집행" },
  { code: "타기", category: "execution", instance: "other", label: "집행 기타" },

  // 헌법재판소
  { code: "헌가", category: "constitutional", instance: "other", label: "위헌법률심판" },
  { code: "헌나", category: "constitutional", instance: "other", label: "탄핵심판" },
  { code: "헌다", category: "constitutional", instance: "other", label: "정당해산심판" },
  { code: "헌라", category: "constitutional", instance: "other", label: "권한쟁의심판" },
  { code: "헌마", category: "constitutional", instance: "other", label: "헌법소원(권리구제)" },
  { code: "헌바", category: "constitutional", instance: "other", label: "헌법소원(위헌심사)" },
  { code: "헌사", category: "constitutional", instance: "other", label: "헌재 신청" },
  { code: "헌아", category: "constitutional", instance: "other", label: "헌재 재심" },
];

const BY_CODE = new Map(CASE_CODES.map((entry) => [entry.code, entry]));

/** 가장 긴 부호부터 시도해야 `고단`이 `고`로 잘리지 않는다. */
const CASE_CODES_BY_LENGTH_DESC: readonly string[] = [...BY_CODE.keys()].sort(
  (a, b) => b.length - a.length,
);

function findCaseCode(code: string): CaseCode | undefined {
  return BY_CODE.get(code);
}

export { CASE_CODES, CASE_CODES_BY_LENGTH_DESC, findCaseCode };
export type { CaseCategory, CaseCode, CaseInstance };
