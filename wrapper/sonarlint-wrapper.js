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
 *   - sonarlint/getTokenForServer      → return token from connection config
 *   - sonarlint/checkConnection        → success if connections configured
 *   - workspace/configuration          → return stored config merged with defaults;
 *                                        auto-binds from .sonarlint/connectedMode.json per scope
 *
 * Custom notifications handled:
 *   - sonarlint/showRuleDescription              → display rule details to user
 *   - sonarlint/suggestBinding                   → log binding suggestions
 *   - sonarlint/suggestConnection                → log connection suggestions
 *   - sonarlint/notifyInvalidToken               → warn user about expired token
 *   - sonarlint/reportConnectionCheckResult      → log connection status
 *   - sonarlint/openConnectionSettings           → show config instructions
 *   - sonarlint/removeBindingsForDeletedConnections → log cleanup request
 *   - sonarlint/setReferenceBranchNameForFolder  → log reference branch
 *
 * Custom notifications silently ignored:
 *   - sonarlint/submitNewCodeDefinition
 *   - sonarlint/embeddedServerStarted
 *   - sonarlint/settingsApplied
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
    "out",
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
        if (
          !SKIP_DIRS.has(entry.name) &&
          (!entry.name.startsWith(".") || entry.name === ".sonarlint")
        ) {
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

const javaArgs = ["-Xmx1024m", "-Xms128m", "-jar", SERVER_JAR, "-stdio"];

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
let connectionConfigs = { sonarqube: [], sonarcloud: [] }; // Connections with tokens
let serverInitialized = false; // Whether the LS has been initialized
let sharedConfigs = {}; // folderUri → parsed .sonarlint/connectedMode.json
let bindingNotificationSent = false; // Only send addedManualBindings once

// ─── Connected Mode helpers ──────────────────────────────────────────────────

/**
 * Store connection configurations (with tokens) for serving sonarlint/getTokenForServer.
 */
function captureConnections(connections) {
  if (!connections) return;
  connectionConfigs = {
    sonarqube: (connections.sonarqube || []).map((c) => ({ ...c })),
    sonarcloud: (connections.sonarcloud || []).map((c) => ({ ...c })),
  };
  const sqCount = connectionConfigs.sonarqube.length;
  const scCount = connectionConfigs.sonarcloud.length;
  log(`Captured connections: ${sqCount} SonarQube, ${scCount} SonarCloud`);
}

/**
 * Normalize a URL for comparison: lowercase, strip trailing slashes.
 */
function normalizeUrl(url) {
  if (!url) return "";
  return url.toLowerCase().replace(/\/+$/, "");
}

/**
 * Find a token for a given server ID.
 * For SonarQube, serverId is the serverUrl or connectionId.
 * For SonarCloud, serverId is a region-prefixed organizationKey (e.g. "EU_myorg") or connectionId.
 * Tries exact match first, then normalized URL match.
 */
function findTokenForServer(serverId) {
  if (!serverId) return null;
  const normalizedId = normalizeUrl(serverId);

  // Strip region prefix (e.g. "EU_myorg" → "myorg") for SonarCloud matching.
  // The LS sends region-prefixed IDs like "EU_orgkey" but users may configure
  // connectionId or organizationKey without the region prefix.
  const strippedId = serverId.replace(/^[A-Z]{2}_/, "");

  for (const conn of connectionConfigs.sonarqube || []) {
    if (
      conn.connectionId === serverId ||
      conn.serverUrl === serverId ||
      normalizeUrl(conn.serverUrl) === normalizedId ||
      normalizeUrl(conn.connectionId) === normalizedId
    ) {
      return conn.token || null;
    }
  }
  for (const conn of connectionConfigs.sonarcloud || []) {
    const regionPrefix = conn.region ? `${conn.region}_` : "";
    const key = regionPrefix + (conn.organizationKey || "");
    if (
      key === serverId ||
      conn.organizationKey === serverId ||
      conn.connectionId === serverId ||
      conn.organizationKey === strippedId ||
      conn.connectionId === strippedId
    ) {
      return conn.token || null;
    }
  }
  return null;
}

function hasConnections() {
  return (
    (connectionConfigs.sonarqube?.length || 0) > 0 ||
    (connectionConfigs.sonarcloud?.length || 0) > 0
  );
}

/**
 * Deep merge two objects. Arrays and non-object values from source overwrite target.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Convert a file:// URI to a filesystem path.
 */
function uriToPath(uri) {
  if (uri && uri.startsWith("file://")) {
    return decodeURIComponent(uri.replace("file://", ""));
  }
  return uri;
}

/**
 * Read .sonarlint/connectedMode.json from a folder.
 * Returns the parsed JSON or null if not found.
 */
function readSharedConnectedModeConfig(folderPath) {
  const configPath = path.join(folderPath, ".sonarlint", "connectedMode.json");
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content);
    log("Read shared config from", configPath, ":", JSON.stringify(config));
    return config;
  } catch {
    return null;
  }
}

/**
 * Load .sonarlint/connectedMode.json from all workspace folders.
 */
function loadSharedConfigs() {
  for (const folder of workspaceFolders) {
    const folderPath = uriToPath(folder.uri);
    if (!folderPath) continue;
    const config = readSharedConnectedModeConfig(folderPath);
    if (config) {
      sharedConfigs[folder.uri] = config;
    }
  }
  const count = Object.keys(sharedConfigs).length;
  if (count > 0) {
    log(`Loaded ${count} shared connected mode config(s)`);
  }
}

/**
 * Match a .sonarlint/connectedMode.json config to a configured connection.
 * Returns the connectionId if a match is found, null otherwise.
 */
function matchConnectionForSharedConfig(sharedConfig) {
  if (sharedConfig.sonarQubeUri) {
    // Normalize: strip trailing slash for comparison
    const uri = sharedConfig.sonarQubeUri.replace(/\/+$/, "");
    for (const conn of connectionConfigs.sonarqube || []) {
      const connUrl = (conn.serverUrl || "").replace(/\/+$/, "");
      if (connUrl === uri) {
        return conn.connectionId || conn.serverUrl;
      }
    }
  }
  if (sharedConfig.sonarCloudOrganization) {
    for (const conn of connectionConfigs.sonarcloud || []) {
      if (conn.organizationKey === sharedConfig.sonarCloudOrganization) {
        return conn.connectionId || conn.organizationKey;
      }
    }
  }
  return null;
}

/**
 * Find shared config for a given scope URI.
 * Tries exact match first, then finds the best matching workspace folder.
 */
function findSharedConfigForScope(scopeUri) {
  if (!scopeUri) {
    // No scope — return first available shared config
    const uris = Object.keys(sharedConfigs);
    return uris.length > 0 ? sharedConfigs[uris[0]] : null;
  }
  // Exact match
  if (sharedConfigs[scopeUri]) {
    return sharedConfigs[scopeUri];
  }
  // Find the workspace folder whose URI is a prefix of scopeUri
  for (const [folderUri, config] of Object.entries(sharedConfigs)) {
    if (scopeUri.startsWith(folderUri)) {
      return config;
    }
  }
  return null;
}

/**
 * Qualify a project key for SonarCloud connections.
 * SonarCloud project keys must be in the format "<organizationKey>_<projectKey>".
 * If the connection is SonarCloud and the project key doesn't already have the org prefix,
 * prepend it automatically.
 * Returns the (possibly prefixed) project key.
 */
function qualifyProjectKey(connectionId, projectKey) {
  if (!connectionId || !projectKey) return projectKey;

  // Find the matching SonarCloud connection
  for (const conn of connectionConfigs.sonarcloud || []) {
    const connId = conn.connectionId || conn.organizationKey;
    if (connId === connectionId && conn.organizationKey) {
      const prefix = conn.organizationKey + "_";
      if (!projectKey.startsWith(prefix)) {
        const qualified = prefix + projectKey;
        log(`Qualified SonarCloud project key: "${projectKey}" → "${qualified}"`);
        return qualified;
      }
      break;
    }
  }

  return projectKey;
}

/**
 * Return a copy of sonarlint config with tokens stripped from connections.
 */
function stripTokensFromConfig(config) {
  if (!config?.connectedMode?.connections) return config;
  const cleaned = JSON.parse(JSON.stringify(config));
  for (const arr of Object.values(cleaned.connectedMode.connections)) {
    if (Array.isArray(arr)) {
      for (const conn of arr) {
        delete conn.token;
      }
    }
  }
  return cleaned;
}

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

    // Capture connections (with tokens) for serving sonarlint/getTokenForServer
    if (msg.params.initializationOptions?.connections) {
      captureConnections(msg.params.initializationOptions.connections);
    }
  }

  if (msg.method === "initialized") {
    serverInitialized = true;
    log("Server initialized");

    // Load .sonarlint/connectedMode.json from workspace folders
    loadSharedConfigs();
  }

  if (msg.method === "workspace/didChangeConfiguration" && msg.params) {
    storedConfig = msg.params.settings || msg.params;
    log("Stored configuration");

    // Also capture connections from settings (may arrive after init)
    if (storedConfig?.connectedMode?.connections) {
      captureConnections(storedConfig.connectedMode.connections);
    }

    // Notify the LS about bindings once after first config is received
    if (serverInitialized && !bindingNotificationSent) {
      const hasExplicitBinding =
        !!storedConfig?.connectedMode?.project?.projectKey;
      const hasSharedBinding = Object.values(sharedConfigs).some(
        (sc) => sc.projectKey && matchConnectionForSharedConfig(sc),
      );
      if (hasExplicitBinding || hasSharedBinding) {
        bindingNotificationSent = true;
        setTimeout(() => {
          sendToServer({
            jsonrpc: "2.0",
            method: "sonarlint/addedManualBindings",
            params: null,
          });
          log("Sent addedManualBindings notification");
        }, 500);
      }
    }
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

      const sonarlintDefaults = {
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

      const items = params?.items || [];
      const results = items.map((item) => {
        const section = item.section || "";

        // For the "sonarlint" section, storedConfig IS the sonarlint config
        // (Zed sends settings from lsp.sonarlint.settings directly)
        if (section === "sonarlint") {
          let config;
          if (storedConfig) {
            config = deepMerge(sonarlintDefaults, storedConfig);
          } else {
            config = { ...sonarlintDefaults };
          }

          // Qualify project key for SonarCloud connections
          if (config.connectedMode?.project?.projectKey) {
            config.connectedMode.project.projectKey = qualifyProjectKey(
              config.connectedMode.project.connectionId,
              config.connectedMode.project.projectKey,
            );
          }

          // If no explicit project binding, check .sonarlint/connectedMode.json
          if (!config.connectedMode?.project?.projectKey) {
            const sharedConfig = findSharedConfigForScope(item.scopeUri);
            if (sharedConfig?.projectKey) {
              const connectionId =
                matchConnectionForSharedConfig(sharedConfig);
              if (connectionId) {
                config.connectedMode = config.connectedMode || {};
                config.connectedMode.project = {
                  connectionId,
                  projectKey: qualifyProjectKey(connectionId, sharedConfig.projectKey),
                };
                log(
                  `Auto-bound scope ${item.scopeUri || "(default)"} to connection=${connectionId} project=${config.connectedMode.project.projectKey} from shared config`,
                );
              }
            }
          }

          return stripTokensFromConfig(config);
        }

        // For sonarlint sub-sections (e.g. "sonarlint.rules"), extract from storedConfig
        if (section.startsWith("sonarlint.") && storedConfig) {
          const subKey = section.slice("sonarlint.".length);
          const parts = subKey.split(".");
          let value = storedConfig;
          for (const part of parts) {
            if (value && typeof value === "object") {
              value = value[part];
            } else {
              value = undefined;
              break;
            }
          }
          if (value !== undefined) {
            return value;
          }
        }

        // Check stored config for non-sonarlint sections
        if (storedConfig && storedConfig[section] !== undefined) {
          return storedConfig[section];
        }

        // Return appropriate defaults for each known section
        switch (section) {
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

    case "sonarlint/getTokenForServer": {
      // LS requests a token for a server connection.
      // params can be a raw string, or an object with serverUrl/serverId/connectionId.
      log("→ getTokenForServer raw params:", JSON.stringify(params));
      const serverId =
        typeof params === "string"
          ? params
          : params?.serverUrl ||
            params?.serverId ||
            params?.connectionId ||
            (Array.isArray(params) ? params[0] : null);
      log("→ getTokenForServer resolved serverId:", serverId);
      const token = findTokenForServer(serverId);
      if (token) {
        log("→ getTokenForServer: found token for", serverId);
      } else {
        log(
          "→ getTokenForServer: no token found for",
          serverId,
          "| known connections:",
          JSON.stringify(
            (connectionConfigs.sonarqube || [])
              .map((c) => c.connectionId || c.serverUrl)
              .concat(
                (connectionConfigs.sonarcloud || []).map(
                  (c) => c.connectionId || c.organizationKey,
                ),
              ),
          ),
        );
      }
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: token || null,
      });
      return true;
    }

    case "sonarlint/checkConnection": {
      // If connections are configured, let the LS handle validation
      if (hasConnections()) {
        log("→ checkConnection: connections configured, returning success");
        sendToServer({
          jsonrpc: "2.0",
          id,
          result: {
            success: true,
          },
        });
      } else {
        log("→ checkConnection: no connections configured");
        sendToServer({
          jsonrpc: "2.0",
          id,
          result: {
            success: false,
            reason: "No connections configured",
          },
        });
      }
      return true;
    }

    case "sonarlint/getCredentials":
    case "sonarlint/validateConnection": {
      // Return token if available, null otherwise
      log("→", method);
      const credServerId =
        typeof params === "string" ? params : params?.connectionId;
      const credToken = credServerId ? findTokenForServer(credServerId) : null;
      sendToServer({
        jsonrpc: "2.0",
        id,
        result: credToken ? { token: credToken } : null,
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

    case "sonarlint/suggestBinding": {
      // Log binding suggestions so the user can configure manually
      log("→ suggestBinding:", JSON.stringify(params));
      const suggestions = params?.suggestions || {};
      for (const [folderUri, bindings] of Object.entries(suggestions)) {
        for (const binding of bindings || []) {
          log(
            `  Binding suggestion for ${folderUri}: connection=${binding.connectionId} project=${binding.sonarProjectKey} (${binding.sonarProjectName})`,
          );
          sendToClient({
            jsonrpc: "2.0",
            method: "window/logMessage",
            params: {
              type: 3, // Info
              message: `SonarLint: Binding suggestion - project "${binding.sonarProjectName}" (${binding.sonarProjectKey}) on connection "${binding.connectionId}". Configure in settings: "connectedMode.project": { "connectionId": "${binding.connectionId}", "projectKey": "${binding.sonarProjectKey}" }`,
            },
          });
        }
      }
      return true;
    }

    case "sonarlint/suggestConnection": {
      // Log connection suggestions so the user can configure manually
      log("→ suggestConnection:", JSON.stringify(params));
      const suggestionsByScope =
        params?.suggestionsByConfigScopeId || params?.suggestions || {};
      for (const [scopeId, suggestions] of Object.entries(
        suggestionsByScope,
      )) {
        for (const suggestion of suggestions || []) {
          const conn = suggestion.connectionSuggestion || suggestion;
          const target = conn.serverUrl || conn.organization || "unknown";
          log(
            `  Connection suggestion for ${scopeId}: ${target} project=${conn.projectKey}`,
          );
          sendToClient({
            jsonrpc: "2.0",
            method: "window/logMessage",
            params: {
              type: 3, // Info
              message: `SonarLint: Connection suggestion for ${target} - project "${conn.projectKey}". Add connection in Zed settings under "connectedMode.connections".`,
            },
          });
        }
      }
      return true;
    }

    case "sonarlint/notifyInvalidToken": {
      // Warn user about invalid/expired token
      const connectionId = params?.connectionId || "unknown";
      log("→ notifyInvalidToken:", connectionId);
      sendToClient({
        jsonrpc: "2.0",
        method: "window/showMessage",
        params: {
          type: 1, // Error
          message: `SonarLint: Token for connection "${connectionId}" is invalid or expired. Please update the token in your Zed settings under "connectedMode.connections".`,
        },
      });
      return true;
    }

    case "sonarlint/reportConnectionCheckResult": {
      // Log connection check results
      const connId = params?.connectionId || "unknown";
      const success = params?.success;
      const reason = params?.reason || "";
      log(
        `→ reportConnectionCheckResult: ${connId} success=${success} reason=${reason}`,
      );
      if (!success) {
        sendToClient({
          jsonrpc: "2.0",
          method: "window/showMessage",
          params: {
            type: 2, // Warning
            message: `SonarLint: Connection "${connId}" check failed${reason ? ": " + reason : ""}. Verify your server URL and token in settings.`,
          },
        });
      }
      return true;
    }

    case "sonarlint/openConnectionSettings": {
      // Log instruction for the user
      const isSonarCloud = params === true;
      log("→ openConnectionSettings: isSonarCloud=" + isSonarCloud);
      sendToClient({
        jsonrpc: "2.0",
        method: "window/showMessage",
        params: {
          type: 3, // Info
          message: `SonarLint: To configure a ${isSonarCloud ? "SonarCloud" : "SonarQube"} connection, add it to your Zed settings under lsp.sonarlint.settings.connectedMode.connections.`,
        },
      });
      return true;
    }

    case "sonarlint/removeBindingsForDeletedConnections": {
      // Log cleanup request
      const connectionIds = params || [];
      log(
        "→ removeBindingsForDeletedConnections:",
        JSON.stringify(connectionIds),
      );
      if (connectionIds.length > 0) {
        sendToClient({
          jsonrpc: "2.0",
          method: "window/logMessage",
          params: {
            type: 2, // Warning
            message: `SonarLint: Connections removed: ${connectionIds.join(", ")}. Please update your project bindings in settings.`,
          },
        });
      }
      return true;
    }

    case "sonarlint/setReferenceBranchNameForFolder": {
      // Log the reference branch for connected mode
      const folderUri = params?.folderUri || "unknown";
      const branchName = params?.branchName || "none";
      log(`→ setReferenceBranchNameForFolder: ${folderUri} → ${branchName}`);
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
    "sonarlint/showSonarLintOutput",
    "sonarlint/openJavaHomeSettings",
    "sonarlint/readyForTests",
    "sonarlint/needCompilationDatabase",
    "sonarlint/showHotspot",
    "sonarlint/showIssueOrHotspot",
    "sonarlint/showSoonUnsupportedVersionMessage",
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
