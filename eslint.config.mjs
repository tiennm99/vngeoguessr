import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import globals from "globals";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [".next/**", ".next-check/**", "src/data/**"],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    // next/core-web-vitals enables neither no-undef nor no-unused-vars, and
    // this is a JavaScript project with no type checker, so a deleted state
    // declaration leaves its setter calls as free identifiers that lint, build
    // and the whole test suite all pass over -- until the button is clicked.
    // That happened: six useState declarations were removed and ten call sites
    // survived, breaking Next Round and Skip while every gate stayed green.
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];

export default eslintConfig;
