import { spawn, execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';

const SONARLINT_VERSION = '4.42.0';

export function findJava() {
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const javaBin = join(javaHome, 'bin', 'java');
    if (existsSync(javaBin)) return javaBin;
  }
  try {
    const which = execSync('which java', { encoding: 'utf8' }).trim();
    if (which) return which;
  } catch {
    // not found
  }
  return null;
}

export function findSonarLintJars() {
  // Allow env var overrides
  const serverOverride = process.env.SONARLINT_SERVER_PATH;
  const analyzerOverride = process.env.SONARLINT_ANALYZER_PATHS;
  if (serverOverride && analyzerOverride) {
    return {
      serverJar: serverOverride,
      analyzerJars: analyzerOverride.split('|').filter(Boolean),
    };
  }

  // Search Zed extension work directory
  let workDir;
  const p = platform();
  if (p === 'darwin') {
    workDir = join(homedir(), 'Library', 'Application Support', 'Zed', 'extensions', 'work', 'sonarlint');
  } else if (p === 'win32') {
    workDir = join(process.env.LOCALAPPDATA || '', 'Zed', 'extensions', 'work', 'sonarlint');
  } else {
    workDir = join(homedir(), '.local', 'share', 'zed', 'extensions', 'work', 'sonarlint');
  }

  const installDir = join(workDir, `sonarlint-${SONARLINT_VERSION}`, 'extension');
  const serverJar = join(installDir, 'server', 'sonarlint-ls.jar');
  if (!existsSync(serverJar)) return null;

  const analyzersDir = join(installDir, 'analyzers');
  const analyzerJars = [];
  if (existsSync(analyzersDir)) {
    for (const f of readdirSync(analyzersDir)) {
      if (f.endsWith('.jar')) {
        analyzerJars.push(join(analyzersDir, f));
      }
    }
  }

  return { serverJar, analyzerJars };
}

export class LspTestClient {
  constructor() {
    this._process = null;
    this._nextId = 1;
    this._pending = new Map();
    this._notifications = [];
    this._serverRequests = [];
    this._buffer = Buffer.alloc(0);
  }

  async start(env) {
    const projectRoot = resolve(import.meta.dirname, '..', '..');
    const wrapperPath = join(projectRoot, 'wrapper', 'sonarlint-wrapper.js');

    this._process = spawn('node', [wrapperPath], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: projectRoot,
    });

    this._process.stdout.on('data', (chunk) => this._onData(chunk));
    this._process.stderr.on('data', (chunk) => {
      // Log stderr for debugging but don't fail
      const text = chunk.toString();
      if (process.env.TEST_DEBUG) {
        process.stderr.write(`[wrapper stderr] ${text}`);
      }
    });

    this._process.on('error', (err) => {
      console.error('Wrapper process error:', err);
    });

    // Give the process a moment to start
    await new Promise((r) => setTimeout(r, 200));
  }

  async stop() {
    if (!this._process) return;
    try {
      await this.request('shutdown', null, 10000);
    } catch {
      // ignore
    }
    this.notify('exit', null);
    await new Promise((r) => setTimeout(r, 500));
    this.kill();
  }

  kill() {
    if (this._process) {
      this._process.kill('SIGKILL');
      this._process = null;
    }
  }

  async request(method, params, timeoutMs = 30000) {
    const id = this._nextId++;
    const message = { jsonrpc: '2.0', id, method, params };
    this._send(message);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this._pending.set(id, { resolve, reject, timer });
    });
  }

  notify(method, params) {
    const message = { jsonrpc: '2.0', method, params };
    this._send(message);
  }

  respondToRequest(id, result) {
    const message = { jsonrpc: '2.0', id, result };
    this._send(message);
  }

  async waitForDiagnostics(uri, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = this._notifications.find(
        (n) =>
          n.method === 'textDocument/publishDiagnostics' &&
          n.params?.uri === uri &&
          n.params?.diagnostics?.length > 0
      );
      if (found) return found.params;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No diagnostics received for ${uri} within ${timeoutMs}ms`);
  }

  async waitForNotification(method, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = this._notifications.find((n) => n.method === method);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No '${method}' notification received within ${timeoutMs}ms`);
  }

  clearDiagnostics(uri) {
    this._notifications = this._notifications.filter(
      (n) =>
        !(n.method === 'textDocument/publishDiagnostics' && n.params?.uri === uri)
    );
  }

  _send(message) {
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    if (this._process?.stdin?.writable) {
      this._process.stdin.write(header + body);
    }
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    this._parseMessages();
  }

  _parseMessages() {
    while (true) {
      const headerEnd = this._buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const header = this._buffer.slice(0, headerEnd).toString();
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Skip malformed header
        this._buffer = this._buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this._buffer.length < bodyStart + contentLength) return;

      const body = this._buffer.slice(bodyStart, bodyStart + contentLength).toString();
      this._buffer = this._buffer.slice(bodyStart + contentLength);

      let message;
      try {
        message = JSON.parse(body);
      } catch {
        continue;
      }

      this._handleMessage(message);
    }
  }

  _handleMessage(message) {
    // Response to our request
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this._pending.get(message.id);
      if (pending) {
        this._pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          pending.reject(new Error(`LSP error ${message.error.code}: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
        return;
      }
    }

    // Server-initiated request (has id + method)
    if (message.id !== undefined && message.method !== undefined) {
      this._serverRequests.push(message);
      // Auto-respond to common server requests
      if (
        message.method === 'client/registerCapability' ||
        message.method === 'client/unregisterCapability' ||
        message.method === 'window/showMessageRequest'
      ) {
        this.respondToRequest(message.id, null);
      } else if (message.method === 'workspace/configuration') {
        // Return empty config for each requested item
        const items = message.params?.items || [];
        this.respondToRequest(message.id, items.map(() => ({})));
      }
      return;
    }

    // Notification (no id)
    if (message.method) {
      this._notifications.push(message);
    }
  }
}
