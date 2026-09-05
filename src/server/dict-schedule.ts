import "server-only";
import { env } from "@/lib/env";
import { DAY_MS } from "@/lib/format";
import { storedSource, syncStandardDictionary } from "./dict-sync";

/**
 * 사전을 스스로 갱신한다. [F-29]
 *
 * **운영체제 스케줄러에 기대지 않는다.** 자가 호스팅하는 사람이 무엇을 쓰는지 모르고
 * (cron·작업 스케줄러·systemd·컨테이너), 그때마다 다른 안내를 쓰는 것은 결국 "각자
 * 알아서 하세요"와 같다. 서버가 켜져 있는 동안 스스로 챙긴다.
 *
 * ## 왜 `instrumentation.ts`가 아닌가
 *
 * Next의 `register()`가 제자리처럼 보이지만 **edge 런타임에서도 불린다.** 런타임을 갈라
 * 늦게 import 해도 번들러는 두 갈래를 다 따라가고, 그 끝에 `better-sqlite3`가 있어
 * edge 번들에서 빌드가 깨진다(실제로 겪었다: `Can't resolve (<dynamic> | 'null')`).
 *
 * 그래서 **뿌리 레이아웃**이 부른다. 화면을 그리는 곳은 언제나 Node이고, 첫 요청이
 * 들어오면 반드시 지나간다. 시작이 서버 부팅보다 한 박자 늦지만, 30일에 한 번 하는
 * 일이라 그 차이는 뜻이 없다.
 *
 * ## 무엇을 조심했나
 *
 * - **시작을 막지 않는다.** `register()`는 서버가 요청을 받기 전에 끝나야 한다. 그래서
 *   여기서는 타이머만 걸고 곧바로 돌아온다.
 * - **프로세스를 붙잡지 않는다.** `unref()`를 걸어, 이 타이머 하나 때문에 종료가 늦어지지
 *   않게 한다.
 * - **한 프로세스에 하나만.** 모듈 수준 표시로 두 번 걸리는 것을 막는다.
 * - **던지지 않는다.** 사전 갱신이 실패해도 서비스는 계속 돌아야 한다. 실패는 적어 두고
 *   다음 차례를 기다린다.
 *
 * **여러 대로 늘리면 그때 다시 본다.** 지금 구조에서는 인스턴스마다 각자 받게 되는데,
 * 자료가 같아 결과는 같고 낭비만 있다. 그때는 작업 선점(`generation_job`)과 같은 방식이
 * 필요하다.
 */

/** 며칠 지난 자료를 낡았다고 볼까. 표준국어대사전은 분기에 한 번꼴로 판이 바뀐다. */
const STALE_AFTER_DAYS = 30;

/** 얼마 만에 한 번씩 "낡았나" 물어볼까. 자주 물어도 대개 아무 일도 하지 않는다. */
const CHECK_EVERY_HOURS = 6;
const HOUR_MS = 3_600_000;

/**
 * 서버가 막 떴을 때는 조금 기다린다. 첫 요청과 68MB 내려받기가 겹치면 그 요청이 느려진다.
 */
const FIRST_CHECK_DELAY_MS = 60_000;

let started = false;

interface ScheduleState {
  /** 마지막 시도 시각과 결과. 관리 화면이 읽는다. */
  lastRunAt: Date | undefined;
  lastDetail: string | undefined;
  lastOk: boolean | undefined;
}

const state: ScheduleState = {
  lastRunAt: undefined,
  lastDetail: undefined,
  lastOk: undefined,
};

/** 자료가 낡았나. 한 번도 받은 적이 없으면 낡은 것으로 본다. */
function isStale(now: number): boolean {
  const stored = storedSource();
  if (stored === undefined || stored.entries === 0) {
    return true;
  }
  return now - stored.fetchedAt.getTime() > STALE_AFTER_DAYS * DAY_MS;
}

async function runOnce(): Promise<void> {
  state.lastRunAt = new Date();
  try {
    const result = await syncStandardDictionary();
    state.lastOk = result.kind !== "failed";
    state.lastDetail = result.detail;
  } catch (error) {
    state.lastOk = false;
    state.lastDetail = error instanceof Error ? error.message : "알 수 없는 오류입니다.";
  }
}

/**
 * 낡았으면 받는다. **던지지 않는다** — 타이머가 부르므로 잡아 줄 사람이 없고,
 * 잡히지 않은 거절 하나가 프로세스를 내릴 수 있다.
 */
function checkAndSync(): void {
  if (!isStale(Date.now())) {
    return;
  }
  runOnce().catch(() => {
    /* `runOnce`가 이미 삼키고 적어 둔다. 여기는 마지막 그물이다. */
  });
}

/**
 * 예약을 건다. **여러 번 불러도 한 번만 걸린다.**
 *
 * 끄려면 `.env`에 `DICT_AUTO_SYNC=false`. 자료를 직접 관리하고 싶은 곳(망이 막힌 곳,
 * 자료를 검토하고 넣는 곳)이 있다.
 */
function startDictSchedule(): void {
  if (started || !env().DICT_AUTO_SYNC) {
    return;
  }
  started = true;

  const timer = setInterval(checkAndSync, CHECK_EVERY_HOURS * HOUR_MS);
  timer.unref?.();

  const first = setTimeout(checkAndSync, FIRST_CHECK_DELAY_MS);
  first.unref?.();
}

/** 관리 화면이 읽는 마지막 결과. */
function dictScheduleState(): Readonly<ScheduleState> {
  return state;
}

export { dictScheduleState, startDictSchedule };
