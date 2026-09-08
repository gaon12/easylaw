"use client";

import { useActionState } from "react";
import { Input } from "@/components/shadcn/ui/input";
import { NativeSelect } from "@/components/shadcn/ui/native-select";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/db/app/repository";
import { USER_ROLES } from "@/db/app/schema";
import { admin } from "@/lib/strings";
import { type AdminRoleState, setAccountRole } from "@/server/setup-actions";
import styles from "./admin.module.css";

interface AdminUser {
  readonly id: string;
  readonly email: string | null;
  readonly nickname: string | null;
  readonly role: UserRole;
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
  const [state, formAction, pending] = useActionState<AdminRoleState, FormData>(setAccountRole, {});
  const error = state.problem;
  return (
    <li className={styles.userRow}>
      <div className={styles.userIdentity}>
        <strong>{user.nickname ?? user.email ?? "이름 없는 계정"}</strong>
        {user.email === null ? null : <span>{user.email}</span>}
      </div>
      <form action={formAction} className={styles.rowActions}>
        <Input name="user_id" type="hidden" value={user.id} />
        <NativeSelect
          aria-label={admin.roleSelect(user.nickname ?? user.email ?? admin.unnamedAccount)}
          defaultValue={user.role}
          name="role"
        >
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {admin.roles[role]}
            </option>
          ))}
        </NativeSelect>
        <Button disabled={pending} size="s" type="submit" variant="secondary">
          {pending ? admin.roleSaving : admin.roleSave}
        </Button>
        {error === undefined ? null : (
          <span className={styles.roleError} role="alert">
            {roleErrorMessage(error)}
          </span>
        )}
      </form>
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
