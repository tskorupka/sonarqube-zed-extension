# SonarLint for Zed

Real-time static code analysis powered by [SonarLint](https://www.sonarsource.com/products/sonarlint/) in [Zed](https://zed.dev/).

> ⚠️ This is an unofficial community extension. It wraps the official SonarLint Language Server from SonarSource.

## Features

- **Real-time diagnostics** — see code smells, bugs, and security vulnerabilities as you type
- **18+ languages** — Java, JavaScript, TypeScript, Python, PHP, Go, C/C++, C#, Ruby, Kotlin, Scala, HTML, CSS, XML, YAML, and more
- **Automatic setup** — downloads the SonarLint language server automatically on first use
- **Standalone mode** — works without requiring SonarQube/SonarCloud connection
- **Connected Mode** — connect to SonarQube or SonarCloud to sync rules, quality profiles, and issue suppression
- **Focus on New Code** — filter analysis to only show issues on recently changed code

## Requirements

- **Java 17+** — SonarLint's language server is a Java application. Install a JDK (e.g. [Eclipse Temurin](https://adoptium.net/)) and make sure `java` is in your `PATH`.
- **Node.js** — required by the extension's LSP wrapper to bridge between Zed and the SonarLint language server

## Installation

### From the Extensions Gallery (once published)

Search for "SonarLint" in the Zed extensions gallery.

### As a dev extension (for development/testing)

1. Clone this repository
2. Open Zed and go to Extensions (`Cmd+Shift+X`)
3. Click "Install Dev Extension"
4. Select the cloned directory

## Configuration

You can configure SonarLint via Zed's `settings.json`:

```json
{
  "lsp": {
    "sonarlint": {
      "initialization_options": {
        "disableTelemetry": true,
        "showVerboseLogs": false
      }
    }
  }
}
```

### Available Settings

Configure SonarLint behavior under `lsp.sonarlint.settings`:

```json
{
  "lsp": {
    "sonarlint": {
      "settings": {
        "automaticAnalysis": true,
        "focusOnNewCode": false,
        "rules": {}
      },
      "initialization_options": {
        "disableTelemetry": true,
        "showVerboseLogs": false
      }
    }
  }
}
```

**Settings** (under `lsp.sonarlint.settings`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `automaticAnalysis` | boolean | `true` | Enable/disable automatic on-the-fly analysis. When `false`, SonarLint will not publish diagnostics automatically. Note: Zed has no command to trigger manual analysis, so disabling this effectively disables SonarLint. |
| `focusOnNewCode` | boolean | `false` | When enabled, only shows issues on code changed in the last 30 days (standalone mode) or based on the server's new code definition (Connected Mode). |
| `rules` | object | `{}` | Override individual rule settings. See [SonarLint rule configuration](https://docs.sonarsource.com/sonarlint/vs-code/using-sonarlint/rules/). |

**Initialization options** (under `lsp.sonarlint.initialization_options`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `disableTelemetry` | boolean | `true` | Disable anonymous usage statistics. |
| `showVerboseLogs` | boolean | `false` | Enable verbose logging for debugging. |

### Connected Mode (SonarQube/SonarCloud)

Connect to a SonarQube server or SonarCloud to synchronize rules, quality profiles, and suppress resolved issues.

#### Configure a connection

Add your server connection in Zed's `settings.json`:

**SonarQube:**
```json
{
  "lsp": {
    "sonarlint": {
      "settings": {
        "connectedMode": {
          "connections": {
            "sonarqube": [
              {
                "connectionId": "my-server",
                "serverUrl": "https://sonarqube.example.com",
                "token": "squ_xxxx"
              }
            ]
          }
        }
      }
    }
  }
}
```

**SonarCloud:**
```json
{
  "lsp": {
    "sonarlint": {
      "settings": {
        "connectedMode": {
          "connections": {
            "sonarcloud": [
              {
                "connectionId": "my-org",
                "organizationKey": "my-org-key",
                "token": "your-token"
              }
            ]
          }
        }
      }
    }
  }
}
```

#### Bind a project

After configuring a connection, bind your workspace to a SonarQube/SonarCloud project using one of these methods (in priority order):

**Option 1: Explicit setting** — add to `settings.json` (global or `.zed/settings.json`):

```json
{
  "lsp": {
    "sonarlint": {
      "settings": {
        "connectedMode": {
          "project": {
            "connectionId": "my-server",
            "projectKey": "my-project"
          }
        }
      }
    }
  }
}
```

**Option 2: Shared configuration file** — create `.sonarlint/connectedMode.json` in your project root:

```json
{
  "sonarQubeUri": "https://sonarqube.example.com",
  "projectKey": "my-project"
}
```

This file can be committed to version control so all team members share the same binding. The extension automatically matches it to your configured connection.

**Option 3: Auto-discovery** — if you have a connection configured but no explicit binding, SonarLint will suggest matching projects in the Zed log.

#### Limitations

- No interactive connection setup UI (Zed does not support custom UI panels)
- All configuration is via settings files
- Token generation must be done in SonarQube/SonarCloud web UI, then pasted into settings

## How It Works

This extension uses a unique architecture to integrate SonarLint with Zed:

1. **Download & Extract** — On first activation, downloads the official SonarLint VS Code extension (VSIX v4.42.0) from GitHub Releases and extracts `sonarlint-ls.jar` and language-specific analyzer JARs

2. **Node.js Wrapper** — Spawns a Node.js wrapper process that sits between Zed and the Java language server, handling custom LSP requests that Zed doesn't natively support:
   - `sonarlint/isOpenInEditor` — confirms files are open for analysis
   - `sonarlint/listFilesInFolder` — provides project file listings
   - `sonarlint/getJavaConfig` — provides Java project configuration
   - Other SonarLint-specific protocol extensions

3. **LSP Bridge** — The wrapper transparently proxies standard LSP messages while intercepting and responding to custom requests, allowing the language server to work in standalone mode

4. **Real-time Analysis** — The SonarLint language server analyzes your code and sends diagnostics via LSP, which Zed displays inline in the editor

**Process hierarchy:**
```
Zed ↔ Node.js wrapper ↔ Java (sonarlint-ls)
      stdin/stdout        stdin/stdout
```

## Supported Languages

| Language | Analyzer |
|----------|----------|
| Java | sonarjava.jar |
| JavaScript/TypeScript | sonarjs.jar |
| Python | sonarpython.jar |
| PHP | sonarphp.jar |
| Go | sonargo.jar |
| Ruby | sonarruby.jar |
| Kotlin | sonarkotlin.jar |
| Scala | sonarscala.jar |
| HTML | sonarhtml.jar |
| CSS | sonarcss.jar |
| XML | sonarxml.jar |
| YAML | sonar-text.jar |
| C/C++ | sonarcfamily.jar |
| C# | sonarcsharp.jar |
| IaC (Terraform, Docker, K8s) | sonariac.jar |

## Troubleshooting

### "Java not found in PATH"

Make sure you have Java 17+ installed and `java` is accessible from your terminal:

```bash
java -version
```

### "Node not found in PATH"

Make sure Node.js is installed and `node` is accessible:

```bash
node --version
```

### No diagnostics appearing

1. Check the Zed log: Command Palette → "zed: open log"
2. Run Zed with verbose logging: `zed --foreground` from terminal
3. Check the wrapper log: `tail -f ~/Library/Application\ Support/Zed/extensions/work/sonarlint/sonarlint-wrapper.log`
4. Verify the language of your file is in the supported list

### Enable verbose logging

Add to your Zed `settings.json`:

```json
{
  "lsp": {
    "sonarlint": {
      "initialization_options": {
        "showVerboseLogs": true
      }
    }
  }
}
```

Then restart Zed or reload the extension.

## Development

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation and development instructions.

### Build the extension

```bash
cargo build --release
```

### Prerequisites for development

- **Rust toolchain** — for building the extension
- **Java 17+** — required by SonarLint language server at runtime
- **Node.js** — required by the wrapper to proxy LSP messages

## License

LGPL-3.0 — see [LICENSE](./LICENSE)

This extension integrates [SonarLint](https://github.com/SonarSource/sonarlint-vscode), which is licensed under LGPL-3.0. To maintain compatibility and comply with the licensing requirements of the SonarLint project, this extension is also distributed under LGPL-3.0.

SonarQube and SonarLint are trademarks of SonarSource SA. This extension is not affiliated with or endorsed by SonarSource.
