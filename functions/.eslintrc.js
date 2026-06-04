"use strict";

module.exports = {
  env: {
    es2022: true,
    node: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: 2022,
  },
  rules: {
    "max-len": ["warn", { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true }],
  },
};
