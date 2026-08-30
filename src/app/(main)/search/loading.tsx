import { SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";
import { site } from "@/lib/strings";
import styles from "./page.module.css";

/** 검색 로딩. 사건번호 조회가 외부 API를 거치므로 기다림이 눈에 띈다. */
export default function SearchLoading() {
  return (
    <output className={styles.page}>
      {/*
        `<output>`은 role="status"를 이미 갖고 있는 요소다. 자리표시자는 읽히지 않고,
        기다리는 중이라는 사실만 한 번 알린다.
      */}
      <span className="sr-only">{site.loading}</span>
      <SkeletonLine width="short" />
      <SkeletonCard lines={2} />
    </output>
  );
}
