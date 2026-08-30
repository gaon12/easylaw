import { ButtonLink } from "@/components/ui/button";
import { Infobox } from "@/components/ui/infobox";
import { setup } from "@/lib/strings";
import { checkEnvironment, hasBlockingIssue } from "@/server/environment";
import styles from "./setup-steps.module.css";
import { StepRail } from "./step-rail";

/**
 * 설치 1단계 — 서버 환경 점검. `PAGES.md` §17
 *
 * 설정을 다 넣은 뒤에 "데이터 폴더에 쓸 수 없다"는 것을 알게 되면, 그때는 무엇이 잘못됐는지
 * 찾기 어렵다. 그래서 아무것도 입력받기 전에 먼저 본다.
 *
 * **막히는 것이 있으면 다음으로 보내지 않는다.** 다만 경고는 막지 않는다 — 개발 모드나
 * 적은 디스크는 알릴 일이지 설치를 세울 일이 아니다.
 *
 * 검사는 화면을 열 때마다 다시 돈다. 그래서 문제를 고치고 새로 고치면 바로 반영된다 —
 * "다시 검사하기"는 그냥 이 주소를 다시 여는 링크다.
 */
export default function SetupPage() {
  const checks = checkEnvironment();
  const blocked = hasBlockingIssue(checks);
  const warned = checks.some((check) => check.level === "warn");

  return (
    <>
      <StepRail current="environment" />

      <header className={styles.header}>
        <h1 className={styles.title}>{setup.environmentTitle}</h1>
        <p className={styles.intro}>{setup.environmentIntro}</p>
      </header>

      {blocked ? (
        <Infobox title={setup.environmentFail} tone="danger">
          {setup.environmentRecheckBody}
        </Infobox>
      ) : (
        <Infobox
          title={warned ? setup.environmentWarn : setup.environmentOk}
          tone={warned ? "warning" : "info"}
        >
          {setup.environmentRecheckBody}
        </Infobox>
      )}

      <ul className={styles.checks}>
        {checks.map((check) => (
          <li className={`${styles.check} ${styles[check.level]}`} key={check.id}>
            <div className={styles.checkHead}>
              <span className={styles.checkLabel}>{check.label}</span>
              {/* 상태를 색으로만 알리지 않는다(`DESIGN.md` §10). 글자로도 말한다. */}
              <span className={styles.checkLevel}>{setup.levels[check.level]}</span>
            </div>
            <p className={styles.checkValue}>{check.value}</p>
            <p className={styles.checkNote}>{check.note}</p>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        {blocked ? null : (
          <ButtonLink href="/setup/account" size="l">
            {setup.environmentSubmit}
          </ButtonLink>
        )}
        <a className={styles.recheck} href="/setup">
          {setup.environmentRecheck}
        </a>
      </div>
    </>
  );
}

export const metadata = { title: setup.title };
