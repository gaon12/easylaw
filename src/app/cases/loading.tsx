import { SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";
import { site } from "@/lib/strings";
import styles from "./page.module.css";

/** 문서함 로딩. 카드 세 장을 미리 그려 목록이 온다는 것을 알린다. */
export default function CasesLoading() {
  return (
    <output className={styles.page}>
      {/*
        `<output>`은 role="status"를 이미 갖고 있는 요소다. 자리표시자는 읽히지 않고,
        기다리는 중이라는 사실만 한 번 알린다.
      */}
      <span className="sr-only">{site.loading}</span>
      <SkeletonLine width="short" />
      <ul className={styles.list}>
        {[0, 1, 2].map((index) => (
          <li key={index}>
            <SkeletonCard lines={2} />
          </li>
        ))}
      </ul>
    </output>
  );
}
