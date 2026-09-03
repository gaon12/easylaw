import { createAvatar } from "@dicebear/core";
/*
 * 단독 스타일 패키지는 `{ create, meta, schema }`를 통째로 내보낸다 —
 * `@dicebear/collection`이 `identicon`이라는 이름으로 다시 묶어 주는 그 값이다.
 * 컬렉션 전체(30여 스타일, 4MB)를 끌어오지 않으려고 이 패키지만 쓴다.
 */
// biome-ignore lint/performance/noNamespaceImport: 이 패키지는 `{ create, meta, schema }`를 이름 없이 내보낸다. `createAvatar`가 그 묶음을 통째로 받으므로 네임스페이스로 가져오는 것 말고는 방법이 없다.
import * as identicon from "@dicebear/identicon";

/**
 * 프로필 이미지. `DESIGN.md` §5 — 이모지를 쓰지 않는다
 *
 * **DiceBear를 npm 패키지로 쓰고 여기서 그린다.** `api.dicebear.com`을 부르지 않는 이유가
 * 둘이다.
 *
 * 1. **외부 요청을 만들지 않는다.** 이 프로젝트는 글꼴까지 자체 호스팅해 외부 요청을 0으로
 *    두고 있고(`69f501c`), 폐쇄망 배포([F-23])를 보고 있다. 아바타마다 바깥으로 나가면
 *    그 두 가지가 함께 깨진다.
 * 2. **닉네임을 제3자에게 보내지 않는다.** 씨앗값이 곧 닉네임이라, 외부 API를 쓰면
 *    사용자 이름이 매 요청 남의 서버 로그에 남는다.
 *
 * `identicon`을 고른 이유는 **사람 얼굴을 그리지 않기 때문**이다. 판결문을 다루는 화면에서
 * 임의로 생성된 얼굴은 그 사건의 당사자처럼 읽힐 여지가 있다. 기하 무늬에는 그런 여지가 없다.
 */

/** 같은 씨앗은 언제나 같은 그림이다. 오래 캐시해도 안전하다. */
const SECONDS_PER_DAY = 60 * 60 * 24;
const CACHE_DAYS = 30;
const CACHE_SECONDS = SECONDS_PER_DAY * CACHE_DAYS;

const SIZE = 96;

async function GET(_request: Request, context: { params: Promise<{ seed: string }> }) {
  const { seed } = await context.params;

  const avatar = createAvatar(identicon, {
    seed: decodeURIComponent(seed),
    size: SIZE,
    /*
     * 배경을 투명하게 두지 않는다. 헤더 배경이 화면 표시 모드에 따라 바뀌는데,
     * 투명하면 무늬가 배경과 같은 색이 되어 사라지는 경우가 생긴다.
     */
    backgroundColor: ["ffffff"],
  });

  return new Response(avatar.toString(), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}, immutable`,
    },
  });
}

export { GET };
