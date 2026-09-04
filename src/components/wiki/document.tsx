import type { ReactNode } from "react";
import type { TocEntry } from "@/components/ui/types";
import { TableOfContents } from "@/components/wiki/toc";
import styles from "./document.module.css";

/**
 * 위키식 문서. `DESIGN.md` §11.5
 *
 * 나무위키·위키백과가 긴 문서를 다루는 방식을 그대로 가져온다.
 *
 * - 회색 바닥 위에 **흰 시트 한 장**. 문서는 카드의 모음이 아니라 한 장의 종이다.
 * - 시트 맨 위에 **제목과 밑줄**, 그 아래 **목차 박스와 정보 틀이 나란히**, 그다음 본문.
 * - 구간은 카드가 아니라 **밑줄**로 나뉜다(`section.module.css`).
 *
 * **KRDS 카드 문법을 문서 본문에는 쓰지 않는다.** 카드마다 여백과 그림자를 두면 문서가
 * 조각으로 흩어지고, 조문 519개짜리 법령에서는 그 조각이 519개가 된다. 의도한 이탈이고
 * `DESIGN.md` §11.5에 근거를 적었다.
 */
function WikiDocument({
  title,
  meta,
  info,
  toc,
  tocLabel,
  children,
}: {
  /** 문서 제목. 시트 맨 위에 온다. */
  title: ReactNode;
  /** 제목 아래 한 줄(선고일·시행일 같은 것). 없으면 넣지 않는다. */
  meta?: ReactNode;
  /** 오른쪽 정보 틀. */
  info?: ReactNode;
  toc: readonly TocEntry[];
  tocLabel?: string;
  children: ReactNode;
}) {
  const hasLead = toc.length > 1 || info !== undefined;
  const hasToc = toc.length > 1;

  return (
    <div className={styles.page}>
      <article className={styles.sheet}>
        <header className={styles.header}>
          {title}
          {meta === undefined ? null : meta}
        </header>

        {hasLead ? (
          <div
            className={[
              styles.layout,
              hasToc ? styles.layoutWithToc : "",
              info === undefined ? "" : styles.layoutWithInfo,
            ].join(" ")}
          >
            {hasToc ? (
              <div className={styles.lead}>
                <TableOfContents entries={toc} label={tocLabel} />
              </div>
            ) : null}
            {info === undefined ? null : <aside className={styles.info}>{info}</aside>}
            <div className={styles.body}>{children}</div>
          </div>
        ) : (
          <div className={styles.body}>{children}</div>
        )}
      </article>
    </div>
  );
}

export { WikiDocument };
