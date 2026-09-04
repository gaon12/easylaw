import Link from "next/link";
import { SignInRequired } from "@/components/auth/sign-in-required";
import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import { account, data, settings } from "@/lib/strings";
import { currentSession, displayName } from "@/server/owner";
import { NicknameForm } from "./nickname-form";
import styles from "./page.module.css";

/**
 * 계정 설정. `PAGES.md` §17
 *
 * **`/settings`와 나눠 둔다.** 그 화면은 "이 브라우저에만 저장돼요"라고 못박은 곳이고,
 * 로그인하지 않아도 쓸 수 있다. 서버에 저장되는 계정 설정을 그 안에 섞으면 그 말이
 * 거짓이 된다.
 */
export default async function AccountSettingsPage() {
  const session = await currentSession();

  if (session?.email == null) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{account.title}</h1>
        <SignInRequired title={account.signInTitle}>{account.signInBody}</SignInRequired>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{account.title}</h1>
        <p className={styles.intro}>{account.intro}</p>
      </header>

      <NicknameForm current={displayName(session) ?? ""} />

      {/*
        이메일은 보여 주되 바꿀 수 없다. 로그인 열쇠라 바꾸려면 확인 절차가 필요한데,
        메일 발송 경로가 아직 없다(`PROGRESS.md`). 없는 기능을 있는 것처럼 두지 않는다.
      */}
      <Card>
        <StructuredList
          rows={[
            { label: account.emailLabel, value: session.email },
            { label: account.emailChangeLabel, value: account.emailChangeNote },
          ]}
        />
      </Card>

      <nav className={styles.links}>
        <Link className={styles.link} href="/settings/data">
          {data.title}
        </Link>
        <Link className={styles.link} href="/settings">
          {settings.title}
        </Link>
      </nav>
    </div>
  );
}

export const metadata = { title: account.title, robots: { index: false, follow: false } };
