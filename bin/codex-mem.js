#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const PACKAGE_NAME = "@sanchowalden/codex-mem";
const SERVER_NAME = "codexMem";
const DEFAULT_TIMEOUT = 90;

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (options.help || !command) {
    printHelp();
    process.exit(0);
  }

  if (command !== "install") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }

  const codexHome = resolveCodexHome(options.codexHome);
  const installDir = options.installDir
    ? path.resolve(options.installDir)
    : path.join(codexHome, "mcp-servers", "codex-mem");
  const configPath = options.config
    ? path.resolve(options.config)
    : path.join(codexHome, "config.toml");
  const python = detectPython();

  if (!python.ok) {
    console.error("Python was not found. Install Python 3 and ensure `python` or `py -3` is available.");
    process.exit(1);
  }

  const workerPath = path.join(installDir, "scripts", "worker.js");
  const nodePath = process.execPath;
  const actions = [
    `Package: ${PACKAGE_NAME}`,
    `Codex home: ${codexHome}`,
    `Install dir: ${installDir}`,
    `Config path: ${configPath}`,
    `Node: ${nodePath}`,
    `Python: ${python.display}`,
  ];

  if (options.dryRun) {
    console.log("[dry-run] codex-mem installer");
    for (const line of actions) console.log(`- ${line}`);
    console.log("- Would copy package runtime files into the install directory");
    console.log("- Would update config.toml with the codexMem MCP server entry");
    process.exit(0);
  }

  ensureDir(path.dirname(installDir));
  replaceDir(installDir);
  copyRuntimeFiles(installDir);

  const previousConfig = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, "utf8")
    : "";
  const nextConfig = upsertCodexMemConfig(previousConfig, {
    nodePath,
    workerPath,
    installDir,
    timeout: DEFAULT_TIMEOUT,
  });

  ensureDir(path.dirname(configPath));
  if (previousConfig && previousConfig !== nextConfig) {
    fs.writeFileSync(`${configPath}.bak`, previousConfig, "utf8");
  }
  fs.writeFileSync(configPath, nextConfig, "utf8");

  console.log("codex-mem installed successfully.");
  for (const line of actions) console.log(`- ${line}`);
  console.log(`- Worker: ${workerPath}`);
  console.log("");
  console.log("Next step:");
  console.log(`- Run: codex mcp get ${SERVER_NAME}`);
}

function parseArgs(argv) {
  const options = {
    help: false,
    dryRun: false,
    codexHome: "",
    installDir: "",
    config: "",
  };

  let command = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!command && !arg.startsWith("--")) {
      command = arg;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--codex-home") {
      options.codexHome = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--install-dir") {
      options.installDir = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--config") {
      options.config = argv[i + 1] || "";
      i += 1;
      continue;
    }
  }

  return { command, options };
}

function printHelp() {
  console.log(`${PACKAGE_NAME}`);
  console.log("");
  console.log("Usage:");
  console.log("  codex-mem install [--dry-run] [--codex-home PATH] [--install-dir PATH] [--config PATH]");
  console.log("");
  console.log("Examples:");
  console.log("  npx @sanchowalden/codex-mem install");
  console.log("  npx @sanchowalden/codex-mem install --dry-run");
}

function resolveCodexHome(explicitPath) {
  if (explicitPath) return path.resolve(explicitPath);
  if (process.env.CODEX_HOME) return path.resolve(process.env.CODEX_HOME);
  if (process.platform === "win32" && process.env.USERPROFILE) {
    return path.join(process.env.USERPROFILE, ".codex");
  }
  return path.join(os.homedir(), ".codex");
}

function detectPython() {
  const candidates = [
    { command: "python", args: ["--version"], display: "python" },
    { command: "py", args: ["-3", "--version"], display: "py -3" },
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, { encoding: "utf8" });
    if (result.status === 0) return { ok: true, display: candidate.display };
  }
  return { ok: false, display: "" };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function replaceDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyRuntimeFiles(installDir) {
  const entries = [
    ".codex-plugin",
    "scripts",
    "skills",
    ".mcp.json",
    "schema.sql",
    "README.md",
    "LICENSE",
  ];

  for (const entry of entries) {
    const src = path.join(PACKAGE_ROOT, entry);
    const dest = path.join(installDir, entry);
    copyPath(src, dest);
  }
}

function copyPath(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyPath(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function upsertCodexMemConfig(existingText, details) {
  const normalized = existingText.replace(/\r\n/g, "\n");
  const filtered = removeSections(normalized, [
    "mcp_servers.codexMem",
    "mcp_servers.codexMem.tools.remember",
    "mcp_servers.codexMem.tools.recall",
    "mcp_servers.codexMem.tools.compact_session",
  ]);

  const block = [
    "[mcp_servers.codexMem]",
    `command = ${tomlString(details.nodePath)}`,
    `args = [${tomlString(details.workerPath)}]`,
    `cwd = ${tomlString(details.installDir)}`,
    `startup_timeout_sec = ${details.timeout}`,
    "",
    "[mcp_servers.codexMem.tools.remember]",
    'approval_mode = "approve"',
    "",
    "[mcp_servers.codexMem.tools.recall]",
    'approval_mode = "approve"',
    "",
    "[mcp_servers.codexMem.tools.compact_session]",
    'approval_mode = "approve"',
    "",
  ].join("\n");

  const base = filtered.trimEnd();
  if (!base) return `${block}`;
  return `${base}\n\n${block}`;
}

function removeSections(text, sectionNames) {
  const lines = text.split("\n");
  const kept = [];
  let currentHeader = "";
  let buffer = [];

  function flush() {
    if (buffer.length === 0) return;
    if (!sectionNames.includes(currentHeader)) {
      kept.push(...buffer);
    }
    buffer = [];
  }

  for (const line of lines) {
    const match = line.match(/^\[([^\]]+)\]\s*$/);
    if (match) {
      flush();
      currentHeader = match[1];
      buffer.push(line);
    } else if (buffer.length > 0) {
      buffer.push(line);
    } else {
      kept.push(line);
    }
  }
  flush();

  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

function tomlString(value) {
  return JSON.stringify(value);
}

main();
