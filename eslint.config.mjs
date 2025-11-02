// 기본 ESLint 설정: Next.js + TypeScript 프로젝트에서 최소 규칙을 실행하기 위함
import js from "@eslint/js"
import nextPlugin from "@next/eslint-plugin-next"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["node_modules", ".next", "dist"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
)
