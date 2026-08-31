import coreWebVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

// eslint-config-next ships native flat config since Next 16, so the old
// FlatCompat bridge (@eslint/eslintrc) is gone.
const eslintConfig = [
  {
    ignores: [".next/**", ".next-check/**", "src/data/**"],
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
      // Next 16 turned these React-Compiler-era rules on as errors. This app's
      // hits are deliberate: setState-in-effect is the localStorage/hydration
      // sync pattern (theme, username, count-up), and the ref reads feed
      // imperative Leaflet/PhotoSphere containers that render nothing. Kept
      // visible as warnings; revisit if the React Compiler is ever adopted.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default eslintConfig;
