import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  js.configs.recommended,
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/node_modules/**", ".next/**", "dist/**"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "import/no-unresolved": "off", // если тормозит анализ импортов
    },
    settings: {
      react: { version: "detect" },
    },
  },
];