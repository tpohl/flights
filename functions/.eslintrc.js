module.exports = {
    root: true,
    env: {
        es6: true,
        node: true,
    },
    extends: [
        "eslint:recommended",
        "google",
        "plugin:@typescript-eslint/recommended",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: ["tsconfig.json"],
        sourceType: "module",
    },
    ignorePatterns: [
        "/lib/**/*", // Ignore built files.
    ],
    plugins: [
        "@typescript-eslint",
    ],
    rules: {
        "quotes": ["error", "double"],
        "indent": ["error", 2],
        "object-curly-spacing": ["error", "always"],
        "max-len": ["error", { "code": 140 }],
        "require-jsdoc": 0,
        "valid-jsdoc": 0,
        "@typescript-eslint/no-explicit-any": 0,
        "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
        "new-cap": 0,
    },
};
