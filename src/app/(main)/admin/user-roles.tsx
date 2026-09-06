"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { admin } from "@/lib/strings";
import { type AdminRoleState, setAdminRole } from "@/server/setup-actions";
import styles from "./admin.module.css";

interface AdminUser {
  readonly id: string;
  readonly email: string | null;
  readonly nickname: string | null;
  readonly role: "admin" | "member";
}

function roleErrorMessage(problem: AdminRoleState["problem"]): string {
  switch (problem) {
    case "forbidden":
      return admin.roleForbidden;
    case "last_admin":
      return admin.lastAdmin;
    default:
      return admin.roleNotFound;
  }
}

function UserRoleForm({ user }: { user: AdminUser }) {
  const [state, formAction, pending] = useActionState<AdminRoleState, FormData>(setAdminRole, {});
  const error = state.problem;
  return (
    <li className={styles.userRow}>
      <div className={styles.userIdentity}>
        <strong>{user.nickname ?? user.email ?? "이름 없는 계정"}</strong>
        {user.email === null ? null : <span>{user.email}</span>}
      </div>
      {user.role === "admin" ? (
        <span className={styles.roleBadge}>{admin.adminRole}</span>
      ) : (
        <form action={formAction}>
          <input name="user_id" type="hidden" value={user.id} />
          <Button disabled={pending} size="s" type="submit">
            {pending ? "지정 중…" : admin.makeAdmin}
          </Button>
          {error === undefined ? null : (
            <span className={styles.roleError} role="alert">
              {roleErrorMessage(error)}
            </span>
          )}
        </form>
      )}
    </li>
  );
}

/** 제목과 안내는 화면이 그린다 — 이 컴포넌트는 목록만 그린다. */
function UserRoles({ users }: { users: readonly AdminUser[] }) {
  return (
    <ul className={styles.userList}>
      {users.map((user) => (
        <UserRoleForm key={user.id} user={user} />
      ))}
    </ul>
  );
}

export { UserRoles };
