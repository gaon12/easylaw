import { SiteShell } from "@/components/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { ServiceCharacter } from "@/components/ui/service-character";
import { errors } from "@/lib/strings";
import styles from "./status.module.css";

/**
 * 404. `PAGES.md` §1
 *
 * 막다른 곳에 두지 않는다(`DESIGN.md` §9). 주소가 틀렸다는 사실만 알리고 끝내면
 * 사용자는 뒤로 가기 말고 할 일이 없다. 여기서 갈 수 있는 곳을 함께 준다.
 */
export default function NotFound() {
  return (
    // 셸을 직접 두른다. 루트 레이아웃은 문서 뼈대만 그리고, 셸은 라우트 그룹이 고른다.
    <SiteShell>
      <div className={styles.page}>
        <section className={styles.panel}>
          <div className={styles.visual}>
            <ServiceCharacter character="male" className={styles.character} priority={true} />
          </div>
          <div className={styles.content}>
            <p className={styles.eyebrow}>{errors.notFoundEyebrow}</p>
            <h1 className={styles.title}>{errors.notFoundTitle}</h1>
            <p className={styles.body}>{errors.notFoundBody}</p>
            <div className={styles.actions}>
              <ButtonLink href="/" size="m">
                {errors.backHome}
              </ButtonLink>
              <ButtonLink href="/upload" size="m" variant="tertiary">
                {errors.toUpload}
              </ButtonLink>
            </div>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}

export const metadata = { title: errors.notFoundTitle };
