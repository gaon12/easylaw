"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ButtonLink } from "@/components/ui/button";
import { viewer } from "@/lib/strings";
import styles from "./citation-dialog.module.css";

/**
 * 인용을 누르면 그 조문을 **그 자리에서** 보여 준다. `PAGES.md` §5
 *
 * 판결문을 읽다가 「민사소송법 제420조」가 무슨 말인지 보려고 법령 화면으로 떠나면,
 * 돌아왔을 때 읽던 자리를 다시 찾아야 한다. 위키가 각주를 띄워 보여 주는 이유가 그것이다.
 * 조문 전체를 읽고 싶으면 **상세 보기**로 그때 옮겨 간다.
 *
 * **자바스크립트가 없으면 그냥 링크다.** 마크업은 `<a href>`이고, 스크립트가 있을 때만
 * 기본 이동을 막고 창을 연다. 이 서비스의 다른 화면이 모두 스크립트 없이 도는데
 * 인용만 스크립트를 요구하면 앞뒤가 맞지 않는다.
 *
 * 창은 브라우저의 `<dialog>`다 — 포커스 가두기와 Esc 닫기를 브라우저가 이미 한다.
 * 직접 만들면 그 둘을 빠뜨리기 쉽고, 빠뜨리면 키보드로 창에서 빠져나올 수 없다.
 *
 * **창은 문서 끝(`body`)에 그린다.** 인용은 판결문 문장(`<p>`) 안에 있는데, `<p>` 안에는
 * `<dialog>`·`<footer>` 같은 블록을 넣을 수 없다. 그대로 두면 브라우저가 마크업을 고쳐
 * 세우고 하이드레이션이 깨진다 — 실제로 그 오류를 봤다. 포털이 그 문제를 없앤다.
 */

/** 항의 key로 쓸 앞글자 길이. 같은 조문 안에서 항끼리 구분되면 충분하다. */
const KEY_LENGTH = 12;

interface ArticleClause {
  readonly number: string | undefined;
  readonly text: string;
}

type ArticleResponse =
  | {
      readonly kind: "exists";
      readonly heading: string;
      readonly title: string | null;
      readonly clauses: readonly ArticleClause[];
      readonly body: string | null;
    }
  | { readonly kind: string };

/** 창 안에 그릴 것. 불러오는 중과 실패를 구분한다 — 둘을 섞으면 영영 기다리게 된다. */
type DialogState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly article: ArticleResponse }
  | { readonly status: "failed" };

function ArticleView({ article }: { article: ArticleResponse }) {
  if (article.kind !== "exists") {
    return <p className={styles.notice}>{viewer.citationUnavailable}</p>;
  }

  const loaded = article as Extract<ArticleResponse, { kind: "exists" }>;
  return (
    <>
      <p className={styles.articleHead}>
        {loaded.heading}
        {loaded.title === null ? null : <span className={styles.articleTitle}>{loaded.title}</span>}
      </p>
      {loaded.clauses.length > 0 ? (
        <ol className={styles.clauses}>
          {loaded.clauses.map((clause) => (
            <li
              className={styles.clause}
              key={`${clause.number ?? ""}${clause.text.slice(0, KEY_LENGTH)}`}
            >
              {clause.text}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.body}>{loaded.body ?? ""}</p>
      )}
    </>
  );
}

function CitationDialog({
  href,
  query,
  label,
  title,
}: {
  /** 상세 보기가 가는 곳. 스크립트가 없으면 이 링크가 그대로 동작한다. */
  href: string;
  /** 조문을 불러올 질의(`id`·`조`·`의`·`때`). */
  query: string;
  /** 원문에 적힌 인용 글자. */
  label: string;
  /** 링크 설명(스크린리더·툴팁). */
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<DialogState>({ status: "idle" });
  /* 포털은 브라우저에만 있다. 서버 렌더에서는 링크만 그리고, 붙은 뒤에 창을 단다. */
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const open = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      // 새 탭으로 열려는 조작(⌘/Ctrl·가운데 클릭)은 가로채지 않는다.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      dialogRef.current?.showModal();

      if (state.status !== "idle") {
        return;
      }
      setState({ status: "loading" });
      fetch(`/api/law/article?${query}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
        .then((article: ArticleResponse) => {
          setState({ status: "loaded", article });
        })
        .catch(() => {
          setState({ status: "failed" });
        });
    },
    [query, state.status],
  );

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const dialog = (
    <dialog className={styles.dialog} ref={dialogRef}>
      {/*
        바깥을 눌러 닫는 일은 `<dialog>`에 맡긴다 — `form method="dialog"`를 배경으로 두면
        클릭 핸들러 없이도 닫힌다. Esc 닫기와 포커스 가두기는 브라우저가 이미 한다.
      */}
      <form className={styles.backdrop} method="dialog">
        <button aria-label={viewer.citationClose} className={styles.backdropButton} type="submit" />
      </form>
      <div className={styles.panel}>
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={close} type="button">
            {viewer.citationClose}
          </button>
        </header>

        <div className={styles.content}>
          {state.status === "loaded" ? <ArticleView article={state.article} /> : null}
          {state.status === "loading" ? (
            <p className={styles.notice}>{viewer.citationLoading}</p>
          ) : null}
          {state.status === "failed" ? (
            <p className={styles.notice}>{viewer.citationFailed}</p>
          ) : null}
        </div>

        <footer className={styles.foot}>
          {/* 전체를 읽고 싶으면 그때 옮겨 간다. 창은 맛보기고 문서는 저쪽에 있다. */}
          <ButtonLink href={href} size="s" variant="secondary">
            {viewer.citationDetail}
          </ButtonLink>
        </footer>
      </div>
    </dialog>
  );

  return (
    <>
      <a className={styles.link} href={href} onClick={open} title={title}>
        {label}
      </a>
      {mounted ? createPortal(dialog, document.body) : null}
    </>
  );
}

export { CitationDialog };
