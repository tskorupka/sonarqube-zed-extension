import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
