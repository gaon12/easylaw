/**
 * 법제처 OPEN API 카테고리 표.
 *
 * 이 표는 **추측이 아니라 실제 응답에서 뽑았다.** 2026-09-03에 11개 카테고리에
 * 목록·본문 요청을 보내고 돌아온 것을 그대로 적었다. 카탈로그는
 * <https://open.law.go.kr/LSO/openApi/guideList.do>에 있고, 항목별 규격은
 * `guideResult.do?htmlName=<이름>Guide`로 볼 수 있다.
 *
 * 표로 두는 이유는 **세 가지가 카테고리마다 제각각이기 때문**이다. 코드 곳곳에 흩어 두면
 * 새 카테고리를 붙일 때마다 세 군데를 고쳐야 하고, 한 군데를 빠뜨리면 조용히 빈 결과가 된다.
 *
 * 1. 목록 응답의 **봉투 키** — `LawSearch` / `Expc` / `Decc`처럼 `Search`가 붙는 것도
 *    안 붙는 것도 있다.
 * 2. 본문 응답의 **봉투 키** — 목록과 다르고, 규칙도 없다. 법령은 한글 `법령`이고,
 *    자치법규는 `LawService`이며, **행정심판례는 판례와 같은 `PrecService`다**(아래 주의).
 * 3. 본문을 부를 때 쓰는 **열쇠 이름** — `ID`인 것과 `MST`인 것이 갈린다.
 *
 * ## 주의 — 봉투 키가 겹친다
 *
 * `decc`(행정심판례)의 본문이 `PrecService`로 온다. `prec`(판례)와 같은 키다. 봉투 이름만
 * 보고 판례 파서에 넘기면 **내용이 빈 판례 하나가 조용히 만들어진다.** 그래서 각 파서는
 * 봉투를 열고 나서 자기 필드가 실제로 있는지 다시 본다.
 *
 * ## 주의 — 상세링크에 인증키가 들어 있다
 *
 * 목록 응답의 `…상세링크`는 `?OC=<우리 인증키>&…` 형태다. **이 값을 그대로 저장하거나
 * 화면에 내보내면 키가 샌다.** 링크가 필요하면 열쇠만 꺼내 우리가 다시 만든다.
 */

/** 본문을 부를 때 쓰는 열쇠 이름. */
type DetailKeyName = "ID" | "MST" | "trmSeqs";

interface TargetSpec {
  /** `target=` 파라미터 값. */
  readonly target: string;
  /** 사람이 읽을 이름. */
  readonly label: string;
  /** 목록 응답의 최상위 키. */
  readonly listEnvelope: string;
  /** 목록 항목 배열의 키. 결과가 1건이면 배열이 아니라 객체로 온다. */
  readonly listItemKey: string;
  /** 본문 응답의 최상위 키. 파일만 주는 카테고리는 없다. */
  readonly detailEnvelope: string | undefined;
  /** 본문 열쇠 이름과, 목록 항목에서 그 값을 담고 있는 필드. */
  readonly detailKey: DetailKeyName | undefined;
  readonly detailIdField: string | undefined;
}

const TARGETS = {
  /** 현행법령. 조문 인용 실존 검증([F-30])과 법령 스냅샷이 여기에서 온다. */
  law: {
    target: "law",
    label: "현행법령",
    listEnvelope: "LawSearch",
    listItemKey: "law",
    detailEnvelope: "법령",
    detailKey: "MST",
    detailIdField: "법령일련번호",
  },
  /** 시행일법령. 목록 봉투는 현행법령과 같고 시행일 기준만 다르다. */
  eflaw: {
    target: "eflaw",
    label: "시행일법령",
    listEnvelope: "LawSearch",
    listItemKey: "law",
    detailEnvelope: "법령",
    detailKey: "MST",
    detailIdField: "법령일련번호",
  },
  admrul: {
    target: "admrul",
    label: "행정규칙",
    listEnvelope: "AdmRulSearch",
    listItemKey: "admrul",
    detailEnvelope: "AdmRulService",
    detailKey: "ID",
    detailIdField: "행정규칙일련번호",
  },
  ordin: {
    target: "ordin",
    label: "자치법규",
    listEnvelope: "OrdinSearch",
    // 자치법규인데 항목 키는 `law`다. 아래 본문 봉투(`LawService`)와 같은 결이다.
    listItemKey: "law",
    // 자치법규인데 본문 봉투는 `LawService`다. 규칙이 아니라 사실이라 그대로 적는다.
    detailEnvelope: "LawService",
    detailKey: "MST",
    detailIdField: "자치법규일련번호",
  },
  prec: {
    target: "prec",
    label: "판례",
    listEnvelope: "PrecSearch",
    listItemKey: "prec",
    detailEnvelope: "PrecService",
    detailKey: "ID",
    detailIdField: "판례일련번호",
  },
  detc: {
    target: "detc",
    label: "헌재결정례",
    listEnvelope: "DetcSearch",
    // 봉투는 소문자 target인데 항목 키만 대문자다. 실제 응답이 그렇다.
    listItemKey: "Detc",
    detailEnvelope: "DetcService",
    detailKey: "ID",
    detailIdField: "헌재결정례일련번호",
  },
  expc: {
    target: "expc",
    label: "법령해석례",
    listEnvelope: "Expc",
    listItemKey: "expc",
    detailEnvelope: "ExpcService",
    detailKey: "ID",
    detailIdField: "법령해석례일련번호",
  },
  decc: {
    target: "decc",
    label: "행정심판례",
    listEnvelope: "Decc",
    listItemKey: "decc",
    // 판례와 같은 봉투다. 이름만으로 구분할 수 없다 — 위의 주의 참조.
    detailEnvelope: "PrecService",
    detailKey: "ID",
    detailIdField: "행정심판재결례일련번호",
  },
  trty: {
    target: "trty",
    label: "조약",
    listEnvelope: "TrtySearch",
    listItemKey: "Trty",
    detailEnvelope: "BothTrtyService",
    detailKey: "ID",
    detailIdField: "조약일련번호",
  },
  /** 법령용어. 용어 풀이의 공식 정의([F-29])가 여기에서 온다. */
  lstrm: {
    target: "lstrm",
    label: "법령용어",
    listEnvelope: "LsTrmSearch",
    listItemKey: "lstrm",
    detailEnvelope: "LsTrmService",
    // 하나가 아니라 **여러 개를 쉼표로** 넘긴다. 그래서 응답도 열 방향 배열이다.
    detailKey: "trmSeqs",
    detailIdField: "법령용어ID",
  },
  /** 별표·서식. 본문이 아니라 파일(hwp/pdf) 링크라 본문 조회가 없다. */
  licbyl: {
    target: "licbyl",
    label: "별표서식",
    listEnvelope: "licBylSearch",
    listItemKey: "licbyl",
    detailEnvelope: undefined,
    detailKey: undefined,
    detailIdField: undefined,
  },
} as const satisfies Record<string, TargetSpec>;

type TargetName = keyof typeof TARGETS;

/** 목록 응답의 항목 배열 키는 대개 target과 같지만 조약만 다르다. 여기서 한 번에 본다. */
function targetSpec(name: TargetName): TargetSpec {
  return TARGETS[name];
}

export { TARGETS, targetSpec };
export type { DetailKeyName, TargetName, TargetSpec };
