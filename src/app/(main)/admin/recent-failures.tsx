import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import type { UploadGenerationFailure } from "@/db/app/generation";
import type { GenerationFailure } from "@/db/corpus/repository";
import { admin } from "@/lib/strings";
import styles from "./page.module.css";

/**
 * 최근에 설명 만들기가 실패한 기록. `PAGES.md` §17
 *
 * **이 자리가 없어서 실패 이유가 이용자 화면에 적혀 있었다.** 운영자가 원인을 아는 길이
 * 터미널에서 스크립트를 돌리는 것뿐이었기 때문이다. 그 결과 아무나 여는 판결문 페이지에
 * AI API 주소와 제공자의 오류 본문이 찍혔다. 볼 사람이 볼 곳을 만들면 그럴 이유가 없다.
 *
 * 그래서 여기에는 **둘 다** 적는다 — 이용자가 본 말과 진짜 원인. 둘을 나란히 두면
 * "사람들에게는 이렇게 보였고, 실은 이것 때문이었다"가 한눈에 읽힌다.
 *
 * 올린 문서 쪽은 **어느 문서인지 내지 않는다.** 그것은 그 사람의 것이고, 여기서 알아야
 * 할 것은 "우리 쪽에서 무엇이 깨졌나"뿐이다(§7).
 */
function RecentFailures({
  cases,
  uploads,
  formatTime,
}: {
  cases: readonly GenerationFailure[];
  uploads: readonly UploadGenerationFailure[];
  formatTime: (at: Date) => string;
}) {
  if (cases.length === 0 && uploads.length === 0) {
    return (
      <Card className={styles.usage} as="section">
        <h2 className={styles.sectionTitle}>{admin.failuresTitle}</h2>
        <p className={styles.usageSummary}>{admin.failuresEmpty}</p>
      </Card>
    );
  }

  return (
    <Card className={styles.usage} as="section">
      <h2 className={styles.sectionTitle}>{admin.failuresTitle}</h2>
      <p className={styles.usageSummary}>{admin.failuresBody}</p>

      <ol className={styles.failures}>
        {cases.map((failure) => (
          <li
            className={styles.failure}
            key={`${failure.caseNo}-${failure.level}-${failure.at?.getTime() ?? 0}`}
          >
            <StructuredList
              rows={[
                { label: "사건", value: `${failure.caseNo} · ${failure.level}` },
                { label: "언제", value: failure.at === null ? "-" : formatTime(failure.at) },
                { label: "화면에 보인 말", value: failure.shown ?? "-" },
                { label: "진짜 원인", value: failure.detail ?? "-" },
              ]}
            />
          </li>
        ))}
        {uploads.map((failure) => (
          <li
            className={styles.failure}
            key={`upload-${failure.level}-${failure.at?.getTime() ?? 0}`}
          >
            <StructuredList
              rows={[
                { label: "올린 문서", value: `${admin.failuresUploadHidden} · ${failure.level}` },
                { label: "언제", value: failure.at === null ? "-" : formatTime(failure.at) },
                { label: "화면에 보인 말", value: failure.shown ?? "-" },
                { label: "진짜 원인", value: failure.detail ?? "-" },
              ]}
            />
          </li>
        ))}
      </ol>
    </Card>
  );
}

export { RecentFailures };
