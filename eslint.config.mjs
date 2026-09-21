import coreWebVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

// eslint-config-next ships native flat config since Next 16, so the old
// FlatCompat bridge (@eslint/eslintrc) is gone.
const eslintConfig = [
  {
    // Playwright's artifact dirs are gitignored but eslint walks them anyway,
    // and a lint run concurrent with a test run crashes on the files the
    // reporter is still writing (ENOENT scandir 'test-results').
    ignores: [
      ".next/**",
      ".next-check/**",
      "src/data/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  ...coreWebVitals,
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
      // Next 16 turns these React-Compiler-era rules on as errors, and the
      // code now satisfies them: browser-stored preferences are read through
      // useSyncExternalStore (lib/use-stored-value.js) rather than seeded in
      // an effect, and callback props reach imperative Leaflet/PhotoSphere
      // handlers through useEffectEvent rather than refs written in render.
      // The one ref written during render (a data snapshot in
      // debug/coverage/CoverageMap.js) carries an inline disable with its
      // reason. Kept as errors so the patterns do not creep back.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
    },
  },
];

export default eslintConfig;
