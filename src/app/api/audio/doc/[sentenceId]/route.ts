import { MIME } from "@/lib/tts/client";
import { findDocAudio, ownsDocSentence } from "@/server/audio";
import { currentSession } from "@/server/owner";

/**
 * 올린 문서 설명 문장 하나의 음성. [F-11]
 *
 * **주인만 들을 수 있다.** 공개 판례 쪽과 길을 나눈 이유가 이것이다 — 한 길에 두 규칙을
 * 담으면 언젠가 조건을 빠뜨린 분기가 남의 판결문을 흘려보낸다.
 *
 * 캐시는 `private`이다. 중간 서버가 들고 있다가 다른 사람에게 주면 안 된다.
 */

const NOT_FOUND = 404;
const ONE_DAY_SECONDS = 86_400;

async function GET(_request: Request, context: { params: Promise<{ sentenceId: string }> }) {
  const { sentenceId } = await context.params;
  const session = await currentSession();

  /* 없는 것과 남의 것을 같은 답으로 돌려준다 — 있다는 사실 자체가 정보다. */
  if (session === undefined || !ownsDocSentence(sentenceId, session.userId)) {
    return new Response("not found", { status: NOT_FOUND });
  }

  const audio = findDocAudio(sentenceId);
  if (audio === undefined) {
    return new Response("not found", { status: NOT_FOUND });
  }

  return new Response(new Uint8Array(audio.bytes), {
    headers: {
      "content-type": MIME[audio.format as keyof typeof MIME] ?? "application/octet-stream",
      "content-length": String(audio.bytes.length),
      "cache-control": `private, max-age=${ONE_DAY_SECONDS}`,
    },
  });
}

export { GET };
