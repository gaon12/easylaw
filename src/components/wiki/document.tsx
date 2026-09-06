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
 * - 시트 맨 위에 **제목과 밑줄**, 그 아래 **목차·본문과 정보 틀이 나란히** 이어진다.
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
  bodyBesideInfo = false,
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
  /** 넓은 화면에서 본문을 정보 틀 아래가 아니라 왼쪽 열에 이어 붙인다. */
  bodyBesideInfo?: boolean;
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
              bodyBesideInfo ? styles.bodyBesideInfo : "",
            ].join(" ")}
          >
            {/*
              **정보 틀이 목차보다 먼저 온다.** 넓은 화면에서 정보 틀은 오른쪽으로 띄우는데
              (`document.module.css`), 띄운 상자는 흐름에서 자기가 놓인 자리보다 위로
              올라가지 못한다. 목차 뒤에 두면 조문 1,193개짜리 법령처럼 목차가 긴 문서에서
              정보 틀이 목차 **아래**로 내려간다 — 실제로 그렇게 보였다.
              좁은 화면에서는 격자 영역 이름이 자리를 정하므로 이 순서가 영향을 주지 않는다.
            */}
            {info === undefined ? null : <aside className={styles.info}>{info}</aside>}
            {hasToc ? (
              <div className={styles.lead}>
                <TableOfContents entries={toc} label={tocLabel} />
              </div>
            ) : null}
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
