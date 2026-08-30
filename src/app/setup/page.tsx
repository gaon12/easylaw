import { redirect } from "next/navigation";
import { hasAdmin } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { setup } from "@/lib/strings";
import { AdminForm } from "./admin-form";
import styles from "./setup-steps.module.css";
import { SETUP_STEP, SETUP_STEP_TOTAL } from "./steps";

/**
 * 설치 1단계 — 관리자 계정. `PAGES.md` §17
 *
 * 관리자가 이미 있으면 다음 단계로 보낸다. 설치를 하다 만 경우(계정만 만들고 창을 닫은
 * 경우)에 첫 화면으로 돌아오면, 그 자리에서 **두 번째 관리자**를 만들 수 있게 되기 때문이다.
 */
export default function SetupPage() {
  if (hasAdmin(appDb())) {
    redirect("/setup/connections");
  }

  return (
    <>
      <header className={styles.header}>
        <p className={styles.step}>{setup.stepLabel(SETUP_STEP.account, SETUP_STEP_TOTAL)}</p>
        <h1 className={styles.title}>{setup.accountTitle}</h1>
        <p className={styles.intro}>{setup.accountIntro}</p>
      </header>

      <AdminForm />
    </>
  );
}

export const metadata = { title: setup.title };
