import { inflateRawSync } from "node:zlib";

/**
 * 최소한의 ZIP 읽기. `scripts/sync-dict.ts`
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

/** 중앙 디렉터리 끝 표지. 여기서부터 거꾸로 읽는다. */
const END_OF_CENTRAL_DIRECTORY = 0x06_05_4b_50;
const CENTRAL_FILE_HEADER = 0x02_01_4b_50;
const LOCAL_FILE_HEADER = 0x04_03_4b_50;

const STORED = 0;
const DEFLATED = 8;

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
  const nameLength = buffer.readUInt16LE(localHeaderAt + 26);
  const extraLength = buffer.readUInt16LE(localHeaderAt + 28);
  return localHeaderAt + 30 + nameLength + extraLength;
}

function readEntry(buffer: Buffer, method: number, at: number, size: number): Buffer {
  const slice = buffer.subarray(at, at + size);
  if (method === STORED) {
    return slice;
  }
  if (method === DEFLATED) {
    return inflateRawSync(slice);
  }
  throw new Error(`ZIP 압축 방식 ${method}은 읽지 못합니다.`);
}

/**
 * 항목 목록. 내용은 `read()`를 부를 때 푼다 — 88개를 한꺼번에 풀면 788MB가 된다.
 */
function readZip(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  let at = buffer.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(at) !== CENTRAL_FILE_HEADER) {
      throw new Error("ZIP 중앙 디렉터리가 깨졌습니다.");
    }
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localHeaderAt = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);

    entries.push({
      name,
      read: () => readEntry(buffer, method, dataOffset(buffer, localHeaderAt), compressedSize),
    });

    at += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

export { readZip };
export type { ZipEntry };
