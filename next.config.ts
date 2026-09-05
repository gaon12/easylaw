import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  /*
   * `braillify`는 번들에 넣지 않고 Node가 직접 `require` 하게 둔다.
   *
   * 이 패키지는 `import * as wasm from "./index_bg.wasm"`로 WebAssembly를 ESM으로 가져오는데,
   * 서버 번들에 말아 넣으면 그 인스턴스가 붙지 않아 첫 호출에서
   * `Cannot read properties of undefined (reading '__wbindgen_add_to_stack_pointer')`로 죽는다.
   * 실제로 겪었다. Node는 같은 import를 그대로 처리한다(실험 기능 경고가 하나 붙는다).
   */
  /*
   * `better-sqlite3`는 네이티브 모듈이다. 번들러가 안을 들여다보면 `bindings`의 동적
   * `require` 때문에 "Can't resolve (<dynamic> | 'null')"로 빌드가 깨진다. 실제로
   * `instrumentation.ts`를 붙이자 edge 쪽 추적에서 그렇게 됐다.
   */
  serverExternalPackages: ["braillify", "better-sqlite3"],
};

export default nextConfig;
