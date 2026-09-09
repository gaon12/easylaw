import { NextResponse } from "next/server";
import { z } from "zod";
import { RateLimiter } from "@/lib/rate-limit";
import { recordBrowserError } from "@/server/error-events";

const FIELD_LIMITS = { digest: 200, name: 100, message: 2000, stack: 12_000, path: 1000 } as const;
const REPORTS_PER_MINUTE = 12;
const MINUTE_MS = 60_000;
const MAX_REPORT_BYTES = 24_000;
const browserErrorSchema = z.object({
  digest: z.string().max(FIELD_LIMITS.digest).optional(),
  name: z.string().min(1).max(FIELD_LIMITS.name),
  message: z.string().max(FIELD_LIMITS.message),
  stack: z.string().max(FIELD_LIMITS.stack).optional(),
  path: z.string().max(FIELD_LIMITS.path).optional(),
});
const limiter = new RateLimiter({ limit: REPORTS_PER_MINUTE, windowMs: MINUTE_MS });

function requester(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REPORT_BYTES) {
    return NextResponse.json({ error: "error_report_too_large" }, { status: 413 });
  }

  const key = requester(request);
  limiter.sweep();
  if (!limiter.allows(key)) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const parsed = browserErrorSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_error_report" }, { status: 400 });
    }
    limiter.fail(key);
    const code = recordBrowserError(parsed.data);
    return NextResponse.json({ code });
  } catch {
    // 오류 보고 자체가 실패해도 새 오류 화면을 만들지 않는다.
    return new NextResponse(null, { status: 204 });
  }
}
