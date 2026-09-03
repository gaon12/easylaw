import { law as strings } from "@/lib/strings";

/**
 * 주소의 `때`를 읽는다. `PAGES.md` §6
 *
 * **날짜를 받았는지와 그것을 읽었는지는 다른 질문이다.** 둘을 하나로 합치면
 * "안 받았다"와 "받았는데 못 읽었다"가 같아지고, 그 둘은 사용자에게 해 줄 말이 다르다.
 */
interface AsOf {
  /** 기준 시점. 날짜를 못 읽었으면 오늘. */
  readonly at: Date;
  /** 판결 선고일을 알아냈는가. 이때만 "판결 당시의 법"이라고 말할 수 있다. */
  readonly dated: boolean;
}

function readAsOf(raw: string | undefined, now: Date): AsOf {
  if (raw === undefined) {
    return { at: now, dated: false };
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? { at: now, dated: false } : { at: parsed, dated: true };
}

/**
 * 어느 시점의 법인지 알리는 문구를 고른다.
 *
 * 세 경우가 다르다.
 * - 날짜를 받았고 읽혔다 → "판결 당시의 법"
 * - 날짜를 아예 안 받았다(주소를 직접 침) → "오늘 시행 중인 법"
 * - 날짜를 받았는데 못 읽었다 → 선고일을 모르는 문서에서 온 것이다
 *
 * **셋을 한 문구로 뭉치면 둘은 거짓말이 된다.** 원래 이 화면은 언제나 "이 판결이 선고될 때
 * 시행 중이던 법이에요"라고 말했는데, 주소를 직접 친 사람과 선고일이 없는 올린 문서에서 온
 * 사람에게는 사실이 아니었다.
 */
function asOfNote(raw: string | undefined, dated: boolean): string {
  if (dated) {
    return strings.asOfNote;
  }
  return raw === undefined ? strings.currentNote : strings.unknownDateNote;
}

export { asOfNote, readAsOf };
export type { AsOf };
