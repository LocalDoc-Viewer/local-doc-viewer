#![allow(dead_code)]

use serde::Deserialize;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const DEFAULT_SIDECAR_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_SIDECAR_STDOUT_LIMIT_BYTES: usize = 4 * 1024 * 1024;
const DEFAULT_SIDECAR_STDERR_LIMIT_BYTES: usize = 64 * 1024;
const DEFAULT_SIDECAR_DETAIL_LIMIT_BYTES: usize = 64 * 1024;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn sidecar_creation_flags() -> u32 {
    CREATE_NO_WINDOW
}

#[derive(Debug, Clone)]
pub(crate) struct CommandResult {
    pub(crate) exit_code: i32,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
}

pub(crate) trait CommandRunner {
    fn run(&self, args: &[String]) -> CommandResult;
}

pub(crate) struct ProcessCommandRunner {
    executable: String,
    fixed_args: Vec<String>,
    timeout: Duration,
    stdout_limit_bytes: usize,
    stderr_limit_bytes: usize,
}

pub(crate) struct SidecarCommandSpec {
    executable: String,
    fixed_args: Vec<String>,
    timeout: Duration,
    stdout_limit_bytes: usize,
    stderr_limit_bytes: usize,
}

impl SidecarCommandSpec {
    pub(crate) fn new(executable: impl Into<String>) -> Self {
        Self {
            executable: executable.into(),
            fixed_args: Vec::new(),
            timeout: DEFAULT_SIDECAR_TIMEOUT,
            stdout_limit_bytes: DEFAULT_SIDECAR_STDOUT_LIMIT_BYTES,
            stderr_limit_bytes: DEFAULT_SIDECAR_STDERR_LIMIT_BYTES,
        }
    }

    pub(crate) fn with_fixed_arg(mut self, arg: impl Into<String>) -> Self {
        self.fixed_args.push(arg.into());
        self
    }

    pub(crate) fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub(crate) fn with_output_limit_bytes(
        mut self,
        stdout_limit_bytes: usize,
        stderr_limit_bytes: usize,
    ) -> Self {
        self.stdout_limit_bytes = stdout_limit_bytes;
        self.stderr_limit_bytes = stderr_limit_bytes;
        self
    }

    pub(crate) fn into_process_runner(self) -> ProcessCommandRunner {
        ProcessCommandRunner::with_fixed_args(self.executable, self.fixed_args)
            .with_timeout(self.timeout)
            .with_output_limit_bytes(self.stdout_limit_bytes, self.stderr_limit_bytes)
    }
}

pub(crate) fn dev_wrapper_command_spec(script_path: &Path, run: bool) -> SidecarCommandSpec {
    let executable = if cfg!(windows) { "pwsh.exe" } else { "pwsh" };
    let mut spec = SidecarCommandSpec::new(executable)
        .with_fixed_arg("-NoProfile")
        .with_fixed_arg("-ExecutionPolicy")
        .with_fixed_arg("Bypass")
        .with_fixed_arg("-File")
        .with_fixed_arg(script_path.to_string_lossy())
        .with_timeout(Duration::from_secs(120));

    if run {
        spec = spec.with_fixed_arg("-Run");
    }

    spec
}

pub(crate) fn packaged_renderer_command_spec(
    java_path: &Path,
    jar_path: &Path,
) -> SidecarCommandSpec {
    SidecarCommandSpec::new(java_compatible_path_string(java_path))
        .with_fixed_arg("-Dfile.encoding=UTF-8")
        .with_fixed_arg("-Dsun.stdout.encoding=UTF-8")
        .with_fixed_arg("-jar")
        .with_fixed_arg(java_compatible_path_string(jar_path))
}

fn java_compatible_path_string(path: &Path) -> String {
    let path = path.to_string_lossy();
    strip_windows_verbatim_prefix(&path).to_string()
}

#[cfg(windows)]
fn strip_windows_verbatim_prefix(path: &str) -> &str {
    path.strip_prefix(r"\\?\").unwrap_or(path)
}

#[cfg(not(windows))]
fn strip_windows_verbatim_prefix(path: &str) -> &str {
    path
}

pub(crate) fn packaged_ofd_renderer_resource_command_spec(
    resource_root: &Path,
) -> SidecarCommandSpec {
    let java_name = if cfg!(windows) { "java.exe" } else { "java" };
    let renderer_root = resource_root.join("ofd-renderer");
    let java_path = renderer_root.join("runtime").join("bin").join(java_name);
    let jar_path = renderer_root.join("ofd-renderer-cli.jar");

    packaged_renderer_command_spec(&java_path, &jar_path)
}

pub(crate) fn packaged_ofd_renderer_resource_exists(resource_root: &Path) -> bool {
    let java_name = if cfg!(windows) { "java.exe" } else { "java" };
    let renderer_root = resource_root.join("ofd-renderer");
    renderer_root
        .join("runtime")
        .join("bin")
        .join(java_name)
        .is_file()
        && renderer_root.join("ofd-renderer-cli.jar").is_file()
}

#[cfg(test)]
pub(crate) fn debug_command_spec_parts(spec: &SidecarCommandSpec) -> (String, Vec<String>) {
    (spec.executable.clone(), spec.fixed_args.clone())
}

impl ProcessCommandRunner {
    pub(crate) fn new(executable: impl Into<String>) -> Self {
        Self {
            executable: executable.into(),
            fixed_args: Vec::new(),
            timeout: DEFAULT_SIDECAR_TIMEOUT,
            stdout_limit_bytes: DEFAULT_SIDECAR_STDOUT_LIMIT_BYTES,
            stderr_limit_bytes: DEFAULT_SIDECAR_STDERR_LIMIT_BYTES,
        }
    }

    pub(crate) fn with_fixed_args(executable: impl Into<String>, fixed_args: Vec<String>) -> Self {
        Self {
            executable: executable.into(),
            fixed_args,
            timeout: DEFAULT_SIDECAR_TIMEOUT,
            stdout_limit_bytes: DEFAULT_SIDECAR_STDOUT_LIMIT_BYTES,
            stderr_limit_bytes: DEFAULT_SIDECAR_STDERR_LIMIT_BYTES,
        }
    }

    pub(crate) fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub(crate) fn with_output_limit_bytes(
        mut self,
        stdout_limit_bytes: usize,
        stderr_limit_bytes: usize,
    ) -> Self {
        self.stdout_limit_bytes = stdout_limit_bytes;
        self.stderr_limit_bytes = stderr_limit_bytes;
        self
    }
}

impl CommandRunner for ProcessCommandRunner {
    fn run(&self, args: &[String]) -> CommandResult {
        let mut command_args = self.fixed_args.clone();
        command_args.extend_from_slice(args);

        let mut command = Command::new(&self.executable);
        command
            .args(command_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        command.creation_flags(sidecar_creation_flags());

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                return CommandResult {
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: error.to_string(),
                }
            }
        };

        let started_at = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_status)) => {
                    return match child.wait_with_output() {
                        Ok(output) => command_result_from_output(
                            output,
                            self.stdout_limit_bytes,
                            self.stderr_limit_bytes,
                        ),
                        Err(error) => CommandResult {
                            exit_code: -1,
                            stdout: String::new(),
                            stderr: error.to_string(),
                        },
                    };
                }
                Ok(None) if started_at.elapsed() >= self.timeout => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return CommandResult {
                        exit_code: -2,
                        stdout: String::new(),
                        stderr: format!("renderer process timed out after {:?}", self.timeout),
                    };
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(10)),
                Err(error) => {
                    let _ = child.kill();
                    return CommandResult {
                        exit_code: -1,
                        stdout: String::new(),
                        stderr: error.to_string(),
                    };
                }
            }
        }
    }
}

fn command_result_from_output(
    output: std::process::Output,
    stdout_limit_bytes: usize,
    stderr_limit_bytes: usize,
) -> CommandResult {
    if output.stdout.len() > stdout_limit_bytes {
        return CommandResult {
            exit_code: -3,
            stdout: String::new(),
            stderr: format!(
                "renderer stdout exceeded limit: {} > {} bytes",
                output.stdout.len(),
                stdout_limit_bytes
            ),
        };
    }

    if output.stderr.len() > stderr_limit_bytes {
        return CommandResult {
            exit_code: -3,
            stdout: String::new(),
            stderr: format!(
                "renderer stderr exceeded limit: {} > {} bytes",
                output.stderr.len(),
                stderr_limit_bytes
            ),
        };
    }

    CommandResult {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    }
}

#[cfg(test)]
pub(crate) struct FakeCommandRunner {
    result: CommandResult,
}

#[cfg(test)]
impl FakeCommandRunner {
    pub(crate) fn new(exit_code: i32, stdout: String, stderr: String) -> Self {
        Self {
            result: CommandResult {
                exit_code,
                stdout,
                stderr,
            },
        }
    }
}

#[cfg(test)]
impl CommandRunner for FakeCommandRunner {
    fn run(&self, _args: &[String]) -> CommandResult {
        self.result.clone()
    }
}

#[derive(Debug, Clone)]
pub(crate) struct SidecarError {
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) recoverable: bool,
    pub(crate) safe_to_show: bool,
    pub(crate) detail_for_report: String,
}

pub(crate) fn sidecar_error_from_result(result: &CommandResult) -> SidecarError {
    let (code, message) = match result.exit_code {
        -2 => ("RENDER_TIMEOUT", "渲染超时，请稍后重试或降低缩放比例。"),
        -3 => ("SIDECAR_OUTPUT_TOO_LARGE", "渲染引擎输出过大，已停止处理。"),
        2 => ("INVALID_ARGUMENT", "渲染引擎调用参数无效。"),
        _ => ("ENGINE_CRASH", "渲染引擎调用失败。"),
    };
    SidecarError {
        code: code.to_string(),
        message: message.to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: limit_detail_for_report(result.stderr.clone()),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InspectSuccess {
    pub(crate) protocol_version: String,
    pub(crate) engine: SidecarEngine,
    pub(crate) document: SidecarDocument,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SidecarEngine {
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) capabilities: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SidecarDocument {
    pub(crate) file_type: String,
    pub(crate) page_count: u32,
    pub(crate) page_sizes: Vec<SidecarPageInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SidecarPageInfo {
    pub(crate) index: u32,
    pub(crate) width_pt: f64,
    pub(crate) height_pt: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VersionSuccess {
    pub(crate) protocol_version: String,
    pub(crate) engine: SidecarEngine,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenderSuccess {
    pub(crate) protocol_version: String,
    pub(crate) engine: SidecarEngine,
    pub(crate) pages: Vec<SidecarRenderedPage>,
    pub(crate) duration_ms: u64,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TextSuccess {
    pub(crate) protocol_version: String,
    pub(crate) engine: SidecarEngine,
    pub(crate) document: SidecarDocumentSummary,
    pub(crate) pages: Vec<SidecarTextPage>,
    pub(crate) duration_ms: u64,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SidecarDocumentSummary {
    pub(crate) file_type: String,
    pub(crate) page_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SidecarRenderedPage {
    pub(crate) index: u32,
    pub(crate) width_px: u32,
    pub(crate) height_px: u32,
    pub(crate) image_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SidecarTextPage {
    pub(crate) index: u32,
    pub(crate) width_pt: f64,
    pub(crate) height_pt: f64,
    pub(crate) text: String,
    pub(crate) fragments: Vec<SidecarTextFragment>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SidecarTextFragment {
    pub(crate) text: String,
    pub(crate) x_pt: f64,
    pub(crate) y_pt: f64,
    pub(crate) width_pt: f64,
    pub(crate) height_pt: f64,
}

#[derive(Debug, Deserialize)]
struct ErrorOutput {
    error: ErrorBody,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    code: String,
    message: String,
    #[serde(default = "default_recoverable")]
    recoverable: bool,
    safe_to_show: bool,
    #[serde(default)]
    detail_for_report: String,
}

fn known_safe_error_message(code: &str) -> Option<&'static str> {
    match code {
        "OFD_INVALID_PACKAGE" | "OFD_STRUCTURE_ERROR" => Some("无法打开该 OFD 文件。"),
        "OFD_RENDER_FAILED" => Some("页面渲染失败。"),
        _ => None,
    }
}

fn sidecar_error_from_protocol_error(error: ErrorBody) -> SidecarError {
    let known_safe_message = known_safe_error_message(&error.code);
    let message = if let Some(message) = known_safe_message {
        message.to_string()
    } else if error.safe_to_show {
        error.message
    } else {
        "渲染引擎调用失败。".to_string()
    };

    SidecarError {
        code: error.code,
        message,
        recoverable: error.recoverable,
        safe_to_show: known_safe_message.is_some() || error.safe_to_show,
        detail_for_report: limit_detail_for_report(error.detail_for_report),
    }
}

fn limit_detail_for_report(detail: String) -> String {
    if detail.len() <= DEFAULT_SIDECAR_DETAIL_LIMIT_BYTES {
        return detail;
    }

    let mut end = DEFAULT_SIDECAR_DETAIL_LIMIT_BYTES;
    while !detail.is_char_boundary(end) {
        end -= 1;
    }
    format!("{} [truncated]", &detail[..end])
}

pub(crate) fn parse_inspect_output(output: &str) -> Result<InspectSuccess, SidecarError> {
    let value: serde_json::Value = serde_json::from_str(output).map_err(parse_json_error)?;
    if value.get("ok").and_then(serde_json::Value::as_bool) == Some(false) {
        let error: ErrorOutput = serde_json::from_value(value).map_err(parse_json_error)?;
        return Err(sidecar_error_from_protocol_error(error.error));
    }

    ensure_supported_protocol(&value)?;
    serde_json::from_value(value).map_err(parse_json_error)
}

pub(crate) fn parse_version_output(output: &str) -> Result<VersionSuccess, SidecarError> {
    let value: serde_json::Value = serde_json::from_str(output).map_err(parse_json_error)?;
    if value.get("ok").and_then(serde_json::Value::as_bool) == Some(false) {
        let error: ErrorOutput = serde_json::from_value(value).map_err(parse_json_error)?;
        return Err(sidecar_error_from_protocol_error(error.error));
    }

    ensure_supported_protocol(&value)?;
    serde_json::from_value(value).map_err(parse_json_error)
}

pub(crate) fn parse_render_output(output: &str) -> Result<RenderSuccess, SidecarError> {
    let value: serde_json::Value = serde_json::from_str(output).map_err(parse_json_error)?;
    if value.get("ok").and_then(serde_json::Value::as_bool) == Some(false) {
        let error: ErrorOutput = serde_json::from_value(value).map_err(parse_json_error)?;
        return Err(sidecar_error_from_protocol_error(error.error));
    }

    ensure_supported_protocol(&value)?;
    serde_json::from_value(value).map_err(parse_json_error)
}

pub(crate) fn parse_text_output(output: &str) -> Result<TextSuccess, SidecarError> {
    let value: serde_json::Value = serde_json::from_str(output).map_err(parse_json_error)?;
    if value.get("ok").and_then(serde_json::Value::as_bool) == Some(false) {
        let error: ErrorOutput = serde_json::from_value(value).map_err(parse_json_error)?;
        return Err(sidecar_error_from_protocol_error(error.error));
    }

    ensure_supported_protocol(&value)?;
    serde_json::from_value(value).map_err(parse_json_error)
}

pub(crate) fn version_args() -> Vec<String> {
    vec!["version".to_string()]
}

pub(crate) fn inspect_args(input_path: &Path) -> Vec<String> {
    vec![
        "inspect".to_string(),
        "--input".to_string(),
        input_path.to_string_lossy().to_string(),
    ]
}

pub(crate) fn render_args(
    input_path: &Path,
    output_dir: &Path,
    page_index: u32,
    dpi: f64,
    max_pages: u32,
    max_pixels: u64,
) -> Vec<String> {
    vec![
        "render".to_string(),
        "--input".to_string(),
        input_path.to_string_lossy().to_string(),
        "--output-dir".to_string(),
        output_dir.to_string_lossy().to_string(),
        "--page".to_string(),
        page_index.to_string(),
        "--dpi".to_string(),
        format!("{dpi:.2}"),
        "--max-pages".to_string(),
        max_pages.to_string(),
        "--max-pixels".to_string(),
        max_pixels.to_string(),
    ]
}

pub(crate) fn text_args(input_path: &Path, max_pages: u32, page_index: Option<u32>) -> Vec<String> {
    let mut args = vec![
        "text".to_string(),
        "--input".to_string(),
        input_path.to_string_lossy().to_string(),
        "--max-pages".to_string(),
        max_pages.to_string(),
    ];
    if let Some(page_index) = page_index {
        args.push("--page".to_string());
        args.push(page_index.to_string());
    }
    args
}

pub(crate) fn version_with_runner(
    runner: &impl CommandRunner,
) -> Result<VersionSuccess, SidecarError> {
    let result = runner.run(&version_args());
    if result.exit_code != 0 {
        return Err(sidecar_error_from_result_or_stdout(
            &result,
            parse_version_output,
        ));
    }

    parse_version_output(&result.stdout)
}

pub(crate) fn inspect_with_runner(
    runner: &impl CommandRunner,
    input_path: &Path,
) -> Result<InspectSuccess, SidecarError> {
    let result = runner.run(&inspect_args(input_path));
    if result.exit_code != 0 {
        return Err(sidecar_error_from_result_or_stdout(
            &result,
            parse_inspect_output,
        ));
    }

    parse_inspect_output(&result.stdout)
}

pub(crate) fn render_with_runner(
    runner: &impl CommandRunner,
    input_path: &Path,
    output_dir: &Path,
    page_index: u32,
    dpi: f64,
    max_pages: u32,
    max_pixels: u64,
) -> Result<RenderSuccess, SidecarError> {
    let result = runner.run(&render_args(
        input_path, output_dir, page_index, dpi, max_pages, max_pixels,
    ));
    if result.exit_code != 0 {
        return Err(sidecar_error_from_result_or_stdout(
            &result,
            parse_render_output,
        ));
    }

    parse_render_output(&result.stdout)
}

pub(crate) fn text_with_runner(
    runner: &impl CommandRunner,
    input_path: &Path,
    max_pages: u32,
    page_index: Option<u32>,
) -> Result<TextSuccess, SidecarError> {
    let result = runner.run(&text_args(input_path, max_pages, page_index));
    if result.exit_code != 0 {
        return Err(sidecar_error_from_result_or_stdout(
            &result,
            parse_text_output,
        ));
    }

    parse_text_output(&result.stdout)
}

fn sidecar_error_from_result_or_stdout<T>(
    result: &CommandResult,
    parser: fn(&str) -> Result<T, SidecarError>,
) -> SidecarError {
    if !result.stdout.trim().is_empty() {
        if let Err(error) = parser(&result.stdout) {
            return error;
        }
    }

    sidecar_error_from_result(result)
}

fn parse_json_error(_error: serde_json::Error) -> SidecarError {
    SidecarError {
        code: "ENGINE_CRASH".to_string(),
        message: "渲染引擎返回了无法解析的结果。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: String::new(),
    }
}

fn default_recoverable() -> bool {
    true
}

fn ensure_supported_protocol(value: &serde_json::Value) -> Result<(), SidecarError> {
    let protocol_version = value
        .get("protocolVersion")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    if protocol_version == "1.0" {
        return Ok(());
    }

    Err(SidecarError {
        code: "UNSUPPORTED_RENDERER_PROTOCOL".to_string(),
        message: "渲染引擎协议版本不兼容。".to_string(),
        recoverable: false,
        safe_to_show: true,
        detail_for_report: format!("protocolVersion={protocol_version}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fake_runner_returns_stdout_for_inspect() {
        let runner = FakeCommandRunner::new(0, "{\"ok\":true}".to_string(), String::new());
        let result = runner.run(&["inspect".to_string()]);

        assert_eq!(result.exit_code, 0);
        assert_eq!(result.stdout, "{\"ok\":true}");
    }

    #[test]
    fn failed_runner_maps_to_engine_crash() {
        let result = CommandResult {
            exit_code: 3,
            stdout: String::new(),
            stderr: "renderer failed".to_string(),
        };
        let error = sidecar_error_from_result(&result);

        assert_eq!(error.code, "ENGINE_CRASH");
        assert!(error.safe_to_show);
    }

    #[test]
    fn inspect_with_runner_preserves_error_json_for_nonzero_exit() {
        let output = r#"{
            "ok": false,
            "protocolVersion": "1.0",
            "error": {
                "code": "OFD_INVALID_PACKAGE",
                "message": "无法打开该 OFD 文件。",
                "detailForReport": "Zip signature not found",
                "recoverable": false,
                "safeToShow": true
            }
        }"#;
        let runner = FakeCommandRunner::new(3, output.to_string(), String::new());

        let error = inspect_with_runner(&runner, std::path::Path::new("C:/samples/bad.ofd"))
            .expect_err("nonzero protocol error should map to sidecar error");

        assert_eq!(error.code, "OFD_INVALID_PACKAGE");
        assert_eq!(error.message, "无法打开该 OFD 文件。");
        assert!(error.safe_to_show);
        assert!(!error.recoverable);
        assert_eq!(error.detail_for_report, "Zip signature not found");
    }

    #[test]
    fn parse_inspect_success_output() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["metadata", "renderPagePng"]
            },
            "document": {
                "fileType": "ofd",
                "pageCount": 2,
                "pageSizes": [
                    {"index": 0, "widthPt": 210.0, "heightPt": 297.0}
                ]
            },
            "warnings": []
        }"#;

        let parsed = parse_inspect_output(output).expect("inspect output should parse");

        assert_eq!(parsed.protocol_version, "1.0");
        assert_eq!(parsed.engine.name, "ofdrw");
        assert_eq!(parsed.document.file_type, "ofd");
        assert_eq!(parsed.document.page_count, 2);
        assert_eq!(parsed.document.page_sizes[0].width_pt, 210.0);
    }

    #[test]
    fn parse_inspect_error_output() {
        let output = r#"{
            "ok": false,
            "protocolVersion": "1.0",
            "error": {
                "code": "OFD_INVALID_PACKAGE",
                "message": "无法打开该 OFD 文件。",
                "detailForReport": "Zip signature not found",
                "recoverable": false,
                "safeToShow": true
            }
        }"#;

        let error = parse_inspect_output(output).expect_err("error output should map to error");

        assert_eq!(error.code, "OFD_INVALID_PACKAGE");
        assert_eq!(error.message, "无法打开该 OFD 文件。");
        assert!(error.safe_to_show);
        assert!(!error.recoverable);
        assert_eq!(error.detail_for_report, "Zip signature not found");
    }

    #[test]
    fn parse_inspect_error_output_uses_known_safe_message() {
        let output = r#"{
            "ok": false,
            "protocolVersion": "1.0",
            "error": {
                "code": "OFD_INVALID_PACKAGE",
                "message": "C:/Users/example/private.ofd Zip signature not found",
                "detailForReport": "C:/Users/example/private.ofd Zip signature not found",
                "recoverable": false,
                "safeToShow": true
            }
        }"#;

        let error = parse_inspect_output(output).expect_err("error output should map to error");

        assert_eq!(error.code, "OFD_INVALID_PACKAGE");
        assert_eq!(error.message, "无法打开该 OFD 文件。");
        assert!(error.safe_to_show);
        assert_eq!(
            error.detail_for_report,
            "C:/Users/example/private.ofd Zip signature not found"
        );
    }

    #[test]
    fn parse_inspect_error_output_preserves_unknown_safe_message() {
        let output = r#"{
            "ok": false,
            "protocolVersion": "1.0",
            "error": {
                "code": "RENDERER_BUSY",
                "message": "渲染引擎正忙，请稍后重试。",
                "detailForReport": "renderer worker queue is full",
                "recoverable": true,
                "safeToShow": true
            }
        }"#;

        let error = parse_inspect_output(output).expect_err("error output should map to error");

        assert_eq!(error.code, "RENDERER_BUSY");
        assert_eq!(error.message, "渲染引擎正忙，请稍后重试。");
        assert!(error.recoverable);
        assert!(error.safe_to_show);
        assert_eq!(error.detail_for_report, "renderer worker queue is full");
    }

    #[test]
    fn parse_inspect_error_output_sanitizes_unknown_unsafe_message() {
        let output = r#"{
            "ok": false,
            "protocolVersion": "1.0",
            "error": {
                "code": "RENDERER_INTERNAL_ERROR",
                "message": "C:/Users/example/private.ofd parser stack trace",
                "detailForReport": "C:/Users/example/private.ofd parser stack trace",
                "recoverable": false,
                "safeToShow": false
            }
        }"#;

        let error = parse_inspect_output(output).expect_err("error output should map to error");

        assert_eq!(error.code, "RENDERER_INTERNAL_ERROR");
        assert_eq!(error.message, "渲染引擎调用失败。");
        assert!(!error.safe_to_show);
        assert!(!error.message.contains("C:/Users/example/private.ofd"));
        assert_eq!(
            error.detail_for_report,
            "C:/Users/example/private.ofd parser stack trace"
        );
    }

    #[test]
    fn parse_inspect_error_output_limits_detail_for_report_size() {
        let oversized_detail = format!("{}tail-marker", "x".repeat(70 * 1024));
        let output = format!(
            r#"{{
                "ok": false,
                "protocolVersion": "1.0",
                "error": {{
                    "code": "RENDERER_INTERNAL_ERROR",
                    "message": "renderer failed",
                    "detailForReport": "{oversized_detail}",
                    "recoverable": false,
                    "safeToShow": false
                }}
            }}"#
        );

        let error = parse_inspect_output(&output).expect_err("error output should map to error");

        assert!(error.detail_for_report.len() <= 64 * 1024 + 64);
        assert!(error.detail_for_report.contains("[truncated]"));
        assert!(!error.detail_for_report.contains("tail-marker"));
    }

    #[test]
    fn parse_inspect_rejects_unsupported_protocol() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "2.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["metadata"]
            },
            "document": {
                "fileType": "ofd",
                "pageCount": 1,
                "pageSizes": []
            },
            "warnings": []
        }"#;

        let error =
            parse_inspect_output(output).expect_err("unsupported protocol should be rejected");

        assert_eq!(error.code, "UNSUPPORTED_RENDERER_PROTOCOL");
        assert!(error.safe_to_show);
    }

    #[test]
    fn inspect_args_use_input_path() {
        let args = inspect_args(std::path::Path::new("C:/samples/public.ofd"));

        assert_eq!(args[0], "inspect");
        assert_eq!(args[1], "--input");
        assert_eq!(args[2], "C:/samples/public.ofd");
    }

    #[test]
    fn inspect_with_runner_parses_fake_stdout() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["metadata"]
            },
            "document": {
                "fileType": "ofd",
                "pageCount": 1,
                "pageSizes": []
            },
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());

        let parsed = inspect_with_runner(&runner, std::path::Path::new("C:/samples/public.ofd"))
            .expect("fake inspect should parse");

        assert_eq!(parsed.engine.name, "ofdrw");
        assert_eq!(parsed.document.page_count, 1);
    }

    #[test]
    fn parse_version_success_output() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["metadata", "renderPagePng"]
            }
        }"#;

        let parsed = parse_version_output(output).expect("version output should parse");

        assert_eq!(parsed.protocol_version, "1.0");
        assert_eq!(parsed.engine.name, "ofdrw");
        assert_eq!(parsed.engine.version, "2.3.9");
        assert_eq!(
            parsed.engine.capabilities,
            vec!["metadata", "renderPagePng"]
        );
    }

    #[test]
    fn parse_version_rejects_unsupported_protocol() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "2.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["metadata"]
            }
        }"#;

        let error =
            parse_version_output(output).expect_err("unsupported protocol should be rejected");

        assert_eq!(error.code, "UNSUPPORTED_RENDERER_PROTOCOL");
        assert!(error.safe_to_show);
    }

    #[test]
    fn version_args_use_version_command() {
        let args = version_args();

        assert_eq!(args, vec!["version"]);
    }

    #[test]
    fn version_with_runner_parses_fake_stdout() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["metadata"]
            }
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());

        let parsed = version_with_runner(&runner).expect("fake version should parse");

        assert_eq!(parsed.engine.name, "ofdrw");
        assert_eq!(parsed.protocol_version, "1.0");
    }

    #[test]
    fn parse_render_success_output() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["metadata", "renderPagePng"]
            },
            "pages": [
                {
                    "index": 0,
                    "widthPx": 1190,
                    "heightPx": 1684,
                    "imagePath": "cache/session/0.png"
                }
            ],
            "durationMs": 128,
            "warnings": ["font subset embedded"]
        }"#;

        let parsed = parse_render_output(output).expect("render output should parse");

        assert_eq!(parsed.protocol_version, "1.0");
        assert_eq!(parsed.engine.name, "ofdrw");
        assert_eq!(parsed.pages[0].index, 0);
        assert_eq!(parsed.pages[0].width_px, 1190);
        assert_eq!(parsed.pages[0].height_px, 1684);
        assert_eq!(parsed.pages[0].image_path, "cache/session/0.png");
        assert_eq!(parsed.duration_ms, 128);
        assert_eq!(parsed.warnings, vec!["font subset embedded"]);
    }

    #[test]
    fn parse_render_error_output_forces_known_safe_message_to_show() {
        let output = r#"{
            "ok": false,
            "protocolVersion": "1.0",
            "error": {
                "code": "OFD_RENDER_FAILED",
                "message": "C:/Users/example/private.ofd render failed",
                "detailForReport": "C:/Users/example/private.ofd render failed",
                "recoverable": true,
                "safeToShow": false
            }
        }"#;

        let error = parse_render_output(output).expect_err("error output should map to error");

        assert_eq!(error.code, "OFD_RENDER_FAILED");
        assert_eq!(error.message, "页面渲染失败。");
        assert!(error.safe_to_show);
        assert_eq!(
            error.detail_for_report,
            "C:/Users/example/private.ofd render failed"
        );
    }

    #[test]
    fn parse_render_rejects_unsupported_protocol() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "2.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["renderPagePng"]
            },
            "pages": [
                {
                    "index": 0,
                    "widthPx": 1190,
                    "heightPx": 1684,
                    "imagePath": "cache/session/0.png"
                }
            ],
            "durationMs": 128,
            "warnings": []
        }"#;

        let error =
            parse_render_output(output).expect_err("unsupported protocol should be rejected");

        assert_eq!(error.code, "UNSUPPORTED_RENDERER_PROTOCOL");
        assert!(error.safe_to_show);
    }

    #[test]
    fn render_args_use_page_and_dpi() {
        let args = render_args(
            std::path::Path::new("C:/samples/public.ofd"),
            std::path::Path::new("C:/cache/session-001"),
            2,
            15.0,
            20,
            150_000_000,
        );

        assert_eq!(args[0], "render");
        assert_eq!(args[1], "--input");
        assert_eq!(args[2], "C:/samples/public.ofd");
        assert_eq!(args[3], "--output-dir");
        assert_eq!(args[4], "C:/cache/session-001");
        assert_eq!(args[5], "--page");
        assert_eq!(args[6], "2");
        assert_eq!(args[7], "--dpi");
        assert_eq!(args[8], "15.00");
        assert_eq!(args[9], "--max-pages");
        assert_eq!(args[10], "20");
        assert_eq!(args[11], "--max-pixels");
        assert_eq!(args[12], "150000000");
    }

    #[test]
    fn render_with_runner_parses_fake_stdout() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["renderPagePng"]
            },
            "pages": [
                {
                    "index": 1,
                    "widthPx": 595,
                    "heightPx": 842,
                    "imagePath": "C:/cache/session-001/1.png"
                }
            ],
            "durationMs": 64,
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());

        let parsed = render_with_runner(
            &runner,
            std::path::Path::new("C:/samples/public.ofd"),
            std::path::Path::new("C:/cache/session-001"),
            1,
            15.0,
            20,
            150_000_000,
        )
        .expect("fake render should parse");

        assert_eq!(parsed.pages[0].index, 1);
        assert_eq!(parsed.pages[0].image_path, "C:/cache/session-001/1.png");
        assert_eq!(parsed.duration_ms, 64);
    }

    #[test]
    fn parse_text_success_output() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["metadata", "renderPagePng", "pageText"]
            },
            "document": {
                "fileType": "ofd",
                "pageCount": 1
            },
            "pages": [
                {
                    "index": 0,
                    "widthPt": 210.0,
                    "heightPt": 297.0,
                    "text": "公开人工样本",
                    "fragments": []
                }
            ],
            "durationMs": 3,
            "warnings": []
        }"#;

        let parsed = parse_text_output(output).expect("text output should parse");

        assert_eq!(parsed.engine.name, "ofdrw");
        assert_eq!(parsed.document.file_type, "ofd");
        assert_eq!(parsed.document.page_count, 1);
        assert_eq!(parsed.pages[0].index, 0);
        assert_eq!(parsed.pages[0].text, "公开人工样本");
    }

    #[test]
    fn text_args_use_input_max_pages_and_optional_page() {
        let args = text_args(std::path::Path::new("C:/samples/public.ofd"), 5, Some(1));

        assert_eq!(args[0], "text");
        assert_eq!(args[1], "--input");
        assert_eq!(args[2], "C:/samples/public.ofd");
        assert_eq!(args[3], "--max-pages");
        assert_eq!(args[4], "5");
        assert_eq!(args[5], "--page");
        assert_eq!(args[6], "1");
    }

    #[test]
    fn text_with_runner_parses_fake_stdout() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["pageText"]
            },
            "document": {
                "fileType": "ofd",
                "pageCount": 1
            },
            "pages": [
                {
                    "index": 0,
                    "widthPt": 210.0,
                    "heightPt": 297.0,
                    "text": "MVP0 OFD Sample - Single Page Text",
                    "fragments": []
                }
            ],
            "durationMs": 5,
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());

        let parsed = text_with_runner(
            &runner,
            std::path::Path::new("C:/samples/public.ofd"),
            5,
            Some(0),
        )
        .expect("fake text should parse");

        assert_eq!(parsed.pages[0].text, "MVP0 OFD Sample - Single Page Text");
        assert_eq!(parsed.duration_ms, 5);
    }

    #[cfg(windows)]
    #[test]
    fn windows_sidecar_process_creation_flags_include_no_window() {
        assert_eq!(
            sidecar_creation_flags() & CREATE_NO_WINDOW,
            CREATE_NO_WINDOW
        );
    }

    #[cfg(windows)]
    #[test]
    fn process_runner_captures_stdout_on_windows() {
        let runner = ProcessCommandRunner::new("cmd");
        let result = runner.run(&["/C".to_string(), "echo hello".to_string()]);

        assert_eq!(result.exit_code, 0);
        assert!(result.stdout.contains("hello"));
    }

    #[cfg(windows)]
    #[test]
    fn process_runner_uses_fixed_args_on_windows() {
        let runner = ProcessCommandRunner::with_fixed_args("cmd", vec!["/C".to_string()]);
        let result = runner.run(&["echo hello".to_string()]);

        assert_eq!(result.exit_code, 0);
        assert!(result.stdout.contains("hello"));
    }

    #[cfg(windows)]
    #[test]
    fn process_runner_times_out_on_windows() {
        let runner = ProcessCommandRunner::with_fixed_args("cmd", vec!["/C".to_string()])
            .with_timeout(std::time::Duration::from_millis(50));
        let result = runner.run(&["ping -n 3 127.0.0.1 > NUL".to_string()]);

        assert_eq!(result.exit_code, -2);
        assert!(result.stderr.contains("timed out"));
        assert_eq!(sidecar_error_from_result(&result).code, "RENDER_TIMEOUT");
        assert!(sidecar_error_from_result(&result).message.contains("超时"));
    }

    #[cfg(windows)]
    #[test]
    fn process_runner_rejects_oversized_stdout_on_windows() {
        let runner = ProcessCommandRunner::with_fixed_args("cmd", vec!["/C".to_string()])
            .with_output_limit_bytes(4, 1024);
        let result = runner.run(&["echo hello".to_string()]);

        assert_eq!(result.exit_code, -3);
        assert!(result.stderr.contains("stdout exceeded"));
        assert_eq!(
            sidecar_error_from_result(&result).code,
            "SIDECAR_OUTPUT_TOO_LARGE"
        );
    }

    #[cfg(windows)]
    #[test]
    fn process_runner_rejects_oversized_stderr_on_windows() {
        let runner = ProcessCommandRunner::with_fixed_args("cmd", vec!["/C".to_string()])
            .with_output_limit_bytes(1024, 4);
        let result = runner.run(&["echo hello 1>&2".to_string()]);

        assert_eq!(result.exit_code, -3);
        assert!(result.stderr.contains("stderr exceeded"));
        assert_eq!(
            sidecar_error_from_result(&result).code,
            "SIDECAR_OUTPUT_TOO_LARGE"
        );
    }

    #[cfg(windows)]
    #[test]
    fn command_spec_builds_process_runner_with_fixed_args_on_windows() {
        let spec = SidecarCommandSpec::new("cmd").with_fixed_arg("/C");
        let runner = spec.into_process_runner();
        let result = runner.run(&["echo hello".to_string()]);

        assert_eq!(result.exit_code, 0);
        assert!(result.stdout.contains("hello"));
    }

    #[test]
    fn dev_wrapper_command_spec_uses_powershell_file_args() {
        let spec = dev_wrapper_command_spec(
            std::path::Path::new("D:/repo/scripts/dev/ofd-renderer-cli.ps1"),
            true,
        );

        let expected_executable = if cfg!(windows) { "pwsh.exe" } else { "pwsh" };

        assert_eq!(spec.executable, expected_executable);
        assert_eq!(
            spec.fixed_args,
            vec![
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                "D:/repo/scripts/dev/ofd-renderer-cli.ps1",
                "-Run",
            ]
        );
        assert_eq!(spec.timeout, std::time::Duration::from_secs(120));
    }

    #[test]
    fn packaged_renderer_command_spec_uses_java_jar_args() {
        let spec = packaged_renderer_command_spec(
            std::path::Path::new("C:/runtime/bin/java.exe"),
            std::path::Path::new("C:/app/sidecars/ofd-renderer-cli.jar"),
        );

        assert_eq!(spec.executable, "C:/runtime/bin/java.exe");
        assert_eq!(
            spec.fixed_args,
            vec![
                "-Dfile.encoding=UTF-8",
                "-Dsun.stdout.encoding=UTF-8",
                "-jar",
                "C:/app/sidecars/ofd-renderer-cli.jar"
            ]
        );
        assert_eq!(spec.timeout, DEFAULT_SIDECAR_TIMEOUT);
    }

    #[cfg(windows)]
    #[test]
    fn packaged_renderer_command_spec_strips_windows_verbatim_prefix() {
        let spec = packaged_renderer_command_spec(
            std::path::Path::new(r"\\?\C:\runtime\bin\java.exe"),
            std::path::Path::new(r"\\?\C:\app\sidecars\ofd-renderer-cli.jar"),
        );

        assert_eq!(spec.executable, r"C:\runtime\bin\java.exe");
        assert_eq!(
            spec.fixed_args,
            vec![
                "-Dfile.encoding=UTF-8",
                "-Dsun.stdout.encoding=UTF-8",
                "-jar",
                r"C:\app\sidecars\ofd-renderer-cli.jar"
            ]
        );
    }

    #[test]
    fn packaged_ofd_renderer_resource_command_spec_uses_bundled_resource_paths() {
        let resource_root = std::path::Path::new("C:/app/resources");
        let spec = packaged_ofd_renderer_resource_command_spec(resource_root);
        let java_name = if cfg!(windows) { "java.exe" } else { "java" };
        let expected_java = resource_root
            .join("ofd-renderer")
            .join("runtime")
            .join("bin")
            .join(java_name)
            .to_string_lossy()
            .to_string();
        let expected_jar = resource_root
            .join("ofd-renderer")
            .join("ofd-renderer-cli.jar")
            .to_string_lossy()
            .to_string();

        assert_eq!(spec.executable, expected_java);
        assert_eq!(
            spec.fixed_args,
            vec![
                "-Dfile.encoding=UTF-8",
                "-Dsun.stdout.encoding=UTF-8",
                "-jar",
                expected_jar.as_str()
            ]
        );
    }

    #[test]
    fn packaged_ofd_renderer_resource_exists_requires_java_and_jar() {
        let root = unique_temp_root("sidecar-resource-exists");
        let java_name = if cfg!(windows) { "java.exe" } else { "java" };
        let java_path = root
            .join("ofd-renderer")
            .join("runtime")
            .join("bin")
            .join(java_name);
        let jar_path = root.join("ofd-renderer").join("ofd-renderer-cli.jar");
        std::fs::create_dir_all(java_path.parent().expect("java path should have parent"))
            .expect("resource dir should be created");

        assert!(!packaged_ofd_renderer_resource_exists(&root));

        std::fs::write(&java_path, b"java").expect("java placeholder should be written");
        assert!(!packaged_ofd_renderer_resource_exists(&root));

        std::fs::write(&jar_path, b"jar").expect("jar placeholder should be written");
        assert!(packaged_ofd_renderer_resource_exists(&root));

        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn version_with_process_runner_reads_windows_stub_sidecar() {
        let stub = write_stub_script(
            "cmd",
            "@echo off\r\necho {\"ok\":true,\"protocolVersion\":\"1.0\",\"engine\":{\"name\":\"stub\",\"version\":\"0.0.1\",\"capabilities\":[\"metadata\"]}}\r\n",
        );
        let spec = SidecarCommandSpec::new("cmd")
            .with_fixed_arg("/C")
            .with_fixed_arg(stub.to_string_lossy());
        let runner = spec.into_process_runner();

        let parsed = version_with_runner(&runner).expect("stub version should parse");

        assert_eq!(parsed.engine.name, "stub");
        assert_eq!(parsed.engine.version, "0.0.1");
        assert_eq!(parsed.engine.capabilities, vec!["metadata"]);
    }

    #[cfg(unix)]
    #[test]
    fn process_runner_captures_stdout_on_linux_and_unix_like_platforms() {
        let runner = ProcessCommandRunner::new("sh");
        let result = runner.run(&["-c".to_string(), "printf hello".to_string()]);

        assert_eq!(result.exit_code, 0);
        assert_eq!(result.stdout, "hello");
    }

    #[cfg(unix)]
    #[test]
    fn process_runner_uses_fixed_args_on_linux_and_unix_like_platforms() {
        let runner = ProcessCommandRunner::with_fixed_args("sh", vec!["-c".to_string()]);
        let result = runner.run(&["printf hello".to_string()]);

        assert_eq!(result.exit_code, 0);
        assert_eq!(result.stdout, "hello");
    }

    #[cfg(unix)]
    #[test]
    fn process_runner_times_out_on_linux_and_unix_like_platforms() {
        let runner = ProcessCommandRunner::with_fixed_args("sh", vec!["-c".to_string()])
            .with_timeout(std::time::Duration::from_millis(50));
        let result = runner.run(&["sleep 2".to_string()]);

        assert_eq!(result.exit_code, -2);
        assert!(result.stderr.contains("timed out"));
        assert_eq!(sidecar_error_from_result(&result).code, "RENDER_TIMEOUT");
        assert!(sidecar_error_from_result(&result).message.contains("超时"));
    }

    #[cfg(unix)]
    #[test]
    fn process_runner_rejects_oversized_stdout_on_linux_and_unix_like_platforms() {
        let runner = ProcessCommandRunner::with_fixed_args("sh", vec!["-c".to_string()])
            .with_output_limit_bytes(4, 1024);
        let result = runner.run(&["printf hello".to_string()]);

        assert_eq!(result.exit_code, -3);
        assert!(result.stderr.contains("stdout exceeded"));
        assert_eq!(
            sidecar_error_from_result(&result).code,
            "SIDECAR_OUTPUT_TOO_LARGE"
        );
    }

    #[cfg(unix)]
    #[test]
    fn process_runner_rejects_oversized_stderr_on_linux_and_unix_like_platforms() {
        let runner = ProcessCommandRunner::with_fixed_args("sh", vec!["-c".to_string()])
            .with_output_limit_bytes(1024, 4);
        let result = runner.run(&["printf hello >&2".to_string()]);

        assert_eq!(result.exit_code, -3);
        assert!(result.stderr.contains("stderr exceeded"));
        assert_eq!(
            sidecar_error_from_result(&result).code,
            "SIDECAR_OUTPUT_TOO_LARGE"
        );
    }

    #[cfg(unix)]
    #[test]
    fn command_spec_builds_process_runner_with_fixed_args_on_linux_and_unix_like_platforms() {
        let spec = SidecarCommandSpec::new("sh").with_fixed_arg("-c");
        let runner = spec.into_process_runner();
        let result = runner.run(&["printf hello".to_string()]);

        assert_eq!(result.exit_code, 0);
        assert_eq!(result.stdout, "hello");
    }

    #[cfg(unix)]
    #[test]
    fn version_with_process_runner_reads_linux_and_unix_like_stub_sidecar() {
        let stub = write_stub_script(
            "sh",
            "printf '%s\n' '{\"ok\":true,\"protocolVersion\":\"1.0\",\"engine\":{\"name\":\"stub\",\"version\":\"0.0.1\",\"capabilities\":[\"metadata\"]}}'\n",
        );
        let spec = SidecarCommandSpec::new("sh").with_fixed_arg(stub.to_string_lossy());
        let runner = spec.into_process_runner();

        let parsed = version_with_runner(&runner).expect("stub version should parse");

        assert_eq!(parsed.engine.name, "stub");
        assert_eq!(parsed.engine.version, "0.0.1");
        assert_eq!(parsed.engine.capabilities, vec!["metadata"]);
    }

    fn write_stub_script(extension: &str, body: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ldv-sidecar-stub-{}-{}.{}",
            std::process::id(),
            unique_stub_id(),
            extension
        ));
        std::fs::write(&path, body).expect("stub script should be written");
        path
    }

    fn unique_stub_id() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos()
    }

    fn unique_temp_root(prefix: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "ldv-{prefix}-{}-{}",
            std::process::id(),
            unique_stub_id()
        ))
    }
}
