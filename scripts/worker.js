#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const serverInfo = {
  name: "codex-mem",
  version: "0.1.0",
};

const scriptPath = path.join(__dirname, "memory_store.py");
let buffer = Buffer.alloc(0);
let sawFirstChunk = false;
let loggedInitialBufferState = false;
let transportMode = null;
let pythonRunner = null;

function log(message) {
  process.stderr.write(`[codex-mem] ${message}\n`);
}

function previewBuffer(bufferValue, maxBytes = 160) {
  const slice = bufferValue.slice(0, maxBytes);
  return {
    utf8: slice.toString("utf8").replace(/\r/g, "\\r").replace(/\n/g, "\\n"),
    hex: slice.toString("hex"),
  };
}

function sendMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (transportMode === "bare_json") {
    process.stdout.write(Buffer.concat([body, Buffer.from("\n", "utf8")]));
    return;
  }
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  process.stdout.write(Buffer.concat([header, body]));
}

function sendError(id, code, message) {
  sendMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function detectPythonRunner() {
  const configured = process.env.CODEX_MEM_PYTHON?.trim();
  if (configured) {
    return { command: configured, preArgs: [] };
  }

  const candidates = [
    { command: "python", args: ["--version"], preArgs: [] },
    { command: "py", args: ["-3", "--version"], preArgs: ["-3"] },
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, { encoding: "utf8" });
    if (result.status === 0) {
      return { command: candidate.command, preArgs: candidate.preArgs };
    }
  }

  throw new Error("Python was not found. Install Python 3 or set CODEX_MEM_PYTHON.");
}

function getPythonRunner() {
  if (!pythonRunner) {
    pythonRunner = detectPythonRunner();
    log(`using python runner=${pythonRunner.command}${pythonRunner.preArgs.length ? ` ${pythonRunner.preArgs.join(" ")}` : ""}`);
  }
  return pythonRunner;
}

function runMemoryStore(command, args) {
  const runner = getPythonRunner();
  const result = spawnSync(runner.command, [...runner.preArgs, scriptPath, command, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim() || `memory_store.py exited with ${result.status}`;
    throw new Error(stderr);
  }
  return JSON.parse(result.stdout);
}

function toolSchema() {
  return [
    {
      name: "remember",
      description: "Persist a durable memory card for future Codex sessions.",
      inputSchema: {
        type: "object",
        required: ["title", "summary", "scope"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          scope: { type: "string", enum: ["global", "project", "repo", "task"] },
          cwd: { type: "string" },
          repo_root: { type: "string" },
          facts: { type: "array", items: { type: "string" } },
          decisions: { type: "array", items: { type: "string" } },
          constraints: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
          file_refs: { type: "array", items: { type: "string" } },
          source_session: { type: "string" },
        },
      },
    },
    {
      name: "recall",
      description: "Search durable memories relevant to the current query and repository.",
      inputSchema: {
        type: "object",
        required: ["query", "cwd"],
        properties: {
          query: { type: "string" },
          cwd: { type: "string" },
          repo_root: { type: "string" },
          scope: { type: "string", enum: ["global", "project", "repo", "task"] },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
      },
    },
    {
      name: "compact_session",
      description: "Compact a completed Codex session into durable memory.",
      inputSchema: {
        type: "object",
        required: ["session_id", "cwd"],
        properties: {
          session_id: { type: "string" },
          cwd: { type: "string" },
          repo_root: { type: "string" },
          mode: { type: "string", enum: ["manual", "end_of_session"] },
        },
      },
    },
  ];
}

function toRememberArgs(input) {
  const args = [
    "--title", input.title,
    "--summary", input.summary,
    "--scope", input.scope,
  ];
  if (input.cwd) args.push("--cwd", input.cwd);
  if (input.repo_root) args.push("--repo-root", input.repo_root);
  if (input.source_session) args.push("--source-session", input.source_session);
  for (const item of input.facts || []) args.push("--fact", item);
  for (const item of input.decisions || []) args.push("--decision", item);
  for (const item of input.constraints || []) args.push("--constraint", item);
  for (const item of input.tags || []) args.push("--tag", item);
  for (const item of input.file_refs || []) args.push("--file-ref", item);
  return args;
}

function toRecallArgs(input) {
  const args = ["--query", input.query, "--cwd", input.cwd];
  if (input.repo_root) args.push("--repo-root", input.repo_root);
  if (input.scope) args.push("--scope", input.scope);
  if (input.limit) args.push("--limit", String(input.limit));
  return args;
}

function toCompactArgs(input) {
  const args = ["--session-id", input.session_id, "--cwd", input.cwd];
  if (input.repo_root) args.push("--repo-root", input.repo_root);
  if (input.mode) args.push("--mode", input.mode);
  return args;
}

function handleRequest(message) {
  const { id, method, params } = message;
  log(`received method=${method}`);

  if (method === "initialize") {
    sendMessage({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo,
      },
    });
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (method === "ping") {
    sendMessage({
      jsonrpc: "2.0",
      id,
      result: {},
    });
    return;
  }

  if (method === "resources/list") {
    sendMessage({
      jsonrpc: "2.0",
      id,
      result: {
        resources: [],
      },
    });
    return;
  }

  if (method === "resourceTemplates/list" || method === "resources/templates/list") {
    sendMessage({
      jsonrpc: "2.0",
      id,
      result: {
        resourceTemplates: [],
      },
    });
    return;
  }

  if (method === "prompts/list") {
    sendMessage({
      jsonrpc: "2.0",
      id,
      result: {
        prompts: [],
      },
    });
    return;
  }

  if (method === "logging/setLevel") {
    sendMessage({
      jsonrpc: "2.0",
      id,
      result: {},
    });
    return;
  }

  if (method === "tools/list") {
    sendMessage({
      jsonrpc: "2.0",
      id,
      result: {
        tools: toolSchema(),
      },
    });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const input = params?.arguments || {};
    try {
      let result;
      if (name === "remember") {
        result = runMemoryStore("remember", toRememberArgs(input));
      } else if (name === "recall") {
        result = runMemoryStore("recall", toRecallArgs(input));
      } else if (name === "compact_session") {
        result = runMemoryStore("compact-session", toCompactArgs(input));
      } else {
        sendError(id, -32602, `Unknown tool: ${name}`);
        return;
      }
      sendMessage({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
        },
      });
    } catch (error) {
      sendError(id, -32603, error instanceof Error ? error.message : String(error));
    }
    return;
  }

  sendError(id, -32601, `Method not found: ${method}`);
}

function locateMessage(bufferValue) {
  const crlfMarker = bufferValue.indexOf("\r\n\r\n");
  const lfMarker = bufferValue.indexOf("\n\n");

  if (crlfMarker !== -1 && (lfMarker === -1 || crlfMarker <= lfMarker)) {
    return { marker: crlfMarker, separatorLength: 4 };
  }
  if (lfMarker !== -1) {
    return { marker: lfMarker, separatorLength: 2 };
  }
  return null;
}

function tryParseBareJson(bufferValue) {
  const text = bufferValue.toString("utf8").trim();
  if (!text) return { status: "empty" };
  if (!text.startsWith("{") && !text.startsWith("[")) {
    return { status: "not_json" };
  }
  try {
    return {
      status: "parsed",
      value: JSON.parse(text),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Unexpected end|unterminated|Unterminated/i.test(message)) {
      return { status: "partial" };
    }
    return { status: "invalid", error: message };
  }
}

function parseMessages() {
  while (true) {
    const located = locateMessage(buffer);
    if (!located) {
      const bare = tryParseBareJson(buffer);
      if (bare.status === "parsed") {
        if (!transportMode) {
          transportMode = "bare_json";
          log("detected transport=bare_json");
        }
        log("parsed bare JSON message without Content-Length framing");
        buffer = Buffer.alloc(0);
        handleRequest(bare.value);
        continue;
      }
      if (!loggedInitialBufferState && buffer.length > 0) {
        loggedInitialBufferState = true;
        const preview = previewBuffer(buffer);
        log(
          `unable to locate framed message buffer_bytes=${buffer.length} bare_status=${bare.status} ` +
          `preview_utf8=${JSON.stringify(preview.utf8)} preview_hex=${preview.hex}`,
        );
        if (bare.status === "invalid") {
          log(`bare JSON parse failed: ${bare.error}`);
        }
      }
      return;
    }
    const { marker, separatorLength } = located;
    if (!transportMode) {
      transportMode = "content_length";
      log("detected transport=content_length");
    }
    const header = buffer.slice(0, marker).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      log(`invalid header block: ${JSON.stringify(header)}`);
      buffer = Buffer.alloc(0);
      return;
    }
    const contentLength = Number(match[1]);
    const totalLength = marker + separatorLength + contentLength;
    if (buffer.length < totalLength) {
      const preview = previewBuffer(buffer);
      log(
        `partial framed message header_bytes=${marker} body_bytes=${contentLength} ` +
        `buffer_bytes=${buffer.length} preview_utf8=${JSON.stringify(preview.utf8)}`,
      );
      return;
    }
    const body = buffer.slice(marker + separatorLength, totalLength).toString("utf8");
    buffer = buffer.slice(totalLength);
    let message;
    try {
      message = JSON.parse(body);
    } catch (error) {
      log(`invalid json body: ${error instanceof Error ? error.message : String(error)}`);
      sendError(null, -32700, "Invalid JSON");
      continue;
    }
    handleRequest(message);
  }
}

process.stdin.on("data", (chunk) => {
  if (!sawFirstChunk) {
    sawFirstChunk = true;
    log(`stdin connected, first chunk bytes=${chunk.length}`);
  }
  buffer = Buffer.concat([buffer, chunk]);
  parseMessages();
});

process.stdin.on("end", () => {
  log("stdin ended");
  process.exit(0);
});

log(`starting server script=${scriptPath}`);
