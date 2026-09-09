import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { canAccessContentWorkspace } from "@/lib/content-permissions";
import { admin } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import styles from "./admin.module.css";
import { AdminNav } from "./nav";

/**
 * 관리자 화면의 껍데기. `PAGES.md` §17
 *
 * ## 왜 레이아웃인가
 *
 * **권한 확인이 화면마다 흩어져 있었다.** 화면이 하나였을 때는 그 화면 맨 위에 적어 두면
 * 됐지만, 화면을 일곱으로 나누면 일곱 군데에 같은 네 줄을 적게 된다 — 그리고 여덟 번째
 * 화면을 만드는 날 하나를 빠뜨린다. 레이아웃은 그 아래 모든 화면이 반드시 지나가는 자리라
 * **빠뜨릴 수 없는 곳**이다.
 *
 * 이것이 유일한 방벽은 아니다. 값을 바꾸는 것은 서버 액션이고 액션도 각자 권한을 본다
 * (`setup-actions.ts`) — 화면을 못 보게 하는 것과 못 바꾸게 하는 것은 다른 일이다.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const role = session?.role;

  if (!canAccessContentWorkspace(role)) {
    return (
      <div className={styles.denied}>
        <Alert title={admin.deniedTitle} tone="warning">
          {admin.deniedBody}
        </Alert>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <AdminNav role={role} />
      <div className={styles.workspace}>
        <header className={styles.toolbar}>
          <div>
            <strong>{admin.consoleTitle}</strong>
            <span>{admin.consoleSubtitle}</span>
          </div>
          <Link className={styles.serviceLink} href="/">
            {admin.returnToService}
          </Link>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
