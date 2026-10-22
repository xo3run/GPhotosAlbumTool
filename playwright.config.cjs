const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "extension.spec.cjs",
  workers: 1,
  timeout: 30000,
  expect: { timeout: 7000 },
  reporter: "list",
  outputDir: "test-results",
});
