import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { baseUrlAdvice, isBaseUrlProblem } from "@/lib/llm/base-url";
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
 * 폼은 `useActionState`를 쓰지 않는다. AI 주소가 맞는지는 **칸에서** 보고(`ConnectionsForm`),
 * 서버 액션은 폼을 거치지 않고 불릴 때를 대비해 한 번 더 막는다. 거기서 막히면 여기로
 * 되돌아오는데, 그때 주소줄에 실려 오는 것은 문장이 아니라 **문제의 이름**이다 —
 * 아무나 만든 주소로 우리 화면에 아무 문장이나 띄울 수 없어야 한다.
 */
export default async function ConnectionsPage(props: {
  searchParams: Promise<{ url_problem?: string }>;
}) {
  const [session, searchParams] = await Promise.all([currentSession(), props.searchParams]);
  if (session?.role !== "admin") {
    // 1단계가 아니라 2단계로 보낸다. 거기에 계정을 만드는 폼과 로그인 폼이 있다 —
    // 1단계로 보내면 "다음"을 누를 때마다 여기로 와서 다시 튕기는 고리가 된다.
    redirect("/setup/account");
  }

  const problem = searchParams.url_problem;

  return (
    <>
      <StepRail current="connections" />
      <header className={styles.header}>
        <h1 className={styles.title}>{setup.connectionsTitle}</h1>
        <p className={styles.intro}>{setup.connectionsIntro}</p>
      </header>
      {isBaseUrlProblem(problem) ? (
        <Alert title={setup.llmBaseUrlRejected} tone="danger">
          {baseUrlAdvice(problem)}
        </Alert>
      ) : null}
      <ConnectionsForm
        dailyLimit={DEFAULT_DAILY_GENERATION_LIMIT}
        defaultModel={DEFAULT_LLM_MODEL}
      />
    </>
  );
}

export const metadata = { title: setup.title };
