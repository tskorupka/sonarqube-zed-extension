import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { LspTestClient, findJava, findSonarLintJars } from './harness.mjs';

const projectRoot = resolve(import.meta.dirname, '..', '..');
const testFixturesDir = resolve(projectRoot, 'test');
const javaPath = findJava();
const jars = findSonarLintJars();

function fileUri(filename) {
  return pathToFileURL(resolve(testFixturesDir, filename)).href;
}

function readFixture(filename) {
  return readFileSync(resolve(testFixturesDir, filename), 'utf8');
}

describe('SonarLint integration tests', { timeout: 120_000 }, () => {
  let client;

  if (!javaPath) {
    console.log('SKIP: Java not found — skipping integration tests');
    return;
  }
  if (!jars) {
    console.log('SKIP: SonarLint JARs not found — skipping integration tests');
    return;
  }

  before(async () => {
    client = new LspTestClient();

    await client.start({
      SONARLINT_JAVA_PATH: javaPath,
      SONARLINT_SERVER_PATH: jars.serverJar,
      SONARLINT_ANALYZER_PATHS: jars.analyzerJars.join('|'),
      SONARLINT_DEBUG: '1',
    });

    const initResult = await client.request('initialize', {
      processId: process.pid,
      capabilities: {
        textDocument: {
          publishDiagnostics: { relatedInformation: true },
          synchronization: { dynamicRegistration: false, didSave: true },
        },
        workspace: {
          workspaceFolders: true,
          didChangeConfiguration: { dynamicRegistration: true },
          configuration: true,
        },
      },
      rootUri: pathToFileURL(testFixturesDir).href,
      workspaceFolders: [
        { uri: pathToFileURL(testFixturesDir).href, name: 'test' },
      ],
      initializationOptions: {
        productKey: 'zed',
        productName: 'Zed',
        productVersion: '0.1.0',
        showVerboseLogs: true,
        disableTelemetry: true,
        focusOnNewCode: false,
        automaticAnalysis: true,
        connectedModeEmbedded: { shouldManageServerLifetime: false },
        additionalAttributes: {},
      },
    }, 60_000);

    assert.ok(initResult?.capabilities, 'Server should return capabilities');

    client.notify('initialized', {});

    client.notify('workspace/didChangeConfiguration', {
      settings: {
        sonarlint: {
          automaticAnalysis: true,
          focusOnNewCode: false,
          rules: {},
          disableTelemetry: true,
          output: { showVerboseLogs: true },
          pathToNodeExecutable: '',
          connectedMode: {
            connections: { sonarqube: [], sonarcloud: [] },
          },
        },
      },
    });

    // Wait for JVM to settle
    await new Promise((r) => setTimeout(r, 5000));
  });

  after(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('should return diagnostics for JavaScript', { timeout: 30_000 }, async () => {
    const uri = fileUri('example.js');
    const text = readFixture('example.js');

    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'javascript',
        version: 1,
        text,
      },
    });

    const result = await client.waitForDiagnostics(uri, 30_000);
    assert.ok(result.diagnostics.length > 0, 'Should have at least one diagnostic');
    assert.ok(
      result.diagnostics.some((d) => d.source === 'sonarlint' || d.source === 'sonarqube'),
      'Diagnostics should come from sonarlint/sonarqube'
    );

    client.notify('textDocument/didClose', { textDocument: { uri } });
    client.clearDiagnostics(uri);
  });

  it('should return diagnostics for Java', { timeout: 30_000 }, async () => {
    const uri = fileUri('example.java');
    const text = readFixture('example.java');

    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'java',
        version: 1,
        text,
      },
    });

    const result = await client.waitForDiagnostics(uri, 30_000);
    assert.ok(result.diagnostics.length > 0, 'Should have at least one diagnostic');
    assert.ok(
      result.diagnostics.some((d) => d.source === 'sonarlint' || d.source === 'sonarqube'),
      'Diagnostics should come from sonarlint/sonarqube'
    );

    client.notify('textDocument/didClose', { textDocument: { uri } });
    client.clearDiagnostics(uri);
  });

  it('should return diagnostics for Python', { timeout: 30_000 }, async () => {
    const uri = fileUri('example.py');
    const text = readFixture('example.py');

    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'python',
        version: 1,
        text,
      },
    });

    const result = await client.waitForDiagnostics(uri, 30_000);
    assert.ok(result.diagnostics.length > 0, 'Should have at least one diagnostic');
    assert.ok(
      result.diagnostics.some((d) => d.source === 'sonarlint' || d.source === 'sonarqube'),
      'Diagnostics should come from sonarlint/sonarqube'
    );

    client.notify('textDocument/didClose', { textDocument: { uri } });
    client.clearDiagnostics(uri);
  });
});

describe('SonarLint focusOnNewCode tests', { timeout: 120_000 }, () => {
  let client;

  if (!javaPath) {
    console.log('SKIP: Java not found — skipping focusOnNewCode tests');
    return;
  }
  if (!jars) {
    console.log('SKIP: SonarLint JARs not found — skipping focusOnNewCode tests');
    return;
  }

  before(async () => {
    client = new LspTestClient();

    await client.start({
      SONARLINT_JAVA_PATH: javaPath,
      SONARLINT_SERVER_PATH: jars.serverJar,
      SONARLINT_ANALYZER_PATHS: jars.analyzerJars.join('|'),
      SONARLINT_DEBUG: '1',
    });

    const initResult = await client.request('initialize', {
      processId: process.pid,
      capabilities: {
        textDocument: {
          publishDiagnostics: { relatedInformation: true },
          synchronization: { dynamicRegistration: false, didSave: true },
        },
        workspace: {
          workspaceFolders: true,
          didChangeConfiguration: { dynamicRegistration: true },
          configuration: true,
        },
      },
      rootUri: pathToFileURL(testFixturesDir).href,
      workspaceFolders: [
        { uri: pathToFileURL(testFixturesDir).href, name: 'test' },
      ],
      initializationOptions: {
        productKey: 'zed',
        productName: 'Zed',
        productVersion: '0.1.0',
        showVerboseLogs: true,
        disableTelemetry: true,
        focusOnNewCode: true,
        automaticAnalysis: true,
        connectedModeEmbedded: { shouldManageServerLifetime: false },
        additionalAttributes: {},
      },
    }, 60_000);

    assert.ok(initResult?.capabilities, 'Server should return capabilities');

    client.notify('initialized', {});

    client.notify('workspace/didChangeConfiguration', {
      settings: {
        sonarlint: {
          automaticAnalysis: true,
          focusOnNewCode: true,
          rules: {},
          disableTelemetry: true,
          output: { showVerboseLogs: true },
          pathToNodeExecutable: '',
          connectedMode: {
            connections: { sonarqube: [], sonarcloud: [] },
          },
        },
      },
    });

    // Wait for JVM to settle
    await new Promise((r) => setTimeout(r, 5000));
  });

  after(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('should initialize successfully with focusOnNewCode enabled', { timeout: 30_000 }, async () => {
    // If before() succeeded, the LS accepted focusOnNewCode: true
    assert.ok(true, 'Server initialized with focusOnNewCode: true');
  });

  it('should still return diagnostics with focusOnNewCode enabled', { timeout: 30_000 }, async () => {
    const uri = fileUri('example.js');
    const text = readFixture('example.js');

    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'javascript',
        version: 1,
        text,
      },
    });

    const result = await client.waitForDiagnostics(uri, 30_000);
    assert.ok(result.diagnostics.length > 0, 'Should have at least one diagnostic');
    assert.ok(
      result.diagnostics.some((d) => d.source === 'sonarlint' || d.source === 'sonarqube'),
      'Diagnostics should come from sonarlint/sonarqube'
    );

    // Check if diagnostics include isOnNewCode field (informational — don't fail if absent,
    // as it may depend on git state / new code definition)
    const withNewCodeData = result.diagnostics.filter(
      (d) => d.data && typeof d.data.isOnNewCode === 'boolean'
    );
    if (withNewCodeData.length > 0) {
      console.log(`${withNewCodeData.length}/${result.diagnostics.length} diagnostics have isOnNewCode field`);
    } else {
      console.log('Note: no diagnostics included isOnNewCode field (may depend on git state)');
    }

    client.notify('textDocument/didClose', { textDocument: { uri } });
    client.clearDiagnostics(uri);
  });
});

describe('SonarLint focusOnNewCode filtering (old code)', { timeout: 120_000 }, () => {
  let client;
  let tmpDir;

  if (!javaPath) {
    console.log('SKIP: Java not found — skipping old code filtering tests');
    return;
  }
  if (!jars) {
    console.log('SKIP: SonarLint JARs not found — skipping old code filtering tests');
    return;
  }

  const oldCodeContent = `// Old code with issues
function unusedVar() {
  var x = 10;
  return 5;
}
function emptyCatch() {
  try { throw new Error("test"); } catch (e) { }
}
module.exports = { unusedVar, emptyCatch };
`;

  before(async () => {
    // Create a temp git repo with a JS file committed 60 days ago
    tmpDir = mkdtempSync(join(tmpdir(), 'sonarlint-test-'));
    const filePath = join(tmpDir, 'old-code.js');
    writeFileSync(filePath, oldCodeContent);

    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const gitEnv = `GIT_AUTHOR_DATE="${oldDate}" GIT_COMMITTER_DATE="${oldDate}"`;

    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git add .', { cwd: tmpDir, stdio: 'ignore' });
    execSync(`${gitEnv} git commit -m "old commit"`, {
      cwd: tmpDir,
      stdio: 'ignore',
      shell: true,
    });

    client = new LspTestClient();

    await client.start({
      SONARLINT_JAVA_PATH: javaPath,
      SONARLINT_SERVER_PATH: jars.serverJar,
      SONARLINT_ANALYZER_PATHS: jars.analyzerJars.join('|'),
      SONARLINT_DEBUG: '1',
    });

    const initResult = await client.request('initialize', {
      processId: process.pid,
      capabilities: {
        textDocument: {
          publishDiagnostics: { relatedInformation: true },
          synchronization: { dynamicRegistration: false, didSave: true },
        },
        workspace: {
          workspaceFolders: true,
          didChangeConfiguration: { dynamicRegistration: true },
          configuration: true,
        },
      },
      rootUri: pathToFileURL(tmpDir).href,
      workspaceFolders: [
        { uri: pathToFileURL(tmpDir).href, name: 'test-old-code' },
      ],
      initializationOptions: {
        productKey: 'zed',
        productName: 'Zed',
        productVersion: '0.1.0',
        showVerboseLogs: true,
        disableTelemetry: true,
        focusOnNewCode: true,
        automaticAnalysis: true,
        connectedModeEmbedded: { shouldManageServerLifetime: false },
        additionalAttributes: {},
      },
    }, 60_000);

    assert.ok(initResult?.capabilities, 'Server should return capabilities');

    client.notify('initialized', {});

    client.notify('workspace/didChangeConfiguration', {
      settings: {
        sonarlint: {
          automaticAnalysis: true,
          focusOnNewCode: true,
          rules: {},
          disableTelemetry: true,
          output: { showVerboseLogs: true },
          pathToNodeExecutable: '',
          connectedMode: {
            connections: { sonarqube: [], sonarcloud: [] },
          },
        },
      },
    });

    // Wait for JVM to settle
    await new Promise((r) => setTimeout(r, 5000));
  });

  after(async () => {
    if (client) {
      await client.stop();
    }
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('should filter out old code diagnostics', { timeout: 30_000 }, async () => {
    const uri = pathToFileURL(join(tmpDir, 'old-code.js')).href;

    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'javascript',
        version: 1,
        text: oldCodeContent,
      },
    });

    const result = await client.waitForDiagnosticsSettled(uri, 15_000);
    assert.ok(
      result === null || result.diagnostics.length === 0,
      `Expected zero diagnostics for old code, got ${result?.diagnostics?.length ?? 0}`
    );

    client.notify('textDocument/didClose', { textDocument: { uri } });
    if (result) client.clearDiagnostics(uri);
  });
});
