"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

/**
 * 2단 대조를 감싸고 **근거 링크의 이동을 우리가 맡는다.**
 *
 * ## 왜 브라우저에 맡기지 않나
 *
 * `href="#문장id"`만 두었더니, 누를 때마다 **왼쪽 칸이 조금씩 내려갔다.** 같은 링크를
 * 계속 눌러도 계속 내려갔다.
 *
 * 브라우저는 목표를 보이게 하려고 **조상 스크롤 상자를 전부** 움직인다. 두 칸이 각자
 * 흐르게 되면서(§11.8) 페이지·오른쪽 칸·왼쪽 칸이 모두 스크롤 상자가 됐고, 페이지가
 * 조금 움직이면 붙박이(`sticky`) 칸들이 자리를 다시 잡고, 그러면 목표의 화면 위 위치가
 * 또 달라져 다음 클릭이 또 움직인다. 조금씩 쌓이는 이유가 그것이다.
 *
 * 그래서 **움직일 상자를 하나로 못박는다** — 목표가 들어 있는 칸 하나만 스크롤한다.
 * 페이지도, 반대쪽 칸도 건드리지 않는다.
 *
 * ## 자바스크립트가 없으면
 *
 * `href`를 그대로 두었으므로 링크는 여전히 동작한다. 그때는 브라우저가 하던 대로 하고,
 * 강조도 `:target`이 그린다. 이 컴포넌트는 **더 나은 이동을 얹을 뿐** 이동 자체를
 * 책임지지 않는다.
 */

/** 스크롤할 칸을 찾는 표시. 페이지가 각 칸에 붙인다. */
const PANE = "[data-viewer-pane]";

/** 강조 표시. `:target`과 같은 모양을 그린다(`viewer.module.css`). */
const CITED = "data-cited";

/** 목표 문장을 칸 위쪽에서 얼마나 띄울까. 붙박이 제목에 가리지 않을 만큼. */
const TOP_MARGIN = 48;

function EvidencePanes({
  className,
  children,
}: {
  className: string | undefined;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node: HTMLDivElement | null = root.current;
    if (node === null) {
      return;
    }
    const panes = node;

    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    /**
     * 누른 링크가 가리키는 문장과 그 문장이 든 칸. 우리가 맡을 일이 아니면 `undefined`.
     *
     * 칸이 흐르지 않는 화면(좁은 화면에서는 한 단으로 쌓인다)에서는 나설 이유가 없다.
     * 새 탭·저장처럼 다른 뜻으로 누른 것도 건드리지 않는다.
     */
    function targetOf(event: MouseEvent): { target: HTMLElement; pane: HTMLElement } | undefined {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }

      const link = (event.target as Element | null)?.closest?.("a[href^='#']");
      const id = link?.getAttribute("href")?.slice(1);
      const target = id === undefined || id.length === 0 ? null : document.getElementById(id);
      const pane = target?.closest<HTMLElement>(PANE) ?? null;

      if (target === null || pane === null || pane.scrollHeight <= pane.clientHeight) {
        return;
      }
      return { target, pane };
    }

    function onClick(event: MouseEvent): void {
      const found = targetOf(event);
      if (found === undefined) {
        return;
      }

      event.preventDefault();

      const top = found.target.getBoundingClientRect().top - found.pane.getBoundingClientRect().top;
      found.pane.scrollTo({
        top: found.pane.scrollTop + top - TOP_MARGIN,
        behavior: reduced ? "auto" : "smooth",
      });

      /* 강조는 한 번에 하나만. `:target`이 하던 일을 그대로 한다. */
      for (const marked of panes.querySelectorAll(`[${CITED}]`)) {
        marked.removeAttribute(CITED);
      }
      found.target.setAttribute(CITED, "true");
    }

    node.addEventListener("click", onClick);
    return () => {
      node.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div className={className} ref={root}>
      {children}
    </div>
  );
}

export { EvidencePanes };
