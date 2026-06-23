#![allow(dead_code)]

use serde::Deserialize;
use serde::Serialize;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const DEFAULT_CONVERTER_DETAIL_LIMIT_BYTES: usize = 64 * 1024;
const DEFAULT_LIBREOFFICE_TIMEOUT: Duration = Duration::from_secs(120);
const DEFAULT_LIBREOFFICE_STDERR_LIMIT_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversionSuccess {
    pub(crate) protocol_version: String,
    pub(crate) converter: ConverterInfo,
    pub(crate) input: ConversionInput,
    pub(crate) output: ConversionOutput,
    pub(crate) duration_ms: u64,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConverterInfo {
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) source: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversionInput {
    pub(crate) file_type: String,
    pub(crate) size_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversionOutput {
    pub(crate) file_type: String,
    pub(crate) path: String,
    pub(crate) size_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ConverterError {
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) recoverable: bool,
    pub(crate) safe_to_show: bool,
    pub(crate) detail_for_report: String,
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

fn default_recoverable() -> bool {
    true
}

pub(crate) fn parse_conversion_output(output: &str) -> Result<ConversionSuccess, ConverterError> {
    let value: serde_json::Value = serde_json::from_str(output).map_err(parse_json_error)?;
    if value.get("ok").and_then(serde_json::Value::as_bool) == Some(false) {
        let error: ErrorOutput = serde_json::from_value(value).map_err(parse_json_error)?;
        return Err(converter_error_from_protocol_error(error.error));
    }

    ensure_supported_protocol(&value)?;
    serde_json::from_value(value).map_err(parse_json_error)
}

fn ensure_supported_protocol(value: &serde_json::Value) -> Result<(), ConverterError> {
    match value
        .get("protocolVersion")
        .and_then(serde_json::Value::as_str)
    {
        Some("1.0") => Ok(()),
        _ => Err(ConverterError {
            code: "UNSUPPORTED_CONVERTER_PROTOCOL".to_string(),
            message: "转换器协议版本不受支持。".to_string(),
            recoverable: false,
            safe_to_show: true,
            detail_for_report: "unsupported converter protocol".to_string(),
        }),
    }
}

fn parse_json_error(error: serde_json::Error) -> ConverterError {
    ConverterError {
        code: "OFFICE_CONVERTER_OUTPUT_INVALID".to_string(),
        message: "转换器输出无法解析。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    }
}

fn converter_error_from_protocol_error(error: ErrorBody) -> ConverterError {
    let message = match error.code.as_str() {
        "OFFICE_PASSWORD_PROTECTED" => "该 Office 文档受密码保护，暂不支持打开。",
        "UNSUPPORTED_OFFICE_FORMAT" => "暂不支持该 Office/WPS 文件格式。",
        "OFFICE_CONVERSION_TIMEOUT" => "Office 文档转换超时。",
        "OFFICE_OUTPUT_TOO_LARGE" => "转换结果过大，已停止处理。",
        "OFFICE_CONVERTER_OUTPUT_TOO_LARGE" => "转换器输出过大，已停止处理。",
        _ => "Office 文档转换失败。",
    };

    ConverterError {
        code: error.code,
        message: message.to_string(),
        recoverable: error.recoverable,
        safe_to_show: true,
        detail_for_report: limit_detail_for_report(error.detail_for_report),
    }
}

fn limit_detail_for_report(detail: String) -> String {
    if detail.len() <= DEFAULT_CONVERTER_DETAIL_LIMIT_BYTES {
        return detail;
    }

    let mut end = DEFAULT_CONVERTER_DETAIL_LIMIT_BYTES;
    while !detail.is_char_boundary(end) {
        end -= 1;
    }
    format!("{} [truncated]", &detail[..end])
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ConversionSessionPaths {
    pub(crate) session_dir: PathBuf,
    pub(crate) output_dir: PathBuf,
    pub(crate) profile_dir: PathBuf,
}

impl ConversionSessionPaths {
    pub(crate) fn new(root: &Path, session_id: &str) -> Self {
        let session_dir = root.join(session_id);
        Self {
            output_dir: session_dir.join("out"),
            profile_dir: session_dir.join("profile"),
            session_dir,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum OfficeConversionLayout {
    Preserve,
    FitWidthPreview,
}

pub(crate) fn conversion_args(
    input_path: &Path,
    output_dir: &Path,
    profile_dir: &Path,
    layout: OfficeConversionLayout,
) -> Vec<String> {
    vec![
        "--headless".to_string(),
        "--nologo".to_string(),
        "--nofirststartwizard".to_string(),
        "--nodefault".to_string(),
        "--norestore".to_string(),
        format!(
            "-env:UserInstallation=file:///{}",
            path_for_libreoffice_profile(profile_dir)
        ),
        "--convert-to".to_string(),
        libreoffice_pdf_filter_for_input(input_path, layout).to_string(),
        "--outdir".to_string(),
        output_dir.to_string_lossy().to_string(),
        input_path.to_string_lossy().to_string(),
    ]
}

fn libreoffice_pdf_filter_for_input(
    input_path: &Path,
    layout: OfficeConversionLayout,
) -> &'static str {
    match (office_file_type(input_path), layout) {
        (Ok("docx" | "doc" | "wps"), _) => "pdf:writer_pdf_Export",
        (Ok("xlsx" | "xls" | "et"), _) => "pdf:calc_pdf_Export",
        (Ok("pptx" | "ppt" | "dps"), _) => "pdf:impress_pdf_Export",
        _ => "pdf",
    }
}

fn path_for_libreoffice_profile(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[derive(Debug, Clone)]
pub(crate) struct ConverterCommandResult {
    pub(crate) exit_code: i32,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
}

pub(crate) trait ConverterCommandRunner {
    fn run(&self, args: &[String]) -> ConverterCommandResult;
}

pub(crate) struct LibreOfficeProcessRunner {
    executable_path: PathBuf,
}

impl LibreOfficeProcessRunner {
    pub(crate) fn new(executable_path: PathBuf) -> Self {
        Self { executable_path }
    }
}

impl ConverterCommandRunner for LibreOfficeProcessRunner {
    fn run(&self, args: &[String]) -> ConverterCommandResult {
        let started_at = Instant::now();
        let mut child = match Command::new(&self.executable_path)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(error) => {
                return ConverterCommandResult {
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: error.to_string(),
                }
            }
        };

        loop {
            match child.try_wait() {
                Ok(Some(_status)) => break,
                Ok(None) if started_at.elapsed() >= DEFAULT_LIBREOFFICE_TIMEOUT => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return ConverterCommandResult {
                        exit_code: -2,
                        stdout: String::new(),
                        stderr: format!(
                            "office converter timed out after {:?}",
                            DEFAULT_LIBREOFFICE_TIMEOUT
                        ),
                    };
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(10)),
                Err(error) => {
                    let _ = child.kill();
                    return ConverterCommandResult {
                        exit_code: -1,
                        stdout: String::new(),
                        stderr: error.to_string(),
                    };
                }
            }
        }

        let output = match child.wait_with_output() {
            Ok(output) => output,
            Err(error) => {
                return ConverterCommandResult {
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: error.to_string(),
                }
            }
        };

        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.len() > DEFAULT_LIBREOFFICE_STDERR_LIMIT_BYTES {
            return ConverterCommandResult {
                exit_code: -3,
                stdout: String::new(),
                stderr: format!(
                    "office converter stderr exceeded limit: {} > {} bytes",
                    stderr.len(),
                    DEFAULT_LIBREOFFICE_STDERR_LIMIT_BYTES
                ),
            };
        }

        let exit_code = output.status.code().unwrap_or(-1);
        if exit_code != 0 {
            return ConverterCommandResult {
                exit_code,
                stdout: String::new(),
                stderr,
            };
        }

        match libreoffice_success_result_from_args(args, started_at.elapsed().as_millis() as u64) {
            Ok(result) => ConverterCommandResult { stderr, ..result },
            Err(error) => ConverterCommandResult {
                exit_code: -1,
                stdout: String::new(),
                stderr: error.detail_for_report,
            },
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConversionSuccessOutput<'a> {
    ok: bool,
    protocol_version: &'a str,
    converter: ConversionSuccessConverter<'a>,
    input: ConversionSuccessInput<'a>,
    output: ConversionSuccessPdfOutput<'a>,
    duration_ms: u64,
    warnings: Vec<String>,
}

#[derive(Serialize)]
struct ConversionSuccessConverter<'a> {
    name: &'a str,
    version: &'a str,
    source: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConversionSuccessInput<'a> {
    file_type: &'a str,
    size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConversionSuccessPdfOutput<'a> {
    file_type: &'a str,
    path: String,
    size_bytes: u64,
}

pub(crate) fn libreoffice_success_result_from_args(
    args: &[String],
    duration_ms: u64,
) -> Result<ConverterCommandResult, ConverterError> {
    let input_path = args
        .last()
        .map(PathBuf::from)
        .ok_or_else(|| ConverterError {
            code: "OFFICE_CONVERSION_FAILED".to_string(),
            message: "Office 文档转换失败。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "missing input path argument".to_string(),
        })?;
    let outdir_index = args
        .iter()
        .position(|arg| arg == "--outdir")
        .ok_or_else(|| ConverterError {
            code: "OFFICE_CONVERSION_FAILED".to_string(),
            message: "Office 文档转换失败。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "missing --outdir argument".to_string(),
        })?;
    let output_dir = args
        .get(outdir_index + 1)
        .map(PathBuf::from)
        .ok_or_else(|| ConverterError {
            code: "OFFICE_CONVERSION_FAILED".to_string(),
            message: "Office 文档转换失败。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "missing --outdir value".to_string(),
        })?;
    let file_type = office_file_type(&input_path)?;
    let output_pdf = output_dir
        .join(
            input_path
                .file_stem()
                .and_then(|value| value.to_str())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or("converted"),
        )
        .with_extension("pdf");
    let output_metadata = std::fs::metadata(&output_pdf).map_err(|error| ConverterError {
        code: "OFFICE_OUTPUT_MISSING".to_string(),
        message: "Office 转换未生成可读取的 PDF。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("converted PDF metadata failed: {}", error.kind()),
    })?;
    let input_size_bytes = std::fs::metadata(&input_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let stdout = serde_json::to_string(&ConversionSuccessOutput {
        ok: true,
        protocol_version: "1.0",
        converter: ConversionSuccessConverter {
            name: "libreoffice",
            version: "unknown",
            source: "explicit-local-executable",
        },
        input: ConversionSuccessInput {
            file_type,
            size_bytes: input_size_bytes,
        },
        output: ConversionSuccessPdfOutput {
            file_type: "pdf",
            path: output_pdf.to_string_lossy().to_string(),
            size_bytes: output_metadata.len(),
        },
        duration_ms,
        warnings: vec![],
    })
    .map_err(|error| ConverterError {
        code: "OFFICE_CONVERTER_OUTPUT_INVALID".to_string(),
        message: "转换器输出无法解析。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    })?;

    Ok(ConverterCommandResult {
        exit_code: 0,
        stdout,
        stderr: String::new(),
    })
}

pub(crate) fn convert_with_runner(
    runner: &impl ConverterCommandRunner,
    input_path: &Path,
    paths: &ConversionSessionPaths,
    layout: OfficeConversionLayout,
) -> Result<ConversionSuccess, ConverterError> {
    let prepared_input = prepare_input_for_layout(input_path, paths, layout)?;
    let result = runner.run(&conversion_args(
        &prepared_input,
        &paths.output_dir,
        &paths.profile_dir,
        layout,
    ));
    if result.exit_code != 0 {
        if result.exit_code == -2 {
            return Err(ConverterError {
                code: "OFFICE_CONVERSION_TIMEOUT".to_string(),
                message: "Office 文档转换超时。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: limit_detail_for_report(result.stderr),
            });
        }
        if result.exit_code == -3 {
            return Err(ConverterError {
                code: "OFFICE_CONVERTER_OUTPUT_TOO_LARGE".to_string(),
                message: "转换器输出过大，已停止处理。".to_string(),
                recoverable: false,
                safe_to_show: true,
                detail_for_report: limit_detail_for_report(result.stderr),
            });
        }
        if !result.stdout.trim().is_empty() {
            if let Err(error) = parse_conversion_output(&result.stdout) {
                return Err(error);
            }
        }
        return Err(ConverterError {
            code: "OFFICE_CONVERSION_FAILED".to_string(),
            message: "Office 文档转换失败。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: limit_detail_for_report(result.stderr),
        });
    }

    parse_conversion_output(&result.stdout)
}

fn prepare_input_for_layout(
    input_path: &Path,
    paths: &ConversionSessionPaths,
    layout: OfficeConversionLayout,
) -> Result<PathBuf, ConverterError> {
    match (office_file_type(input_path)?, layout) {
        ("xlsx", OfficeConversionLayout::FitWidthPreview) => {
            let preview_dir = paths.session_dir.join("preview-input");
            std::fs::create_dir_all(&preview_dir).map_err(|error| ConverterError {
                code: "OFFICE_CACHE_IO_ERROR".to_string(),
                message: "无法准备 Office 转换缓存。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: format!("create preview input dir failed: {}", error.kind()),
            })?;
            let prepared = preview_dir.join(
                input_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or("preview.xlsx"),
            );
            write_xlsx_fit_width_preview_copy(input_path, &prepared)?;
            Ok(prepared)
        }
        _ => Ok(input_path.to_path_buf()),
    }
}

fn write_xlsx_fit_width_preview_copy(
    input_path: &Path,
    output_path: &Path,
) -> Result<(), ConverterError> {
    let input_file = File::open(input_path).map_err(|error| ConverterError {
        code: "OFFICE_INPUT_READ_FAILED".to_string(),
        message: "无法读取 Office 文档。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("open xlsx failed: {}", error.kind()),
    })?;
    let mut archive = ZipArchive::new(input_file).map_err(|error| ConverterError {
        code: "OFFICE_INPUT_READ_FAILED".to_string(),
        message: "无法读取 Office 文档。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("open xlsx zip failed: {error}"),
    })?;
    let output_file = File::create(output_path).map_err(|error| ConverterError {
        code: "OFFICE_CACHE_IO_ERROR".to_string(),
        message: "无法准备 Office 转换缓存。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("create preview xlsx failed: {}", error.kind()),
    })?;
    let mut writer = ZipWriter::new(output_file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|error| ConverterError {
            code: "OFFICE_INPUT_READ_FAILED".to_string(),
            message: "无法读取 Office 文档。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: format!("read xlsx zip entry failed: {error}"),
        })?;
        let name = file.name().to_string();
        if name.ends_with('/') {
            writer
                .add_directory(name, options)
                .map_err(zip_write_error)?;
            continue;
        }

        let mut data = Vec::new();
        file.read_to_end(&mut data)
            .map_err(|error| ConverterError {
                code: "OFFICE_INPUT_READ_FAILED".to_string(),
                message: "无法读取 Office 文档。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: format!("read xlsx zip entry bytes failed: {}", error.kind()),
            })?;

        let output_data = if is_xlsx_worksheet(&name) {
            fit_width_worksheet_xml(&String::from_utf8_lossy(&data)).into_bytes()
        } else {
            data
        };

        writer.start_file(name, options).map_err(zip_write_error)?;
        writer
            .write_all(&output_data)
            .map_err(|error| ConverterError {
                code: "OFFICE_CACHE_IO_ERROR".to_string(),
                message: "无法准备 Office 转换缓存。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: format!("write preview xlsx entry failed: {}", error.kind()),
            })?;
    }

    writer.finish().map_err(zip_write_error)?;
    Ok(())
}

fn is_xlsx_worksheet(name: &str) -> bool {
    name.starts_with("xl/worksheets/") && name.ends_with(".xml")
}

fn fit_width_worksheet_xml(xml: &str) -> String {
    let with_sheet_pr = ensure_fit_to_page_sheet_pr(xml);
    let page_setup =
        r#"<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>"#;
    if with_sheet_pr.contains("<pageSetup") {
        replace_empty_xml_element(&with_sheet_pr, "pageSetup", page_setup)
    } else if with_sheet_pr.contains("</worksheet>") {
        with_sheet_pr.replacen("</worksheet>", &format!("{page_setup}</worksheet>"), 1)
    } else {
        with_sheet_pr
    }
}

fn ensure_fit_to_page_sheet_pr(xml: &str) -> String {
    let page_setup_pr = r#"<pageSetUpPr fitToPage="1"/>"#;
    if xml.contains("<pageSetUpPr") {
        replace_empty_xml_element(xml, "pageSetUpPr", page_setup_pr)
    } else if xml.contains("<sheetPr") {
        xml.replacen("<sheetPr>", &format!("<sheetPr>{page_setup_pr}"), 1)
    } else if let Some(index) = worksheet_start_tag_end(xml) {
        let mut output = String::with_capacity(xml.len() + 64);
        output.push_str(&xml[..=index]);
        output.push_str("<sheetPr>");
        output.push_str(page_setup_pr);
        output.push_str("</sheetPr>");
        output.push_str(&xml[index + 1..]);
        output
    } else {
        xml.to_string()
    }
}

fn worksheet_start_tag_end(xml: &str) -> Option<usize> {
    let start = xml.find("<worksheet")?;
    xml[start..]
        .find('>')
        .map(|relative_end| start + relative_end)
}

fn replace_empty_xml_element(xml: &str, element: &str, replacement: &str) -> String {
    let start_pattern = format!("<{element}");
    let Some(start) = xml.find(&start_pattern) else {
        return xml.to_string();
    };
    let Some(relative_end) = xml[start..].find("/>") else {
        return xml.to_string();
    };
    let end = start + relative_end + 2;
    let mut output = String::with_capacity(xml.len() + replacement.len());
    output.push_str(&xml[..start]);
    output.push_str(replacement);
    output.push_str(&xml[end..]);
    output
}

fn zip_write_error(error: zip::result::ZipError) -> ConverterError {
    ConverterError {
        code: "OFFICE_CACHE_IO_ERROR".to_string(),
        message: "无法准备 Office 转换缓存。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("write preview xlsx zip failed: {error}"),
    }
}

pub(crate) fn office_file_type(path: &Path) -> Result<&'static str, ConverterError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match extension.as_str() {
        "docx" => Ok("docx"),
        "xlsx" => Ok("xlsx"),
        "pptx" => Ok("pptx"),
        "doc" => Ok("doc"),
        "xls" => Ok("xls"),
        "ppt" => Ok("ppt"),
        "wps" => Ok("wps"),
        "et" => Ok("et"),
        "dps" => Ok("dps"),
        _ => Err(ConverterError {
            code: "UNSUPPORTED_OFFICE_FORMAT".to_string(),
            message: "暂不支持该 Office/WPS 文件格式。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: format!("extension={extension}"),
        }),
    }
}

pub(crate) fn validate_office_input_package(
    input_path: &Path,
    file_type: &str,
) -> Result<(), ConverterError> {
    let expected_entry = match file_type {
        "docx" => "word/document.xml",
        "xlsx" => "xl/workbook.xml",
        "pptx" => "ppt/presentation.xml",
        "doc" | "xls" | "ppt" | "wps" | "et" | "dps" => return Ok(()),
        _ => {
            return Err(ConverterError {
                code: "UNSUPPORTED_OFFICE_FORMAT".to_string(),
                message: "暂不支持该 Office/WPS 文件格式。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: format!("file_type={file_type}"),
            });
        }
    };

    let input_file = File::open(input_path).map_err(|error| ConverterError {
        code: "OFFICE_INPUT_INVALID_PACKAGE".to_string(),
        message: "无法读取该 Office 文档。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("open office package failed: {}", error.kind()),
    })?;
    let mut archive = ZipArchive::new(input_file).map_err(|_| ConverterError {
        code: "OFFICE_INPUT_INVALID_PACKAGE".to_string(),
        message: "无法读取该 Office 文档。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: "office package is not a readable zip".to_string(),
    })?;

    if archive.by_name(expected_entry).is_err() {
        return Err(ConverterError {
            code: "OFFICE_INPUT_INVALID_PACKAGE".to_string(),
            message: "无法读取该 Office 文档。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: format!("missing main OOXML entry for file_type={file_type}"),
        });
    }

    Ok(())
}

pub(crate) fn validate_converted_pdf_output(
    output_dir: &Path,
    output_pdf: &Path,
    max_bytes: u64,
) -> Result<PathBuf, ConverterError> {
    if !output_pdf.starts_with(output_dir) || !output_pdf.is_file() {
        return Err(ConverterError {
            code: "OFFICE_OUTPUT_MISSING".to_string(),
            message: "Office 转换未生成可读取的 PDF。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "converted output missing or outside output dir".to_string(),
        });
    }

    let metadata = std::fs::metadata(output_pdf).map_err(|error| ConverterError {
        code: "OFFICE_OUTPUT_MISSING".to_string(),
        message: "Office 转换未生成可读取的 PDF。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("metadata failed: {}", error.kind()),
    })?;

    if metadata.len() > max_bytes {
        return Err(ConverterError {
            code: "OFFICE_OUTPUT_TOO_LARGE".to_string(),
            message: "转换结果过大，已停止处理。".to_string(),
            recoverable: false,
            safe_to_show: true,
            detail_for_report: format!("converted output bytes={}", metadata.len()),
        });
    }

    let bytes = std::fs::read(output_pdf).map_err(|error| ConverterError {
        code: "OFFICE_OUTPUT_MISSING".to_string(),
        message: "Office 转换未生成可读取的 PDF。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("read failed: {}", error.kind()),
    })?;

    if !bytes.starts_with(b"%PDF-") {
        return Err(ConverterError {
            code: "OFFICE_OUTPUT_MISSING".to_string(),
            message: "Office 转换未生成可读取的 PDF。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "converted output is not a PDF".to_string(),
        });
    }

    Ok(output_pdf.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_conversion_success_output() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "1.0",
            "converter": {
                "name": "libreoffice",
                "version": "24.2.7.2",
                "source": "ubuntu:24.04 apt"
            },
            "input": {
                "fileType": "docx",
                "sizeBytes": 971
            },
            "output": {
                "fileType": "pdf",
                "path": "D:/cache/office/session-001/output.pdf",
                "sizeBytes": 16232
            },
            "durationMs": 1200,
            "warnings": []
        }"#;

        let parsed = parse_conversion_output(output).expect("conversion output should parse");

        assert_eq!(parsed.protocol_version, "1.0");
        assert_eq!(parsed.converter.name, "libreoffice");
        assert_eq!(parsed.input.file_type, "docx");
        assert_eq!(parsed.output.file_type, "pdf");
        assert_eq!(parsed.output.size_bytes, 16232);
    }

    #[test]
    fn parse_conversion_error_uses_safe_message() {
        let output = r#"{
            "ok": false,
            "protocolVersion": "1.0",
            "error": {
                "code": "OFFICE_CONVERSION_FAILED",
                "message": "C:/Users/example/private.docx failed",
                "detailForReport": "exit=1 C:/Users/example/private.docx failed",
                "recoverable": true,
                "safeToShow": false
            }
        }"#;

        let error = parse_conversion_output(output).expect_err("error output should map");

        assert_eq!(error.code, "OFFICE_CONVERSION_FAILED");
        assert_eq!(error.message, "Office 文档转换失败。");
        assert!(error.recoverable);
        assert!(error.safe_to_show);
        assert!(error.detail_for_report.contains("exit=1"));
    }

    #[test]
    fn parse_conversion_error_recognizes_office_error_matrix() {
        for (code, expected_message, expected_recoverable) in [
            (
                "OFFICE_PASSWORD_PROTECTED",
                "该 Office 文档受密码保护，暂不支持打开。",
                true,
            ),
            (
                "UNSUPPORTED_OFFICE_FORMAT",
                "暂不支持该 Office/WPS 文件格式。",
                true,
            ),
            ("OFFICE_CONVERSION_TIMEOUT", "Office 文档转换超时。", true),
            (
                "OFFICE_OUTPUT_TOO_LARGE",
                "转换结果过大，已停止处理。",
                false,
            ),
            (
                "OFFICE_CONVERTER_OUTPUT_TOO_LARGE",
                "转换器输出过大，已停止处理。",
                false,
            ),
        ] {
            let output = format!(
                r#"{{
                    "ok": false,
                    "protocolVersion": "1.0",
                    "error": {{
                        "code": "{code}",
                        "message": "unsafe converter message with C:/Users/example/private.docx",
                        "detailForReport": "converter detail without document text",
                        "recoverable": {expected_recoverable},
                        "safeToShow": false
                    }}
                }}"#
            );

            let error = parse_conversion_output(&output).expect_err("error output should map");

            assert_eq!(error.code, code);
            assert_eq!(error.message, expected_message);
            assert_eq!(error.recoverable, expected_recoverable);
            assert!(error.safe_to_show);
            assert!(!error.message.contains("private.docx"));
        }
    }

    #[test]
    fn conversion_args_use_fixed_profile_outdir_and_input() {
        let args = conversion_args(
            std::path::Path::new("D:/input/simple-text.docx"),
            std::path::Path::new("D:/cache/session-001/out"),
            std::path::Path::new("D:/cache/session-001/profile"),
            OfficeConversionLayout::Preserve,
        );

        assert_eq!(args[0], "--headless");
        assert!(args.contains(&"--convert-to".to_string()));
        assert!(args.contains(&"pdf:writer_pdf_Export".to_string()));
        assert!(args.contains(&"--outdir".to_string()));
        assert!(args.contains(&"D:/cache/session-001/out".to_string()));
        assert!(args
            .iter()
            .any(|arg| arg.starts_with("-env:UserInstallation=file:///")));
        assert_eq!(args.last().unwrap(), "D:/input/simple-text.docx");
    }

    #[test]
    fn conversion_args_choose_pdf_export_filter_by_office_type() {
        let output_dir = std::path::Path::new("D:/cache/session-001/out");
        let profile_dir = std::path::Path::new("D:/cache/session-001/profile");

        let docx_args = conversion_args(
            std::path::Path::new("D:/input/simple-text.docx"),
            output_dir,
            profile_dir,
            OfficeConversionLayout::Preserve,
        );
        let xlsx_args = conversion_args(
            std::path::Path::new("D:/input/wide-sheet.xlsx"),
            output_dir,
            profile_dir,
            OfficeConversionLayout::Preserve,
        );
        let pptx_args = conversion_args(
            std::path::Path::new("D:/input/simple-slide.pptx"),
            output_dir,
            profile_dir,
            OfficeConversionLayout::Preserve,
        );
        let wps_args = conversion_args(
            std::path::Path::new("D:/input/simple-text.wps"),
            output_dir,
            profile_dir,
            OfficeConversionLayout::Preserve,
        );
        let et_args = conversion_args(
            std::path::Path::new("D:/input/simple-sheet.et"),
            output_dir,
            profile_dir,
            OfficeConversionLayout::Preserve,
        );
        let dps_args = conversion_args(
            std::path::Path::new("D:/input/simple-slide.dps"),
            output_dir,
            profile_dir,
            OfficeConversionLayout::Preserve,
        );

        assert!(docx_args.contains(&"pdf:writer_pdf_Export".to_string()));
        assert!(xlsx_args.contains(&"pdf:calc_pdf_Export".to_string()));
        assert!(!xlsx_args.iter().any(|arg| arg.contains("SinglePageSheets")));
        assert!(pptx_args.contains(&"pdf:impress_pdf_Export".to_string()));
        assert!(wps_args.contains(&"pdf:writer_pdf_Export".to_string()));
        assert!(et_args.contains(&"pdf:calc_pdf_Export".to_string()));
        assert!(dps_args.contains(&"pdf:impress_pdf_Export".to_string()));
    }

    #[test]
    fn conversion_args_fit_width_preview_uses_stable_export_filters() {
        let output_dir = std::path::Path::new("D:/cache/session-001/out");
        let profile_dir = std::path::Path::new("D:/cache/session-001/profile");

        let xlsx_args = conversion_args(
            std::path::Path::new("D:/input/wide-sheet.xlsx"),
            output_dir,
            profile_dir,
            OfficeConversionLayout::FitWidthPreview,
        );
        let docx_args = conversion_args(
            std::path::Path::new("D:/input/simple-text.docx"),
            output_dir,
            profile_dir,
            OfficeConversionLayout::FitWidthPreview,
        );
        let pptx_args = conversion_args(
            std::path::Path::new("D:/input/simple-slide.pptx"),
            output_dir,
            profile_dir,
            OfficeConversionLayout::FitWidthPreview,
        );

        assert!(xlsx_args.contains(&"pdf:calc_pdf_Export".to_string()));
        assert!(!xlsx_args.iter().any(|arg| arg.contains("SinglePageSheets")));
        assert!(docx_args.contains(&"pdf:writer_pdf_Export".to_string()));
        assert!(!docx_args.iter().any(|arg| arg.contains("SinglePageSheets")));
        assert!(pptx_args.contains(&"pdf:impress_pdf_Export".to_string()));
        assert!(!pptx_args.iter().any(|arg| arg.contains("SinglePageSheets")));
    }

    #[test]
    fn fit_width_preview_xlsx_uses_temporary_page_setup_copy() {
        let root = unique_temp_root("office-fit-width-copy");
        let input = root.join("wide-sheet.xlsx");
        let paths = ConversionSessionPaths::new(&root.join("cache"), "session-001");
        std::fs::create_dir_all(input.parent().unwrap()).expect("input parent should exist");
        write_minimal_xlsx(
            &input,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>left</t></is></c><c r="N1" t="inlineStr"><is><t>right</t></is></c></row>
  </sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  <pageSetup paperSize="9" orientation="portrait"/>
</worksheet>"#,
        );
        let original_bytes = std::fs::read(&input).expect("original xlsx should be readable");

        let prepared =
            prepare_input_for_layout(&input, &paths, OfficeConversionLayout::FitWidthPreview)
                .expect("fit width preview should prepare an XLSX input");

        assert_ne!(prepared, input);
        assert!(prepared.starts_with(&paths.session_dir));
        assert_eq!(
            prepared.extension().and_then(|value| value.to_str()),
            Some("xlsx")
        );
        let sheet_xml = read_zip_entry(&prepared, "xl/worksheets/sheet1.xml");
        assert!(sheet_xml.contains(
            r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr>"#
        ));
        assert!(sheet_xml.contains(r#"<pageSetUpPr fitToPage="1"/>"#));
        assert!(sheet_xml.contains(
            r#"<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>"#
        ));

        let args = conversion_args(
            &prepared,
            &paths.output_dir,
            &paths.profile_dir,
            OfficeConversionLayout::FitWidthPreview,
        );

        assert!(args.contains(&"pdf:calc_pdf_Export".to_string()));
        assert!(!args.iter().any(|arg| arg.contains("SinglePageSheets")));
        assert_eq!(
            std::fs::read(&input).expect("original xlsx should still be readable"),
            original_bytes
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn fit_width_preview_leaves_non_xlsx_inputs_unchanged() {
        let root = unique_temp_root("office-fit-width-non-xlsx");
        let input = root.join("simple-text.docx");
        let paths = ConversionSessionPaths::new(&root.join("cache"), "session-001");
        std::fs::create_dir_all(input.parent().unwrap()).expect("input parent should exist");
        std::fs::write(&input, b"placeholder").expect("input should exist");

        let prepared =
            prepare_input_for_layout(&input, &paths, OfficeConversionLayout::FitWidthPreview)
                .expect("non-xlsx input should be preserved");

        assert_eq!(prepared, input);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    #[ignore = "Requires LDV_OFFICE_CONVERTER_EXE and local node_modules; uses public wide XLSX fixture only"]
    fn real_libreoffice_fit_width_preview_preserves_public_wide_sheet_text() {
        let Ok(converter) = std::env::var("LDV_OFFICE_CONVERTER_EXE") else {
            eprintln!("skipping: LDV_OFFICE_CONVERTER_EXE is not set");
            return;
        };
        let converter_path = PathBuf::from(converter);
        if !converter_path.is_absolute() || !converter_path.exists() {
            eprintln!("skipping: LDV_OFFICE_CONVERTER_EXE must be an existing absolute path");
            return;
        }

        let repo_root = repo_root_from_cargo_manifest_dir();
        let input = repo_root
            .join("testdata")
            .join("public")
            .join("office")
            .join("wide-sheet.xlsx");
        assert!(input.exists(), "public wide XLSX fixture should exist");

        let root = unique_temp_root("office-real-fit-width-preview");
        let paths = ConversionSessionPaths::new(&root.join("cache"), "session-001");
        let runner = LibreOfficeProcessRunner::new(converter_path);
        let conversion = convert_with_runner(
            &runner,
            &input,
            &paths,
            OfficeConversionLayout::FitWidthPreview,
        )
        .expect("real LibreOffice fit-width preview conversion should succeed");
        let output_pdf = PathBuf::from(conversion.output.path);

        let pdf_bytes = std::fs::read(&output_pdf).expect("converted PDF should be readable");
        assert!(pdf_bytes.starts_with(b"%PDF-"));

        let extracted_text = extract_pdf_text_with_pdfjs(&repo_root, &output_pdf);
        assert!(
            extracted_text.contains("LDV wide XLSX left edge"),
            "fit-width preview should keep left cell text, got: {extracted_text}"
        );
        assert!(
            extracted_text.contains("公开人工 Office 宽表样本"),
            "fit-width preview should keep public Chinese cell text, got: {extracted_text}"
        );
        assert!(
            extracted_text.contains("LDV wide XLSX right edge"),
            "fit-width preview should keep right cell text, got: {extracted_text}"
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn conversion_session_paths_stay_under_cache_root() {
        let paths = ConversionSessionPaths::new(
            std::path::Path::new("D:/app-cache/office"),
            "office-session-001",
        );

        assert_eq!(
            paths.session_dir,
            std::path::Path::new("D:/app-cache/office/office-session-001")
        );
        assert_eq!(
            paths.output_dir,
            std::path::Path::new("D:/app-cache/office/office-session-001/out")
        );
        assert_eq!(
            paths.profile_dir,
            std::path::Path::new("D:/app-cache/office/office-session-001/profile")
        );
    }

    #[test]
    fn convert_with_runner_parses_success_stdout() {
        let runner = FakeConverterRunner {
            result: ConverterCommandResult {
                exit_code: 0,
                stdout: r#"{
                    "ok": true,
                    "protocolVersion": "1.0",
                    "converter": {"name": "libreoffice", "version": "24.2.7.2", "source": "test"},
                    "input": {"fileType": "docx", "sizeBytes": 971},
                    "output": {"fileType": "pdf", "path": "D:/cache/out/simple-text.pdf", "sizeBytes": 16232},
                    "durationMs": 1,
                    "warnings": []
                }"#
                .to_string(),
                stderr: String::new(),
            },
        };
        let paths = ConversionSessionPaths::new(std::path::Path::new("D:/cache"), "session-001");

        let output = convert_with_runner(
            &runner,
            std::path::Path::new("D:/input/simple-text.docx"),
            &paths,
            OfficeConversionLayout::Preserve,
        )
        .expect("fake conversion should parse");

        assert_eq!(output.output.file_type, "pdf");
        assert_eq!(output.output.size_bytes, 16232);
    }

    #[test]
    fn convert_with_runner_maps_nonzero_exit_to_safe_error() {
        let runner = FakeConverterRunner {
            result: ConverterCommandResult {
                exit_code: 1,
                stdout: String::new(),
                stderr: "C:/Users/example/private.docx failed".to_string(),
            },
        };
        let paths = ConversionSessionPaths::new(std::path::Path::new("D:/cache"), "session-001");

        let error = convert_with_runner(
            &runner,
            std::path::Path::new("D:/input/simple-text.docx"),
            &paths,
            OfficeConversionLayout::Preserve,
        )
        .expect_err("nonzero exit should map");

        assert_eq!(error.code, "OFFICE_CONVERSION_FAILED");
        assert_eq!(error.message, "Office 文档转换失败。");
        assert!(error.safe_to_show);
    }

    #[test]
    fn convert_with_runner_maps_timeout_to_office_timeout() {
        let runner = FakeConverterRunner {
            result: ConverterCommandResult {
                exit_code: -2,
                stdout: String::new(),
                stderr: "office converter timed out after 120s".to_string(),
            },
        };
        let paths = ConversionSessionPaths::new(std::path::Path::new("D:/cache"), "session-001");

        let error = convert_with_runner(
            &runner,
            std::path::Path::new("D:/input/simple-text.docx"),
            &paths,
            OfficeConversionLayout::Preserve,
        )
        .expect_err("timeout should map");

        assert_eq!(error.code, "OFFICE_CONVERSION_TIMEOUT");
        assert_eq!(error.message, "Office 文档转换超时。");
        assert!(error.safe_to_show);
    }

    #[test]
    fn libreoffice_success_result_from_args_uses_fixed_output_pdf() {
        let root = unique_temp_root("office-libreoffice-success");
        let input = root.join("simple-text.docx");
        let output_dir = root.join("out");
        let profile_dir = root.join("profile");
        std::fs::create_dir_all(&output_dir).expect("output dir should exist");
        std::fs::write(&input, b"placeholder").expect("input should exist");
        let output_pdf = output_dir.join("simple-text.pdf");
        std::fs::write(&output_pdf, b"%PDF-1.7\n").expect("output PDF should exist");
        let args = conversion_args(
            &input,
            &output_dir,
            &profile_dir,
            OfficeConversionLayout::Preserve,
        );

        let result = libreoffice_success_result_from_args(&args, 42)
            .expect("LibreOffice result should be synthesized");
        let parsed = parse_conversion_output(&result.stdout).expect("stdout should parse");

        assert_eq!(result.exit_code, 0);
        assert_eq!(parsed.converter.name, "libreoffice");
        assert_eq!(parsed.converter.source, "explicit-local-executable");
        assert_eq!(parsed.input.file_type, "docx");
        assert_eq!(parsed.output.file_type, "pdf");
        assert_eq!(PathBuf::from(parsed.output.path), output_pdf);
        assert_eq!(parsed.duration_ms, 42);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn office_file_type_accepts_current_office_and_wps_formats() {
        for extension in ["docx", "xlsx", "pptx", "doc", "xls", "ppt", "wps", "et", "dps"] {
            let path = std::path::PathBuf::from(format!("a.{extension}"));
            assert_eq!(office_file_type(&path).unwrap(), extension);
        }
    }

    #[test]
    fn converted_pdf_output_must_exist_under_output_dir() {
        let root = unique_temp_root("office-output");
        let output_dir = root.join("out");
        std::fs::create_dir_all(&output_dir).expect("output dir should exist");
        let pdf = output_dir.join("simple-text.pdf");
        std::fs::write(&pdf, b"%PDF-1.7\n").expect("pdf should be written");

        let output = validate_converted_pdf_output(&output_dir, &pdf, 1024)
            .expect("converted pdf should be accepted");

        assert_eq!(output, pdf);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn converted_pdf_output_rejects_parent_escape() {
        let root = unique_temp_root("office-output-escape");
        let output_dir = root.join("out");
        let outside = root.join("outside.pdf");
        std::fs::create_dir_all(&output_dir).expect("output dir should exist");
        std::fs::write(&outside, b"%PDF-1.7\n").expect("outside pdf should be written");

        let error = validate_converted_pdf_output(&output_dir, &outside, 1024)
            .expect_err("outside output should be rejected");

        assert_eq!(error.code, "OFFICE_OUTPUT_MISSING");
        let _ = std::fs::remove_dir_all(root);
    }

    struct FakeConverterRunner {
        result: ConverterCommandResult,
    }

    impl ConverterCommandRunner for FakeConverterRunner {
        fn run(&self, _args: &[String]) -> ConverterCommandResult {
            self.result.clone()
        }
    }

    fn unique_temp_root(prefix: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "ldv-{prefix}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time should be after unix epoch")
                .as_nanos()
        ))
    }

    fn repo_root_from_cargo_manifest_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|path| path.parent())
            .and_then(|path| path.parent())
            .expect("CARGO_MANIFEST_DIR should be under apps/desktop-tauri/src-tauri")
            .to_path_buf()
    }

    fn extract_pdf_text_with_pdfjs(
        repo_root: &std::path::Path,
        pdf_path: &std::path::Path,
    ) -> String {
        let desktop_root = repo_root.join("apps").join("desktop-tauri");
        let script = r#"
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const pdfPath = process.env.LDV_TEST_PDF_PATH;
  const desktopRoot = process.env.LDV_TEST_DESKTOP_ROOT;
  const pdfjs = await import(pathToFileURL(path.join(desktopRoot, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs")).href);
  const standardFontDataUrl = `${path.join(desktopRoot, "node_modules", "pdfjs-dist", "standard_fonts").replaceAll("\\", "/")}/`;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(pdfPath)),
    disableWorker: true,
    disableRange: true,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: true,
    useWasm: false,
    useWorkerFetch: false,
    standardFontDataUrl,
  });
  const document = await loadingTask.promise;
  const parts = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      parts.push(textContent.items.map((item) => item.str).join(" "));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  process.stdout.write(parts.join("\n").replace(/\s+/g, " ").trim());
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
"#;
        let output = std::process::Command::new("node")
            .arg("-e")
            .arg(script)
            .env("LDV_TEST_PDF_PATH", pdf_path)
            .env("LDV_TEST_DESKTOP_ROOT", desktop_root)
            .output()
            .expect("node should run PDF.js text extraction");
        assert!(
            output.status.success(),
            "PDF.js extraction failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).to_string()
    }

    fn write_minimal_xlsx(path: &std::path::Path, sheet_xml: &str) {
        let file = File::create(path).expect("xlsx should be created");
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (name, data) in [
            (
                "[Content_Types].xml",
                r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"#,
            ),
            (
                "_rels/.rels",
                r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#,
            ),
            (
                "xl/_rels/workbook.xml.rels",
                r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"#,
            ),
            (
                "xl/workbook.xml",
                r#"<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="WidePublicFixture" sheetId="1" r:id="rId1"/></sheets>
</workbook>"#,
            ),
            ("xl/worksheets/sheet1.xml", sheet_xml),
        ] {
            writer
                .start_file(name, options)
                .expect("entry should start");
            writer
                .write_all(data.as_bytes())
                .expect("entry should be written");
        }
        writer.finish().expect("xlsx should finish");
    }

    fn read_zip_entry(path: &std::path::Path, name: &str) -> String {
        let file = File::open(path).expect("zip should open");
        let mut archive = ZipArchive::new(file).expect("zip should parse");
        let mut entry = archive.by_name(name).expect("entry should exist");
        let mut output = String::new();
        entry
            .read_to_string(&mut output)
            .expect("entry should be utf8");
        output
    }
}
