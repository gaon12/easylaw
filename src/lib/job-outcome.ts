/**
 * 작업이 어떻게 끝났는가. **실패는 두 얼굴로 적는다.**
 *
 * 예전에는 실패 이유가 하나였고, 그 하나가 판결문 페이지에 그대로 나갔다. 그래서
 * AI API 주소와 제공자가 보낸 401 본문이 **아무나 여는 화면에** 찍혔다. 그리고 그것을
 * 보고 고칠 수 있는 사람은 관리자인데, 관리자는 그 화면을 보지 않는다 — 아무도 이득을
 * 보지 못하는 배치였다.
 *
 * 이제 읽는 사람으로 나눈다.
 *
 * - `reason` — 화면 앞의 사람. **우리 설정도, 제공자 응답도 담지 않는다.** 그 사람이
 *   할 수 있는 일(다시 눌러 볼지, 기다릴지, 관리자에게 알릴지)만 말한다.
 * - `detail` — 관리자. 고치려면 무엇이 왔는지 알아야 한다. `/admin`에서만 읽는다.
 */
interface JobFailure {
  readonly ok: false;
  /** 이용자에게 보여 줄 한 문장. */
  readonly reason: string;
  /** 관리자만 보는 진짜 원인. */
  readonly detail: string;
}

type JobOutcome = { readonly ok: true } | JobFailure;

export type { JobFailure, JobOutcome };
