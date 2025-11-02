import { defineConfig } from "vitest/config"

/**
 * Vitest 설정: DOMParser가 필요한 파서 테스트를 위해 jsdom 환경을 사용한다.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      enabled: false,
    },
  },
})
