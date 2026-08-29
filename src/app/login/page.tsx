import Link from "next/link";
import { logIn } from "@/app/signup/actions";
import styles from "@/app/signup/page.module.css";
import { AuthForm } from "@/components/auth/auth-form";
import { auth } from "@/lib/strings";

/**
 * 로그인. `PAGES.md` §17
 *
 * 폼은 가입 화면과 같은 컴포넌트를 쓴다. 다른 것은 문구와 `autoComplete` 값뿐이다.
 */
export default function LogInPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{auth.logInTitle}</h1>
        <p className={styles.intro}>{auth.logInIntro}</p>
      </header>

      <AuthForm
        action={logIn}
        mode="login"
        submitLabel={auth.logInSubmit}
        submittingLabel={auth.logInSubmitting}
      />

      <Link className={styles.switch} href="/signup">
        {auth.toSignUp}
      </Link>
    </div>
  );
}

export const metadata = { title: auth.logInTitle };
