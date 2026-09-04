import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SiteShell } from "@/components/site-shell";
import { isSetupComplete } from "@/server/settings";

/**
 * 서비스 화면 전체를 감싸는 관문. `PAGES.md` §1
 *
 * **설치가 끝나지 않은 서버는 서비스 화면을 열지 않는다.** 처음 띄운 서버에는 관리자도,
 * 법제처 키도 없어서 무엇을 해도 "아직 준비되지 않았어요"만 나온다. 그 상태를 둘러보게
 * 하는 것보다 설치를 마치게 하는 편이 낫다.
 *
 * 이 가드를 라우트 그룹 레이아웃에 두는 이유가 있다.
 * - 페이지마다 검사를 넣으면 새 페이지를 만들 때 빠뜨린다.
 * - 미들웨어에는 둘 수 없다. 설치 여부는 데이터베이스에 있고, better-sqlite3는
 *   미들웨어 런타임에서 돌지 않는다.
 * - 루트 레이아웃에 두면 `/setup` 자신까지 걸려 무한히 돌아간다. 그래서 `/setup`은
 *   이 그룹 **밖**에 두고, 그룹 안쪽만 이 가드를 지난다. 괄호 폴더는 주소에 나타나지 않는다.
 *
 * 서비스 셸도 여기에 있다. 헤더의 메뉴는 이 그룹 안의 화면들을 가리키므로, 그룹 밖에서는
 * 그릴 이유가 없다.
 */
export default async function MainLayout({ children }: { children: ReactNode }) {
  // better-sqlite3는 동기 호출이라 이 경계가 없으면 Next가 빌드 중 빈 DB를 읽으려 한다.
  await connection();

  if (!isSetupComplete()) {
    redirect("/setup");
  }

  // 서비스 셸(헤더·푸터)은 여기서 그린다. 설치 마법사는 자기 셸을 따로 쓴다.
  return <SiteShell>{children}</SiteShell>;
}
