import { listUsersForAdmin } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { admin } from "@/lib/strings";
import styles from "../admin.module.css";
import { UserRoles } from "../user-roles";

/**
 * 계정. `PAGES.md` §17
 *
 * 비밀번호는 여기서도 볼 수 없다 — 저장된 것이 해시라서 볼 것이 없다. 이 화면이 하는
 * 일은 **권한을 옮기는 것** 하나다.
 */
export default function AdminUsersPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{admin.usersTitle}</h1>
        <p className={styles.intro}>{admin.usersIntro}</p>
      </header>

      <UserRoles users={listUsersForAdmin(appDb())} />
    </div>
  );
}

export const metadata = {
  title: `${admin.usersTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
