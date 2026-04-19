import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Force a single canonical import path for context modules. Multiple
      // import paths (relative vs alias, with/without extension) cause Vite to
      // load the same context twice, breaking provider/consumer matching.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/contexts/AuthContext",
                "**/contexts/AuthContext.tsx",
                "**/contexts/PageHeaderContext",
                "**/contexts/PageHeaderContext.tsx",
              ],
              message:
                "Import context modules only via the '@/contexts/*' alias (no relative paths, no .tsx extension). This prevents HMR from loading duplicate context instances.",
            },
          ],
          paths: [
            {
              name: "@/contexts/AuthContext.tsx",
              message: "Drop the .tsx extension — import as '@/contexts/AuthContext'.",
            },
            {
              name: "@/contexts/PageHeaderContext.tsx",
              message: "Drop the .tsx extension — import as '@/contexts/PageHeaderContext'.",
            },
          ],
        },
      ],
    },
  },
  {
    // The context modules themselves are allowed to be the canonical source.
    files: ["src/contexts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
