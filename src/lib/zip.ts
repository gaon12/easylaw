/**
 * 최소한의 ZIP 읽기. `scripts/sync-dict.ts`
 *
 * biome-ignore-all lint/correctness/noNodejsModules: 자료를 들여오는 스크립트 전용이다. 화면에서 부르지 않는다.
 *
 * **의존성을 하나 더 들이지 않으려고 직접 읽는다.** 사전 자료는 표준국어대사전이 zip으로만
 * 내려 주는데, 그것 하나 때문에 런타임 의존성을 늘리고 싶지 않았다 — 자가 호스팅하는
 * 사람이 주기적으로 돌릴 스크립트라 개발 의존성으로 둘 수도 없다(`DESIGN.md` §13).
 *
 * **읽기만 한다. 만들지 않는다.** 그래서 다루는 범위가 좁다.
 *
 * - 압축 방식 `store`(0)와 `deflate`(8)만. 그 밖은 던진다 — 조용히 건너뛰면 자료가
 *   반만 들어온 것을 아무도 모른다.
 * - zip64와 암호화는 다루지 않는다. 68MB짜리 정부 공개 자료에 쓸 일이 없다.
 *
 * 파일 전체를 메모리에 올려 두고 훑는다. 스트리밍이 아니어도 되는 이유는 이것이 **가끔
 * 도는 스크립트**이고, 지금 자료가 68MB이기 때문이다. 그보다 커지면 그때 다시 본다.
 */

import { inflateRawSync } from "node:zlib";

/** 중앙 디렉터리 끝 표지. 여기서부터 거꾸로 읽는다. */
const END_OF_CENTRAL_DIRECTORY = 0x06_05_4b_50;
const CENTRAL_FILE_HEADER = 0x02_01_4b_50;
const LOCAL_FILE_HEADER = 0x04_03_4b_50;

const STORED = 0;
const DEFLATED = 8;

/**
 * 규격이 정한 필드 자리(바이트). **숫자를 코드에 흩어 놓지 않는다** — 한 칸만 밀려도
 * 압축 해제가 엉뚱한 곳에서 시작해 "깨진 zip"처럼 보이고, 그때 어디가 틀렸는지 찾기 어렵다.
 * 이름을 붙여 두면 규격 문서와 나란히 놓고 볼 수 있다.
 */
const CENTRAL = {
  method: 10,
  compressedSize: 20,
  uncompressedSize: 24,
  nameLength: 28,
  extraLength: 30,
  commentLength: 32,
  localHeaderOffset: 42,
  size: 46,
} as const;

const LOCAL = { nameLength: 26, extraLength: 28, size: 30 } as const;

const EOCD = { entryCount: 10, directoryOffset: 16 } as const;

/** EOCD는 가변 길이 주석 앞에 있다. 주석 최대치(65535) + 헤더만큼 뒤에서 찾는다. */
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xff_ff;

interface ZipEntry {
  readonly name: string;
  /** 압축을 푼 내용. */
  read(): Buffer;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const from = Math.max(0, buffer.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let at = buffer.length - EOCD_MIN_SIZE; at >= from; at -= 1) {
    if (buffer.readUInt32LE(at) === END_OF_CENTRAL_DIRECTORY) {
      return at;
    }
  }
  throw new Error("ZIP 파일이 아닙니다: 중앙 디렉터리를 찾지 못했습니다.");
}

/** 지역 헤더의 이름·부가 필드 길이만큼 건너뛴 자리가 실제 자료의 시작이다. */
function dataOffset(buffer: Buffer, localHeaderAt: number): number {
  if (buffer.readUInt32LE(localHeaderAt) !== LOCAL_FILE_HEADER) {
    throw new Error("ZIP 항목의 지역 헤더가 깨졌습니다.");
  }
  const nameLength = buffer.readUInt16LE(localHeaderAt + LOCAL.nameLength);
  const extraLength = buffer.readUInt16LE(localHeaderAt + LOCAL.extraLength);
  return localHeaderAt + LOCAL.size + nameLength + extraLength;
}

/**
 * 한 항목을 풀었을 때 받아들일 최대 크기.
 *
 * 압축 파일은 **작은 파일이 거대하게 부풀 수 있다.** 지금 자료는 항목 하나가 9MB인데,
 * 상한이 없으면 조작된 파일 하나가 서버 메모리를 다 쓴다. 이 코드는 예약 작업이
 * **아무도 보고 있지 않을 때** 부르므로 그 자리에서 막아야 한다.
 */
const MEGABYTE = 1_048_576;
const MAX_ENTRY_MEGABYTES = 128;
const MAX_ENTRY_BYTES = MAX_ENTRY_MEGABYTES * MEGABYTE;

interface EntryLocation {
  readonly method: number;
  readonly at: number;
  readonly compressed: number;
  readonly uncompressed: number;
}

function readEntry(buffer: Buffer, where: EntryLocation): Buffer {
  const { method, at, compressed, uncompressed } = where;
  if (uncompressed > MAX_ENTRY_BYTES) {
    throw new Error(`ZIP 항목이 너무 큽니다(${uncompressed}바이트).`);
  }

  const slice = buffer.subarray(at, at + compressed);
  if (method === STORED) {
    return slice;
  }
  if (method === DEFLATED) {
    /* 선언한 크기를 넘기면 거기서 멈춘다. 헤더의 숫자를 그대로 믿지 않는다. */
    return inflateRawSync(slice, { maxOutputLength: MAX_ENTRY_BYTES });
  }
  throw new Error(`ZIP 압축 방식 ${method}은 읽지 못합니다.`);
}

/**
 * 항목 목록. 내용은 `read()`를 부를 때 푼다 — 88개를 한꺼번에 풀면 788MB가 된다.
 */
function readZip(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(eocd + EOCD.entryCount);
  let at = buffer.readUInt32LE(eocd + EOCD.directoryOffset);

  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(at) !== CENTRAL_FILE_HEADER) {
      throw new Error("ZIP 중앙 디렉터리가 깨졌습니다.");
    }
    const method = buffer.readUInt16LE(at + CENTRAL.method);
    const compressedSize = buffer.readUInt32LE(at + CENTRAL.compressedSize);
    const uncompressedSize = buffer.readUInt32LE(at + CENTRAL.uncompressedSize);
    const nameLength = buffer.readUInt16LE(at + CENTRAL.nameLength);
    const extraLength = buffer.readUInt16LE(at + CENTRAL.extraLength);
    const commentLength = buffer.readUInt16LE(at + CENTRAL.commentLength);
    const localHeaderAt = buffer.readUInt32LE(at + CENTRAL.localHeaderOffset);
    const name = buffer.toString("utf8", at + CENTRAL.size, at + CENTRAL.size + nameLength);

    entries.push({
      name,
      read: () =>
        readEntry(buffer, {
          method,
          at: dataOffset(buffer, localHeaderAt),
          compressed: compressedSize,
          uncompressed: uncompressedSize,
        }),
    });

    at += CENTRAL.size + nameLength + extraLength + commentLength;
  }

  return entries;
}

export { readZip };
export type { ZipEntry };
