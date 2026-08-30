import "server-only";
import { accessSync, constants, mkdirSync, statfsSync } from "node:fs";
import { totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { appDb, corpusDb } from "@/db/client";
import { env } from "@/lib/env";

/**
 * 서버 환경 점검. `PAGES.md` §17
 *
 * 설치를 시작하기 전에 **이 서버가 이 서비스를 돌릴 수 있는 상태인지** 먼저 본다.
 * 설정을 다 넣고 나서 "데이터 폴더에 쓸 수 없다"는 것을 알게 되면, 그때는 무엇이
 * 잘못됐는지 찾기 어렵다.
 *
 * 검사 하나하나가 **무엇을 봤고 왜 중요한지, 안 되면 어떻게 고치는지**를 함께 돌려준다.
 * "실패"만 알려 주는 점검은 점검이 아니다.
 *
 * 이 함수는 값을 바꾸지 않는다. 읽고 보기만 한다.
 */

/** `package.json`의 `engines.node`와 같아야 한다. 테스트가 두 값을 맞춰 준다. */
const MIN_NODE_MAJOR = 20;
const MIN_NODE_MINOR = 9;

/** 1GiB. 2^30. */
const BYTES_PER_GIB = 1_073_741_824;
/** 이보다 적으면 알린다(1GiB). 판결문 원문과 데이터베이스가 쌓이는 자리다. */
const LOW_DISK_BYTES = BYTES_PER_GIB;
/** 이보다 적으면 알린다(0.5GiB). SQLite와 Next 서버가 함께 도는 데 필요한 최소한. */
const LOW_MEMORY_BYTES = BYTES_PER_GIB / 2;

type CheckLevel =
  /** 문제없다. */
  | "ok"
  /** 돌아가지만 알아 둘 것이 있다. */
  | "warn"
  /** 이 상태로는 설치를 이어 갈 수 없다. */
  | "fail";

interface EnvironmentCheck {
  readonly id: string;
  readonly level: CheckLevel;
  /** 무엇을 봤는지. */
  readonly label: string;
  /** 무엇이 나왔는지. 숫자나 버전처럼 눈으로 확인할 수 있는 값. */
  readonly value: string;
  /** 왜 보는지, 안 되면 어떻게 하는지. */
  readonly note: string;
}

function gib(bytes: number): string {
  return `${(bytes / BYTES_PER_GIB).toFixed(1)}GB`;
}

/** Node 버전. 낮으면 문법 자체가 돌지 않으므로 막는다. */
function checkNode(): EnvironmentCheck {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  const enough = major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);

  return {
    id: "node",
    level: enough ? "ok" : "fail",
    label: "Node.js 버전",
    value: process.versions.node,
    note: enough
      ? `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR} 이상이면 돼요. 이 서버는 조건을 만족해요.`
      : `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR} 이상이 필요해요. Node를 올린 뒤 서버를 다시 띄워 주세요.`,
  };
}

/**
 * 데이터 폴더에 쓸 수 있는지.
 *
 * 데이터베이스 파일이 여기 생긴다. 못 쓰면 아무것도 저장되지 않으므로 막는다.
 */
function checkDataDirectory(): EnvironmentCheck {
  const directory = dirname(resolve(process.cwd(), env().APP_DB_PATH));

  try {
    mkdirSync(directory, { recursive: true });
    accessSync(directory, constants.W_OK);
    return {
      id: "data_directory",
      level: "ok",
      label: "데이터 폴더 쓰기",
      value: directory,
      note: "이 폴더에 데이터베이스 파일이 만들어져요. 쓸 수 있어요.",
    };
  } catch {
    return {
      id: "data_directory",
      level: "fail",
      label: "데이터 폴더 쓰기",
      value: directory,
      note: "이 폴더에 쓸 수 없어요. 폴더 권한을 확인하시거나, .env의 APP_DB_PATH를 쓸 수 있는 곳으로 바꿔 주세요.",
    };
  }
}

/**
 * 데이터베이스를 열고 마이그레이션이 적용됐는지.
 *
 * 표가 없으면 `npm run db:migrate`를 아직 돌리지 않은 것이다. 이 상태로 설치를 진행하면
 * 관리자 계정을 만드는 첫 단계에서 죽는다.
 */
function checkDatabases(): EnvironmentCheck {
  try {
    appDb().$client.prepare("select 1 from user limit 1").get();
    corpusDb().$client.prepare("select 1 from judgment limit 1").get();
    return {
      id: "database",
      level: "ok",
      label: "데이터베이스",
      value: "연결됨",
      note: "두 데이터베이스가 열리고 표도 준비돼 있어요.",
    };
  } catch {
    return {
      id: "database",
      level: "fail",
      label: "데이터베이스",
      value: "표가 없어요",
      note: "터미널에서 npm run db:migrate 를 한 번 돌린 뒤 이 화면을 새로 고쳐 주세요.",
    };
  }
}

/**
 * 두 데이터베이스가 다른 파일인지.
 *
 * 같은 파일이면 사용자가 올린 판결문과 공개 판례가 한곳에 쌓인다. 파일을 나누는 것이
 * 이 서비스의 개인정보 격리 방식이라(`PRODUCT.md` §6.1) 여기서도 다시 확인한다.
 */
function checkDatabaseSeparation(): EnvironmentCheck {
  const config = env();
  const same = resolve(config.APP_DB_PATH) === resolve(config.CORPUS_DB_PATH);

  return {
    id: "database_separation",
    level: same ? "fail" : "ok",
    label: "데이터베이스 분리",
    value: same ? "같은 파일" : "서로 다른 파일",
    note: same
      ? "올리신 판결문과 공개 판례가 한 파일에 섞여요. .env에서 두 경로를 다르게 지정해 주세요."
      : "올리신 판결문은 공개 판례와 다른 파일에 저장돼요.",
  };
}

/** 디스크 여유. 부족해도 지금 당장 막히지는 않으므로 알리기만 한다. */
function checkDisk(): EnvironmentCheck {
  const directory = dirname(resolve(process.cwd(), env().APP_DB_PATH));

  try {
    const stats = statfsSync(directory);
    const free = Number(stats.bavail) * Number(stats.bsize);
    const enough = free >= LOW_DISK_BYTES;

    return {
      id: "disk",
      level: enough ? "ok" : "warn",
      label: "디스크 여유 공간",
      value: gib(free),
      note: enough
        ? "판결문 원문과 설명을 저장하기에 넉넉해요."
        : `${gib(LOW_DISK_BYTES)}보다 적어요. 지금 설치는 되지만 문서가 쌓이면 모자랄 수 있어요.`,
    };
  } catch {
    return {
      id: "disk",
      level: "warn",
      label: "디스크 여유 공간",
      value: "확인 못 함",
      note: "이 환경에서는 여유 공간을 읽을 수 없어요. 설치에는 지장이 없지만 직접 확인해 주세요.",
    };
  }
}

/** 메모리. 역시 알리기만 한다. */
function checkMemory(): EnvironmentCheck {
  const total = totalmem();
  const enough = total >= LOW_MEMORY_BYTES;

  return {
    id: "memory",
    level: enough ? "ok" : "warn",
    label: "메모리",
    value: gib(total),
    note: enough
      ? "서버를 돌리기에 충분해요."
      : `${gib(LOW_MEMORY_BYTES)}보다 적어요. 문서가 길면 변환 중에 느려질 수 있어요.`,
  };
}

/**
 * 실행 환경.
 *
 * 개발 모드로 공개 서비스를 돌리면 느리고, 오류 화면에 내부 정보가 그대로 나온다.
 */
function checkRuntimeMode(): EnvironmentCheck {
  const production = env().NODE_ENV === "production";

  return {
    id: "runtime",
    level: production ? "ok" : "warn",
    label: "실행 모드",
    value: env().NODE_ENV,
    note: production
      ? "운영 모드로 돌고 있어요."
      : "개발 모드예요. 직접 쓰시는 데는 문제없지만, 다른 사람에게 열어 주실 거라면 npm run build 후 npm start 로 띄워 주세요.",
  };
}

function checkEnvironment(): EnvironmentCheck[] {
  return [
    checkNode(),
    checkDataDirectory(),
    checkDatabases(),
    checkDatabaseSeparation(),
    checkDisk(),
    checkMemory(),
    checkRuntimeMode(),
  ];
}

/** 하나라도 막히는 것이 있으면 다음 단계로 보내지 않는다. */
function hasBlockingIssue(checks: readonly EnvironmentCheck[]): boolean {
  return checks.some((check) => check.level === "fail");
}

export { checkEnvironment, hasBlockingIssue, MIN_NODE_MAJOR, MIN_NODE_MINOR };
export type { CheckLevel, EnvironmentCheck };
