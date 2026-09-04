import { SignInRequired } from "@/components/auth/sign-in-required";
import { Infobox } from "@/components/ui/infobox";
import { upload } from "@/lib/strings";
import { currentOwnerId } from "@/server/owner";
import styles from "./page.module.css";
import { UploadForm } from "./upload-form";

/**
 * 업로드. `PAGES.md` §4 · `DESIGN.md` §5.1
 *
 * 폼 화면이므로 배경 띠를 쓰지 않는다. 단일 `bg-canvas` 위에서 위계는 카드 보더가 만든다.
 *
 * 개인정보 안내를 폼 **위**에 둔다. 올리고 나서 알려 주는 것은 안내가 아니다.
 *
 * **로그인해야 올릴 수 있다.** 판결문에는 개인정보가 그대로 들어 있어서, 그 문서의
 * 주인이 누구인지가 쿠키 하나에 달려 있으면 안 된다. 로그인하지 않은 사람에게는 폼 대신
 * 이유를 보여 준다 — 로그인 화면으로 곧장 튕기면 그것이 문턱인지 사고인지 알 수 없다.
 */
export default async function UploadPage() {
  const ownerId = await currentOwnerId();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{upload.title}</h1>
        <p className={styles.intro}>{upload.intro}</p>
      </header>

      <Infobox title={upload.privacyTitle}>
        <ul className={styles.privacyList}>
          {upload.privacyPoints.map((point) => (
            <li className={styles.privacyItem} key={point}>
              {point}
            </li>
          ))}
        </ul>
      </Infobox>

      {ownerId === undefined ? (
        <SignInRequired title={upload.signInTitle}>{upload.signInBody}</SignInRequired>
      ) : (
        <UploadForm />
      )}
    </div>
  );
}

export const metadata = { title: upload.title };
