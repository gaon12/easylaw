import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import { lawApi } from "@/lib/law-api/client";
import { llm } from "@/lib/llm/client";
import { admin, adminTest } from "@/lib/strings";
import { type ProbeResult, probeLawApi, probeLlm } from "@/server/connection-test";
import { currentSession } from "@/server/owner";
import styles from "./page.module.css";

/**
 * 연결 시험. `PROGRESS.md` "설치 마법사에 연결 시험이 없다"
 *
 * **자바스크립트 없이 동작한다.** 링크를 눌러 들어오면 서버가 두 곳에 실제로 한 번씩
 * 걸어 보고 결과를 그린다. 이 화면 전체가 곧 "시험 버튼"이라 폼도 액션도 필요 없다.
 *
 * 저장된 설정으로 시험한다 — 폼에 적힌 값이 아니라. 비밀 항목은 화면에 값을 되돌려
 * 주지 않으므로(§10.5) 폼 값으로 시험하면 키를 다시 타이핑하게 만든다.
 */

/** 결과 하나를 톤과 함께 그린다. "안 켬"과 "실패"를 같은 색으로 보여 주지 않는다. */
function ProbeCard({ label, result }: { label: string; result: ProbeResult }) {
  if (result.kind === "not_configured") {
    return (
      <Alert title={`${label} — ${adminTest.notConfiguredTitle}`} tone="warning">
        {adminTest.notConfiguredBody}
      </Alert>
    );
  }

  if (result.kind === "failed") {
    return (
      <Alert title={`${label} — ${adminTest.failedTitle}`} tone="danger">
        <StructuredList
          rows={[
            { label: "이유", value: result.message },
            { label: "걸린 시간", value: adminTest.elapsed(result.elapsedMs) },
          ]}
        />
      </Alert>
    );
  }

  return (
    <Alert title={`${label} — ${adminTest.okTitle}`} tone="success">
      <StructuredList
        rows={[
          { label: "결과", value: result.detail },
          { label: "걸린 시간", value: adminTest.elapsed(result.elapsedMs) },
        ]}
      />
    </Alert>
  );
}

export default async function AdminTestPage() {
  const session = await currentSession();
  if (session?.role !== "admin") {
    return (
      <div className={styles.page}>
        <Alert title={admin.deniedTitle} tone="warning">
          {admin.deniedBody}
        </Alert>
      </div>
    );
  }

  // 두 시험은 서로 상관이 없다. 차례로 걸면 느린 쪽이 빠른 쪽을 기다리게 한다.
  const [law, model] = await Promise.all([probeLawApi(lawApi()), probeLlm(llm())]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{adminTest.title}</h1>
        <p className={styles.intro}>{adminTest.intro}</p>
      </header>

      <div className={styles.results}>
        <ProbeCard label={adminTest.lawLabel} result={law} />
        {law.kind === "ok" ? (
          <Card>
            <p className={styles.note}>{adminTest.lawZeroNote}</p>
          </Card>
        ) : null}
        <ProbeCard label={adminTest.llmLabel} result={model} />
      </div>

      <nav className={styles.actions}>
        <Link className={styles.link} href="/admin/test">
          {adminTest.run}
        </Link>
        <Link className={styles.link} href="/admin">
          {adminTest.back}
        </Link>
      </nav>
    </div>
  );
}

/** 시험 결과를 캐시하면 값을 고친 뒤에도 옛 결과가 보인다. 이 화면은 매번 새로 걸어야 한다. */
export const dynamic = "force-dynamic";

export const metadata = { title: adminTest.title, robots: { index: false, follow: false } };
