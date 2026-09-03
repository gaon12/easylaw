import { redirect } from "next/navigation";
import { Infobox } from "@/components/ui/infobox";
import { hasAdmin } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { setup } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import styles from "../setup-steps.module.css";
import { StepRail } from "../step-rail";
import { AdminForm } from "./admin-form";
import { SignInForm } from "./sign-in-form";

/**
 * 설치 2단계 — 관리자 계정. `PAGES.md` §17
 *
 * 세 갈래다.
 *
 * 1. 관리자가 없다 → 만든다. 첫 사람이 관리자다.
 * 2. 관리자가 있고 그 사람으로 들어와 있다 → 다음 단계로 보낸다. 첫 화면으로 돌아왔을 때
 *    **두 번째 관리자**를 만들 수 있게 되면 안 되기 때문이다.
 * 3. 관리자가 있는데 들어와 있지 않다 → **로그인 폼을 보여 준다.**
 *
 * 3번이 없던 시절에는 여기서 곧장 3단계로 보냈고, 3단계는 관리자 세션이 없다며 1단계로
 * 되돌렸다. 그래서 "다음"을 누르면 1단계로 돌아오는 고리가 생겼다. 설치가 끝나기 전에는
 * `/login`도 `/setup`으로 돌아가므로 빠져나갈 길이 아예 없었다.
 *
 * 관리자를 만들고 창을 닫았거나, 쿠키가 지워졌거나, 다른 브라우저로 열었거나 —
 * 흔한 일이다. 마법사는 그 상태에서도 앞으로 갈 수 있어야 한다.
 */
export default async function SetupAccountPage() {
  const [session, exists] = await Promise.all([
    currentSession(),
    Promise.resolve(hasAdmin(appDb())),
  ]);

  if (exists && session?.role === "admin") {
    redirect("/setup/service");
  }

  const signingIn = exists;

  return (
    <>
      <StepRail current="account" />

      <header className={styles.header}>
        <h1 className={styles.title}>
          {signingIn ? setup.accountSignInTitle : setup.accountTitle}
        </h1>
        <p className={styles.intro}>{signingIn ? setup.accountSignInIntro : setup.accountIntro}</p>
      </header>

      {signingIn ? (
        <>
          <Infobox title={setup.accountExistsTitle}>{setup.accountExistsBody}</Infobox>
          <SignInForm />
        </>
      ) : (
        <AdminForm />
      )}
    </>
  );
}

export const metadata = { title: setup.title };
