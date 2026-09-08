"use client";

import {
  AudioLines,
  FlaskConical,
  Images,
  LayoutDashboard,
  LibraryBig,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/db/app/repository";
import { admin } from "@/lib/strings";
import styles from "./admin.module.css";

/**
 * 관리자 메뉴.
 *
 * **지금 어디에 있는지를 색으로만 알리지 않는다**(`DESIGN.md` §11). `aria-current`가
 * 화면 낭독기에 말해 주고, 굵기와 밑줄이 눈에 보인다 — 셋이 같은 것을 말한다.
 *
 * 클라이언트인 이유는 `usePathname` 하나뿐이다. 목록 자체는 고정이라 서버에서 그려도
 * 되지만, 그러면 화면마다 "내가 어디인지"를 넘겨줘야 하고 그것을 빠뜨리면 아무 데도
 * 표시되지 않는다.
 */

const GROUPS = [
  {
    label: admin.navGroups.operate,
    items: [
      { href: "/admin", label: admin.nav.overview, icon: LayoutDashboard },
      { href: "/admin/log", label: admin.nav.log, icon: ScrollText },
    ],
  },
  {
    label: admin.navGroups.content,
    items: [
      { href: "/admin/content", label: admin.nav.content, icon: LibraryBig },
      { href: "/admin/media/recipes", label: admin.nav.mediaRecipes, icon: Images },
      { href: "/admin/audio", label: admin.nav.audio, icon: AudioLines },
    ],
  },
  {
    label: admin.navGroups.manage,
    items: [
      { href: "/admin/users", label: admin.nav.users, icon: Users },
      { href: "/admin/settings", label: admin.nav.settings, icon: Settings },
      { href: "/admin/system", label: admin.nav.system, icon: ShieldCheck },
      { href: "/admin/test", label: admin.nav.test, icon: FlaskConical },
    ],
  },
] as const;

function AdminNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const groups = role === "admin" ? GROUPS : [GROUPS[1]];

  return (
    <nav aria-label={admin.navLabel} className={styles.nav}>
      <div className={styles.navBrand} aria-hidden="true">
        <span>{admin.brandMark}</span>
        <strong>{admin.brandName}</strong>
      </div>
      {groups.map((group) => (
        <section className={styles.navGroup} key={group.label}>
          <h2 className={styles.navGroupLabel}>{group.label}</h2>
          <ul className={styles.navList}>
            {group.items.map((item) => {
              // "/admin"은 모든 하위 경로의 앞부분이라 정확히 같을 때만 켠다.
              const here =
                item.href === "/admin"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.href}>
                  <Link
                    aria-current={here ? "page" : undefined}
                    className={styles.navLink}
                    href={item.href}
                  >
                    <item.icon aria-hidden="true" className={styles.navGlyph} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export { AdminNav };
