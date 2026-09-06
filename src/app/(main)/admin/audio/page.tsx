import { admin } from "@/lib/strings";
import { caseAudioStatus } from "@/server/audio";
import styles from "../admin.module.css";
import { AudioStatus } from "../audio-status";

/** 음성 현황을 몇 줄까지 보여 주나. 최근 것부터. */
const AUDIO_ROWS = 30;

/**
 * 설명 음성. `PAGES.md` §17
 *
 * **이 자리가 없으면 운영자는 어느 문서에 음성이 없는지 알 방법이 없다** — 화면마다 들어가
 * 눌러 봐야 하고, 그러면 결국 아무도 확인하지 않는다.
 *
 * 만드는 통로는 **이용자 화면과 같다**. 관리자용 지름길을 따로 내면 하루 상한을 비껴가는
 * 길이 하나 더 생기고, 그 길만 고장 나 있어도 아무도 모른다.
 */
export default function AdminAudioPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.audioTitle}</h1>
        <p className={styles.intro}>{admin.audioBody}</p>
      </header>

      <AudioStatus rows={caseAudioStatus(AUDIO_ROWS)} />
    </div>
  );
}

/** 방금 만든 음성이 목록에 바로 보여야 한다. 캐시하면 "안 만들어졌다"가 계속 보인다. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: `${admin.audioTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
