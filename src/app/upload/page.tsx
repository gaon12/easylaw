import { Infobox } from "@/components/ui/infobox";
import { upload } from "@/lib/strings";
import styles from "./page.module.css";
import { UploadForm } from "./upload-form";

/**
 * 업로드. `PAGES.md` §4 · `DESIGN.md` §5.1
 *
 * 폼 화면이므로 배경 띠를 쓰지 않는다. 단일 `bg-canvas` 위에서 위계는 카드 보더가 만든다.
 *
 * 개인정보 안내를 폼 **위**에 둔다. 올리고 나서 알려 주는 것은 안내가 아니다.
 */
export default function UploadPage() {
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

      <UploadForm />
    </div>
  );
}

export const metadata = { title: upload.title };
