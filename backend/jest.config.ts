import type { Config } from "jest"

const config: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          target: "es2022",
          parser: { syntax: "typescript", tsx: true, decorators: true },
          transform: { decoratorMetadata: true, legacyDecorator: true },
        },
      },
    ],
  },
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts", "<rootDir>/src/**/__tests__/**/*.test.tsx"],
  moduleNameMapper: {
    // Only strip `.js` from relative imports (TS-with-ESM convention).
    // Leaves package imports like `bignumber.js` alone.
    "^(\\.{1,2}\\/.*)\\.js$": "$1",
  },
  moduleDirectories: ["node_modules", "src"],
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/__tests__/**",
    "!src/**/index.ts",
  ],
}

export default config
