import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { corpusDb } from "@/db/client";
import {
  findJudgmentById,
  findRenditionById,
  listSentences,
  listSpans,
} from "@/db/corpus/repository";
import { canEditContent } from "@/lib/content-permissions";
import { admin } from "@/lib/strings";
import { currentSession } from "@/server/owner";
import { type EditableSentence, EditorForm } from "./editor-form";
import styles from "./page.module.css";

export default async function RenditionEditPage({
  params,
}: {
  params: Promise<{ judgmentId: string; renditionId: string }>;
}) {
  const session = await currentSession();
  if (!canEditContent(session?.role)) {
    notFound();
  }

  const { judgmentId, renditionId } = await params;
  const db = corpusDb();
  const judgment = findJudgmentById(db, judgmentId);
  const rendition = findRenditionById(db, judgmentId, renditionId);
  if (
    judgment === undefined ||
    rendition === undefined ||
    judgment.currentRevisionId === null ||
    rendition.sourceRevisionId !== judgment.currentRevisionId
  ) {
    notFound();
  }

  const spans = listSpans(db, judgmentId, rendition.sourceRevisionId);
  const spanText = new Map(spans.map((span) => [span.id, span.text]));
  const sentences: EditableSentence[] = listSentences(db, renditionId).map((sentence) => ({
    id: sentence.id,
    orderIdx: sentence.orderIdx,
    role: sentence.role,
    text: sentence.text,
    source: sentence.source,
    evidence: sentence.sourceSpanIds.flatMap((id) => {
      const text = spanText.get(id);
      return text === undefined ? [] : [text];
    }),
  }));
  if (sentences.length === 0) {
    notFound();
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} href={`/admin/content/judgments/${judgmentId}`}>
          {admin.renditionEditBack}
        </Link>
        <h1>{admin.renditionEditTitle}</h1>
        <p>{admin.renditionEditIntro}</p>
        <dl className={styles.meta}>
          <div>
            <dt>{admin.judgmentColumns.caseNo}</dt>
            <dd>{judgment.caseNoDisplay}</dd>
          </div>
          <div>
            <dt>{admin.renditionEditLevel}</dt>
            <dd>{rendition.level}</dd>
          </div>
        </dl>
      </header>
      <Card as="section" className={styles.editor}>
        <EditorForm judgmentId={judgmentId} renditionId={renditionId} sentences={sentences} />
      </Card>
    </div>
  );
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${admin.renditionEditTitle} · ${admin.title}`,
  robots: { index: false, follow: false },
};
