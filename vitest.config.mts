import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /*
       * `server-only`는 클라이언트 번들에 서버 모듈이 딸려 들어가면 빌드를 실패시키는
       * 장치다. 테스트에서는 그 판정을 할 번들러가 없어서 기본 진입점이 무조건 던진다.
       * 빈 모듈로 바꿔 서버 모듈을 그대로 테스트한다 — 실제 보호는 `next build`가 한다.
       */
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
});
