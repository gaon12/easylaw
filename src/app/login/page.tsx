import Link from "next/link";
import { logIn } from "@/app/signup/actions";
import styles from "@/app/signup/page.module.css";
import { AuthForm } from "@/components/auth/auth-form";
import { Infobox } from "@/components/ui/infobox";
import { auth } from "@/lib/strings";

/**
 * 로그인. `PAGES.md` §17
 *
 * 로그인은 **다른 계정으로 갈아타는 것**이라, 가입 없이 이 브라우저에 올려 둔 문서는
 * 따라오지 않는다. 같은 컴퓨터를 여러 사람이 쓸 수 있어서 자동으로 옮기지 않는다 —
 * 옮기면 남의 문서를 가져가는 일이 된다. 그래서 그 사실을 폼 위에서 미리 알린다.
 */
export default function LogInPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{auth.logInTitle}</h1>
        <p className={styles.intro}>{auth.logInIntro}</p>
      </header>

      <Infobox title={auth.toSignUp}>{auth.logInCarryOver}</Infobox>

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
