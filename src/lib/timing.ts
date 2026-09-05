/**
 * 한 단계가 얼마나 걸려도 되는가, 그리고 얼마나 조용하면 죽은 것으로 보는가.
 *
 * **두 숫자를 한곳에 둔다.** 따로 두었더니 어긋났다 — AI 호출 타임아웃이 120초인데 좀비
 * 회수 시간은 90초여서, **정상적으로 답을 기다리는 작업이 죽은 것으로 회수됐다.** 그러면
 * 다른 일꾼이 같은 판결문을 다시 만들고, 지출이 두 배가 되며, 둘이 서로의 구조를 밟는다.
 */

/**
 * AI 호출 하나를 얼마나 기다리나.
 *
 * 생성은 수십 초가 걸린다(`PRODUCT.md` §5.1). 법제처 조회의 10초를 그대로 쓰면 정상 응답을
 * 실패로 만들고, 무한정 기다리면 좀비가 캐시를 영구히 막는다(§5.3).
 *
 * **답 앞에 설명을 길게 쓰는 모델이 있다.** Gemma는 판결문 하나에 300초 가까이 쓴다.
 * 이 값은 품질의 문턱이 아니라 **멈춘 것을 알아채는 안전장치**다. 그래서 넉넉하게 잡고,
 * 대신 아래 heartbeat로 "아직 살아 있다"를 계속 알린다.
 */
const REQUEST_TIMEOUT_SECONDS = 600;
const MS_PER_SECOND = 1000;
const REQUEST_TIMEOUT_MS = REQUEST_TIMEOUT_SECONDS * MS_PER_SECOND;

/**
 * 이 간격으로 "아직 살아 있다"를 적는다.
 *
 * 예전에는 **단계가 바뀔 때만** 적었다. 그래서 두 heartbeat 사이의 간격이 곧 AI 호출
 * 하나의 길이였고, 회수 시간을 호출 시간보다 길게 잡을 수밖에 없었다 — 정말 죽은 작업이
 * 그만큼 오래 그 판결문을 막는다는 뜻이다. 기다리는 동안에도 적으면 그 묶임이 풀린다.
 */
const HEARTBEAT_MS = 20_000;

/**
 * 이 시간 동안 heartbeat가 없으면 죽은 작업으로 보고 회수한다.
 *
 * heartbeat 간격의 몇 배로 잡는다 — 한두 번 놓치는 것(GC, 잠깐의 부하)으로 회수되면 안 된다.
 * 살아 있는 일꾼은 계속 말하므로, **호출이 얼마나 길든 이 값과 무관하다.**
 */
/** 몇 번까지 놓쳐도 봐주나. 한두 번은 GC나 잠깐의 부하로도 놓친다. */
const MISSED_BEATS_ALLOWED = 5;

const STALE_AFTER_MS = HEARTBEAT_MS * MISSED_BEATS_ALLOWED;

export { HEARTBEAT_MS, REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_SECONDS, STALE_AFTER_MS };
