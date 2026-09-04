import "server-only";
import { headers } from "next/headers";

/**
 * 지금 요청이 어떤 프로토콜로 왔는가.
 *
 * 이것이 필요한 이유는 하나다 — **`Secure` 쿠키를 http 요청에 심으면 브라우저가 그냥
 * 버린다.** 오류도, 경고도 없다. 로그인한 것처럼 보이지만 다음 요청에 쿠키가 오지 않고,
 * 화면은 "로그인하지 않음"으로 되돌아간다. 설치 마법사에서 이 일이 벌어지면
 * 2단계 → 3단계 → 1단계로 되튕기는 고리에 갇혀 **아무것도 할 수 없게 된다.**
 *
 * `next start`는 프록시가 없어도 `x-forwarded-proto`를 붙여 준다(직접 확인했다).
 * 리버스 프록시 뒤에서도 같은 헤더가 온다 — 그래서 이 하나로 두 배치를 다 덮는다.
 */

/**
 * 순수 판정. 헤더 두 개만 보고 답한다.
 *
 * `x-forwarded-proto`를 먼저 본다. 프록시가 여러 단계면 값이 쉼표로 이어지는데,
 * **맨 앞이 브라우저와 맞닿은 쪽**이다. 그 헤더가 없을 때만 `Origin`의 스킴을 본다 —
 * 서버 액션 요청에는 `Origin`이 늘 붙는다(Next가 같은 출처인지 검사하기 때문이다).
 *
 * 둘 다 없으면 **http로 본다.** 모를 때 https라고 답하면 그 순간 쿠키가 사라진다.
 */
function isSecureProtocol(forwardedProto: string | null, origin: string | null): boolean {
  const proto = forwardedProto?.split(",")[0]?.trim().toLowerCase();
  if (proto === "https") {
    return true;
  }
  if (proto === "http") {
    return false;
  }
  return origin?.trim().toLowerCase().startsWith("https://") ?? false;
}

async function isSecureRequest(): Promise<boolean> {
  const incoming = await headers();
  return isSecureProtocol(incoming.get("x-forwarded-proto"), incoming.get("origin"));
}

/** 요청자 제한에 사용할 IP. 프록시가 앞단에 있으면 가장 바깥쪽 주소를 사용한다. */
async function requestIp(): Promise<string> {
  const incoming = await headers();
  const forwarded = incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
  const direct = incoming.get("x-real-ip")?.trim();
  const value = forwarded || direct;
  return value === undefined || value.length === 0 ? "unknown" : value;
}

export { isSecureProtocol, isSecureRequest, requestIp };
