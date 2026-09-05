/* biome-ignore-all lint/correctness/noNodejsModules: 시험용 zip을 만들어 읽기 코드를 검사한다. */
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readZip } from "./zip";

/**
 * 시험용 zip을 손으로 만든다. **읽기 코드를 만들기 코드로 검증하지 않으려는 것**이다 —
 * 같은 사람이 같은 오해로 양쪽을 짜면 둘 다 틀려도 시험은 통과한다. 여기서는 규격 문서의
 * 바이트 배치를 그대로 적어 둔다.
 */
function buildZip(files: { name: string; body: string; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.body, "utf8");
    const stored = file.store === true;
    const data = stored ? raw : deflateRawSync(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02_01_4b_50, 0);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

describe("readZip", () => {
  it("압축한 항목을 푼다", () => {
    const zip = readZip(buildZip([{ name: "a.json", body: '{"말":"뜻"}' }]));

    expect(zip).toHaveLength(1);
    expect(zip[0]?.name).toBe("a.json");
    expect(zip[0]?.read().toString("utf8")).toBe('{"말":"뜻"}');
  });

  it("압축하지 않은 항목도 읽는다", () => {
    const zip = readZip(buildZip([{ name: "b.txt", body: "그대로", store: true }]));

    expect(zip[0]?.read().toString("utf8")).toBe("그대로");
  });

  it("여러 항목의 자리를 각각 맞춘다 — 한 칸 밀리면 다음 것부터 전부 깨진다", () => {
    const zip = readZip(
      buildZip([
        { name: "1.json", body: "첫째" },
        { name: "2.json", body: "둘째", store: true },
        { name: "3.json", body: "셋째" },
      ]),
    );

    expect(zip.map((entry) => entry.name)).toEqual(["1.json", "2.json", "3.json"]);
    expect(zip.map((entry) => entry.read().toString("utf8"))).toEqual(["첫째", "둘째", "셋째"]);
  });

  it("zip이 아니면 던진다 — 반만 읽고 넘어가지 않는다", () => {
    expect(() => readZip(Buffer.from("이건 zip이 아니다"))).toThrow("ZIP 파일이 아닙니다");
  });
});

/*
 * 이 코드는 예약 작업이 **아무도 보고 있지 않을 때** 부른다. 헤더에 적힌 숫자를 그대로
 * 믿으면 조작된 파일 하나가 서버 메모리를 다 쓴다.
 */
describe("부풀기 막기", () => {
  it("풀었을 때 너무 커진다고 적혀 있으면 풀지 않는다", () => {
    const zip = buildZip([{ name: "big.json", body: "작다" }]);
    /* 중앙 디렉터리의 "푼 크기"만 크게 적어 둔다 — 실제 자료는 그대로다. */
    const at = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(999_999_999, at + 24);

    expect(() => readZip(zip)[0]?.read()).toThrow("너무 큽니다");
  });
});
