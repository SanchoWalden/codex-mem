#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const scriptPath = path.join(__dirname, "memory_store.py");
const result = spawnSync("python", [scriptPath, "recall", ...process.argv.slice(2)], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
