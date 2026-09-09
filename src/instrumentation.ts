import type { Instrumentation } from "next";

/** Next가 잡은 서버 오류를 공개 오류 번호와 연결해 관리자 DB에 남긴다. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // biome-ignore lint/style/noProcessEnv lint/correctness/noProcessGlobal: Next가 공식적으로 제공하는 런타임 구분 값이다.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  try {
    const { recordServerError } = await import("@/server/error-events");
    recordServerError(error, request, context);
  } catch (loggingError) {
    // biome-ignore lint/suspicious/noConsole: DB 기록까지 실패한 경우 서버 표준 로그가 마지막 추적 수단이다.
    console.error("EasyLaw 오류 추적 기록을 저장하지 못했습니다.", loggingError);
  }
};
