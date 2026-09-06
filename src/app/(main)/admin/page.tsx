import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { listRecentUploadFailures } from "@/db/app/generation";
import { listUsersForAdmin } from "@/db/app/repository";
import { appDb, corpusDb } from "@/db/client";
import { listRecentGenerationFailures } from "@/db/corpus/repository";
import { admin } from "@/lib/strings";
import { audioStored, contentCounts } from "@/server/admin-overview";
import { checkEnvironment, hasBlockingIssue } from "@/server/environment";
import { generationBudget } from "@/server/generate";
import styles from "./admin.module.css";

/** 살펴볼 것이 있는지 판단할 때만 센다. 목록은 "기록" 화면이 보여 준다. */
const FAILURE_WINDOW = 10;

/**
 * 숫자 하나. **크기로 읽히게 한다** — 이름은 작게, 값은 크게.
 *
 * 상자 왼쪽이나 위에 색 막대를 두지 않는다(`DESIGN.md` §11.6). 숫자 여섯 개가 저마다 다른
 * 색을 달고 있으면 어느 것이 문제인지가 오히려 안 보인다. 색은 정말로 살펴볼 것이 있을 때
 * 화면 맨 위 한 곳에서만 쓴다.
 */
function Metric({
  label,
  value,
  unit,
  note,
  href,
}: {
  label: string;
  value: number;
  unit: string;
  note?: string;
  href?: string;
}) {
  return (
    <Card as="li" padding="tight">
      <div className={styles.metric}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricValue}>
          {value.toLocaleString()}
          <span className={styles.metricUnit}>{unit}</span>
        </span>
        {note === undefined ? null : <span className={styles.metricNote}>{note}</span>}
        {href === undefined ? null : (
          <Link className={styles.link} href={href}>
            {admin.seeMore}
          </Link>
        )}
      </div>
    </Card>
  );
}

/**
 * 한눈에. `PAGES.md` §17
 *
 * **문제가 없으면 조용하다.** 예전 관리자 화면은 사용량·음성·실패·설정·계정을 한 장에
 * 세로로 쌓아 두어서, 아무 일도 없는 날에도 화면 절반이 목록이었다. 그러면 정말로 뭔가
 * 잘못된 날에도 눈에 띄지 않는다.
 *
 * 그래서 이 화면에는 **숫자와 경고만** 있다. 자세한 것은 각 화면이 맡는다 — 여기서 할 수
 * 있는 일은 하나도 없고, 그것이 의도다(보는 것과 바꾸는 것을 섞지 않는다).
 */
export default function AdminPage() {
  const db = appDb();
  const budget = generationBudget();
  const counts = contentCounts();
  const audio = audioStored();
  const users = listUsersForAdmin(db);
  const failures =
    listRecentGenerationFailures(corpusDb(), FAILURE_WINDOW).length +
    listRecentUploadFailures(db, FAILURE_WINDOW).length;
  const blocked = hasBlockingIssue(checkEnvironment());

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.overviewTitle}</h1>
        <p className={styles.intro}>{admin.overviewIntro}</p>
      </header>

      {/*
        살펴볼 것이 있을 때만 색이 나온다. 둘 다 아니면 한 줄로 조용히 지나간다 —
        "이상 없음"을 초록 상자로 크게 그리면 진짜 경고와 자리를 다투게 된다.
      */}
      {blocked ? (
        <Alert title={admin.systemTitle} tone="danger">
          <Link className={styles.link} href="/admin/system">
            {admin.seeMore}
          </Link>
        </Alert>
      ) : null}
      {failures > 0 ? (
        <Alert title={admin.failuresTitle} tone="warning">
          <Link className={styles.link} href="/admin/log">
            {admin.seeMore}
          </Link>
        </Alert>
      ) : null}
      {!blocked && failures === 0 ? (
        <Card>
          <p className={styles.sectionBody}>{admin.overviewHealthy}</p>
        </Card>
      ) : null}

      <ul className={styles.metrics}>
        <Metric
          label={admin.metricGeneration}
          note={admin.metricGenerationLimit(budget.limit)}
          unit={admin.metricUnit.times}
          value={budget.used}
        />
        <Metric
          href="/admin/content"
          label={admin.metricJudgments}
          unit={admin.metricUnit.cases}
          value={counts.judgments}
        />
        <Metric
          href="/admin/content"
          label={admin.metricRenditions}
          unit={admin.metricUnit.cases}
          value={counts.renditions}
        />
        <Metric
          href="/admin/audio"
          label={admin.metricAudio}
          unit={admin.metricUnit.clips}
          value={audio.clips}
        />
        <Metric
          href="/admin/users"
          label={admin.metricUsers}
          unit={admin.metricUnit.people}
          value={users.length}
        />
        <Metric
          href="/admin/log"
          label={admin.metricFailures}
          unit={admin.metricUnit.cases}
          value={failures}
        />
      </ul>
    </div>
  );
}

/** 상태를 보는 화면이다. 캐시하면 어제 숫자가 보인다. */
export const dynamic = "force-dynamic";

export const metadata = { title: admin.title, robots: { index: false, follow: false } };
