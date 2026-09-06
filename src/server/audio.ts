import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  upload,
  uploadRendition,
  uploadRenditionAudio,
  uploadRenditionSentence,
} from "@/db/app/schema";
import { appDb, corpusDb } from "@/db/client";
import { reserveAudioSlot } from "@/db/corpus/repository";
import { judgment, rendition, renditionAudio, renditionSentence } from "@/db/corpus/schema";
import { dayKey } from "@/lib/format";
import { speak, TtsError } from "@/lib/tts/client";
import { siteTimeZone, ttsAllowsUploads, ttsConfig, ttsDailyLimit } from "./settings";

/**
 * 변환본을 소리로 만들어 둔다. [F-11]
 *
 * **눌렀을 때 만들고, 만들어 두면 다시 만들지 않는다.** 설명 생성과 같은 방식이다 —
 * 첫 사람만 기다리고 그다음 사람은 바로 듣는다.
 *
 * ## 두 저장소를 같은 절차로 다룬다
 *
 * 공개 판례(`corpus`)와 올린 문서(`app`)는 표가 다르지만 하는 일이 같다. 그래서 표를
 * 여닫는 부분만 갈라 두고 절차는 하나로 둔다 — 두 벌로 두면 언젠가 한쪽만 고쳐진다.
 *
 * ## 올린 문서는 기본으로 만들지 않는다
 *
 * 올린 판결문을 밖의 음성 서버로 보내면 그 사람이 어떤 사건을 들고 왔는지가 남의 서버에
 * 남는다. 그래서 **주소가 내 컴퓨터를 가리킬 때만** 켤 수 있다(`ttsAllowsUploads`).
 */

interface AudioTarget {
  /** 문장 id와 글. 순서대로 온다. */
  readonly sentences: readonly { id: string; text: string }[];
  /**
   * **지금 설정으로 만든** 음성이 있는 문장 id.
   *
   * 목소리나 모델을 바꾸면 옛 음성은 그 설정의 산물이지 지금 설정의 산물이 아니다.
   * 그대로 두면 한 변환본 안에서 목소리가 문장마다 달라진다 — 새로 만들 것으로 센다.
   */
  hasAudio(ids: readonly string[], voice: string, model: string): Set<string>;
  save(input: {
    sentenceId: string;
    voice: string;
    model: string;
    format: string;
    bytes: Buffer;
  }): void;
}

function caseAudio(renditionId: string): AudioTarget {
  const db = corpusDb();
  return {
    sentences: db
      .select({ id: renditionSentence.id, text: renditionSentence.text })
      .from(renditionSentence)
      .where(eq(renditionSentence.renditionId, renditionId))
      .orderBy(renditionSentence.orderIdx)
      .all(),

    hasAudio: (ids, voice, model) =>
      new Set(
        db
          .select({ id: renditionAudio.sentenceId })
          .from(renditionAudio)
          .where(
            and(
              inArray(renditionAudio.sentenceId, [...ids]),
              eq(renditionAudio.voice, voice),
              eq(renditionAudio.model, model),
            ),
          )
          .all()
          .map((row) => row.id),
      ),

    save: (input) => {
      db.insert(renditionAudio)
        .values(input)
        .onConflictDoUpdate({
          target: renditionAudio.sentenceId,
          set: {
            voice: sql`excluded.voice`,
            model: sql`excluded.model`,
            format: sql`excluded.format`,
            bytes: sql`excluded.bytes`,
          },
        })
        .run();
    },
  };
}

function docAudio(renditionId: string): AudioTarget {
  const db = appDb();
  return {
    sentences: db
      .select({ id: uploadRenditionSentence.id, text: uploadRenditionSentence.text })
      .from(uploadRenditionSentence)
      .where(eq(uploadRenditionSentence.renditionId, renditionId))
      .orderBy(uploadRenditionSentence.orderIdx)
      .all(),

    hasAudio: (ids, voice, model) =>
      new Set(
        db
          .select({ id: uploadRenditionAudio.sentenceId })
          .from(uploadRenditionAudio)
          .where(
            and(
              inArray(uploadRenditionAudio.sentenceId, [...ids]),
              eq(uploadRenditionAudio.voice, voice),
              eq(uploadRenditionAudio.model, model),
            ),
          )
          .all()
          .map((row) => row.id),
      ),

    save: (input) => {
      db.insert(uploadRenditionAudio)
        .values(input)
        .onConflictDoUpdate({
          target: uploadRenditionAudio.sentenceId,
          set: {
            voice: sql`excluded.voice`,
            model: sql`excluded.model`,
            format: sql`excluded.format`,
            bytes: sql`excluded.bytes`,
          },
        })
        .run();
    },
  };
}

type AudioResult =
  | { kind: "done"; made: number; skipped: number }
  | { kind: "cached" }
  | { kind: "off" }
  | { kind: "not_allowed" }
  | { kind: "limited" }
  | { kind: "failed"; reason: string; detail: string };

/**
 * 변환본 하나를 소리로 만든다.
 *
 * **이미 있는 문장은 건너뛴다.** 중간에 실패해도 다음에 부르면 남은 것부터 이어 만든다 —
 * 스무 문장 중 열여덟을 만들고 끊겼는데 처음부터 다시 하면 그만큼이 그대로 지출이다.
 */
async function makeAudio(
  target: AudioTarget,
  options: { signal?: AbortSignal } = {},
): Promise<AudioResult> {
  const config = ttsConfig();
  if (config === undefined) {
    return { kind: "off" };
  }

  const ids = target.sentences.map((sentence) => sentence.id);
  if (ids.length === 0) {
    return { kind: "cached" };
  }

  const done = target.hasAudio(ids, config.voice, config.model);
  const todo = target.sentences.filter((sentence) => !done.has(sentence.id));
  if (todo.length === 0) {
    return { kind: "cached" };
  }

  /*
   * 오늘 몫을 뗀다. **이미 있는 것을 확인한 뒤에 뗀다** — 다 만들어져 있는 변환본을
   * 다시 눌렀다고 몫이 줄면, 듣기만 해도 상한이 닳는다.
   *
   * 한 벌이 한 번이다. 문장 스무 개를 스무 번으로 세지 않는다 — 사람이 누른 횟수가
   * 곧 지출의 단위다.
   */
  if (
    !reserveAudioSlot(corpusDb(), {
      day: dayKey(new Date(), siteTimeZone()),
      limit: ttsDailyLimit(),
    })
  ) {
    return { kind: "limited" };
  }

  let made = 0;
  for (const sentence of todo) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: 한 번에 한 문장씩 청한다. 음성 서버를 한꺼번에 두드리지 않는다.
      const speech = await speak(config, sentence.text, options.signal);
      target.save({
        sentenceId: sentence.id,
        voice: config.voice,
        model: config.model,
        format: speech.format,
        bytes: speech.bytes,
      });
      made += 1;
    } catch (error) {
      /*
       * 여기까지 만든 것은 저장돼 있다. 다음에 부르면 남은 것부터 이어 만든다.
       * 실패 이유는 **읽는 사람에 맞게** 나눈다(`CONVENTIONS.md` §7).
       */
      return {
        kind: "failed",
        reason:
          error instanceof TtsError && error.status === undefined
            ? "음성을 만들지 못했어요. 잠시 뒤에 다시 눌러 주세요."
            : "음성 만들기 설정에 문제가 있어요. 이 사이트 관리자에게 알려 주세요.",
        detail: error instanceof Error ? error.message : "알 수 없는 오류입니다.",
      };
    }
  }

  return { kind: "done", made, skipped: ids.length - todo.length };
}

/** 공개 판례의 설명 한 벌을 소리로. */
function makeCaseAudio(renditionId: string, signal?: AbortSignal): Promise<AudioResult> {
  return makeAudio(caseAudio(renditionId), { signal });
}

/**
 * 올린 문서의 설명 한 벌을 소리로. **주소가 내 컴퓨터를 가리킬 때만 한다.**
 */
function makeDocAudio(renditionId: string, signal?: AbortSignal): Promise<AudioResult> {
  if (!ttsAllowsUploads()) {
    return Promise.resolve({ kind: "not_allowed" });
  }
  return makeAudio(docAudio(renditionId), { signal });
}

/**
 * 이 변환본에서 **음성이 있는 문장**의 id.
 *
 * 화면이 이것을 보고 "미리 만들어 둔 음성으로 읽을 수 있나"를 정한다. 바이트를 읽지
 * 않는다 — 목록을 그리는 데 음성 파일까지 끌어올 이유가 없다.
 */
function caseAudioSentenceIds(renditionId: string): Set<string> {
  return new Set(
    corpusDb()
      .select({ id: renditionAudio.sentenceId })
      .from(renditionAudio)
      .innerJoin(renditionSentence, eq(renditionSentence.id, renditionAudio.sentenceId))
      .where(eq(renditionSentence.renditionId, renditionId))
      .all()
      .map((row) => row.id),
  );
}

function docAudioSentenceIds(renditionId: string): Set<string> {
  return new Set(
    appDb()
      .select({ id: uploadRenditionAudio.sentenceId })
      .from(uploadRenditionAudio)
      .innerJoin(
        uploadRenditionSentence,
        eq(uploadRenditionSentence.id, uploadRenditionAudio.sentenceId),
      )
      .where(eq(uploadRenditionSentence.renditionId, renditionId))
      .all()
      .map((row) => row.id),
  );
}

interface AudioStatusRow {
  readonly renditionId: string;
  readonly caseNo: string;
  readonly level: string;
  readonly sentences: number;
  readonly withAudio: number;
}

/**
 * 어느 설명에 음성이 있고 어디가 비었나. **관리 화면이 읽는다.**
 *
 * 이 자리가 없으면 운영자는 "음성이 안 만들어진 문서"를 알 방법이 없다 — 화면마다
 * 들어가 눌러 봐야 하고, 그러면 결국 아무도 확인하지 않는다.
 *
 * 공개 판례만 센다. **올린 문서는 목록에 내지 않는다** — 관리자라도 누가 무엇을 올렸는지
 * 늘어놓고 볼 이유가 없다(§7). 그쪽은 주인이 자기 화면에서 만든다.
 */
function caseAudioStatus(limit: number): AudioStatusRow[] {
  return corpusDb()
    .select({
      renditionId: rendition.id,
      caseNo: judgment.caseNoDisplay,
      level: rendition.level,
      sentences: count(renditionSentence.id),
      withAudio: count(renditionAudio.sentenceId),
    })
    .from(rendition)
    .innerJoin(judgment, eq(judgment.id, rendition.judgmentId))
    .innerJoin(renditionSentence, eq(renditionSentence.renditionId, rendition.id))
    .leftJoin(renditionAudio, eq(renditionAudio.sentenceId, renditionSentence.id))
    .groupBy(rendition.id)
    .orderBy(desc(rendition.generatedAt))
    .limit(limit)
    .all();
}

/** 문장 하나의 음성. 화면이 `<audio>`로 받아 간다. */
function findCaseAudio(sentenceId: string): { bytes: Buffer; format: string } | undefined {
  return corpusDb()
    .select({ bytes: renditionAudio.bytes, format: renditionAudio.format })
    .from(renditionAudio)
    .where(eq(renditionAudio.sentenceId, sentenceId))
    .all()
    .at(0);
}

function findDocAudio(sentenceId: string): { bytes: Buffer; format: string } | undefined {
  return appDb()
    .select({ bytes: uploadRenditionAudio.bytes, format: uploadRenditionAudio.format })
    .from(uploadRenditionAudio)
    .where(eq(uploadRenditionAudio.sentenceId, sentenceId))
    .all()
    .at(0);
}

/**
 * 이 문장이 그 사람의 문서에 속하나. 올린 문서의 음성을 내보내기 전에 반드시 묻는다.
 *
 * 문장 → 변환본 → 문서 → 주인으로 세 번 거슬러 올라간다. 조인 하나로 묻는 이유는,
 * 나눠 물으면 그 사이에 조건 하나를 빠뜨린 분기가 생길 자리가 늘기 때문이다.
 */
function ownsDocSentence(sentenceId: string, userId: string): boolean {
  return (
    appDb()
      .select({ id: uploadRenditionSentence.id })
      .from(uploadRenditionSentence)
      .innerJoin(uploadRendition, eq(uploadRendition.id, uploadRenditionSentence.renditionId))
      .innerJoin(upload, eq(upload.id, uploadRendition.uploadId))
      .where(and(eq(uploadRenditionSentence.id, sentenceId), eq(upload.userId, userId)))
      .all().length > 0
  );
}

export {
  caseAudioSentenceIds,
  caseAudioStatus,
  docAudioSentenceIds,
  findCaseAudio,
  findDocAudio,
  makeCaseAudio,
  makeDocAudio,
  ownsDocSentence,
};
export type { AudioResult, AudioStatusRow };
