import { ButtonLink } from "@/components/ui/button";
import { auth } from "@/lib/strings";
import styles from "./sign-in-required.module.css";

/**
 * 로그인이 필요한 자리에 세우는 안내. `PAGES.md` §17
 *
 * 로그인 화면으로 곧장 보내지 않고 **왜 필요한지 먼저 말한다.** 판결문을 올리러 온
 * 사람에게 갑자기 로그인 폼이 뜨면, 그것이 문턱인지 사고인지 알 수 없다.
 * 이유를 읽고 나서 로그인하러 가는 편이 낫다.
 */
function SignInRequired({ title, children }: { title: string; children: string }) {
  return (
    <section className={styles.gate}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{children}</p>
      <div className={styles.actions}>
        <ButtonLink href="/signup" size="m">
          {auth.signUpTitle}
        </ButtonLink>
        <ButtonLink href="/login" size="m" variant="tertiary">
          {auth.logInTitle}
        </ButtonLink>
      </div>
    </section>
  );
}

export { SignInRequired };
