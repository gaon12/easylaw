import { MIME } from "@/lib/tts/client";
import { findCaseAudio } from "@/server/audio";

/**
 * 공개 판례 설명 문장 하나의 음성. [F-11]
 *
 * **공개 판례라 누구나 들을 수 있다.** 여기서 나가는 것은 이미 화면에 글로 적혀 있는
 * 문장을 소리로 바꾼 것뿐이다 — 글보다 더 알려 주는 것이 없다.
 *
 * 올린 문서는 **다른 길**이다(`/api/audio/doc/…`). 그쪽은 주인만 들을 수 있어야 해서
 * 소유권을 확인한다. 한 길에 두 규칙을 담지 않는다 — 언젠가 조건을 빠뜨린다.
 *
 * 오래 캐시한다. 문장 id는 변환본에 매여 있고, 변환본이 다시 만들어지면 **문장 id도
 * 새로 난다.** 같은 주소가 다른 소리를 낼 일이 없다.
 */

const NOT_FOUND = 404;
const ONE_YEAR_SECONDS = 31_536_000;

async function GET(_request: Request, context: { params: Promise<{ sentenceId: string }> }) {
  const { sentenceId } = await context.params;
  const audio = findCaseAudio(sentenceId);

  if (audio === undefined) {
    return new Response("not found", { status: NOT_FOUND });
  }

  return new Response(new Uint8Array(audio.bytes), {
    headers: {
      "content-type": MIME[audio.format as keyof typeof MIME] ?? "application/octet-stream",
      "content-length": String(audio.bytes.length),
      "cache-control": `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
    },
  });
}

export { GET };
