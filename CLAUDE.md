# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Zed editor extension** that integrates SonarLint for real-time static code analysis. The architecture uses a **Node.js wrapper** to bridge between Zed and the SonarLint Language Server (Java), handling custom LSP extensions that Zed doesn't natively support.

**Key Architecture:**
- Rust extension (`src/lib.rs`) implements `zed::Extension` trait
- Downloads SonarLint VS Code extension (VSIX) from GitHub releases on first use
- Extracts `sonarlint-ls.jar` and language-specific analyzer JARs
- Spawns a **Node.js wrapper** (`wrapper/sonarlint-wrapper.js`) that:
  - Intercepts custom LSP requests from `sonarlint-ls` (e.g., `sonarlint/isOpenInEditor`)
  - Provides appropriate responses so analysis proceeds without Connected Mode
  - Proxies standard LSP messages between Zed and the Java language server
- Supports 18+ languages: Java, JavaScript, TypeScript, Python, PHP, Go, C/C++, C#, Ruby, Kotlin, Scala, HTML, CSS, XML, YAML

## Build & Development

### Prerequisites
- **Rust toolchain** (for building the extension)
- **Java 17+** (required by SonarLint language server at runtime)
- **Node.js** (required by the wrapper to proxy LSP messages)

### Build the extension
```bash
cargo build --release
```

### Install as dev extension in Zed
1. Open Zed
2. Go to Extensions (Cmd+Shift+X)
3. Click "Install Dev Extension"
4. Select this repository directory

### Testing
Open a supported file (e.g., `.java`, `.ts`, `.py`) in Zed to trigger the extension.

**View logs:**
```bash
# Zed extension log: Command Palette -> "zed: open log"

# Wrapper log (custom requests, file listing, etc.):
tail -f ~/sonarlint-wrapper.log

# Run Zed from terminal for verbose output:
zed --foreground
```

## Code Structure

### `src/lib.rs` (Rust extension)
- `SonarLintExtension`: main extension struct
- `server_path()`: downloads and extracts VSIX if not cached
- `analyzer_paths()`: collects analyzer JARs from `sonarlint-{VERSION}/extension/analyzers/`
- `language_server_command()`: spawns Node.js wrapper with environment variables:
  - `SONARLINT_JAVA_PATH`: path to `java` binary
  - `SONARLINT_SERVER_PATH`: path to `sonarlint-ls.jar`
  - `SONARLINT_ANALYZER_PATHS`: pipe-separated list of analyzer JARs
  - `JAVA_HOME`: forwarded from shell environment
  - `SONARLINT_DEBUG=1`: enables verbose logging if `showVerboseLogs: true` in settings
- `language_server_initialization_options()`: sends product metadata, extracts connections from settings, and merges user init options
- `language_server_workspace_configuration()`: forwards user settings to language server

### `wrapper/sonarlint-wrapper.js` (Node.js proxy)
The wrapper sits between Zed and `sonarlint-ls`, handling custom LSP extensions:

**Custom requests intercepted and handled:**
- `sonarlint/isOpenInEditor` → `true` (file is open)
- `sonarlint/isIgnoredByScm` → `false` (not ignored)
- `sonarlint/listFilesInFolder` → lists project files recursively (skips `node_modules`, `.git`, etc.)
- `sonarlint/filterOutExcludedFiles` → passes through (no filtering)
- `sonarlint/getJavaConfig` → `null` (no special Java project config)
- `sonarlint/canShowMissingRequirementsNotification` → `"silently"` (suppress popups)
- `sonarlint/getTokenForServer` → returns token from stored connection config (Connected Mode)
- `sonarlint/checkConnection` → success if connections configured, failure otherwise
- `workspace/configuration` → returns stored config merged with defaults (tokens stripped)

**Connected Mode notifications handled:**
- `sonarlint/suggestBinding` → logs binding suggestions with config instructions
- `sonarlint/suggestConnection` → logs connection suggestions
- `sonarlint/notifyInvalidToken` → shows error message to user
- `sonarlint/reportConnectionCheckResult` → logs status, shows warning on failure
- `sonarlint/openConnectionSettings` → shows config instructions
- `sonarlint/removeBindingsForDeletedConnections` → logs cleanup request
- `sonarlint/setReferenceBranchNameForFolder` → logs reference branch

**Custom notifications silently dropped:**
- `sonarlint/submitNewCodeDefinition`, `sonarlint/embeddedServerStarted`, `sonarlint/settingsApplied`, etc.

**Path resolution:**
- Uses `findExtensionWorkDir()` to locate Zed's extension work directory on disk
- Resolves relative JAR paths from environment variables to absolute paths
- Platform-specific search: `~/Library/Application Support/Zed/extensions/work/sonarlint` (macOS), `%LOCALAPPDATA%\Zed\extensions\work\sonarlint` (Windows), `~/.local/share/zed/extensions/work/sonarlint` (Linux)

### Configuration files
- `extension.toml`: extension metadata, language support, LSP server registration
- `Cargo.toml`: Rust dependencies (`zed_extension_api = "0.7.0"`, `const_format`)

## Important Constants

**In `src/lib.rs`:**
- `SONARLINT_VERSION`: currently `"4.42.0"` — update to upgrade the language server
- `SONARLINT_VSCODE_REPO`: `"SonarSource/sonarlint-vscode"`
- `SONARLINT_ASSET_NAME`: `"sonarlint-vscode-{VERSION}.vsix"`
- Installation directory: `sonarlint-{VERSION}/extension/`

## Common Tasks

**Upgrade SonarLint version:**
1. Update `SONARLINT_VERSION` in `src/lib.rs`
2. Rebuild extension: `cargo build --release`
3. Reinstall dev extension in Zed
4. Open a file to trigger re-download

**Add support for a new language:**
1. Add language to `extension.toml` under `language_servers.sonarlint.languages`
2. Verify the analyzer JAR is included in the VSIX (check upstream SonarLint VS Code extension)

**Debug wrapper issues:**
1. Check `~/sonarlint-wrapper.log` for custom request handling
2. Look for path resolution errors or missing JARs
3. Verify Node.js is in PATH: `which node`

**Debug download/extraction issues:**
1. Check Zed log (`zed: open log` command)
2. Verify `sonarlint-{VERSION}/extension/server/sonarlint-ls.jar` exists
3. Verify analyzer JARs in `sonarlint-{VERSION}/extension/analyzers/`

**Modify custom request handling:**
- Edit `wrapper/sonarlint-wrapper.js` → `handleServerRequest()` function
- The wrapper is embedded via `include_str!()` in `lib.rs` and written to disk at runtime
- Changes require reinstalling the dev extension

## Architecture Notes

**Why a Node.js wrapper?**
- SonarLint uses custom LSP requests (`sonarlint/*`) that Zed doesn't handle
- Without the wrapper, the language server would fail initialization or refuse to analyze files
- The wrapper transparently handles these requests so analysis works in "standalone mode" (without Connected Mode)

**Process hierarchy:**
```
Zed ↔ node (wrapper) ↔ java (sonarlint-ls)
      stdin/stdout       stdin/stdout
```

**Connected Mode (SonarQube/SonarCloud):**
- Phase 1 supported: basic connection + project binding via settings.json
- User configures connections and binding in Zed settings:
  ```json
  {
    "lsp": {
      "sonarlint": {
        "settings": {
          "connectedMode": {
            "connections": {
              "sonarqube": [{
                "connectionId": "my-server",
                "serverUrl": "https://sonarqube.example.com",
                "token": "squ_xxxx"
              }]
            },
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
- Connections are passed to the LS via `initializationOptions` at startup
- Tokens are served via `sonarlint/getTokenForServer` (tokens stripped from config responses)
- Binding is communicated via `workspace/configuration` and `sonarlint/addedManualBindings`
- Per-project binding via three methods (priority order):
  1. Explicit `connectedMode.project` in settings (global or `.zed/settings.json`)
  2. `.sonarlint/connectedMode.json` in project root (auto-matched to configured connections)
  3. LS auto-discovery via `sonarlint/suggestBinding`
- The `listFilesInFolder` handler exposes `.sonarlint/` directories so the LS can discover shared configs
- No interactive UI for connection setup (Zed limitation) — settings files only
- Phase 2 (token generation wizard, auto-bind) and Phase 3 (branch awareness) not yet implemented
