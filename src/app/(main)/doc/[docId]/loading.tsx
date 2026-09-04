import { SkeletonCard, SkeletonLine, SkeletonParagraph } from "@/components/ui/skeleton";
import { site } from "@/lib/strings";
import styles from "./page.module.css";

/** 내 문서 로딩. 제목 · 마스킹 요약 · 원문 순서 그대로 자리를 잡아 둔다. */
export default function DocLoading() {
  return (
    <output className={styles.page}>
      {/*
        `<output>`은 role="status"를 이미 갖고 있는 요소다. 자리표시자는 읽히지 않고,
        기다리는 중이라는 사실만 한 번 알린다.
      */}
      <span className="sr-only">{site.loading}</span>
      <SkeletonLine width="medium" />
      <SkeletonCard lines={1} />
      <SkeletonParagraph lines={8} />
    </output>
  );
}
