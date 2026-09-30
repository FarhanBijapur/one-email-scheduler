{
  "root": true,
  "ignorePatterns": ["dist", "node_modules", "coverage"],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "ecmaFeatures": { "jsx": true }
  },
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  "env": {
    "node": true,
    "es2022": true
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  },
  "overrides": [
    {
      "files": ["apps/web/**/*.{ts,tsx}"],
      "env": { "browser": true, "node": true }
    }
  ]
}
