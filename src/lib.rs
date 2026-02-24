// SonarLint for Zed Editor
// Copyright (C) 2025 Tomasz Skorupka
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

use const_format::concatcp;
use std::{env, fs};
use zed_extension_api::{
    self as zed, LanguageServerId, Result,
    serde_json::{self},
    settings::LspSettings,
};

const SONARLINT_VSCODE_REPO: &str = "SonarSource/sonarlint-vscode";
const SONARLINT_VERSION: &str = "4.42.0";
const SONARLINT_TAG: &str = concatcp!(SONARLINT_VERSION, "+79846");
const SONARLINT_ASSET_NAME: &str = concatcp!("sonarlint-vscode-", SONARLINT_VERSION, ".vsix");

const SERVER_NAME: &str = "sonarlint-ls.jar";
const SERVER_INSTALL_DIR: &str = concatcp!("sonarlint-", SONARLINT_VERSION);
const SERVER_PATH: &str = concatcp!(SERVER_INSTALL_DIR, "/extension/server/", SERVER_NAME);

const WRAPPER_DIR: &str = "wrapper";
const WRAPPER_PATH: &str = concatcp!(WRAPPER_DIR, "/sonarlint-wrapper.js");
const WRAPPER_CONTENT: &str = include_str!("../wrapper/sonarlint-wrapper.js");

struct SonarLintExtension {
    cached_server_path: Option<String>,
}

impl SonarLintExtension {
    fn server_exists(&self) -> bool {
        fs::metadata(SERVER_PATH).is_ok()
    }

    fn server_path(&mut self, language_server_id: &LanguageServerId) -> Result<String> {
        let server_exists = self.server_exists();
        if self.cached_server_path.is_some() && server_exists {
            return Ok(SERVER_PATH.to_string());
        }

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        let release = zed::github_release_by_tag_name(SONARLINT_VSCODE_REPO, SONARLINT_TAG)
            .map_err(|e| {
                format!("Failed to find SonarLint release for tag '{SONARLINT_TAG}': {e}")
            })?;

        let asset = release
            .assets
            .iter()
            .find(|a| a.name == SONARLINT_ASSET_NAME)
            .ok_or_else(|| {
                format!(
                    "Asset '{SONARLINT_ASSET_NAME}' not found in release '{SONARLINT_TAG}'. \
                     Available assets: {:?}",
                    release.assets.iter().map(|a| &a.name).collect::<Vec<_>>()
                )
            })?;

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::Downloading,
        );

        zed::download_file(
            &asset.download_url,
            SERVER_INSTALL_DIR,
            zed::DownloadedFileType::Zip,
        )
        .map_err(|e| format!("Failed to download SonarLint v{SONARLINT_VERSION}: {e}"))?;

        if fs::metadata(SERVER_PATH).is_err() {
            return Err(format!(
                "After extraction, sonarlint-ls.jar not found at expected path: {SERVER_PATH}"
            )
            .into());
        }

        let server_path = env::current_dir()
            .unwrap()
            .join(SERVER_PATH)
            .to_string_lossy()
            .to_string();

        Ok(server_path)
    }

    fn analyzer_paths(&self) -> Vec<String> {
        let analyzers_dir = format!("sonarlint-{SONARLINT_VERSION}/extension/analyzers");
        let mut paths = Vec::new();

        if let Ok(entries) = fs::read_dir(&analyzers_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "jar") {
                    if let Some(path_str) = path.to_str() {
                        paths.push(
                            env::current_dir()
                                .unwrap()
                                .join(&path_str)
                                .to_string_lossy()
                                .to_string(),
                        );
                    }
                }
            }
        }

        paths
    }

    fn wrapper_path(&self) -> Result<String> {
        let wrapper_path = env::current_dir()
            .unwrap()
            .join(WRAPPER_PATH)
            .to_string_lossy()
            .to_string();

        if fs::metadata(&wrapper_path).is_err() {
            return Err(
                    "sonarlint-wrapper.js not found. Make sure the wrapper/ directory is included in the extension."
                        .into(),
                );
        }
        Ok(wrapper_path.to_string())
    }

    fn ensure_wrapper(&self) -> Result<String> {
        if fs::metadata(WRAPPER_DIR).is_err() {
            fs::create_dir(WRAPPER_DIR)
                .map_err(|e| format!("Failed to create wrapper dir: {e}"))?;
        }

        fs::write(WRAPPER_PATH, WRAPPER_CONTENT)
            .map_err(|e| format!("Failed to write wrapper script: {e}"))?;

        Ok(WRAPPER_PATH.to_string())
    }
}

impl zed::Extension for SonarLintExtension {
    fn new() -> Self {
        SonarLintExtension {
            cached_server_path: None,
        }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        self.ensure_wrapper()?;
        let server_path = self.server_path(language_server_id)?;
        let analyzer_paths = self.analyzer_paths();
        let wrapper_path = self.wrapper_path()?;
        self.cached_server_path = Some(server_path.clone());

        let node_path = worktree
            .which("node")
            .or_else(|| zed::node_binary_path().ok())
            .ok_or(
                "Node.js not found. The SonarLint extension requires Node.js for its LSP wrapper. \
                     Please install Node.js and ensure 'node' is in your PATH.",
            )?;

        let java_path = worktree
            .which("java")
            .ok_or("Java not found in PATH. SonarLint requires Java 17+ to run. \
                    Please install a JDK (e.g. OpenJDK 17 or later) and ensure 'java' is in your PATH.")?;

        let mut env = vec![
            ("SONARLINT_JAVA_PATH".to_string(), java_path),
            ("SONARLINT_SERVER_PATH".to_string(), server_path),
            (
                "SONARLINT_ANALYZER_PATHS".to_string(),
                analyzer_paths.join("|"),
            ),
        ];

        if let Some(java_home) = worktree.shell_env().iter().find(|(k, _)| k == "JAVA_HOME") {
            env.push(("JAVA_HOME".to_string(), java_home.1.clone()));
        }

        let user_settings = LspSettings::for_worktree(language_server_id.as_ref(), worktree).ok();
        if let Some(ref settings) = user_settings {
            if let Some(ref init_opts) = settings.initialization_options {
                if init_opts.get("showVerboseLogs") == Some(&serde_json::Value::Bool(true)) {
                    env.push(("SONARLINT_DEBUG".to_string(), "1".to_string()));
                }
            }
        }

        Ok(zed::Command {
            command: node_path,
            args: vec![wrapper_path],
            env,
        })
    }

    fn language_server_workspace_configuration(
        &mut self,
        server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<zed::serde_json::Value>> {
        let settings = LspSettings::for_worktree(server_id.as_ref(), worktree)
            .ok()
            .and_then(|lsp_settings| lsp_settings.settings)
            .unwrap_or_default();
        Ok(Some(settings))
    }

    fn language_server_initialization_options(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<serde_json::Value>> {
        let lsp_settings = LspSettings::for_worktree(language_server_id.as_ref(), worktree).ok();
        let user_init_opts = lsp_settings
            .as_ref()
            .and_then(|s| s.initialization_options.clone());
        let user_ws_settings = lsp_settings.as_ref().and_then(|s| s.settings.clone());

        let mut options = serde_json::json!({
            "productKey": "zed",
            "productName": "Zed",
            "productVersion": "0.1.0",
            "showVerboseLogs": false,
            "disableTelemetry": true,
            "connectedModeEmbedded": {
                "shouldManageServerLifetime": false
            },
            "additionalAttributes": {}
        });

        // Extract connections from workspace settings for initializationOptions.
        // The LS expects connections at startup to register them.
        // Settings structure: { "connectedMode": { "connections": { "sonarqube": [...], "sonarcloud": [...] } } }
        if let Some(ref settings) = user_ws_settings {
            if let Some(connections) = settings
                .get("connectedMode")
                .and_then(|cm| cm.get("connections"))
            {
                options["connections"] = connections.clone();
            }
        }

        // Merge user initialization options (these take precedence)
        if let Some(user_opts) = user_init_opts {
            if let (Some(base), Some(overrides)) = (options.as_object_mut(), user_opts.as_object())
            {
                for (key, value) in overrides {
                    base.insert(key.clone(), value.clone());
                }
            }
        }

        Ok(Some(options))
    }
}

zed::register_extension!(SonarLintExtension);
