import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { BadgeTone } from "@/components/ui/types";
import { formatBytes } from "@/lib/format";
import { admin, setup } from "@/lib/strings";
import { audioStored, storageRows } from "@/server/admin-overview";
import { type CheckLevel, checkEnvironment } from "@/server/environment";
import styles from "../admin.module.css";

/** 검사 결과의 세 단계를 배지 톤으로 옮긴다. 설치 마법사와 같은 짝이다. */
const BADGE_TONES: Readonly<Record<CheckLevel, BadgeTone>> = {
  ok: "grounded",
  warn: "needs-check",
  fail: "ungrounded",
};

/**
 * 시스템. `PAGES.md` §17
 *
 * **환경 점검이 설치 마법사에만 있었다.** 그런데 디스크가 차고 메모리가 모자라는 일은
 * 설치한 날이 아니라 반 년 뒤에 생긴다. 그때 다시 보려면 마법사를 열어야 하는데, 마법사는
 * 한 번 끝나면 닫힌다 — 볼 방법이 아예 없었다는 뜻이다.
 *
 * 저장 공간은 여기서 **처음** 보인다. 사전만 120MB가 넘고 판례 본문이 그 뒤를 따르는데,
 * 어느 파일이 커지는지 모르면 디스크가 찰 때까지 아무도 눈치채지 못한다.
 */
export default function AdminSystemPage() {
  const checks = checkEnvironment();
  const storage = storageRows();
  const audio = audioStored();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.systemTitle}</h1>
        <p className={styles.intro}>{admin.systemIntro}</p>
      </header>

      <ul className={styles.metrics}>
        {checks.map((check) => (
          <Card as="li" key={check.id} padding="tight">
            <div className={styles.metric}>
              <span className={styles.metricLabel}>{check.label}</span>
              <strong>{check.value}</strong>
              {/* 상태는 아이콘·글자·색 셋으로 전한다(§11). 카드에 색을 입히지는 않는다. */}
              <Badge tone={BADGE_TONES[check.level]}>{setup.levels[check.level]}</Badge>
              <span className={styles.metricNote}>{check.note}</span>
            </div>
          </Card>
        ))}
      </ul>

      <Card as="section" className={styles.usage}>
        <h2 className={styles.sectionTitle}>{admin.storageTitle}</h2>
        <p className={styles.sectionBody}>{admin.storageIntro}</p>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{admin.storageColumns.label}</th>
                <th scope="col">{admin.storageColumns.path}</th>
                <th scope="col">{admin.storageColumns.bytes}</th>
              </tr>
            </thead>
            <tbody>
              {storage.map((row) => (
                <tr key={row.path}>
                  <td>{row.label}</td>
                  <td>{row.path}</td>
                  <td>{row.bytes === undefined ? admin.storageMissing : formatBytes(row.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.hint}>{admin.audioStorage(audio.clips, formatBytes(audio.bytes))}</p>
      </Card>
    </div>
  );
}

/** 디스크와 메모리는 매번 다시 본다. 캐시하면 어제 값이 보인다. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: `${admin.systemTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
