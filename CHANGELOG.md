# Changelog

All notable changes to the SonarLint extension for Zed will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Remap diagnostic severities based on Clean Code impact severity instead of using raw SonarLint rule severities

## [0.1.0] - 2026-03-04

### Added
- SonarLint integration for Zed with real-time static code analysis
- Support for 18+ languages: Java, JavaScript, TypeScript, TSX, Python, PHP, Go, C/C++, C#, Ruby, Kotlin, Scala, HTML, CSS, XML, YAML, Terraform
- Node.js wrapper to handle custom SonarLint LSP extensions (`sonarlint/*` requests) that Zed does not natively support
- Automatic download and extraction of SonarLint VS Code extension (VSIX) on first use
- Connected Mode for SonarQube and SonarCloud via settings-based configuration (connections, project binding, token management)
- Support for `.sonarlint/connectedMode.json` project-level binding files
- `focusOnNewCode` setting with client-side diagnostic filtering to show only issues on new code
- `automaticAnalysis` setting to toggle real-time analysis on or off
- Settings dual-path: configuration passed via both `initializationOptions` at startup and `workspace/configuration` at runtime
- Integration test harness with real `sonarlint-ls` JVM, covering JavaScript, Java, and Python analysis
- Debug logging via `showVerboseLogs` setting (`SONARLINT_DEBUG=1`)

### Fixed
- Pinned SonarLint VSIX download to exact version tag (`github_release_by_tag_name`) to avoid fetching incorrect releases
