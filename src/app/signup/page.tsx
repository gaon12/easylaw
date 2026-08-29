import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { auth } from "@/lib/strings";
import { createAccount } from "./actions";
import styles from "./page.module.css";

/**
 * 회원가입. `PAGES.md` §17
 *
 * 가입은 **지금 쓰던 계정에 이메일을 붙이는 일**이지 새 사람이 되는 일이 아니다.
 * 그래서 가입 전에 올린 문서가 그대로 따라오고, 화면에서도 그 사실을 먼저 말한다.
 * 가입 때문에 문서를 잃는다고 생각하면 아무도 가입하지 않는다.
 */
export default function SignUpPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{auth.signUpTitle}</h1>
        <p className={styles.intro}>{auth.signUpIntro}</p>
      </header>

      <AuthForm
        action={createAccount}
        mode="signup"
        submitLabel={auth.signUpSubmit}
        submittingLabel={auth.signUpSubmitting}
      />

      <section className={styles.why}>
        <h2 className={styles.whyTitle}>{auth.whyTitle}</h2>
        <ul className={styles.whyList}>
          {auth.whyPoints.map((point) => (
            <li className={styles.whyItem} key={point}>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <Link className={styles.switch} href="/login">
        {auth.toLogin}
      </Link>
    </div>
  );
}

export const metadata = { title: auth.signUpTitle };
