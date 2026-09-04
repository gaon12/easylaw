import type { ReactNode } from "react";
import type { TocEntry } from "@/components/ui/types";
import { TableOfContents } from "@/components/wiki/toc";
import styles from "./document.module.css";

/**
 * 위키식 문서 뼈대. `DESIGN.md` §11.5
 *
 * 나무위키·위키백과가 긴 문서를 다루는 방식을 그대로 가져온다.
 *
 * - **본문이 왼쪽, 목차가 오른쪽**에 붙어 따라온다(`position: sticky`). 조문 519개짜리
 *   문서에서 목차가 화면 밖으로 나가면 그 순간부터 훑을 방법이 없다.
 * - 좁은 화면에서는 목차가 **본문 앞**으로 온다. 문서를 열었을 때 먼저 보이는 것이
 *   목차여야 한다는 점은 화면 크기와 무관하다.
 * - 문서 머리(제목·정보 틀)는 두 단 위에 걸친다.
 *
 * 목차를 오른쪽에 두는 이유는 왼쪽에 두면 본문이 화면 가운데에서 밀려나기 때문이다.
 * 읽는 것은 본문이고, 목차는 곁다리다.
 */
function WikiDocument({
  header,
  toc,
  tocLabel,
  children,
}: {
  /** 제목·정보 틀처럼 두 단 위에 걸치는 것. */
  header: ReactNode;
  toc: readonly TocEntry[];
  tocLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      {header}

      <div className={styles.layout}>
        {/*
          목차가 마크업에서 본문보다 **앞**에 온다. 좁은 화면에서 목차가 위로 오는 것이
          자연스럽고, 스크린리더도 문서를 훑기 전에 목차를 먼저 만난다.
          넓은 화면에서만 CSS가 오른쪽으로 옮긴다.
        */}
        {toc.length > 1 ? (
          <aside className={styles.aside}>
            <TableOfContents entries={toc} label={tocLabel} />
          </aside>
        ) : null}

        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

export { WikiDocument };
