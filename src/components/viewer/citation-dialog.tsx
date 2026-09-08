"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shadcn/ui/button";
import {
  Dialog as ShadcnDialog,
  DialogContent as ShadcnDialogContent,
  DialogTitle as ShadcnDialogTitle,
} from "@/components/shadcn/ui/dialog";
import { ButtonLink } from "@/components/ui/button";
import type { Citation } from "@/lib/law-citation/detect";
import { law, viewer } from "@/lib/strings";
import styles from "./citation-dialog.module.css";
import { type CitationTarget, citationTarget, currentCitationHref } from "./citation-target";
import { isSimplifiedLevel, type ViewLevel } from "./levels";

const KEY_LENGTH = 12;

interface ArticleClause {
  readonly number: string | undefined;
  readonly text: string;
  readonly citations: readonly Citation[];
}

type ArticleResponse =
  | {
      readonly kind: "exists";
      readonly lawId: string;
      readonly lawName: string;
      readonly lawVersionId: string;
      readonly heading: string;
      readonly title: string | null;
      readonly clauses: readonly ArticleClause[];
      readonly body: string | null;
      readonly bodyCitations: readonly Citation[];
    }
  | {
      readonly kind: "bad_request" | "missing" | "not_in_force" | "unknown_law" | "unverifiable";
    };

type DialogState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly article: ArticleResponse }
  | { readonly status: "failed" };

function followsLink(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;
}

/** 모달 안의 인용은 새 창을 겹치지 않고 현재 창의 탐색 기록에 조문을 더한다. */
function ArticleCitedText({
  text,
  citations,
  at,
  level,
  onNavigate,
}: {
  text: string;
  citations: readonly Citation[];
  at: string | undefined;
  level: ViewLevel;
  onNavigate: (target: CitationTarget) => void;
}) {
  if (citations.length === 0) {
    return text;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const citation of citations) {
    if (citation.start < cursor || citation.end > text.length) {
      continue;
    }
    if (citation.start > cursor) {
      parts.push(text.slice(cursor, citation.start));
    }

    const target = citationTarget(citation, at, level);
    if (target === undefined) {
      parts.push(citation.text);
    } else {
      parts.push(
        <a
          className={styles.link}
          href={target.href}
          key={`${citation.start}-${citation.end}`}
          onClick={(event) => {
            if (followsLink(event)) {
              return;
            }
            event.preventDefault();
            onNavigate(target);
          }}
          title={target.title}
        >
          {citation.text}
        </a>,
      );
    }
    cursor = citation.end;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts;
}

function ArticleView({
  article,
  at,
  level,
  onNavigate,
}: {
  article: ArticleResponse;
  at: string | undefined;
  level: ViewLevel;
  onNavigate: (target: CitationTarget) => void;
}) {
  if (article.kind !== "exists") {
    return <p className={styles.notice}>{viewer.citationUnavailable}</p>;
  }

  return (
    <>
      <p className={styles.articleHead}>
        {article.heading}
        {article.title === null ? null : (
          <span className={styles.articleTitle}>{article.title}</span>
        )}
      </p>
      {article.clauses.length > 0 ? (
        <ol className={styles.clauses}>
          {article.clauses.map((clause) => (
            <li
              className={styles.clause}
              key={`${clause.number ?? ""}${clause.text.slice(0, KEY_LENGTH)}`}
            >
              <ArticleCitedText
                at={at}
                citations={clause.citations}
                level={level}
                onNavigate={onNavigate}
                text={clause.text}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.body}>
          <ArticleCitedText
            at={at}
            citations={article.bodyCitations}
            level={level}
            onNavigate={onNavigate}
            text={article.body ?? ""}
          />
        </p>
      )}
    </>
  );
}

function useArticleLoader() {
  const requestId = useRef(0);
  const cache = useRef(new Map<string, ArticleResponse>());
  const [state, setState] = useState<DialogState>({ status: "idle" });

  const load = useCallback((target: CitationTarget) => {
    const cached = cache.current.get(target.query);
    if (cached !== undefined) {
      setState({ status: "loaded", article: cached });
      return;
    }
    const ownRequest = requestId.current + 1;
    requestId.current = ownRequest;
    setState({ status: "loading" });
    fetch(`/api/law/article?${target.query}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((article: ArticleResponse) => {
        if (requestId.current === ownRequest) {
          cache.current.set(target.query, article);
          setState({ status: "loaded", article });
        }
      })
      .catch(() => {
        if (requestId.current === ownRequest) {
          setState({ status: "failed" });
        }
      });
  }, []);

  const reset = useCallback((initial: CitationTarget) => {
    requestId.current += 1;
    const first = cache.current.get(initial.query);
    setState(first === undefined ? { status: "idle" } : { status: "loaded", article: first });
  }, []);
  return { load, reset, state };
}

function DialogHeader({
  active,
  canGoBack,
  onBack,
  onClose,
}: {
  active: CitationTarget;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <header className={styles.head}>
      <div className={styles.headingGroup}>
        {canGoBack ? (
          <Button className={styles.back} onClick={onBack} size="sm" type="button" variant="ghost">
            {viewer.citationBack}
          </Button>
        ) : null}
        <ShadcnDialogTitle className={styles.title}>{active.title}</ShadcnDialogTitle>
      </div>
      <Button className={styles.close} onClick={onClose} size="sm" type="button" variant="ghost">
        {viewer.citationClose}
      </Button>
    </header>
  );
}

function DialogContent({
  state,
  at,
  level,
  onNavigate,
}: {
  state: DialogState;
  at: string | undefined;
  level: ViewLevel;
  onNavigate: (target: CitationTarget) => void;
}) {
  return (
    <div className={styles.content}>
      {isSimplifiedLevel(level) ? (
        <p className={styles.originalNote}>{law.originalTextNotice(viewer.levels[level])}</p>
      ) : null}
      {state.status === "loaded" ? (
        <ArticleView article={state.article} at={at} level={level} onNavigate={onNavigate} />
      ) : null}
      {state.status === "loading" ? (
        <p className={styles.notice}>{viewer.citationLoading}</p>
      ) : null}
      {state.status === "failed" ? <p className={styles.notice}>{viewer.citationFailed}</p> : null}
    </div>
  );
}

function DialogFooter({ active }: { active: CitationTarget }) {
  const currentHref = currentCitationHref(active);
  return (
    <footer className={styles.foot}>
      {currentHref === undefined ? null : (
        <ButtonLink href={currentHref} size="s" variant="tertiary">
          {viewer.citationCurrent}
        </ButtonLink>
      )}
      <ButtonLink href={active.href} size="s" variant="secondary">
        {currentHref === undefined ? viewer.citationDetail : viewer.citationDetailAsOf}
      </ButtonLink>
    </footer>
  );
}

/** 조문을 그 자리에서 열고, 그 조문이 인용한 다른 조문까지 같은 기준일로 따라간다. */
function CitationDialog({
  href,
  query,
  label,
  level,
  title,
}: {
  href: string;
  query: string;
  label: string;
  level: ViewLevel;
  title: string;
}) {
  const initial = useMemo<CitationTarget>(() => ({ href, query, title }), [href, query, title]);
  const [isOpen, setOpen] = useState(false);
  const [trail, setTrail] = useState<readonly CitationTarget[]>([initial]);
  const { load, reset: resetArticle, state } = useArticleLoader();
  const active = trail.at(-1) ?? initial;
  const at = new URLSearchParams(active.query).get("때") ?? undefined;

  const openDialog = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (followsLink(event)) {
        return;
      }
      event.preventDefault();
      setOpen(true);
      if (state.status === "idle") {
        load(initial);
      }
    },
    [initial, load, state.status],
  );

  const navigate = useCallback(
    (target: CitationTarget) => {
      setTrail((current) => [...current, target]);
      load(target);
    },
    [load],
  );

  const back = useCallback(() => {
    const previous = trail.at(-2);
    if (previous === undefined) {
      return;
    }
    setTrail((current) => current.slice(0, -1));
    load(previous);
  }, [load, trail]);

  const reset = useCallback(() => {
    setTrail([initial]);
    resetArticle(initial);
  }, [initial, resetArticle]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <a className={styles.link} href={href} onClick={openDialog} title={title}>
        {label}
      </a>
      <ShadcnDialog
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            reset();
          }
        }}
        open={isOpen}
      >
        <ShadcnDialogContent className={styles.panel} showCloseButton={false}>
          <DialogHeader
            active={active}
            canGoBack={trail.length > 1}
            onBack={back}
            onClose={close}
          />
          <DialogContent at={at} level={level} onNavigate={navigate} state={state} />
          <DialogFooter active={active} />
        </ShadcnDialogContent>
      </ShadcnDialog>
    </>
  );
}

export { ArticleCitedText, CitationDialog };
