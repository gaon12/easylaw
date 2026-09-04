import Link from "next/link";
import { Infobox } from "@/components/ui/infobox";
import { braille } from "@/lib/strings";
import { toBrailleDocument } from "@/server/braille";
import { BrailleActions } from "./braille-actions";
import styles from "./braille-document.module.css";

/** 공개 판례와 비공개 업로드가 함께 쓰는 점자 문서 화면. 접근 검사는 각 라우트가 맡는다. */
function BrailleDocument({
  backHref,
  filename,
  lines,
  meta,
}: {
  backHref: string;
  filename: string;
  lines: readonly string[];
  meta: string;
}) {
  const document = toBrailleDocument(lines);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{braille.title}</h1>
        <p className={styles.meta}>{meta}</p>
        <Link className={styles.back} href={backHref}>
          {braille.backToViewer}
        </Link>
      </header>

      {lines.length === 0 ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{braille.emptyTitle}</h2>
          <p className={styles.emptyBody}>{braille.emptyBody}</p>
        </div>
      ) : (
        <>
          <Infobox title={braille.title}>{braille.disclaimer}</Infobox>
          <BrailleActions filename={filename} text={document} />
          <pre className={styles.braille}>{document}</pre>
          <p className={styles.source}>{braille.source}</p>
        </>
      )}
    </div>
  );
}

export { BrailleDocument };
