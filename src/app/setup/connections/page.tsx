import { redirect } from "next/navigation";
import { setup } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { DEFAULT_DAILY_GENERATION_LIMIT, DEFAULT_LLM_MODEL } from "@/server/settings";
import styles from "../setup-steps.module.css";
import { StepRail } from "../step-rail";
import { ConnectionsForm } from "./connections-form";

/**
 * 설치 4단계 — 외부 연결. `PAGES.md` §17
 *
 * **전부 선택 항목이다.** 넣지 않으면 그 기능만 꺼진 채로 서비스가 돌아간다.
 * 설치를 마치는 데 외부 서비스 가입을 요구하면, 둘러보려던 사람이 여기서 멈춘다.
 *
 * 이 폼은 `useActionState`를 쓰지 않는다 — 실패할 수 있는 검증이 없고(빈 값도 정상),
 * 되돌려 줄 오류 상태가 없다. 성공하면 곧바로 다음 단계로 넘어간다.
 */
export default async function ConnectionsPage() {
  const session = await currentSession();
  if (session?.role !== "admin") {
    // 1단계가 아니라 2단계로 보낸다. 거기에 계정을 만드는 폼과 로그인 폼이 있다 —
    // 1단계로 보내면 "다음"을 누를 때마다 여기로 와서 다시 튕기는 고리가 된다.
    redirect("/setup/account");
  }

  return (
    <>
      <StepRail current="connections" />
      <header className={styles.header}>
        <h1 className={styles.title}>{setup.connectionsTitle}</h1>
        <p className={styles.intro}>{setup.connectionsIntro}</p>
      </header>
      <ConnectionsForm
        dailyLimit={DEFAULT_DAILY_GENERATION_LIMIT}
        defaultModel={DEFAULT_LLM_MODEL}
      />
    </>
  );
}

export const metadata = { title: setup.title };
