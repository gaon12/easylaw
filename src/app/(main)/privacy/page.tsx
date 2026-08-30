import { Article } from "@/components/ui/article";
import { privacy } from "@/lib/strings";

/**
 * 개인정보 처리방침. `PAGES.md` §20
 *
 * 여기 적힌 것은 전부 코드가 실제로 하는 일이다(문구는 `strings.ts` 주석 참조).
 * 처리방침은 약속이지 소개문이 아니라서, 코드와 어긋나는 문장이 한 줄이라도 있으면
 * 나머지 전부를 믿을 수 없게 된다.
 */
export default function PrivacyPage() {
  return (
    <Article
      intro={privacy.intro}
      sections={privacy.sections}
      title={privacy.title}
      updatedAt={privacy.updatedAt}
    />
  );
}

export const metadata = { title: privacy.title };
