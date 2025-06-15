module.exports = {
  testEnvironment: "jsdom",
  moduleFileExtensions: ["js"],
  testMatch: ["**/__tests__/**/*.js", "**/?(*.)+(spec|test).js"],
  transform: {
    "^.+\\.js$": [
      "babel-jest",
      {
        presets: [["@babel/preset-env", { modules: "commonjs" }]],
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/cc/src/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  collectCoverageFrom: [
    "cc/src/**/*.js",
    "!cc/src/background.js",
    "!cc/src/popup.js",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
};
