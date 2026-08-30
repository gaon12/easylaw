import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setup } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { DEFAULT_DAILY_GENERATION_LIMIT, DEFAULT_LLM_MODEL } from "@/server/settings";
import { saveConnections } from "@/server/setup-actions";
import styles from "../setup-steps.module.css";
import { StepRail } from "../step-rail";

/**
 * 설치 2단계 — 외부 연결. `PAGES.md` §17
 *
 * **전부 선택 항목이다.** 넣지 않으면 그 기능만 꺼진 채로 서비스가 돌아간다.
 * 설치를 마치는 데 외부 서비스 가입을 요구하면, 둘러보려던 사람이 여기서 멈춘다.
 *
 * 이 폼은 `useActionState`를 쓰지 않는다 — 실패할 수 있는 검증이 없고(빈 값도 정상),
 * 되돌려 줄 오류 상태가 없다. 성공하면 곧바로 다음 단계로 넘어간다.
 */
export default async function ConnectionsPage() {
  const session = await currentSession();
  if (session?.role !== "admin") {
    // 1단계를 건너뛰고 들어온 경우. 관리자 계정부터 만들어야 한다.
    redirect("/setup");
  }

  return (
    <>
      <StepRail current="connections" />

      <header className={styles.header}>
        <h1 className={styles.title}>{setup.connectionsTitle}</h1>
        <p className={styles.intro}>{setup.connectionsIntro}</p>
      </header>

      <form action={saveConnections} className={styles.form}>
        <fieldset className={styles.group}>
          <legend className={styles.groupTitle}>{setup.lawApiTitle}</legend>
          <p className={styles.groupBody}>{setup.lawApiBody}</p>
          <label className={styles.field}>
            <span className={styles.label}>{setup.lawApiLabel}</span>
            <input
              autoComplete="off"
              className={styles.input}
              name="law_api_oc"
              placeholder={setup.lawApiPlaceholder}
              type="text"
            />
          </label>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.groupTitle}>{setup.llmTitle}</legend>
          <p className={styles.groupBody}>{setup.llmBody}</p>

          <label className={styles.field}>
            <span className={styles.label}>{setup.llmBaseUrlLabel}</span>
            <input
              autoComplete="off"
              className={styles.input}
              name="llm_base_url"
              placeholder={setup.llmBaseUrlPlaceholder}
              type="url"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{setup.llmApiKeyLabel}</span>
            <input autoComplete="off" className={styles.input} name="llm_api_key" type="password" />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{setup.llmModelLabel}</span>
            <input
              autoComplete="off"
              className={styles.input}
              defaultValue={DEFAULT_LLM_MODEL}
              name="llm_model"
              type="text"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{setup.limitLabel}</span>
            <input
              className={styles.input}
              defaultValue={DEFAULT_DAILY_GENERATION_LIMIT}
              inputMode="numeric"
              min={1}
              name="generation_daily_limit"
              type="number"
            />
            <span className={styles.hint}>{setup.limitHint}</span>
          </label>
        </fieldset>

        <p className={styles.optional}>{setup.optionalNote}</p>

        <Button size="l" type="submit">
          {setup.connectionsSubmit}
        </Button>
      </form>
    </>
  );
}

export const metadata = { title: setup.title };
