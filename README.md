# SonarLint for Zed

Real-time static code analysis powered by [SonarLint](https://www.sonarsource.com/products/sonarlint/) in [Zed](https://zed.dev/).

> ⚠️ This is an unofficial community extension. It wraps the official SonarLint Language Server from SonarSource.

## Features

- **Real-time diagnostics** — see code smells, bugs, and security vulnerabilities as you type
- **18+ languages** — Java, JavaScript, TypeScript, Python, PHP, Go, C/C++, C#, Ruby, Kotlin, Scala, HTML, CSS, XML, YAML, and more
- **Automatic setup** — downloads the SonarLint language server automatically on first use
- **Standalone mode** — works without requiring SonarQube/SonarCloud connection

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

- `disableTelemetry` — disable anonymous usage statistics (default: `false`)
- `showVerboseLogs` — enable verbose logging for debugging (default: `false`)

### Connected Mode (SonarQube/SonarCloud)

Connected Mode is **not currently supported**. The extension runs in standalone mode, analyzing code locally without connecting to SonarQube or SonarCloud servers. This means:

- No server-side rule configuration
- No issue synchronization with SonarQube/SonarCloud
- No Quality Gate status
- No authentication required

Support for Connected Mode may be added in future versions.

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
3. Check the wrapper log: `tail -f ~/sonarlint-wrapper.log`
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
