import { notFound } from "next/navigation";
import { BrailleDocument } from "@/components/a11y/braille-document";
import { toLevel } from "@/components/viewer/levels";
import {
  findLatestUploadRendition,
  findUploadRendition,
  listUploadSentences,
} from "@/db/app/generation";
import { findUploadForOwner, listUploadSpans } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { formatDate } from "@/lib/format";
import { braille as strings, viewer } from "@/lib/strings";
import { PIPELINE_VERSION } from "@/server/generate";
import { currentOwnerId } from "@/server/owner";
import { siteTimeZone } from "@/server/settings";
import { purgeExpiredUploads } from "@/server/upload";

/**
 * 내가 올린 판결문을 점자로 가져간다. 소유자 확인과 만료 정리를 일반 문서 뷰어와 같은
 * 순서로 거친다. URL을 아는 것만으로 개인 문서가 드러나서는 안 된다.
 */
export default async function DocBraillePage(props: {
  params: Promise<{ docId: string }>;
  searchParams: Promise<{ level?: string | string[] }>;
}) {
  const [{ docId }, searchParams] = await Promise.all([props.params, props.searchParams]);

  const ownerId = await currentOwnerId();
  if (ownerId === undefined) {
    notFound();
  }

  const db = appDb();
  purgeExpiredUploads(db);

  const upload = findUploadForOwner(db, docId, ownerId);
  if (upload === undefined) {
    notFound();
  }

  const level = toLevel(searchParams.level);
  const viewerPath = `/doc/${encodeURIComponent(docId)}?level=${level}`;
  const content =
    level === "L0"
      ? { lines: listUploadSpans(db, docId).map((span) => span.text), outdatedAt: null }
      : (() => {
          const current = findUploadRendition(db, docId, level, PIPELINE_VERSION);
          const rendition = current ?? findLatestUploadRendition(db, docId, level);
          return {
            lines:
              rendition === undefined
                ? []
                : listUploadSentences(db, rendition.id).map((sentence) => sentence.text),
            outdatedAt:
              current === undefined && rendition !== undefined
                ? formatDate(rendition.generatedAt, siteTimeZone())
                : null,
          };
        })();

  return (
    <BrailleDocument
      backHref={viewerPath}
      filename={`${docId}-${level}.txt`}
      lines={content.lines}
      meta={strings.meta(
        upload.title,
        level === "L0" ? strings.originalLabel : viewer.levels[level],
      )}
      outdatedAt={content.outdatedAt}
    />
  );
}

/** 개인 문서는 점자 화면도 검색 엔진에 노출하지 않는다. */
export const metadata = { robots: { index: false, follow: false } };
