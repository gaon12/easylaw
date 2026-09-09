import "server-only";

import { notFound } from "next/navigation";
import { isAdministrator } from "@/lib/content-permissions";
import { currentSession } from "./owner";

/** 콘텐츠 역할이 관리자 전용 URL을 직접 열어도 데이터 조회 전에 멈춘다. */
async function requireAdministrator() {
  const session = await currentSession();
  if (!isAdministrator(session?.role)) {
    notFound();
  }
  return session;
}

export { requireAdministrator };
