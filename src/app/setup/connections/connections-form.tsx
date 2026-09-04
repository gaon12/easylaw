"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import { admin, adminTest, setup } from "@/lib/strings";
import { saveConnections } from "@/server/setup-actions";
import {
  probeSetupConnections,
  type SetupConnectionProbeState,
} from "@/server/setup-connection-test";
import styles from "../setup-steps.module.css";

function ProbeCard({
  label,
  result,
}: {
  label: string;
  result: NonNullable<SetupConnectionProbeState["law"]>;
}) {
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

function ConnectionsForm({
  dailyLimit,
  defaultModel,
}: {
  dailyLimit: number;
  defaultModel: string;
}) {
  const [state, testAction, pending] = useActionState(probeSetupConnections, {});
  const [values, setValues] = useState({
    law_api_oc: "",
    llm_base_url: "",
    llm_api_key: "",
    llm_model: defaultModel,
  });
  const setValue = (name: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((previous) => ({ ...previous, [name]: event.target.value }));

  return (
    <>
      <form action={testAction}>
        <Card className={styles.form}>
          <fieldset className={styles.group}>
            <legend className={styles.groupTitle}>{setup.lawApiTitle}</legend>
            <p className={styles.groupBody}>{setup.lawApiBody}</p>
            <label className={styles.field}>
              <span className={styles.label}>{setup.lawApiLabel}</span>
              <input
                autoComplete="off"
                className={styles.input}
                name="law_api_oc"
                onChange={setValue("law_api_oc")}
                placeholder={setup.lawApiPlaceholder}
                type="text"
                value={values.law_api_oc}
              />
            </label>
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={styles.groupTitle}>{setup.llmTitle}</legend>
            <p className={styles.groupBody}>{setup.llmBody}</p>
            <label className={styles.field}>
              <span className={styles.label}>{setup.llmBaseUrlLabel}</span>
              <input
                autoComplete="url"
                className={styles.input}
                name="llm_base_url"
                onChange={setValue("llm_base_url")}
                placeholder={setup.llmBaseUrlPlaceholder}
                type="url"
                value={values.llm_base_url}
              />
              <span className={styles.hint}>{setup.llmBaseUrlHint}</span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{setup.llmApiKeyLabel}</span>
              <input
                autoComplete="new-password"
                className={styles.input}
                name="llm_api_key"
                onChange={setValue("llm_api_key")}
                type="password"
                value={values.llm_api_key}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{setup.llmModelLabel}</span>
              <input
                className={styles.input}
                name="llm_model"
                onChange={setValue("llm_model")}
                type="text"
                value={values.llm_model}
              />
              <span className={styles.hint}>{setup.llmModelHint}</span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{setup.limitLabel}</span>
              <input
                className={styles.input}
                defaultValue={dailyLimit}
                inputMode="numeric"
                min={1}
                name="generation_daily_limit"
                type="number"
              />
              <span className={styles.hint}>{setup.limitHint}</span>
            </label>
          </fieldset>

          <p className={styles.optional}>{setup.optionalNote}</p>
          <div className={styles.actions}>
            <Button size="l" type="submit" disabled={pending}>
              {pending ? "연결을 시험하고 있어요…" : "입력한 연결 시험하기"}
            </Button>
            <Button formAction={saveConnections} size="l" type="submit" variant="secondary">
              {setup.connectionsSubmit}
            </Button>
          </div>
        </Card>
      </form>

      <ProbeResults state={state} />
    </>
  );
}

function ProbeResults({ state }: { state: SetupConnectionProbeState }) {
  if (state.denied) {
    return (
      <Alert title={admin.deniedTitle} tone="warning">
        {admin.deniedBody}
      </Alert>
    );
  }
  if (state.law === undefined || state.llm === undefined) {
    return null;
  }
  return (
    <div className={styles.results}>
      <ProbeCard label={adminTest.lawLabel} result={state.law} />
      <ProbeCard label={adminTest.llmLabel} result={state.llm} />
    </div>
  );
}

export { ConnectionsForm };
