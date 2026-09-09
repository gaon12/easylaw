import { corpusDb } from "@/db/client";
import { findCaseMediaAssetForPlacement } from "@/lib/case-media";
import { canAccessContentWorkspace } from "@/lib/content-permissions";
import { readContentMediaFile } from "@/server/content-media-file";
import { findPublishedMediaReportTarget } from "@/server/media-report-target";
import { currentSession } from "@/server/owner";

async function GET(_request: Request, context: { params: Promise<{ placementId: string }> }) {
  const { placementId } = await context.params;
  const asset = findCaseMediaAssetForPlacement(placementId);
  if (asset === undefined) {
    return new Response(null, { status: 404 });
  }
  const published = findPublishedMediaReportTarget(corpusDb(), placementId) !== undefined;
  if (!published) {
    const session = await currentSession();
    if (!canAccessContentWorkspace(session?.role)) {
      return new Response(null, { status: 404 });
    }
  }
  const file = await readContentMediaFile(asset.storageKey);
  if (file === undefined) {
    return new Response(null, { status: 404 });
  }
  return new Response(file, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export { GET };
