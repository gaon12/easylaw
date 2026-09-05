"use client";

import { useActionState, useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StructuredList } from "@/components/ui/structured-list";
import { baseUrlAdvice, checkBaseUrl } from "@/lib/llm/base-url";
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

/**
 * AI API 주소 칸.
 *
 * **여기서 막는다.** 주소를 대신 고쳐서 저장하면 사람은 자기가 무엇을 넣었는지 모른 채
 * 넘어가고, 다음에도 같은 값을 넣는다. 무엇을 어떻게 고쳐야 하는지 칸 아래에 적는다.
 */
function BaseUrlField({
  onChange,
  value,
}: {
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  value: string;
}) {
  const hintId = useId();
  const problem = checkBaseUrl(value);

  return (
    <label className={styles.field}>
      <span className={styles.label}>{setup.llmBaseUrlLabel}</span>
      <input
        aria-describedby={hintId}
        aria-invalid={problem !== undefined}
        autoComplete="url"
        className={styles.input}
        name="llm_base_url"
        onChange={onChange}
        placeholder={setup.llmBaseUrlPlaceholder}
        type="url"
        value={value}
      />
      {/* 문제가 있으면 안내 대신 고칠 방법을 적는다. 둘을 같이 두면 어느 쪽을 읽어야 할지 모른다. */}
      <span className={problem === undefined ? styles.hint : styles.fieldError} id={hintId}>
        {problem === undefined ? setup.llmBaseUrlHint : baseUrlAdvice(problem, value)}
      </span>
    </label>
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

  /* 주소가 틀린 동안에는 다음으로 넘어가지 못하게 한다. 칸이 무엇을 고칠지 말해 준다. */
  const urlProblem = checkBaseUrl(values.llm_base_url);

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
            <BaseUrlField onChange={setValue("llm_base_url")} value={values.llm_base_url} />
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
            <Button size="l" type="submit" disabled={pending || urlProblem !== undefined}>
              {pending ? "연결을 시험하고 있어요…" : "입력한 연결 시험하기"}
            </Button>
            <Button
              disabled={urlProblem !== undefined}
              formAction={saveConnections}
              size="l"
              type="submit"
              variant="secondary"
            >
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
