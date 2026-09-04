import { NextResponse } from "next/server";
import { law as strings } from "@/lib/strings";
import { verifyCitation } from "@/server/law";

/**
 * 조문 하나를 JSON으로. 인용을 눌렀을 때 뜨는 창이 이것을 읽는다.
 *
 * **화면을 옮기지 않고 조문을 보여 주기 위한 것이다.** 판결문을 읽다가 「민사소송법
 * 제420조」가 무슨 말인지 보려고 법령 화면으로 떠나면, 돌아왔을 때 읽던 자리를 다시 찾아야
 * 한다. 위키가 각주를 띄워 보여 주는 이유가 그것이다.
 *
 * **날짜를 받는다.** 가리켜야 하는 것은 현행 법이 아니라 **그 판결 당시 시행 중이던 법**이다
 * (`PRODUCT.md` §6.5). 날짜가 없으면 오늘로 본다.
 *
 * 이 라우트는 우리가 이미 갖고 있는 것을 돌려줄 뿐이다 — 본문이 캐시에 없고 법제처 연결도
 * 없으면 "확인하지 못했다"고 답한다. 없는 것과 확인 못 한 것을 섞지 않는다.
 */

const BAD_REQUEST = 400;

/** 조회에 쓰는 값의 길이 상한. 주소로 들어오는 값이라 길이를 먼저 본다(§7). */
const MAX_PARAM = 40;

function param(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 || trimmed.length > MAX_PARAM ? undefined : trimmed;
}

async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const lawId = param(url.searchParams.get("id"));
  const articleNo = param(url.searchParams.get("조"));
  const branchNo = param(url.searchParams.get("의"));
  const at = param(url.searchParams.get("때"));

  if (lawId === undefined || articleNo === undefined) {
    return NextResponse.json({ kind: "bad_request" }, { status: BAD_REQUEST });
  }

  const reference = branchNo === undefined ? `제${articleNo}조` : `제${articleNo}조의${branchNo}`;
  const when = at === undefined ? new Date() : new Date(`${at}T00:00:00Z`);
  const check = await verifyCitation(
    { lawId },
    reference,
    Number.isNaN(when.getTime()) ? new Date() : when,
    request.signal,
  );

  if (check.kind !== "exists") {
    /*
     * 왜 못 보여 주는지 그대로 전한다. "없는 조문"과 "우리가 확인하지 못한 조문"은
     * 읽는 사람에게 완전히 다른 말이다(§5.5 [6a]).
     */
    return NextResponse.json({ kind: check.kind });
  }

  const { article } = check;
  return NextResponse.json({
    kind: "exists",
    heading: strings.articleLabel(article.articleNo, article.branchNo),
    title: article.title,
    clauses: article.clauses.map((clause) => ({ number: clause.number, text: clause.text })),
    body: article.body,
  });
}

export { GET };
