import { SkeletonCard, SkeletonLine, SkeletonParagraph } from "@/components/ui/skeleton";
import { site } from "@/lib/strings";
import styles from "./page.module.css";

/**
 * 뷰어 로딩. `DESIGN.md` §5
 *
 * 이 화면은 법제처 조회가 걸려 있어 첫 응답까지 몇 초가 걸릴 수 있다. 빈 화면을 보여 주면
 * 사용자는 고장으로 읽는다.
 *
 * `aria-busy`로 기다리는 중이라는 사실만 알리고, 자리표시자 자체는 읽히지 않게 한다.
 */
export default function CaseLoading() {
  return (
    <output className={styles.page}>
      {/*
        `<output>`은 role="status"를 이미 갖고 있는 요소다. 자리표시자는 읽히지 않고,
        기다리는 중이라는 사실만 한 번 알린다.
      */}
      <span className="sr-only">{site.loading}</span>
      <SkeletonCard lines={4} />
      <SkeletonLine width="medium" />
      <div className={styles.panels}>
        <SkeletonParagraph lines={6} />
      </div>
    </output>
  );
}
