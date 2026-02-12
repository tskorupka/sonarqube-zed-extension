#!/usr/bin/env node
"use strict";

/**
 * SonarLint LSP Wrapper for Zed
 * Copyright (C) 2025 Tomasz Skorupka
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * ---
 *
 * SonarLint Language Server uses non-standard LSP extensions (custom requests)
 * that Zed cannot handle. This wrapper sits between Zed and sonarlint-ls,
 * intercepting these custom requests and providing appropriate responses
 * so that the server can proceed with analysis.
 *
 * Architecture:
 *   Zed <--stdin/stdout--> wrapper <--stdin/stdout--> sonarlint-ls (java)
 *
 * Custom requests handled:
 *   - sonarlint/isOpenInEditor        → true (file is open)
 *   - sonarlint/isIgnoredByScm        → false (not ignored)
 *   - sonarlint/listFilesInFolder     → list of files in folder
 *   - sonarlint/filterOutExcludedFiles → pass through (no filtering)
 *   - sonarlint/getJavaConfig          → null (no special java config)
 *   - sonarlint/canShowMissingRequirementsNotification → "silently" (don't show)
 *   - sonarlint/hasJoinedIdeLabs       → false (not in experimental program)
 *   - workspace/configuration          → return stored config
 *
 * Custom notifications handled:
 *   - sonarlint/showRuleDescription → display rule details to user
 *
 * Custom notifications silently ignored:
 *   - sonarlint/submitNewCodeDefinition
 *   - sonarlint/embeddedServerStarted
 *   - sonarlint/settingsApplied
 *   - sonarlint/suggestBinding
 *   - sonarlint/suggestConnection
 *   - sonarlint/showSonarLintOutput
 *   - sonarlint/openJavaHomeSettings
 *   - sonarlint/readyForTests
 *   - sonarlint/needCompilationDatabase
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// ─── Resolve extension work directory ─────────────────────────────────────────
// Zed extensions store downloaded files in a "work" directory. The WASM sandbox
// uses relative paths, but Node.js runs outside the sandbox with a different CWD.
// We need to find the actual work directory on disk to resolve JAR paths.

function findExtensionWorkDir() {
  const os = require("os");
  const homedir = os.homedir();

  // Zed extension work directories by platform
  const candidates = [];

  if (process.platform === "darwin") {
    candidates.push(
      path.join(
        homedir,
        "Library",
        "Application Support",
        "Zed",
        "extensions",
        "work",
        "sonarlint",
      ),
    );
  } else if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(homedir, "AppData", "Local");
    candidates.push(
      path.join(localAppData, "Zed", "extensions", "work", "sonarlint"),
    );
  } else {
    // Linux
    const xdgData =
      process.env.XDG_DATA_HOME || path.join(homedir, ".local", "share");
    candidates.push(
      path.join(xdgData, "zed", "extensions", "work", "sonarlint"),
    );
  }

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

/**
 * Resolve a potentially relative path to an absolute one.
 * If the path is already absolute and exists, return it.
 * If relative, try resolving against the extension work directory.
 */
function resolveExtPath(relPath) {
  if (!relPath) return relPath;

  // Already absolute and exists?
  if (path.isAbsolute(relPath) && fs.existsSync(relPath)) {
    return relPath;
  }

  // Try CWD first
  const fromCwd = path.resolve(relPath);
  if (fs.existsSync(fromCwd)) {
    return fromCwd;
  }

  // Try extension work directory
  const workDir = findExtensionWorkDir();
  if (workDir) {
    const fromWork = path.join(workDir, relPath);
    if (fs.existsSync(fromWork)) {
      return fromWork;
    }
  }

  // Return as-is, will fail later with a clear error
  return relPath;
}

// ─── Configuration from environment / args ───────────────────────────────────

const JAVA_PATH = process.env.SONARLINT_JAVA_PATH || "java";
const RAW_SERVER_JAR =
  process.env.SONARLINT_SERVER_JAR || process.env.SONARLINT_SERVER_PATH;
const RAW_ANALYZERS = (
  process.env.SONARLINT_ANALYZERS ||
  process.env.SONARLINT_ANALYZER_PATHS ||
  ""
)
  .split("|")
  .filter(Boolean);
const JAVA_HOME = process.env.JAVA_HOME || "";
const DEBUG = process.env.SONARLINT_DEBUG === "1";

if (!RAW_SERVER_JAR) {
  process.stderr.write(
    "[sonarlint-wrapper] ERROR: SONARLINT_SERVER_JAR not set\n",
  );
  process.exit(1);
}

// Resolve relative paths to absolute
const SERVER_JAR = resolveExtPath(RAW_SERVER_JAR);
const ANALYZERS = RAW_ANALYZERS.map(resolveExtPath);

// ─── Logging to file ─────────────────────────────────────────────────────────

const workDir = findExtensionWorkDir();
const LOG_PATH = workDir
  ? path.join(workDir, "sonarlint-wrapper.log")
  : path.join(__dirname, "sonarlint-wrapper.log"); // fallback to wrapper directory
const logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });

function log(...args) {
  if (!DEBUG) return;
  const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  logStream.write(line);
}

log("=== Wrapper started ===");
log("CWD:", process.cwd());
log("SERVER_JAR:", SERVER_JAR);
log("exists:", fs.existsSync(SERVER_JAR));
log("JAVA_PATH:", JAVA_PATH);
log("ANALYZERS:", ANALYZERS.length, "JARs");
log("argv:", JSON.stringify(process.argv));

// ─── LSP Message Parser ─────────────────────────────────────────────────────

/**
 * Parses LSP messages from a stream (Content-Length header + JSON body).
 * Emits parsed JSON objects via callback.
 */
class LspMessageReader {
  constructor(stream, onMessage) {
    this.buffer = Buffer.alloc(0);
    this.contentLength = -1;
    this.onMessage = onMessage;

    stream.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this._parse();
    });
  }

  _parse() {
    while (true) {
      if (this.contentLength === -1) {
        // Look for the end of headers
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;

        const header = this.buffer.slice(0, headerEnd).toString("ascii");
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          // Skip malformed header
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      if (this.buffer.length < this.contentLength) return;

      const body = this.buffer.slice(0, this.contentLength).toString("utf-8");
      this.buffer = this.buffer.slice(this.contentLength);
      this.contentLength = -1;

      try {
        const msg = JSON.parse(body);
        this.onMessage(msg);
      } catch (e) {
        log("Failed to parse JSON:", e.message);
      }
    }
  }
}

/**
 * Encodes a JSON object as an LSP message with Content-Length header.
 */
function encodeLspMessage(msg) {
  const body = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n`;
  return Buffer.concat([
    Buffer.from(header, "ascii"),
    Buffer.from(body, "utf-8"),
  ]);
}

// ─── File listing utility ────────────────────────────────────────────────────

/**
 * Recursively list files in a directory (non-blocking, best-effort).
 * Returns an array of { fileName, filePath } objects.
 * Skips node_modules, .git, and other common non-project dirs.
 */
function listFilesInFolder(folderUri) {
  const folderPath = folderUri.startsWith("file://")
    ? decodeURIComponent(folderUri.replace("file://", ""))
    : folderUri;

  const results = [];
  const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "__pycache__",
    ".tox",
    ".venv",
    "venv",
    "target",
    ".idea",
    ".vscode",
  ]);

  const MAX_FILES = 10000;

  function walk(dir, depth) {
    if (depth > 10 || results.length >= MAX_FILES) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_FILES) break;

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          walk(path.join(dir, entry.name), depth + 1);
        }
      } else if (entry.isFile()) {
        const absPath = path.join(dir, entry.name);
        results.push({
          fileName: entry.name,
          filePath: absPath,
        });
      }
    }
  }

  walk(folderPath, 0);
  return results;
}

// ─── Spawn SonarLint Language Server ─────────────────────────────────────────

const javaArgs = ["-Xmx512m", "-Xms128m", "-jar", SERVER_JAR, "-stdio"];

if (ANALYZERS.length > 0) {
  javaArgs.push("-analyzers");
  javaArgs.push(...ANALYZERS);
}

const javaEnv = { ...process.env };
if (JAVA_HOME) {
  javaEnv.JAVA_HOME = JAVA_HOME;
}

log("Starting:", JAVA_PATH, javaArgs.join(" "));

const serverProcess = spawn(JAVA_PATH, javaArgs, {
  stdio: ["pipe", "pipe", "pipe"],
  env: javaEnv,
});

serverProcess.on("error", (err) => {
  log("FATAL: Failed to start sonarlint-ls:", err.message);
  process.exit(1);
});

serverProcess.on("exit", (code, signal) => {
  log("sonarlint-ls exited: code=" + code, "signal=" + signal);
  process.exit(code || 0);
});

serverProcess.stdout.on("end", () => {
  log("sonarlint-ls stdout ended");
});

// Forward server stderr to log
serverProcess.stderr.on("data", (chunk) => {
  log("[sonarlint-ls stderr]", chunk.toString().trim());
});

// ─── State ───────────────────────────────────────────────────────────────────

let storedConfig = null; // Configuration from didChangeConfiguration
let workspaceFolders = []; // From initialize request

// ─── Handle messages from Zed (client → server) ─────────────────────────────

new LspMessageReader(process.stdin, (msg) => {
  log("ZED→SERVER:", msg.method || msg.id || "response");

  if (msg.method === "initialize" && msg.params) {
    if (msg.params.workspaceFolders) {
      workspaceFolders = msg.params.workspaceFolders;
    } else if (msg.params.rootUri) {
      workspaceFolders = [{ uri: msg.params.rootUri, name: "root" }];
    }
    log("Workspace folders:", JSON.stringify(workspaceFolders));
  }

  if (msg.method === "workspace/didChangeConfiguration" && msg.params) {
    storedConfig = msg.params.settings || msg.params;
    log("Stored configuration");
  }

  serverProcess.stdin.write(encodeLspMessage(msg));
});

// ─── Handle messages from SonarLint LS (server → client) ────────────────────

new LspMessageReader(serverProcess.stdout, (msg) => {
  if (msg.id !== undefined && msg.method) {
    log("SERVER→ZED REQUEST:", msg.method, "id=" + msg.id);
    const handled = handleServerRequest(msg);
    if (handled) {
      log("✓ Handled:", msg.method);
      return;
    }
  }

  if (msg.method && !msg.id) {
    if (handleServerNotification(msg)) {
      log("✓ Handled notification:", msg.method);
      return;
    }
    if (isIgnoredNotification(msg.method)) {
      log("Dropping notification:", msg.method);
      return;
    }
  }

  if (msg.method) {
    if (msg.method === "window/logMessage" && msg.params) {
      log("SERVER LOG:", msg.params.message);
    } else {
      log("SERVER→ZED PASS:", msg.method);
    }
  } else if (msg.id !== undefined) {
    log("SERVER→ZED RESPONSE: id=" + msg.id);
  }

  process.stdout.write(encodeLspMessage(msg));
});

// ─── Custom request handlers ─────────────────────────────────────────────────

/**
 * Handles a custom request from sonarlint-ls.
 * Returns true if handled, false if should be forwarded.
 */
function handleServerRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "sonarlint/isOpenInEditor": {
      // SonarLint asks if a file URI is open. Always say yes.
      log("→ isOpenInEditor:", JSON.stringify(params));
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: true,
      });
      return true;
    }

    case "sonarlint/isIgnoredByScm": {
      // Is the file ignored by version control? Always say no.
      log("→ isIgnoredByScm:", JSON.stringify(params));
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: false,
      });
      return true;
    }

    case "sonarlint/listFilesInFolder": {
      // List all project files in the folder
      const folderUri = params?.folderUri || params;
      log("→ listFilesInFolder:", folderUri);
      log("→ listFilesInFolder raw params:", JSON.stringify(params));

      try {
        const files = listFilesInFolder(
          typeof folderUri === "string"
            ? folderUri
            : folderUri?.toString() || "",
        );
        log("→ listFilesInFolder found", files.length, "files");

        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            foundFiles: files,
          },
        };
        log(
          "→ listFilesInFolder response id:",
          id,
          "foundFiles:",
          files.length,
        );
        log("→ listFilesInFolder full response:", JSON.stringify(response));
        sendToServer(response);
      } catch (e) {
        log("→ listFilesInFolder ERROR:", e.message);
        sendToServer({
          jsonrpc: "2.0",
          id,
          result: {
            foundFiles: [],
          },
        });
      }
      return true;
    }

    case "sonarlint/filterOutExcludedFiles": {
      // Return files as-is (don't filter any)
      log("→ filterOutExcludedFiles");
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: params,
      });
      return true;
    }

    case "sonarlint/getJavaConfig": {
      // No special Java project configuration
      log("→ getJavaConfig");
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: null,
      });
      return true;
    }

    case "sonarlint/canShowMissingRequirementsNotification": {
      // Don't show requirement notifications
      log("→ canShowMissingRequirementsNotification");
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: "silently",
      });
      return true;
    }

    case "sonarlint/assistCreatingConnection": {
      // Decline connection creation
      log("→ assistCreatingConnection");
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: null,
      });
      return true;
    }

    case "sonarlint/askSslCertificateConfirmation": {
      // Reject SSL certificate confirmation
      log("→ askSslCertificateConfirmation");
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: false,
      });
      return true;
    }

    case "workspace/configuration": {
      // Return stored configuration or defaults
      log("→ workspace/configuration:", JSON.stringify(params));

      const items = params?.items || [];
      const results = items.map((item) => {
        const section = item.section || "";

        // Check stored config first
        if (storedConfig && storedConfig[section] !== undefined) {
          return storedConfig[section];
        }

        // Return appropriate defaults for each known section
        switch (section) {
          case "sonarlint":
            return {
              rules: {},
              disableTelemetry: true,
              output: { showVerboseLogs: false },
              pathToNodeExecutable: "",
              connectedMode: {
                connections: {
                  sonarqube: [],
                  sonarcloud: [],
                },
              },
            };
          case "files.exclude":
            // VSCode format: pattern → boolean
            return {
              "**/.git": true,
              "**/.svn": true,
              "**/.hg": true,
              "**/CVS": true,
              "**/.DS_Store": true,
              "**/Thumbs.db": true,
              "**/node_modules": true,
            };
          case "dotnet.defaultSolution":
            return "";
          case "omnisharp.useModernNet":
            return true;
          case "omnisharp.enableMsBuildLoadProjectsOnDemand":
            return false;
          case "omnisharp.projectLoadTimeout":
            return 60;
          default:
            if (section.startsWith("sonarlint")) {
              return {};
            }
            return null;
        }
      });

      sendToServer({
        jsonrpc: "2.0",
        id,
        result: results,
      });
      return true;
    }

    case "window/showMessageRequest": {
      // Auto-dismiss message requests (pick first action or null)
      log("→ showMessageRequest:", params?.message);
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: null,
      });
      return true;
    }

    case "sonarlint/hasJoinedIdeLabs": {
      // IDE Labs is SonarLint's experimental features program
      // Return false to indicate user hasn't joined
      log("→ hasJoinedIdeLabs");
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: false,
      });
      return true;
    }

    case "window/workDoneProgress/create": {
      // Standard LSP request to create a progress token
      // Return success even if Zed doesn't fully support it
      log("→ workDoneProgress/create:", JSON.stringify(params));
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: null,
      });
      return true;
    }

    case "sonarlint/checkConnection": {
      // Return failure for connection checks (we're in standalone mode)
      log("→ checkConnection");
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: {
          success: false,
          reason: "Standalone mode - no connections configured",
        },
      });
      return true;
    }

    case "sonarlint/getCredentials":
    case "sonarlint/validateConnection": {
      // Decline credential/validation requests
      log("→", method);
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: null,
      });
      return true;
    }

    default:
      // Unknown request — handle it ourselves instead of forwarding to Zed
      // because Zed will return an error for any custom request it doesn't understand
      log(`→ Unknown server request '${method}' (id=${id}), returning null`);
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: null,
      });
      return true;
  }
}

/**
 * Handles server notifications that need special processing.
 * Returns true if handled, false to pass through or ignore.
 */
function handleServerNotification(msg) {
  const { method, params } = msg;

  switch (method) {
    case "sonarlint/showRuleDescription": {
      // Transform SonarLint rule description into a user-friendly message
      log("→ showRuleDescription:", JSON.stringify(params));

      const ruleKey = params?.ruleKey || params?.key || "unknown";
      const name = params?.name || ruleKey;
      const htmlDescription =
        params?.htmlDescription || params?.description || "";
      const severity = params?.severity || params?.type || "";
      const languageKey = params?.languageKey || "";

      // Strip HTML tags for plain text preview
      const plainDescription = htmlDescription
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const maxLength = 500;
      const truncatedDesc =
        plainDescription.length > maxLength
          ? plainDescription.substring(0, maxLength) + "..."
          : plainDescription;

      // Build a formatted message
      let message = `SonarLint Rule: ${name}\n`;
      message += `Key: ${ruleKey}\n`;
      if (severity) message += `Severity: ${severity}\n`;
      if (languageKey) message += `Language: ${languageKey}\n`;
      message += `\n${truncatedDesc}`;

      // Send as a window/showMessage to display in Zed
      sendToClient({
        jsonrpc: "2.0",
        method: "window/showMessage",
        params: {
          type: 3, // Info
          message: message,
        },
      });

      return true;
    }

    default:
      return false;
  }
}

/**
 * Notifications from sonarlint-ls that we can safely ignore.
 */
function isIgnoredNotification(method) {
  const IGNORED = new Set([
    "sonarlint/submitNewCodeDefinition",
    "sonarlint/embeddedServerStarted",
    "sonarlint/settingsApplied",
    "sonarlint/suggestBinding",
    "sonarlint/suggestConnection",
    "sonarlint/showSonarLintOutput",
    "sonarlint/openJavaHomeSettings",
    "sonarlint/readyForTests",
    "sonarlint/needCompilationDatabase",
    "sonarlint/showHotspot",
    "sonarlint/showIssueOrHotspot",
    "sonarlint/showSoonUnsupportedVersionMessage",
    "sonarlint/reportConnectionCheckResult",
  ]);
  return IGNORED.has(method);
}

// ─── Send messages ───────────────────────────────────────────────────────────

function sendToServer(msg) {
  serverProcess.stdin.write(encodeLspMessage(msg));
}

function sendToClient(msg) {
  process.stdout.write(encodeLspMessage(msg));
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

process.stdin.on("end", () => {
  log("stdin ended, shutting down");
  serverProcess.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  serverProcess.kill();
  process.exit(0);
});

process.on("SIGINT", () => {
  serverProcess.kill();
  process.exit(0);
});
