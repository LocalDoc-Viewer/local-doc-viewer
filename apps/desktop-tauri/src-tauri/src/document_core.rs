use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

use crate::cache_policy::{
    page_image_name, prune_cache_to_budget, remove_cache_session_dir,
    remove_cache_session_dirs_except, session_cache_dir, DEFAULT_MAX_RENDER_CACHE_BYTES,
    DEFAULT_MAX_RENDER_CACHE_ENTRIES,
};
use crate::office_converter::{
    convert_with_runner, office_file_type, validate_converted_pdf_output,
    validate_office_input_package, ConversionSessionPaths, ConverterCommandRunner, ConverterError,
    LibreOfficeProcessRunner, OfficeConversionLayout,
};
use crate::renderer_sidecar::{
    dev_wrapper_command_spec, inspect_with_runner, packaged_ofd_renderer_resource_command_spec,
    packaged_ofd_renderer_resource_exists, render_with_runner, text_with_runner,
    version_with_runner, CommandRunner, InspectSuccess, RenderSuccess, SidecarCommandSpec,
    SidecarError, TextSuccess, VersionSuccess,
};

#[derive(Debug, Clone, Serialize)]
pub(crate) struct EngineInfo {
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) protocol_version: String,
    pub(crate) capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PageInfo {
    pub(crate) index: u32,
    pub(crate) width_pt: f64,
    pub(crate) height_pt: f64,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DocumentSession {
    pub(crate) id: String,
    pub(crate) file_type: String,
    pub(crate) page_count: u32,
    pub(crate) page_sizes: Vec<PageInfo>,
    pub(crate) engine: EngineInfo,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct PageBitmap {
    pub(crate) session_id: String,
    pub(crate) page_index: u32,
    pub(crate) scale: f64,
    pub(crate) width_px: u32,
    pub(crate) height_px: u32,
    pub(crate) image_ref: String,
    pub(crate) duration_ms: u64,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct OfdTextView {
    pub(crate) session_id: String,
    pub(crate) page_count: u32,
    pub(crate) pages: Vec<OfdTextPageView>,
    pub(crate) duration_ms: u64,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct OfdTextPageView {
    pub(crate) index: u32,
    pub(crate) width_pt: f64,
    pub(crate) height_pt: f64,
    pub(crate) text: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct RenderError {
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) recoverable: bool,
    pub(crate) safe_to_show: bool,
    pub(crate) detail_for_report: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct CacheCleanupView {
    pub(crate) removed_session_count: usize,
    pub(crate) removed_file_count: usize,
}

#[derive(Debug, Serialize)]
pub(crate) struct OfficePdfOpenResult {
    pub(crate) session_id: String,
    pub(crate) original_file_type: String,
    pub(crate) display_name: String,
    pub(crate) output_pdf_size_bytes: u64,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub(crate) struct OfficeConverterTestResult {
    pub(crate) ok: bool,
    pub(crate) message: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct TextDocumentView {
    pub(crate) session_id: String,
    pub(crate) file_type: String,
    pub(crate) display_name: String,
    pub(crate) text: String,
    pub(crate) size_bytes: u64,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct ImageDocumentView {
    pub(crate) session_id: String,
    pub(crate) file_type: String,
    pub(crate) display_name: String,
    pub(crate) source_path: String,
    pub(crate) width_px: u32,
    pub(crate) height_px: u32,
    pub(crate) size_bytes: u64,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct OfficeConverterConfig {
    executable_path: Option<PathBuf>,
}

impl OfficeConverterConfig {
    const ENV_KEY: &'static str = "LDV_OFFICE_CONVERTER_EXE";

    pub(crate) fn disabled() -> Self {
        Self {
            executable_path: None,
        }
    }

    #[allow(dead_code)]
    pub(crate) fn executable(path: PathBuf) -> Self {
        Self {
            executable_path: Some(path),
        }
    }

    fn is_disabled(&self) -> bool {
        self.executable_path.is_none()
    }

    #[allow(dead_code)]
    fn from_setting_or_env_value(setting_value: Option<&str>, env_value: Option<&str>) -> Self {
        if setting_value
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
        {
            return Self::from_env_value(setting_value);
        }
        Self::from_env_value(env_value)
    }

    #[allow(dead_code)]
    fn from_env_value(value: Option<&str>) -> Self {
        let Some(raw_path) = value.map(str::trim).filter(|value| !value.is_empty()) else {
            return Self::disabled();
        };
        let path = PathBuf::from(raw_path);
        if !path.is_absolute() || !path.is_file() {
            return Self::disabled();
        }
        Self::executable(path)
    }
}

const PUBLIC_OFD_SAMPLES: &[(&str, &str)] = &[
    (
        "s4c-public-embedded-font-text",
        "s4c-public-embedded-font-text.ofd",
    ),
    ("p0-single-page-text", "p0-single-page-text.ofd"),
    ("p0-multi-page-text", "p0-multi-page-text.ofd"),
    ("p0-corrupt-missing-ofdxml", "p0-corrupt-missing-ofdxml.ofd"),
    ("p0-not-ofd-renamed", "p0-not-ofd-renamed.ofd"),
];

const DEFAULT_MAX_LOCAL_OFD_BYTES: u64 = 50 * 1024 * 1024;
const DEFAULT_MAX_LOCAL_PDF_BYTES: u64 = 50 * 1024 * 1024;
const DEFAULT_MAX_LOCAL_TEXT_BYTES: u64 = 10 * 1024 * 1024;
const DEFAULT_MAX_LOCAL_IMAGE_BYTES: u64 = 50 * 1024 * 1024;
const DEFAULT_MAX_RECENT_FILES: usize = 20;
const RECENT_FILES_STORAGE_NAME: &str = "recent-files.json";

#[derive(Default)]
pub(crate) struct LocalDocumentRegistry {
    paths: Mutex<HashMap<String, PathBuf>>,
    ofd_sessions: Mutex<HashMap<String, DocumentSession>>,
    office_conversions: Mutex<HashMap<String, OfficeConversionRegistryEntry>>,
}

impl LocalDocumentRegistry {
    pub(crate) fn remember(&self, session_id: &str, path: &Path) {
        let mut paths = self.paths.lock().expect("local registry mutex poisoned");
        paths.insert(session_id.to_string(), path.to_path_buf());
    }

    pub(crate) fn path_for(&self, session_id: &str) -> Option<PathBuf> {
        let paths = self.paths.lock().expect("local registry mutex poisoned");
        paths.get(session_id).cloned()
    }

    pub(crate) fn remember_ofd_session(&self, session: &DocumentSession, path: &Path) {
        self.remember(&session.id, path);
        let mut sessions = self
            .ofd_sessions
            .lock()
            .expect("OFD session registry mutex poisoned");
        sessions.insert(session.id.clone(), session.clone());
    }

    pub(crate) fn ofd_session_for(&self, session_id: &str) -> Option<DocumentSession> {
        let sessions = self
            .ofd_sessions
            .lock()
            .expect("OFD session registry mutex poisoned");
        sessions.get(session_id).cloned()
    }

    pub(crate) fn remember_office_conversion(
        &self,
        session_id: &str,
        original_path: &Path,
        converted_pdf_path: &Path,
    ) {
        let mut entries = self
            .office_conversions
            .lock()
            .expect("office registry mutex poisoned");
        entries.insert(
            session_id.to_string(),
            OfficeConversionRegistryEntry {
                original_path: original_path.to_path_buf(),
                converted_pdf_path: converted_pdf_path.to_path_buf(),
            },
        );
    }

    pub(crate) fn office_conversion_for(
        &self,
        session_id: &str,
    ) -> Option<OfficeConversionRegistryEntry> {
        let entries = self
            .office_conversions
            .lock()
            .expect("office registry mutex poisoned");
        entries.get(session_id).cloned()
    }

    #[allow(dead_code)]
    pub(crate) fn forget(&self, session_id: &str) -> bool {
        let mut paths = self.paths.lock().expect("local registry mutex poisoned");
        let removed_path = paths.remove(session_id).is_some();
        let mut sessions = self
            .ofd_sessions
            .lock()
            .expect("OFD session registry mutex poisoned");
        let removed_session = sessions.remove(session_id).is_some();
        removed_path || removed_session
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct OfficeConversionRegistryEntry {
    pub(crate) original_path: PathBuf,
    pub(crate) converted_pdf_path: PathBuf,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[allow(dead_code)]
struct RecentFilesData {
    enabled: bool,
    entries: Vec<RecentFileEntry>,
}

impl Default for RecentFilesData {
    fn default() -> Self {
        Self {
            enabled: true,
            entries: vec![],
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[allow(dead_code)]
struct RecentFileEntry {
    id: String,
    absolute_path: String,
    display_name: String,
    file_type: String,
    opened_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub(crate) struct RecentFilesView {
    pub(crate) enabled: bool,
    pub(crate) entries: Vec<RecentFileView>,
}

#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub(crate) struct RecentFileView {
    pub(crate) id: String,
    pub(crate) display_name: String,
    pub(crate) file_type: String,
    pub(crate) opened_at: String,
    pub(crate) location_hint: Option<String>,
}

#[allow(dead_code)]
pub(crate) struct RecentFilesStore {
    storage_path: PathBuf,
    max_entries: usize,
}

#[allow(dead_code)]
impl RecentFilesStore {
    pub(crate) fn new(storage_path: PathBuf, max_entries: usize) -> Self {
        Self {
            storage_path,
            max_entries,
        }
    }

    pub(crate) fn list_recent_files(&self) -> Result<RecentFilesView, RenderError> {
        let data = self.load_data();
        Ok(recent_files_view_from_data(data))
    }

    pub(crate) fn record_opened_ofd(
        &self,
        path: &Path,
        opened_at: &str,
    ) -> Result<RecentFileView, RenderError> {
        self.record_opened_document(path, "ofd", opened_at)
    }

    pub(crate) fn record_opened_pdf(
        &self,
        path: &Path,
        opened_at: &str,
    ) -> Result<RecentFileView, RenderError> {
        self.record_opened_document(path, "pdf", opened_at)
    }

    pub(crate) fn record_opened_text(
        &self,
        path: &Path,
        file_type: &str,
        opened_at: &str,
    ) -> Result<RecentFileView, RenderError> {
        match file_type {
            "txt" | "log" | "csv" | "md" => {
                self.record_opened_document(path, file_type, opened_at)
            }
            _ => Err(RenderError {
                code: "UNSUPPORTED_FILE_TYPE".to_string(),
                message: "不支持的文件类型。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: "unsupported text file_type".to_string(),
            }),
        }
    }

    pub(crate) fn record_opened_image(
        &self,
        path: &Path,
        file_type: &str,
        opened_at: &str,
    ) -> Result<RecentFileView, RenderError> {
        match file_type {
            "png" | "jpg" | "jpeg" | "webp" => {
                self.record_opened_document(path, file_type, opened_at)
            }
            _ => Err(RenderError {
                code: "UNSUPPORTED_FILE_TYPE".to_string(),
                message: "不支持的文件类型。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: "unsupported image file_type".to_string(),
            }),
        }
    }

    pub(crate) fn record_opened_office(
        &self,
        path: &Path,
        file_type: &str,
        opened_at: &str,
    ) -> Result<RecentFileView, RenderError> {
        match file_type {
            "docx" | "xlsx" | "pptx" | "doc" | "xls" | "ppt" | "wps" | "et" | "dps" => {
                self.record_opened_document(path, file_type, opened_at)
            }
            _ => Err(RenderError {
                code: "UNSUPPORTED_OFFICE_FORMAT".to_string(),
                message: "暂不支持该 Office/WPS 文件格式。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: format!("recent office file_type={file_type}"),
            }),
        }
    }

    fn record_opened_document(
        &self,
        path: &Path,
        file_type: &str,
        opened_at: &str,
    ) -> Result<RecentFileView, RenderError> {
        let id = recent_file_id_for_path(path);
        let display_name = recent_display_name(path);
        let view = RecentFileView {
            id: id.clone(),
            display_name: display_name.clone(),
            file_type: file_type.to_string(),
            opened_at: opened_at.to_string(),
            location_hint: recent_location_hint(path),
        };

        let mut data = self.load_data();
        if !data.enabled {
            return Ok(view);
        }

        data.entries.retain(|entry| entry.id != id);
        data.entries.insert(
            0,
            RecentFileEntry {
                id,
                absolute_path: path.to_string_lossy().to_string(),
                display_name,
                file_type: file_type.to_string(),
                opened_at: opened_at.to_string(),
            },
        );
        data.entries.truncate(self.max_entries);
        self.save_data(&data)?;
        Ok(view)
    }

    pub(crate) fn set_recent_files_enabled(
        &self,
        enabled: bool,
    ) -> Result<RecentFilesView, RenderError> {
        let mut data = self.load_data();
        data.enabled = enabled;
        self.save_data(&data)?;
        Ok(recent_files_view_from_data(data))
    }

    pub(crate) fn remove_recent_file(&self, id: &str) -> Result<bool, RenderError> {
        let mut data = self.load_data();
        let before = data.entries.len();
        data.entries.retain(|entry| entry.id != id);
        let removed = data.entries.len() != before;
        if removed {
            self.save_data(&data)?;
        }
        Ok(removed)
    }

    pub(crate) fn clear_recent_files(&self) -> Result<(), RenderError> {
        let mut data = self.load_data();
        data.entries.clear();
        self.save_data(&data)
    }

    pub(crate) fn path_for_recent_id(&self, id: &str) -> Option<PathBuf> {
        self.load_data()
            .entries
            .into_iter()
            .find(|entry| entry.id == id)
            .map(|entry| PathBuf::from(entry.absolute_path))
    }

    fn load_data(&self) -> RecentFilesData {
        let Ok(text) = std::fs::read_to_string(&self.storage_path) else {
            return RecentFilesData::default();
        };
        serde_json::from_str(&text).unwrap_or_default()
    }

    fn save_data(&self, data: &RecentFilesData) -> Result<(), RenderError> {
        if let Some(parent) = self.storage_path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| recent_files_io_error(error))?;
        }
        let text = serde_json::to_string_pretty(data).map_err(|error| RenderError {
            code: "RECENT_FILES_WRITE_FAILED".to_string(),
            message: "无法保存最近文件。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: error.to_string(),
        })?;
        std::fs::write(&self.storage_path, text).map_err(recent_files_io_error)
    }
}

#[allow(dead_code)]
fn recent_files_io_error(error: std::io::Error) -> RenderError {
    RenderError {
        code: "RECENT_FILES_WRITE_FAILED".to_string(),
        message: "无法保存最近文件。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    }
}

#[allow(dead_code)]
fn recent_files_view_from_data(data: RecentFilesData) -> RecentFilesView {
    RecentFilesView {
        enabled: data.enabled,
        entries: data
            .entries
            .into_iter()
            .map(|entry| RecentFileView {
                id: entry.id,
                display_name: entry.display_name,
                file_type: entry.file_type,
                opened_at: entry.opened_at,
                location_hint: recent_location_hint(Path::new(&entry.absolute_path)),
            })
            .collect(),
    }
}

#[allow(dead_code)]
fn recent_display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("本地 OFD")
        .to_string()
}

#[allow(dead_code)]
fn recent_location_hint(path: &Path) -> Option<String> {
    let parent = path.parent()?;
    let mut parts: Vec<String> = parent
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            Component::Prefix(value) => Some(value.as_os_str().to_string_lossy().to_string()),
            _ => None,
        })
        .filter(|part| !part.trim().is_empty())
        .collect();

    if parts.is_empty() {
        return None;
    }

    let keep = parts.len().min(2);
    let shown = parts.split_off(parts.len() - keep);
    let separator = std::path::MAIN_SEPARATOR.to_string();
    let tail = shown.join(&separator);
    if parts.is_empty() {
        Some(tail)
    } else {
        Some(format!("...{}{}", separator, tail))
    }
}

#[allow(dead_code)]
fn recent_file_id_for_path(path: &Path) -> String {
    let mut normalized = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        normalized = normalized.to_lowercase();
    }

    let mut hash = 0xcbf29ce484222325u64;
    for byte in normalized.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn current_opened_at() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn local_session_id_for_path(path: &Path) -> String {
    let path_id = recent_file_id_for_path(path);
    let version = local_file_version_for_session_id(path);
    let mut hash = 0xcbf29ce484222325u64;
    for byte in format!("{path_id}:{version}").as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("local-{hash:016x}")
}

fn local_file_version_for_session_id(path: &Path) -> String {
    let Ok(metadata) = std::fs::metadata(path) else {
        return "missing".to_string();
    };
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("{}:{modified_ms}", metadata.len())
}

fn recent_files_store_for_app_data_dir(app_data_dir: &Path) -> RecentFilesStore {
    RecentFilesStore::new(
        app_data_dir.join(RECENT_FILES_STORAGE_NAME),
        DEFAULT_MAX_RECENT_FILES,
    )
}

fn recent_files_store_from_app(app: &tauri::AppHandle) -> Result<RecentFilesStore, RenderError> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| RenderError {
        code: "RECENT_FILES_UNAVAILABLE".to_string(),
        message: "无法访问最近文件存储。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    })?;

    Ok(recent_files_store_for_app_data_dir(&app_data_dir))
}

fn office_conversion_cache_root_from_app(app: &tauri::AppHandle) -> Result<PathBuf, RenderError> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join("office-conversions"))
        .map_err(|error| RenderError {
            code: "OFFICE_CACHE_UNAVAILABLE".to_string(),
            message: "无法访问 Office 转换缓存。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: error.to_string(),
        })
}

fn recent_file_path_for_id(store: &RecentFilesStore, id: &str) -> Result<PathBuf, RenderError> {
    store.path_for_recent_id(id).ok_or_else(|| RenderError {
        code: "RECENT_FILE_NOT_FOUND".to_string(),
        message: "未找到这条最近文件记录。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: "recent file id not found".to_string(),
    })
}

#[tauri::command]
pub(crate) fn list_recent_files(app: tauri::AppHandle) -> Result<RecentFilesView, RenderError> {
    recent_files_store_from_app(&app)?.list_recent_files()
}

#[tauri::command]
pub(crate) fn set_recent_files_enabled(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<RecentFilesView, RenderError> {
    recent_files_store_from_app(&app)?.set_recent_files_enabled(enabled)
}

#[tauri::command]
pub(crate) fn remove_recent_file(
    app: tauri::AppHandle,
    id: String,
) -> Result<RecentFilesView, RenderError> {
    let store = recent_files_store_from_app(&app)?;
    store.remove_recent_file(&id)?;
    store.list_recent_files()
}

#[tauri::command]
pub(crate) fn clear_recent_files(app: tauri::AppHandle) -> Result<RecentFilesView, RenderError> {
    let store = recent_files_store_from_app(&app)?;
    store.clear_recent_files()?;
    store.list_recent_files()
}

#[tauri::command]
pub(crate) fn record_opened_pdf(
    app: tauri::AppHandle,
    path: String,
) -> Result<RecentFilesView, RenderError> {
    let selected_path = PathBuf::from(path);
    validate_local_pdf_path(&selected_path)?;
    let store = recent_files_store_from_app(&app)?;
    store.record_opened_pdf(&selected_path, &current_opened_at())?;
    store.list_recent_files()
}

#[tauri::command]
pub(crate) fn read_recent_pdf_bytes(
    app: tauri::AppHandle,
    id: String,
) -> Result<Vec<u8>, RenderError> {
    let store = recent_files_store_from_app(&app)?;
    let path = recent_file_path_for_id(&store, &id)?;
    read_local_pdf_bytes_for_test(&path)
}

#[tauri::command]
pub(crate) fn record_recent_pdf_opened(
    app: tauri::AppHandle,
    id: String,
) -> Result<RecentFilesView, RenderError> {
    let store = recent_files_store_from_app(&app)?;
    record_recent_pdf_opened_with_store_for_test(&store, &id, &current_opened_at())
}

#[tauri::command]
pub(crate) fn open_recent_file(
    app: tauri::AppHandle,
    registry: tauri::State<LocalDocumentRegistry>,
    id: String,
) -> Result<DocumentSession, RenderError> {
    let store = recent_files_store_from_app(&app)?;
    let packaged_resource_root = available_packaged_resource_root_from_app(&app)?;
    let dev_wrapper_script = default_dev_wrapper_script();
    let runner = default_ofd_renderer_command_spec_for_available_resources(
        packaged_resource_root.as_deref(),
        dev_wrapper_script.as_deref(),
    )?
    .into_process_runner();

    open_recent_file_with_runner(&registry, &runner, &store, &id, &current_opened_at())
}

#[tauri::command]
pub(crate) fn open_fake_document() -> Result<DocumentSession, RenderError> {
    let pages = vec![
        PageInfo {
            index: 0,
            width_pt: 210.0,
            height_pt: 297.0,
        },
        PageInfo {
            index: 1,
            width_pt: 210.0,
            height_pt: 297.0,
        },
        PageInfo {
            index: 2,
            width_pt: 210.0,
            height_pt: 297.0,
        },
    ];

    Ok(DocumentSession {
        id: "fake-session-001".to_string(),
        file_type: "fake".to_string(),
        page_count: pages.len() as u32,
        page_sizes: pages,
        engine: EngineInfo {
            name: "fake".to_string(),
            version: "0.1.0".to_string(),
            protocol_version: "1.0".to_string(),
            capabilities: vec!["metadata".to_string(), "renderPagePng".to_string()],
        },
        warnings: vec![],
    })
}

#[tauri::command]
pub(crate) fn open_public_sample(sample_id: String) -> Result<DocumentSession, RenderError> {
    public_sample_filename(&sample_id)?;
    open_fake_document()
}

#[tauri::command]
pub(crate) fn open_public_sample_with_dev_renderer(
    sample_id: String,
) -> Result<DocumentSession, RenderError> {
    let repo_root = dev_repo_root();
    let script = repo_root.join("scripts/dev/ofd-renderer-cli.ps1");
    let public_root = repo_root.join("testdata/public/ofd");

    public_sample_session_with_dev_wrapper(&script, true, &public_root, &sample_id)
}

#[tauri::command]
pub(crate) fn render_public_sample_page_with_dev_renderer(
    sample_id: String,
    page_index: u32,
    scale: f64,
) -> Result<PageBitmap, RenderError> {
    let repo_root = dev_repo_root();
    let script = repo_root.join("scripts/dev/ofd-renderer-cli.ps1");
    let public_root = repo_root.join("testdata/public/ofd");
    let cache_root = repo_root.join("tmp/ofd-renderer-cli/tauri-dev");

    public_sample_page_with_dev_wrapper(
        &script,
        true,
        &repo_root,
        &public_root,
        &cache_root,
        &sample_id,
        page_index,
        scale,
    )
}

#[tauri::command]
pub(crate) fn open_local_ofd_with_dev_renderer(
    registry: tauri::State<LocalDocumentRegistry>,
    path: String,
) -> Result<DocumentSession, RenderError> {
    open_local_ofd_with_dev_renderer_state(&registry, path)
}

#[tauri::command]
pub(crate) fn open_local_ofd(
    app: tauri::AppHandle,
    registry: tauri::State<LocalDocumentRegistry>,
    path: String,
) -> Result<DocumentSession, RenderError> {
    let packaged_resource_root = available_packaged_resource_root_from_app(&app)?;
    let dev_wrapper_script = default_dev_wrapper_script();
    let recent_files = recent_files_store_from_app(&app)?;

    open_local_ofd_with_default_renderer_state_and_recent_files(
        &registry,
        path,
        packaged_resource_root.as_deref(),
        dev_wrapper_script.as_deref(),
        &recent_files,
        &current_opened_at(),
    )
}

#[tauri::command]
pub(crate) fn open_local_document(
    app: tauri::AppHandle,
    registry: tauri::State<LocalDocumentRegistry>,
    path: String,
) -> Result<DocumentSession, RenderError> {
    match local_document_extension(Path::new(&path))? {
        LocalDocumentType::Ofd => open_local_ofd(app, registry, path),
        LocalDocumentType::Pdf => Err(pdf_not_implemented_error()),
        LocalDocumentType::Office(file_type) => {
            let _ = file_type;
            Err(converter_not_configured_error())
        }
        LocalDocumentType::Image(file_type) => {
            let _ = file_type;
            Err(RenderError {
                code: "IMAGE_READER_DIRECT_OPEN_UNAVAILABLE".to_string(),
                message: "图片预览请通过图片读取入口打开。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: "image direct open command is not used by product path"
                    .to_string(),
            })
        }
        LocalDocumentType::Text(file_type) => {
            let _ = file_type;
            Err(RenderError {
                code: "TEXT_READER_DIRECT_OPEN_UNAVAILABLE".to_string(),
                message: "文本预览请通过文本读取入口打开。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: "text direct open command is not used by product path".to_string(),
            })
        }
    }
}

#[tauri::command]
pub(crate) fn read_local_pdf_bytes(path: String) -> Result<Vec<u8>, RenderError> {
    read_local_pdf_bytes_for_test(Path::new(&path))
}

#[tauri::command]
pub(crate) fn read_local_text_document(
    app: tauri::AppHandle,
    path: String,
) -> Result<TextDocumentView, RenderError> {
    let selected_path = PathBuf::from(path);
    let view = read_local_text_document_for_test(&selected_path)?;
    let store = recent_files_store_from_app(&app)?;
    store.record_opened_text(&selected_path, &view.file_type, &current_opened_at())?;
    Ok(view)
}

#[tauri::command]
pub(crate) fn read_recent_text_document(
    app: tauri::AppHandle,
    id: String,
) -> Result<TextDocumentView, RenderError> {
    let store = recent_files_store_from_app(&app)?;
    let path = recent_file_path_for_id(&store, &id)?;
    let view = read_local_text_document_for_test(&path)?;
    store.record_opened_text(&path, &view.file_type, &current_opened_at())?;
    Ok(view)
}

#[tauri::command]
pub(crate) fn open_local_image_document(
    app: tauri::AppHandle,
    path: String,
) -> Result<ImageDocumentView, RenderError> {
    let selected_path = PathBuf::from(path);
    let view = read_local_image_document_for_test(&selected_path)?;
    let store = recent_files_store_from_app(&app)?;
    store.record_opened_image(&selected_path, &view.file_type, &current_opened_at())?;
    Ok(view)
}

#[tauri::command]
pub(crate) fn open_recent_image_document(
    app: tauri::AppHandle,
    id: String,
) -> Result<ImageDocumentView, RenderError> {
    let store = recent_files_store_from_app(&app)?;
    let path = recent_file_path_for_id(&store, &id)?;
    let view = read_local_image_document_for_test(&path)?;
    store.record_opened_image(&path, &view.file_type, &current_opened_at())?;
    Ok(view)
}

#[tauri::command]
pub(crate) fn open_local_office_as_pdf(
    app: tauri::AppHandle,
    registry: tauri::State<LocalDocumentRegistry>,
    path: String,
    layout: Option<String>,
    converter_executable_path: Option<String>,
) -> Result<OfficePdfOpenResult, RenderError> {
    let recent_files = recent_files_store_from_app(&app)?;
    let cache_root = office_conversion_cache_root_from_app(&app)?;
    let layout = office_conversion_layout_from_option(layout.as_deref())?;
    open_local_office_as_pdf_with_state_for_test(
        &registry,
        &recent_files,
        OfficeConverterConfig::from_setting_or_env_value(
            converter_executable_path.as_deref(),
            std::env::var(OfficeConverterConfig::ENV_KEY)
                .ok()
                .as_deref(),
        ),
        &cache_root,
        path,
        layout,
        &current_opened_at(),
    )
}

#[tauri::command]
pub(crate) fn read_converted_office_pdf_bytes(
    registry: tauri::State<LocalDocumentRegistry>,
    session_id: String,
) -> Result<Vec<u8>, RenderError> {
    read_converted_office_pdf_bytes_with_registry_for_test(&registry, &session_id)
}

#[tauri::command]
pub(crate) fn open_recent_office_as_pdf(
    app: tauri::AppHandle,
    registry: tauri::State<LocalDocumentRegistry>,
    id: String,
    layout: Option<String>,
    converter_executable_path: Option<String>,
) -> Result<OfficePdfOpenResult, RenderError> {
    let recent_files = recent_files_store_from_app(&app)?;
    let cache_root = office_conversion_cache_root_from_app(&app)?;
    let layout = office_conversion_layout_from_option(layout.as_deref())?;
    open_recent_office_as_pdf_with_store_for_test(
        &registry,
        &recent_files,
        OfficeConverterConfig::from_setting_or_env_value(
            converter_executable_path.as_deref(),
            std::env::var(OfficeConverterConfig::ENV_KEY)
                .ok()
                .as_deref(),
        ),
        &cache_root,
        id,
        layout,
        &current_opened_at(),
    )
}

#[tauri::command]
pub(crate) fn test_office_converter_executable(
    converter_executable_path: Option<String>,
) -> OfficeConverterTestResult {
    let config = OfficeConverterConfig::from_setting_or_env_value(
        converter_executable_path.as_deref(),
        std::env::var(OfficeConverterConfig::ENV_KEY)
            .ok()
            .as_deref(),
    );

    if config.is_disabled() {
        return OfficeConverterTestResult {
            ok: false,
            message: "路径不可用，请检查 LibreOffice 程序路径。".to_string(),
        };
    }

    OfficeConverterTestResult {
        ok: true,
        message: "LibreOffice 路径可用。".to_string(),
    }
}

#[tauri::command]
pub(crate) fn startup_document_path() -> Option<String> {
    startup_document_path_from_args(std::env::args())
}

pub(crate) fn startup_document_path_from_args<I, S>(args: I) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().skip(1).find_map(|arg| {
        let path = arg.as_ref();
        if path.starts_with('-') {
            return None;
        }

        let extension = std::path::Path::new(path)
            .extension()
            .and_then(|value| value.to_str())?;
        if extension.eq_ignore_ascii_case("ofd")
            || extension.eq_ignore_ascii_case("pdf")
            || extension.eq_ignore_ascii_case("docx")
            || extension.eq_ignore_ascii_case("xlsx")
            || extension.eq_ignore_ascii_case("pptx")
            || extension.eq_ignore_ascii_case("doc")
            || extension.eq_ignore_ascii_case("xls")
            || extension.eq_ignore_ascii_case("ppt")
            || extension.eq_ignore_ascii_case("wps")
            || extension.eq_ignore_ascii_case("et")
            || extension.eq_ignore_ascii_case("dps")
            || extension.eq_ignore_ascii_case("txt")
            || extension.eq_ignore_ascii_case("log")
            || extension.eq_ignore_ascii_case("csv")
            || extension.eq_ignore_ascii_case("md")
            || extension.eq_ignore_ascii_case("png")
            || extension.eq_ignore_ascii_case("jpg")
            || extension.eq_ignore_ascii_case("jpeg")
            || extension.eq_ignore_ascii_case("webp")
        {
            Some(path.to_string())
        } else {
            None
        }
    })
}

#[allow(dead_code)]
pub(crate) fn open_local_ofd_with_dev_renderer_state(
    registry: &LocalDocumentRegistry,
    path: String,
) -> Result<DocumentSession, RenderError> {
    let selected_path = PathBuf::from(path);
    let repo_root = dev_repo_root();
    let script = repo_root.join("scripts/dev/ofd-renderer-cli.ps1");
    let runner = dev_wrapper_command_spec(&script, true).into_process_runner();

    local_ofd_session_with_registry(registry, &runner, &selected_path)
}

#[allow(dead_code)]
pub(crate) fn open_local_ofd_with_default_renderer_state(
    registry: &LocalDocumentRegistry,
    path: String,
    packaged_resource_root: Option<&Path>,
    dev_wrapper_script: Option<&Path>,
) -> Result<DocumentSession, RenderError> {
    let selected_path = PathBuf::from(path);
    let runner = default_ofd_renderer_command_spec_for_available_resources(
        packaged_resource_root,
        dev_wrapper_script,
    )?
    .into_process_runner();

    local_ofd_session_with_registry(registry, &runner, &selected_path)
}

#[allow(dead_code)]
pub(crate) fn open_local_ofd_with_default_renderer_state_and_recent_files(
    registry: &LocalDocumentRegistry,
    path: String,
    packaged_resource_root: Option<&Path>,
    dev_wrapper_script: Option<&Path>,
    recent_files: &RecentFilesStore,
    opened_at: &str,
) -> Result<DocumentSession, RenderError> {
    let selected_path = PathBuf::from(path);
    let runner = default_ofd_renderer_command_spec_for_available_resources(
        packaged_resource_root,
        dev_wrapper_script,
    )?
    .into_process_runner();

    local_ofd_session_with_recent_files(registry, &runner, &selected_path, recent_files, opened_at)
}

#[allow(dead_code)]
fn open_local_document_with_state_for_test(
    registry: &LocalDocumentRegistry,
    recent_files: &RecentFilesStore,
    path: String,
) -> Result<DocumentSession, RenderError> {
    let selected_path = PathBuf::from(path);

    match local_document_extension(&selected_path)? {
        LocalDocumentType::Ofd => open_local_ofd_with_default_renderer_state_and_recent_files(
            registry,
            selected_path.to_string_lossy().to_string(),
            None,
            None,
            recent_files,
            &current_opened_at(),
        ),
        LocalDocumentType::Pdf => Err(pdf_not_implemented_error()),
        LocalDocumentType::Office(file_type) => {
            let _ = file_type;
            Err(converter_not_configured_error())
        }
        LocalDocumentType::Image(file_type) => {
            let _ = file_type;
            Err(RenderError {
                code: "IMAGE_READER_DIRECT_OPEN_UNAVAILABLE".to_string(),
                message: "图片预览请通过图片读取入口打开。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: "image direct open command is not used by product path"
                    .to_string(),
            })
        }
        LocalDocumentType::Text(file_type) => {
            let _ = file_type;
            Err(RenderError {
                code: "TEXT_READER_DIRECT_OPEN_UNAVAILABLE".to_string(),
                message: "文本预览请通过文本读取入口打开。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: "text direct open command is not used by product path"
                    .to_string(),
            })
        }
    }
}

#[allow(dead_code)]
fn open_local_office_as_pdf_with_state_for_test(
    registry: &LocalDocumentRegistry,
    recent_files: &RecentFilesStore,
    config: OfficeConverterConfig,
    cache_root: &Path,
    path: String,
    layout: OfficeConversionLayout,
    opened_at: &str,
) -> Result<OfficePdfOpenResult, RenderError> {
    let selected_path = PathBuf::from(path);
    match local_document_extension(&selected_path)? {
        LocalDocumentType::Office(file_type) => {
            let _ = file_type;
        }
        _ => {
            return Err(RenderError {
                code: "UNSUPPORTED_FILE_TYPE".to_string(),
                message: "不支持的文件类型。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: "not an office file".to_string(),
            });
        }
    }

    if config.is_disabled() {
        return Err(converter_not_configured_error());
    }

    let executable_path = config
        .executable_path
        .ok_or_else(converter_not_configured_error)?;
    let runner = LibreOfficeProcessRunner::new(executable_path);
    open_local_office_as_pdf_with_runner_for_test(
        registry,
        recent_files,
        &runner,
        cache_root,
        selected_path.to_string_lossy().to_string(),
        layout,
        opened_at,
    )
}

#[allow(dead_code)]
fn open_local_office_as_pdf_with_runner_for_test(
    registry: &LocalDocumentRegistry,
    recent_files: &RecentFilesStore,
    runner: &impl ConverterCommandRunner,
    cache_root: &Path,
    path: String,
    layout: OfficeConversionLayout,
    opened_at: &str,
) -> Result<OfficePdfOpenResult, RenderError> {
    let selected_path = PathBuf::from(path);
    let file_type = office_file_type(&selected_path).map_err(converter_error_to_render_error)?;
    match local_document_extension(&selected_path)? {
        LocalDocumentType::Office(extension) if extension == file_type => {}
        _ => {
            return Err(RenderError {
                code: "UNSUPPORTED_FILE_TYPE".to_string(),
                message: "不支持的文件类型。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: "not an office file".to_string(),
            });
        }
    }
    validate_office_input_package(&selected_path, file_type)
        .map_err(converter_error_to_render_error)?;

    let session_id = office_session_id_for_path(&selected_path);
    let paths = ConversionSessionPaths::new(cache_root, &session_id);
    std::fs::create_dir_all(&paths.output_dir).map_err(office_cache_io_error)?;
    std::fs::create_dir_all(&paths.profile_dir).map_err(office_cache_io_error)?;

    let conversion = convert_with_runner(runner, &selected_path, &paths, layout)
        .map_err(converter_error_to_render_error)?;
    let output_pdf = PathBuf::from(&conversion.output.path);
    let converted_pdf =
        validate_converted_pdf_output(&paths.output_dir, &output_pdf, DEFAULT_MAX_LOCAL_PDF_BYTES)
            .map_err(converter_error_to_render_error)?;

    registry.remember_office_conversion(&session_id, &selected_path, &converted_pdf);
    recent_files.record_opened_office(&selected_path, file_type, opened_at)?;

    Ok(OfficePdfOpenResult {
        session_id,
        original_file_type: file_type.to_string(),
        display_name: recent_display_name(&selected_path),
        output_pdf_size_bytes: conversion.output.size_bytes,
        warnings: conversion.warnings,
    })
}

#[allow(dead_code)]
fn read_converted_office_pdf_bytes_with_registry_for_test(
    registry: &LocalDocumentRegistry,
    session_id: &str,
) -> Result<Vec<u8>, RenderError> {
    let entry = registry
        .office_conversion_for(session_id)
        .ok_or_else(|| RenderError {
            code: "SESSION_NOT_FOUND".to_string(),
            message: "未找到该文档会话。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "office conversion session not found".to_string(),
        })?;
    read_local_pdf_bytes_for_test(&entry.converted_pdf_path)
}

#[allow(dead_code)]
fn open_recent_office_as_pdf_with_store_for_test(
    registry: &LocalDocumentRegistry,
    recent_files: &RecentFilesStore,
    config: OfficeConverterConfig,
    cache_root: &Path,
    id: String,
    layout: OfficeConversionLayout,
    opened_at: &str,
) -> Result<OfficePdfOpenResult, RenderError> {
    let path = recent_file_path_for_id(recent_files, &id)?;
    open_local_office_as_pdf_with_state_for_test(
        registry,
        recent_files,
        config,
        cache_root,
        path.to_string_lossy().to_string(),
        layout,
        opened_at,
    )
}

#[tauri::command]
pub(crate) fn render_local_ofd_page_with_dev_renderer(
    registry: tauri::State<LocalDocumentRegistry>,
    session_id: String,
    page_index: u32,
    scale: f64,
) -> Result<PageBitmap, RenderError> {
    render_local_ofd_page_with_dev_renderer_state(&registry, session_id, page_index, scale)
}

#[allow(dead_code)]
pub(crate) fn render_local_ofd_page_with_dev_renderer_state(
    registry: &LocalDocumentRegistry,
    session_id: String,
    page_index: u32,
    scale: f64,
) -> Result<PageBitmap, RenderError> {
    let repo_root = dev_repo_root();
    let script = repo_root.join("scripts/dev/ofd-renderer-cli.ps1");
    let cache_root = repo_root.join("tmp/ofd-renderer-cli/tauri-dev");
    let runner = dev_wrapper_command_spec(&script, true).into_process_runner();

    let mut bitmap = local_ofd_page_with_runner(
        registry,
        &runner,
        &cache_root,
        &session_id,
        page_index,
        scale,
    )?;
    bitmap.image_ref = workspace_ref_to_host_path(&repo_root, &bitmap.image_ref);
    bitmap.image_ref = copy_dev_image_to_asset_temp(&bitmap)?;

    Ok(bitmap)
}

#[tauri::command]
pub(crate) fn render_local_ofd_page(
    app: tauri::AppHandle,
    registry: tauri::State<LocalDocumentRegistry>,
    session_id: String,
    page_index: u32,
    scale: f64,
) -> Result<PageBitmap, RenderError> {
    let packaged_resource_root = available_packaged_resource_root_from_app(&app)?;
    if packaged_resource_root.is_some() {
        return render_local_ofd_page_with_default_renderer_state(
            &registry,
            session_id,
            page_index,
            scale,
            &dev_asset_cache_root(),
            packaged_resource_root.as_deref(),
            None,
        );
    }

    if default_dev_wrapper_script().is_some() {
        return render_local_ofd_page_with_dev_renderer_state(
            &registry, session_id, page_index, scale,
        );
    }

    Err(packaged_renderer_unavailable_error())
}

#[tauri::command]
pub(crate) fn local_ofd_text(
    app: tauri::AppHandle,
    registry: tauri::State<LocalDocumentRegistry>,
    session_id: String,
    max_pages: u32,
    page_index: Option<u32>,
) -> Result<OfdTextView, RenderError> {
    let packaged_resource_root = available_packaged_resource_root_from_app(&app)?;
    let dev_wrapper_script = default_dev_wrapper_script();
    let runner = default_ofd_renderer_command_spec_for_available_resources(
        packaged_resource_root.as_deref(),
        dev_wrapper_script.as_deref(),
    )?
    .into_process_runner();

    local_ofd_text_with_runner(&registry, &runner, &session_id, max_pages, page_index)
}

#[allow(dead_code)]
pub(crate) fn render_local_ofd_page_with_default_renderer_state(
    registry: &LocalDocumentRegistry,
    session_id: String,
    page_index: u32,
    scale: f64,
    cache_root: &Path,
    packaged_resource_root: Option<&Path>,
    dev_wrapper_script: Option<&Path>,
) -> Result<PageBitmap, RenderError> {
    let runner = default_ofd_renderer_command_spec_for_available_resources(
        packaged_resource_root,
        dev_wrapper_script,
    )?
    .into_process_runner();

    local_ofd_page_with_runner(
        registry,
        &runner,
        cache_root,
        &session_id,
        page_index,
        scale,
    )
}

#[tauri::command]
pub(crate) fn cleanup_render_cache_session(session_id: String) -> Result<bool, RenderError> {
    cleanup_render_cache_session_at_root(&dev_asset_cache_root(), &session_id)
}

#[tauri::command]
pub(crate) fn clear_render_cache(
    current_session_id: Option<String>,
) -> Result<CacheCleanupView, RenderError> {
    clear_render_cache_at_root(&dev_asset_cache_root(), current_session_id.as_deref())
}

#[allow(dead_code)]
pub(crate) fn document_session_from_inspect(
    session_id: &str,
    inspect: InspectSuccess,
) -> DocumentSession {
    DocumentSession {
        id: session_id.to_string(),
        file_type: inspect.document.file_type,
        page_count: inspect.document.page_count,
        page_sizes: inspect
            .document
            .page_sizes
            .into_iter()
            .map(|page| PageInfo {
                index: page.index,
                width_pt: page.width_pt,
                height_pt: page.height_pt,
            })
            .collect(),
        engine: EngineInfo {
            name: inspect.engine.name,
            version: inspect.engine.version,
            protocol_version: inspect.protocol_version,
            capabilities: inspect.engine.capabilities,
        },
        warnings: inspect.warnings,
    }
}

#[allow(dead_code)]
pub(crate) fn engine_info_from_version(version: VersionSuccess) -> EngineInfo {
    EngineInfo {
        name: version.engine.name,
        version: version.engine.version,
        protocol_version: version.protocol_version,
        capabilities: version.engine.capabilities,
    }
}

#[allow(dead_code)]
pub(crate) fn renderer_engine_info_with_runner(
    runner: &impl CommandRunner,
) -> Result<EngineInfo, RenderError> {
    let version = version_with_runner(runner).map_err(render_error_from_sidecar)?;

    Ok(engine_info_from_version(version))
}

#[allow(dead_code)]
pub(crate) fn renderer_engine_info_with_command_spec(
    spec: SidecarCommandSpec,
) -> Result<EngineInfo, RenderError> {
    let runner = spec.into_process_runner();

    renderer_engine_info_with_runner(&runner)
}

#[allow(dead_code)]
pub(crate) fn renderer_engine_info_with_dev_wrapper(
    script_path: &Path,
    run: bool,
) -> Result<EngineInfo, RenderError> {
    renderer_engine_info_with_command_spec(dev_wrapper_command_spec(script_path, run))
}

#[allow(dead_code)]
pub(crate) fn default_ofd_renderer_command_spec(
    packaged_resource_root: Option<&Path>,
    dev_wrapper_script: Option<&Path>,
) -> Result<SidecarCommandSpec, RenderError> {
    if let Some(resource_root) = packaged_resource_root {
        return Ok(packaged_ofd_renderer_resource_command_spec(resource_root));
    }

    if let Some(script_path) = dev_wrapper_script {
        return Ok(dev_wrapper_command_spec(script_path, true));
    }

    Err(packaged_renderer_unavailable_error())
}

#[allow(dead_code)]
pub(crate) fn default_ofd_renderer_command_spec_for_available_resources(
    packaged_resource_root: Option<&Path>,
    dev_wrapper_script: Option<&Path>,
) -> Result<SidecarCommandSpec, RenderError> {
    let available_resource_root =
        packaged_resource_root.filter(|root| packaged_ofd_renderer_resource_exists(root));

    default_ofd_renderer_command_spec(available_resource_root, dev_wrapper_script)
}

#[allow(dead_code)]
pub(crate) fn packaged_ofd_renderer_command_spec_from_app(
    app: &tauri::AppHandle,
) -> Result<SidecarCommandSpec, RenderError> {
    let resource_root = app.path().resource_dir().map_err(|error| RenderError {
        code: "PACKAGED_RENDERER_UNAVAILABLE".to_string(),
        message: "未找到随应用打包的 OFD 渲染引擎。".to_string(),
        recoverable: false,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    })?;

    Ok(packaged_ofd_renderer_resource_command_spec(&resource_root))
}

#[allow(dead_code)]
pub(crate) fn renderer_engine_info_with_packaged_ofd_resources(
    app: &tauri::AppHandle,
) -> Result<EngineInfo, RenderError> {
    let spec = packaged_ofd_renderer_command_spec_from_app(app)?;

    renderer_engine_info_with_command_spec(spec)
}

fn available_packaged_resource_root_from_app(
    app: &tauri::AppHandle,
) -> Result<Option<PathBuf>, RenderError> {
    let mut candidates = Vec::new();
    if let Ok(resource_root) = app.path().resource_dir() {
        candidates.push(resource_root);
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_parent) = current_exe.parent() {
            candidates.push(exe_parent.to_path_buf());
        }
    }

    Ok(first_available_packaged_resource_root(
        candidates.iter().map(|path| path.as_path()),
    ))
}

fn first_available_packaged_resource_root<'a>(
    resource_roots: impl IntoIterator<Item = &'a Path>,
) -> Option<PathBuf> {
    resource_roots
        .into_iter()
        .find(|root| packaged_ofd_renderer_resource_exists(root))
        .map(Path::to_path_buf)
}

fn default_dev_wrapper_script() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        Some(dev_repo_root().join("scripts/dev/ofd-renderer-cli.ps1"))
    } else {
        None
    }
}

fn packaged_renderer_unavailable_error() -> RenderError {
    RenderError {
        code: "PACKAGED_RENDERER_UNAVAILABLE".to_string(),
        message: "未找到可用的 OFD 渲染引擎。".to_string(),
        recoverable: false,
        safe_to_show: true,
        detail_for_report: "no packaged resource root or explicit dev wrapper fallback configured"
            .to_string(),
    }
}

#[allow(dead_code)]
pub(crate) fn public_sample_session_with_runner(
    runner: &impl CommandRunner,
    public_root: &Path,
    sample_id: &str,
) -> Result<DocumentSession, RenderError> {
    let filename = public_sample_filename(sample_id)?;
    let inspect = inspect_with_runner(runner, &public_root.join(filename))
        .map_err(render_error_from_sidecar)?;

    Ok(document_session_from_inspect(
        &format!("public-{sample_id}"),
        inspect,
    ))
}

#[allow(dead_code)]
pub(crate) fn local_ofd_session_with_runner(
    runner: &impl CommandRunner,
    path: &Path,
) -> Result<DocumentSession, RenderError> {
    validate_local_ofd_path(path)?;
    let inspect = inspect_with_runner(runner, path).map_err(render_error_from_sidecar)?;

    Ok(document_session_from_inspect(
        &local_session_id_for_path(path),
        inspect,
    ))
}

#[allow(dead_code)]
pub(crate) fn local_ofd_session_with_registry(
    registry: &LocalDocumentRegistry,
    runner: &impl CommandRunner,
    path: &Path,
) -> Result<DocumentSession, RenderError> {
    validate_local_ofd_path(path)?;
    let session_id = local_session_id_for_path(path);
    if let Some(session) = registry.ofd_session_for(&session_id) {
        registry.remember(&session.id, path);
        return Ok(session);
    }

    let inspect = inspect_with_runner(runner, path).map_err(render_error_from_sidecar)?;
    let session = document_session_from_inspect(&session_id, inspect);
    registry.remember_ofd_session(&session, path);

    Ok(session)
}

#[allow(dead_code)]
pub(crate) fn local_ofd_session_with_recent_files(
    registry: &LocalDocumentRegistry,
    runner: &impl CommandRunner,
    path: &Path,
    recent_files: &RecentFilesStore,
    opened_at: &str,
) -> Result<DocumentSession, RenderError> {
    let session = local_ofd_session_with_registry(registry, runner, path)?;
    recent_files.record_opened_ofd(path, opened_at)?;

    Ok(session)
}

#[allow(dead_code)]
pub(crate) fn open_recent_file_with_runner(
    registry: &LocalDocumentRegistry,
    runner: &impl CommandRunner,
    recent_files: &RecentFilesStore,
    id: &str,
    opened_at: &str,
) -> Result<DocumentSession, RenderError> {
    let path = recent_file_path_for_id(recent_files, id)?;
    local_ofd_session_with_recent_files(registry, runner, &path, recent_files, opened_at)
}

#[allow(dead_code)]
pub(crate) fn public_sample_session_with_dev_wrapper(
    script_path: &Path,
    run: bool,
    public_root: &Path,
    sample_id: &str,
) -> Result<DocumentSession, RenderError> {
    let runner = dev_wrapper_command_spec(script_path, run).into_process_runner();

    public_sample_session_with_runner(&runner, public_root, sample_id)
}

#[allow(dead_code)]
pub(crate) fn page_bitmap_from_render(
    session_id: &str,
    scale: f64,
    render: RenderSuccess,
) -> Result<PageBitmap, RenderError> {
    let page = render.pages.into_iter().next().ok_or_else(|| RenderError {
        code: "OFD_RENDER_FAILED".to_string(),
        message: "渲染引擎未返回页面图片。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: "missing rendered page".to_string(),
    })?;

    Ok(PageBitmap {
        session_id: session_id.to_string(),
        page_index: page.index,
        scale,
        width_px: page.width_px,
        height_px: page.height_px,
        image_ref: page.image_path,
        duration_ms: render.duration_ms,
        warnings: render.warnings,
    })
}

#[allow(dead_code)]
pub(crate) fn ofd_text_view_from_sidecar(session_id: &str, text: TextSuccess) -> OfdTextView {
    OfdTextView {
        session_id: session_id.to_string(),
        page_count: text.document.page_count,
        pages: text
            .pages
            .into_iter()
            .map(|page| OfdTextPageView {
                index: page.index,
                width_pt: page.width_pt,
                height_pt: page.height_pt,
                text: page.text,
            })
            .collect(),
        duration_ms: text.duration_ms,
        warnings: text.warnings,
    }
}

fn ofd_screen_preview_dpi(scale: f64) -> f64 {
    4.0 * scale.clamp(0.5, 3.0)
}

#[allow(dead_code)]
pub(crate) fn public_sample_page_with_runner(
    runner: &impl CommandRunner,
    public_root: &Path,
    cache_root: &Path,
    sample_id: &str,
    page_index: u32,
    scale: f64,
) -> Result<PageBitmap, RenderError> {
    let filename = public_sample_filename(sample_id)?;
    let session_id = format!("public-{sample_id}");
    let cache_dir = session_cache_dir(cache_root, &session_id);
    let bounded_scale = scale.clamp(0.5, 3.0);
    let render = render_with_runner(
        runner,
        &public_root.join(filename),
        &cache_dir,
        page_index,
        ofd_screen_preview_dpi(bounded_scale),
        20,
        150_000_000,
    )
    .map_err(render_error_from_sidecar)?;

    page_bitmap_from_render(&session_id, bounded_scale, render)
}

#[allow(dead_code)]
pub(crate) fn local_ofd_page_with_runner(
    registry: &LocalDocumentRegistry,
    runner: &impl CommandRunner,
    cache_root: &Path,
    session_id: &str,
    page_index: u32,
    scale: f64,
) -> Result<PageBitmap, RenderError> {
    let path = registry.path_for(session_id).ok_or_else(|| RenderError {
        code: "INVALID_ARGUMENT".to_string(),
        message: "本地文档会话已失效，请重新打开文件。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("unknown local session_id={session_id}"),
    })?;

    let cache_dir = session_cache_dir(cache_root, session_id);
    let bounded_scale = scale.clamp(0.5, 3.0);
    if let Some(bitmap) = cached_page_bitmap(session_id, page_index, bounded_scale, &cache_dir) {
        return Ok(bitmap);
    }

    let render = render_with_runner(
        runner,
        &path,
        &cache_dir,
        page_index,
        ofd_screen_preview_dpi(bounded_scale),
        20,
        150_000_000,
    )
    .map_err(render_error_from_sidecar)?;

    let mut bitmap = page_bitmap_from_render(session_id, bounded_scale, render)?;
    bitmap.image_ref = copy_renderer_image_to_page_cache(&cache_root, &bitmap)?;
    Ok(bitmap)
}

fn cached_page_bitmap(
    session_id: &str,
    page_index: u32,
    scale: f64,
    cache_dir: &Path,
) -> Option<PageBitmap> {
    let image_path = cache_dir.join(page_image_name(page_index, scale));
    let mut file = std::fs::File::open(&image_path).ok()?;
    let mut header = [0_u8; 24];
    file.read_exact(&mut header).ok()?;
    let (width_px, height_px) = png_dimensions(&header)?;

    Some(PageBitmap {
        session_id: session_id.to_string(),
        page_index,
        scale,
        width_px,
        height_px,
        image_ref: image_path.to_string_lossy().replace('\\', "/"),
        duration_ms: 0,
        warnings: vec![],
    })
}

#[allow(dead_code)]
pub(crate) fn local_ofd_text_with_runner(
    registry: &LocalDocumentRegistry,
    runner: &impl CommandRunner,
    session_id: &str,
    max_pages: u32,
    page_index: Option<u32>,
) -> Result<OfdTextView, RenderError> {
    let path = registry.path_for(session_id).ok_or_else(|| RenderError {
        code: "INVALID_ARGUMENT".to_string(),
        message: "本地文档会话已失效，请重新打开文件。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("unknown local session_id={session_id}"),
    })?;

    validate_local_ofd_path(&path)?;
    let text = text_with_runner(runner, &path, max_pages, page_index)
        .map_err(render_error_from_sidecar)?;
    Ok(ofd_text_view_from_sidecar(session_id, text))
}

#[allow(dead_code)]
pub(crate) fn public_sample_page_with_dev_wrapper(
    script_path: &Path,
    run: bool,
    repo_root: &Path,
    public_root: &Path,
    cache_root: &Path,
    sample_id: &str,
    page_index: u32,
    scale: f64,
) -> Result<PageBitmap, RenderError> {
    let runner = dev_wrapper_command_spec(script_path, run).into_process_runner();

    let mut bitmap = public_sample_page_with_runner(
        &runner,
        public_root,
        cache_root,
        sample_id,
        page_index,
        scale,
    )?;
    bitmap.image_ref = workspace_ref_to_host_path(repo_root, &bitmap.image_ref);
    bitmap.image_ref = copy_dev_image_to_asset_temp(&bitmap)?;

    Ok(bitmap)
}

fn public_sample_filename(sample_id: &str) -> Result<&'static str, RenderError> {
    for (id, filename) in PUBLIC_OFD_SAMPLES {
        if *id == sample_id {
            return Ok(filename);
        }
    }

    Err(RenderError {
        code: "INVALID_ARGUMENT".to_string(),
        message: "未知公开样本。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("sample_id={sample_id}"),
    })
}

fn workspace_ref_to_host_path(repo_root: &Path, image_ref: &str) -> String {
    let Some(relative) = image_ref.strip_prefix("/workspace/") else {
        return image_ref.to_string();
    };

    let mut host_path = repo_root.to_path_buf();
    for segment in relative.split('/') {
        host_path.push(segment);
    }

    host_path.to_string_lossy().replace('\\', "/")
}

fn copy_dev_image_to_asset_temp(bitmap: &PageBitmap) -> Result<String, RenderError> {
    let source = std::path::Path::new(&bitmap.image_ref);
    if !source.exists() {
        return Ok(bitmap.image_ref.clone());
    }

    let cache_root = dev_asset_cache_root();
    let target_dir = cache_root.join(&bitmap.session_id);
    std::fs::create_dir_all(&target_dir).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法准备页面图片缓存目录。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    })?;

    let target = target_dir.join(page_image_name(bitmap.page_index, bitmap.scale));
    std::fs::copy(source, &target).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法准备页面图片。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    })?;
    let _ = prune_cache_to_budget(
        &cache_root,
        DEFAULT_MAX_RENDER_CACHE_BYTES,
        DEFAULT_MAX_RENDER_CACHE_ENTRIES,
    );

    Ok(target.to_string_lossy().replace('\\', "/"))
}

fn copy_renderer_image_to_page_cache(
    cache_root: &Path,
    bitmap: &PageBitmap,
) -> Result<String, RenderError> {
    let source = std::path::Path::new(&bitmap.image_ref);
    if !source.exists() {
        return Ok(bitmap.image_ref.clone());
    }

    let target_dir = session_cache_dir(cache_root, &bitmap.session_id);
    std::fs::create_dir_all(&target_dir).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法准备页面图片缓存目录。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    })?;

    let target = target_dir.join(page_image_name(bitmap.page_index, bitmap.scale));
    if source != target {
        std::fs::copy(source, &target).map_err(|error| RenderError {
            code: "IO_ERROR".to_string(),
            message: "无法准备页面图片。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: error.to_string(),
        })?;
    }
    let _ = prune_cache_to_budget(
        cache_root,
        DEFAULT_MAX_RENDER_CACHE_BYTES,
        DEFAULT_MAX_RENDER_CACHE_ENTRIES,
    );

    Ok(target.to_string_lossy().replace('\\', "/"))
}

#[allow(dead_code)]
pub(crate) fn cleanup_render_cache_session_at_root(
    cache_root: &Path,
    session_id: &str,
) -> Result<bool, RenderError> {
    cleanup_cache_session(cache_root, session_id)
}

#[allow(dead_code)]
pub(crate) fn clear_render_cache_at_root(
    cache_root: &Path,
    current_session_id: Option<&str>,
) -> Result<CacheCleanupView, RenderError> {
    let summary =
        remove_cache_session_dirs_except(cache_root, current_session_id).map_err(|error| {
            RenderError {
                code: "IO_ERROR".to_string(),
                message: "无法清理页面图片缓存。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: error.to_string(),
            }
        })?;

    Ok(CacheCleanupView {
        removed_session_count: summary.removed_session_count,
        removed_file_count: summary.removed_file_count,
    })
}

fn dev_asset_cache_root() -> PathBuf {
    std::env::temp_dir()
        .join("local-doc-viewer")
        .join("tauri-dev")
}

#[allow(dead_code)]
pub(crate) fn validate_local_ofd_path(path: &Path) -> Result<(), RenderError> {
    if !path.is_file() {
        return Err(RenderError {
            code: "FILE_NOT_FOUND".to_string(),
            message: "未找到该文件。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "selected path is not a file".to_string(),
        });
    }

    let extension = path.extension().and_then(|value| value.to_str());
    if !matches!(extension, Some(value) if value.eq_ignore_ascii_case("ofd")) {
        return Err(RenderError {
            code: "UNSUPPORTED_FILE_TYPE".to_string(),
            message: "当前仅支持打开 OFD 文件。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "unsupported extension".to_string(),
        });
    }

    let metadata = std::fs::metadata(path).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法读取文件信息。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    })?;

    if metadata.len() > DEFAULT_MAX_LOCAL_OFD_BYTES {
        return Err(RenderError {
            code: "FILE_TOO_LARGE".to_string(),
            message: "文件过大，暂无法打开。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: format!("size_bytes={}", metadata.len()),
        });
    }

    Ok(())
}

#[allow(dead_code)]
pub(crate) fn validate_local_pdf_path(path: &Path) -> Result<(), RenderError> {
    if !path.is_file() {
        return Err(RenderError {
            code: "FILE_NOT_FOUND".to_string(),
            message: "未找到该文件。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "selected path is not a file".to_string(),
        });
    }

    let extension = path.extension().and_then(|value| value.to_str());
    if !matches!(extension, Some(value) if value.eq_ignore_ascii_case("pdf")) {
        return Err(RenderError {
            code: "UNSUPPORTED_FILE_TYPE".to_string(),
            message: "当前仅支持打开 PDF 文件。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "unsupported extension".to_string(),
        });
    }

    let metadata = std::fs::metadata(path).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法读取文件信息。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("metadata read failed: {}", error.kind()),
    })?;

    if metadata.len() > DEFAULT_MAX_LOCAL_PDF_BYTES {
        return Err(RenderError {
            code: "FILE_TOO_LARGE".to_string(),
            message: "文件过大，暂无法打开。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: format!("size_bytes={}", metadata.len()),
        });
    }

    Ok(())
}

#[allow(dead_code)]
fn read_local_pdf_bytes_for_test(path: &Path) -> Result<Vec<u8>, RenderError> {
    validate_local_pdf_path(path)?;
    let bytes = std::fs::read(path).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法读取文件内容。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("PDF read failed: {}", error.kind()),
    })?;

    if !bytes.starts_with(b"%PDF-1.") {
        return Err(RenderError {
            code: "PDF_STRUCTURE_ERROR".to_string(),
            message: "无法打开该 PDF 文件。".to_string(),
            recoverable: false,
            safe_to_show: true,
            detail_for_report: "PDF header magic mismatch".to_string(),
        });
    }

    Ok(bytes)
}

#[allow(dead_code)]
fn read_local_text_document_for_test(path: &Path) -> Result<TextDocumentView, RenderError> {
    let file_type = match local_document_extension(path)? {
        LocalDocumentType::Text(file_type) => file_type,
        _ => {
            return Err(RenderError {
                code: "UNSUPPORTED_FILE_TYPE".to_string(),
                message: "不支持的文件类型。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: "not a text file".to_string(),
            });
        }
    };
    let metadata = std::fs::metadata(path).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法读取文件信息。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("text metadata read failed: {}", error.kind()),
    })?;
    if metadata.len() > DEFAULT_MAX_LOCAL_TEXT_BYTES {
        return Err(RenderError {
            code: "TEXT_FILE_TOO_LARGE".to_string(),
            message: "文本文件过大，暂不支持打开。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "text file exceeds local read budget".to_string(),
        });
    }
    let bytes = std::fs::read(path).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法读取文件内容。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("text read failed: {}", error.kind()),
    })?;
    let mut text = String::from_utf8(bytes).map_err(|_| RenderError {
        code: "TEXT_UNSUPPORTED_ENCODING".to_string(),
        message: "暂不支持该文本文件编码。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: "text is not valid UTF-8".to_string(),
    })?;
    if text.starts_with('\u{feff}') {
        text.replace_range(..'\u{feff}'.len_utf8(), "");
    }

    Ok(TextDocumentView {
        session_id: format!("text-{}", recent_file_id_for_path(path)),
        file_type: file_type.to_string(),
        display_name: recent_display_name(path),
        text,
        size_bytes: metadata.len(),
        warnings: Vec::new(),
    })
}

#[allow(dead_code)]
fn read_local_image_document_for_test(path: &Path) -> Result<ImageDocumentView, RenderError> {
    let file_type = match local_document_extension(path)? {
        LocalDocumentType::Image(file_type) => file_type,
        _ => {
            return Err(RenderError {
                code: "UNSUPPORTED_FILE_TYPE".to_string(),
                message: "不支持的文件类型。".to_string(),
                recoverable: true,
                safe_to_show: true,
                detail_for_report: "not an image file".to_string(),
            });
        }
    };
    let metadata = std::fs::metadata(path).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法读取文件信息。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("image metadata read failed: {}", error.kind()),
    })?;
    if metadata.len() > DEFAULT_MAX_LOCAL_IMAGE_BYTES {
        return Err(RenderError {
            code: "IMAGE_FILE_TOO_LARGE".to_string(),
            message: "图片文件过大，暂不支持打开。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "image file exceeds local read budget".to_string(),
        });
    }

    let header_len = usize::try_from(metadata.len().min(64 * 1024)).unwrap_or(0);
    let mut header = vec![0_u8; header_len];
    let mut file = std::fs::File::open(path).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法读取文件内容。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("image open failed: {}", error.kind()),
    })?;
    use std::io::Read;
    let read_len = file.read(&mut header).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法读取文件内容。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("image header read failed: {}", error.kind()),
    })?;
    header.truncate(read_len);

    let (width_px, height_px) = image_dimensions_from_header(file_type, &header).ok_or_else(|| {
        RenderError {
            code: "IMAGE_UNSUPPORTED_STRUCTURE".to_string(),
            message: "无法识别该图片文件。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "image header dimensions unavailable".to_string(),
        }
    })?;

    let session_id = format!("image-{}", local_session_id_for_path(path));
    let source_path = copy_local_image_to_asset_temp(path, &session_id, file_type)?;

    Ok(ImageDocumentView {
        session_id,
        file_type: file_type.to_string(),
        display_name: recent_display_name(path),
        source_path,
        width_px,
        height_px,
        size_bytes: metadata.len(),
        warnings: Vec::new(),
    })
}

fn copy_local_image_to_asset_temp(
    path: &Path,
    session_id: &str,
    file_type: &str,
) -> Result<String, RenderError> {
    let cache_root = dev_asset_cache_root();
    let target_dir = cache_root.join(session_id);
    std::fs::create_dir_all(&target_dir).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法准备图片预览缓存目录。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    })?;

    let target = target_dir.join(format!("source.{file_type}"));
    std::fs::copy(path, &target).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法准备图片预览。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    })?;
    let _ = prune_cache_to_budget(
        &cache_root,
        DEFAULT_MAX_RENDER_CACHE_BYTES,
        DEFAULT_MAX_RENDER_CACHE_ENTRIES,
    );

    Ok(target.to_string_lossy().replace('\\', "/"))
}

fn image_dimensions_from_header(file_type: &str, bytes: &[u8]) -> Option<(u32, u32)> {
    match file_type {
        "png" => png_dimensions(bytes),
        "jpg" | "jpeg" => jpeg_dimensions(bytes),
        "webp" => webp_dimensions(bytes),
        _ => None,
    }
}

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1A\n" || &bytes[12..16] != b"IHDR" {
        return None;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    nonzero_dimensions(width, height)
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return None;
    }
    let mut index = 2;
    while index + 9 < bytes.len() {
        while index < bytes.len() && bytes[index] != 0xFF {
            index += 1;
        }
        while index < bytes.len() && bytes[index] == 0xFF {
            index += 1;
        }
        if index >= bytes.len() {
            return None;
        }
        let marker = bytes[index];
        index += 1;
        if marker == 0xD9 || marker == 0xDA {
            return None;
        }
        if index + 2 > bytes.len() {
            return None;
        }
        let segment_len = u16::from_be_bytes(bytes[index..index + 2].try_into().ok()?) as usize;
        if segment_len < 2 || index + segment_len > bytes.len() {
            return None;
        }
        if matches!(
            marker,
            0xC0 | 0xC1 | 0xC2 | 0xC3 | 0xC5 | 0xC6 | 0xC7 | 0xC9 | 0xCA | 0xCB | 0xCD | 0xCE | 0xCF
        ) {
            if segment_len < 7 {
                return None;
            }
            let height = u16::from_be_bytes(bytes[index + 3..index + 5].try_into().ok()?) as u32;
            let width = u16::from_be_bytes(bytes[index + 5..index + 7].try_into().ok()?) as u32;
            return nonzero_dimensions(width, height);
        }
        index += segment_len;
    }
    None
}

fn webp_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 30 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }
    match &bytes[12..16] {
        b"VP8 " if bytes.len() >= 30 => {
            if bytes[23] != 0x9D || bytes[24] != 0x01 || bytes[25] != 0x2A {
                return None;
            }
            let width = u16::from_le_bytes(bytes[26..28].try_into().ok()?) as u32 & 0x3FFF;
            let height = u16::from_le_bytes(bytes[28..30].try_into().ok()?) as u32 & 0x3FFF;
            nonzero_dimensions(width, height)
        }
        b"VP8L" if bytes.len() >= 25 => {
            if bytes[20] != 0x2F {
                return None;
            }
            let b0 = bytes[21] as u32;
            let b1 = bytes[22] as u32;
            let b2 = bytes[23] as u32;
            let b3 = bytes[24] as u32;
            let width = 1 + (((b1 & 0x3F) << 8) | b0);
            let height = 1 + ((b3 << 6) | (b2 << 2) | ((b1 & 0xC0) >> 6));
            nonzero_dimensions(width, height)
        }
        b"VP8X" if bytes.len() >= 30 => {
            let width = 1
                + u32::from_le_bytes([bytes[24], bytes[25], bytes[26], 0]);
            let height = 1
                + u32::from_le_bytes([bytes[27], bytes[28], bytes[29], 0]);
            nonzero_dimensions(width, height)
        }
        _ => None,
    }
}

fn nonzero_dimensions(width: u32, height: u32) -> Option<(u32, u32)> {
    if width == 0 || height == 0 {
        None
    } else {
        Some((width, height))
    }
}

#[allow(dead_code)]
fn record_recent_pdf_opened_with_store_for_test(
    store: &RecentFilesStore,
    id: &str,
    opened_at: &str,
) -> Result<RecentFilesView, RenderError> {
    let path = recent_file_path_for_id(store, id)?;
    validate_local_pdf_path(&path)?;
    store.record_opened_pdf(&path, opened_at)?;
    store.list_recent_files()
}

enum LocalDocumentType {
    Ofd,
    Pdf,
    Office(&'static str),
    Image(&'static str),
    Text(&'static str),
}

fn local_document_extension(path: &Path) -> Result<LocalDocumentType, RenderError> {
    if !path.is_file() {
        return Err(RenderError {
            code: "FILE_NOT_FOUND".to_string(),
            message: "未找到该文件。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "selected path is not a file".to_string(),
        });
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match extension.as_str() {
        "ofd" => Ok(LocalDocumentType::Ofd),
        "pdf" => Ok(LocalDocumentType::Pdf),
        "docx" => Ok(LocalDocumentType::Office("docx")),
        "xlsx" => Ok(LocalDocumentType::Office("xlsx")),
        "pptx" => Ok(LocalDocumentType::Office("pptx")),
        "doc" => Ok(LocalDocumentType::Office("doc")),
        "xls" => Ok(LocalDocumentType::Office("xls")),
        "ppt" => Ok(LocalDocumentType::Office("ppt")),
        "wps" => Ok(LocalDocumentType::Office("wps")),
        "et" => Ok(LocalDocumentType::Office("et")),
        "dps" => Ok(LocalDocumentType::Office("dps")),
        "txt" => Ok(LocalDocumentType::Text("txt")),
        "log" => Ok(LocalDocumentType::Text("log")),
        "csv" => Ok(LocalDocumentType::Text("csv")),
        "md" => Ok(LocalDocumentType::Text("md")),
        "png" => Ok(LocalDocumentType::Image("png")),
        "jpg" => Ok(LocalDocumentType::Image("jpg")),
        "jpeg" => Ok(LocalDocumentType::Image("jpeg")),
        "webp" => Ok(LocalDocumentType::Image("webp")),
        _ => Err(RenderError {
            code: "UNSUPPORTED_FILE_TYPE".to_string(),
            message: "不支持的文件类型。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "unsupported extension".to_string(),
        }),
    }
}

fn pdf_not_implemented_error() -> RenderError {
    RenderError {
        code: "PDF_NOT_IMPLEMENTED".to_string(),
        message: "PDF 阅读能力尚未启用。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: "PDF renderer is not implemented in this build".to_string(),
    }
}

fn converter_not_configured_error() -> RenderError {
    RenderError {
        code: "CONVERTER_NOT_CONFIGURED".to_string(),
        message: "Office/WPS 转换器尚未配置。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: "office converter is not configured".to_string(),
    }
}

fn office_conversion_layout_from_option(
    layout: Option<&str>,
) -> Result<OfficeConversionLayout, RenderError> {
    match layout.unwrap_or("preserve") {
        "preserve" => Ok(OfficeConversionLayout::Preserve),
        "fit_width_preview" => Ok(OfficeConversionLayout::FitWidthPreview),
        _ => Err(RenderError {
            code: "UNSUPPORTED_OFFICE_LAYOUT".to_string(),
            message: "暂不支持该 Office 预览版式。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: "unsupported office layout".to_string(),
        }),
    }
}

fn converter_error_to_render_error(error: ConverterError) -> RenderError {
    RenderError {
        code: error.code,
        message: error.message,
        recoverable: error.recoverable,
        safe_to_show: error.safe_to_show,
        detail_for_report: error.detail_for_report,
    }
}

fn office_cache_io_error(error: std::io::Error) -> RenderError {
    RenderError {
        code: "OFFICE_CACHE_UNAVAILABLE".to_string(),
        message: "无法准备 Office 转换缓存。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: format!("office cache io failed: {}", error.kind()),
    }
}

fn office_session_id_for_path(path: &Path) -> String {
    format!("office-{}", recent_file_id_for_path(path))
}

#[allow(dead_code)]
pub(crate) fn cleanup_cache_session(
    cache_root: &Path,
    session_id: &str,
) -> Result<bool, RenderError> {
    remove_cache_session_dir(cache_root, session_id).map_err(|error| RenderError {
        code: "IO_ERROR".to_string(),
        message: "无法清理页面图片缓存。".to_string(),
        recoverable: true,
        safe_to_show: true,
        detail_for_report: error.to_string(),
    })
}

fn dev_repo_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

fn render_error_from_sidecar(error: SidecarError) -> RenderError {
    RenderError {
        code: error.code,
        message: error.message,
        recoverable: error.recoverable,
        safe_to_show: error.safe_to_show,
        detail_for_report: error.detail_for_report,
    }
}

#[tauri::command]
pub(crate) fn render_fake_page(page_index: u32, scale: f64) -> Result<PageBitmap, RenderError> {
    if page_index > 2 {
        return Err(RenderError {
            code: "INVALID_ARGUMENT".to_string(),
            message: "页码超出范围。".to_string(),
            recoverable: true,
            safe_to_show: true,
            detail_for_report: format!("page_index={page_index}"),
        });
    }

    let bounded_scale = scale.clamp(0.5, 3.0);
    Ok(PageBitmap {
        session_id: "fake-session-001".to_string(),
        page_index,
        scale: bounded_scale,
        width_px: (420.0 * bounded_scale).round() as u32,
        height_px: (594.0 * bounded_scale).round() as u32,
        image_ref: format!("fake://page/{page_index}@{bounded_scale:.2}"),
        duration_ms: 0,
        warnings: vec![],
    })
}

#[cfg(test)]
mod tests {
    use crate::renderer_sidecar::{
        debug_command_spec_parts, packaged_ofd_renderer_resource_command_spec,
        packaged_renderer_command_spec, CommandResult, CommandRunner, FakeCommandRunner,
        InspectSuccess, RenderSuccess, SidecarCommandSpec, SidecarDocument, SidecarEngine,
        SidecarPageInfo, SidecarRenderedPage, VersionSuccess,
    };

    use super::*;

    #[test]
    fn public_sample_command_rejects_unknown_sample_id() {
        let error = open_public_sample("local-secret".to_string())
            .expect_err("unknown sample should be rejected");

        assert_eq!(error.code, "INVALID_ARGUMENT");
        assert!(error.safe_to_show);
    }

    #[test]
    fn public_sample_command_accepts_known_sample_id() {
        let session = open_public_sample("s4c-public-embedded-font-text".to_string())
            .expect("known public sample should open");

        assert_eq!(session.file_type, "fake");
        assert_eq!(session.page_count, 3);
    }

    #[test]
    fn public_sample_command_accepts_public_regression_sample_ids() {
        for sample_id in [
            "p0-single-page-text",
            "p0-multi-page-text",
            "p0-corrupt-missing-ofdxml",
            "p0-not-ofd-renamed",
            "s4c-public-embedded-font-text",
        ] {
            open_public_sample(sample_id.to_string())
                .unwrap_or_else(|_| panic!("public sample should be allowlisted: {sample_id}"));
        }
    }

    #[test]
    fn public_sample_allowlist_files_exist() {
        let public_root = repo_root_from_manifest_dir().join("testdata/public/ofd");

        for (sample_id, filename) in PUBLIC_OFD_SAMPLES {
            assert!(
                public_root.join(filename).is_file(),
                "public sample file should exist for {sample_id}: {filename}"
            );
        }
    }

    fn assert_error_does_not_expose_path(error: &RenderError, path: &Path) {
        let path_text = path.to_string_lossy().to_string();
        let normalized_path = path_text.replace('\\', "/");

        assert!(!error.message.contains(&path_text));
        assert!(!error.message.contains(&normalized_path));
        assert!(!error.detail_for_report.contains(&path_text));
        assert!(!error.detail_for_report.contains(&normalized_path));
    }

    #[test]
    fn validate_local_ofd_rejects_non_ofd_extension() {
        let root = unique_temp_root("local-file-validation");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.txt");
        std::fs::write(&path, b"not an ofd").expect("sample should be written");

        let error = validate_local_ofd_path(&path).expect_err("non-OFD extension should fail");

        assert_eq!(error.code, "UNSUPPORTED_FILE_TYPE");
        assert!(error.safe_to_show);
        assert_error_does_not_expose_path(&error, &path);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn validate_local_ofd_rejects_missing_file() {
        let path = std::env::temp_dir().join("ldv-missing-file.ofd");

        let error = validate_local_ofd_path(&path).expect_err("missing file should fail");

        assert_eq!(error.code, "FILE_NOT_FOUND");
        assert!(error.safe_to_show);
        assert_error_does_not_expose_path(&error, &path);
    }

    #[test]
    fn validate_local_ofd_accepts_existing_ofd_file() {
        let root = unique_temp_root("local-file-validation");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.OFD");
        std::fs::write(&path, b"minimal bytes").expect("sample should be written");

        validate_local_ofd_path(&path).expect("existing OFD file should pass validation");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn validate_local_ofd_rejects_file_over_size_budget() {
        let root = unique_temp_root("local-file-validation");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("huge.ofd");
        let file = std::fs::File::create(&path).expect("huge sample should be created");
        file.set_len(DEFAULT_MAX_LOCAL_OFD_BYTES + 1)
            .expect("huge sample should be resized");

        let error = validate_local_ofd_path(&path).expect_err("huge file should fail");

        assert_eq!(error.code, "FILE_TOO_LARGE");
        assert!(error.safe_to_show);
        assert_error_does_not_expose_path(&error, &path);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn open_local_document_rejects_pdf_until_renderer_exists_with_safe_message() {
        let root = unique_temp_root("local-pdf-not-implemented");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.pdf");
        std::fs::write(&path, b"%PDF-1.4\n% public synthetic placeholder\n")
            .expect("sample should be written");
        let registry = LocalDocumentRegistry::default();
        let store = RecentFilesStore::new(root.join("recent-files.json"), DEFAULT_MAX_RECENT_FILES);

        let error = open_local_document_with_state_for_test(
            &registry,
            &store,
            path.to_string_lossy().to_string(),
        )
        .expect_err("PDF should be recognized but not opened before renderer spike");

        assert_eq!(error.code, "PDF_NOT_IMPLEMENTED");
        assert_eq!(error.message, "PDF 阅读能力尚未启用。");
        assert!(error.safe_to_show);
        assert_error_does_not_expose_path(&error, &path);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_document_extension_accepts_current_office_and_wps_formats() {
        let root = unique_temp_root("office-extension");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        for extension in ["docx", "xlsx", "pptx", "doc", "xls", "ppt", "wps", "et", "dps"] {
            let path = root.join(format!("sample.{extension}"));
            std::fs::write(&path, b"placeholder").expect("office sample should be written");
            assert!(matches!(
                local_document_extension(&path).unwrap(),
                LocalDocumentType::Office(actual) if actual == extension
            ));
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_document_extension_accepts_txt_and_log_formats() {
        let root = unique_temp_root("text-extension");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        for extension in ["txt", "log"] {
            let path = root.join(format!("sample.{extension}"));
            std::fs::write(&path, b"LDV public text").expect("text sample should be written");
            assert!(matches!(
                local_document_extension(&path).unwrap(),
                LocalDocumentType::Text(actual) if actual == extension
            ));
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_document_extension_accepts_csv_and_md_formats() {
        let root = unique_temp_root("csv-md-extension");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        for extension in ["csv", "md"] {
            let path = root.join(format!("sample.{extension}"));
            std::fs::write(&path, b"LDV public text").expect("text sample should be written");
            assert!(matches!(
                local_document_extension(&path).unwrap(),
                LocalDocumentType::Text(actual) if actual == extension
            ));
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_document_extension_accepts_image_formats() {
        let root = unique_temp_root("image-extension");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        for extension in ["png", "jpg", "jpeg", "webp"] {
            let path = root.join(format!("sample.{extension}"));
            std::fs::write(&path, b"placeholder image").expect("image sample should be written");
            assert!(matches!(
                local_document_extension(&path).unwrap(),
                LocalDocumentType::Image(actual) if actual == extension
            ));
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn open_local_image_document_copies_png_to_asset_scoped_preview_cache() {
        let root = unique_temp_root("local-image-read");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.png");
        let bytes = [
            0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, b'I', b'H',
            b'D', b'R', 0x00, 0x00, 0x02, 0x80, 0x00, 0x00, 0x01, 0xE0, 0x08, 0x02, 0x00, 0x00,
            0x00,
        ];
        std::fs::write(&path, bytes).expect("png sample should be written");

        let view = read_local_image_document_for_test(&path).expect("PNG image should read");

        assert_eq!(view.file_type, "png");
        assert_eq!(view.display_name, "sample.png");
        assert_eq!(view.width_px, 640);
        assert_eq!(view.height_px, 480);
        assert_ne!(view.source_path, path.to_string_lossy());
        assert!(view.source_path.contains("local-doc-viewer"));
        assert!(view.source_path.contains(&view.session_id));
        assert!(std::path::Path::new(&view.source_path).is_file());
        assert!(view.session_id.starts_with("image-"));

        let _ = std::fs::remove_dir_all(root);
        let _ = cleanup_render_cache_session_at_root(&dev_asset_cache_root(), &view.session_id);
    }

    #[test]
    fn open_local_image_document_versions_session_when_same_path_changes() {
        let root = unique_temp_root("local-image-versioned-session");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.png");
        let mut first_bytes = vec![
            0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, b'I',
            b'H', b'D', b'R', 0x00, 0x00, 0x02, 0x80, 0x00, 0x00, 0x01, 0xE0, 0x08, 0x02,
            0x00, 0x00, 0x00,
        ];
        std::fs::write(&path, &first_bytes).expect("first png sample should be written");

        let first = read_local_image_document_for_test(&path).expect("first PNG image should read");
        std::thread::sleep(std::time::Duration::from_millis(5));
        first_bytes.push(0);
        std::fs::write(&path, &first_bytes).expect("updated png sample should be written");

        let second =
            read_local_image_document_for_test(&path).expect("updated PNG image should read");

        assert_eq!(first.display_name, second.display_name);
        assert_ne!(first.session_id, second.session_id);
        assert_ne!(first.source_path, second.source_path);
        assert!(first.source_path.contains(&first.session_id));
        assert!(second.source_path.contains(&second.session_id));

        let _ = std::fs::remove_dir_all(root);
        let _ = cleanup_render_cache_session_at_root(&dev_asset_cache_root(), &first.session_id);
        let _ = cleanup_render_cache_session_at_root(&dev_asset_cache_root(), &second.session_id);
    }

    #[test]
    fn read_local_image_document_rejects_over_budget_image() {
        let root = unique_temp_root("local-image-huge");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("huge.png");
        let file = std::fs::File::create(&path).expect("huge image should be created");
        file.set_len(DEFAULT_MAX_LOCAL_IMAGE_BYTES + 1)
            .expect("huge image should be resized");

        let error = read_local_image_document_for_test(&path).expect_err("huge image should fail");

        assert_eq!(error.code, "IMAGE_FILE_TOO_LARGE");
        assert_eq!(error.message, "图片文件过大，暂不支持打开。");
        assert!(error.safe_to_show);
        assert_error_does_not_expose_path(&error, &path);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_files_accept_image_file_types() {
        let root = unique_temp_root("recent-image-files");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let png_path = root.join("sample.png");
        let webp_path = root.join("sample.webp");
        std::fs::write(&png_path, b"LDV public PNG placeholder").expect("png should be written");
        std::fs::write(&webp_path, b"LDV public WebP placeholder").expect("webp should be written");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);

        store
            .record_opened_image(&png_path, "png", "2026-06-17T01:00:00Z")
            .expect("png recent file should record");
        store
            .record_opened_image(&webp_path, "webp", "2026-06-17T01:01:00Z")
            .expect("webp recent file should record");

        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.entries.len(), 2);
        assert_eq!(view.entries[0].file_type, "webp");
        assert_eq!(view.entries[1].file_type, "png");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn read_local_text_document_accepts_utf8_and_strips_bom() {
        let root = unique_temp_root("local-text-read");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.txt");
        std::fs::write(&path, b"\xEF\xBB\xBFLDV public TXT fixture\n")
            .expect("text sample should be written");

        let view = read_local_text_document_for_test(&path).expect("UTF-8 text should read");

        assert_eq!(view.file_type, "txt");
        assert_eq!(view.display_name, "sample.txt");
        assert_eq!(view.text, "LDV public TXT fixture\n");
        assert_eq!(view.size_bytes, 26);
        assert!(view.session_id.starts_with("text-"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn read_local_text_document_accepts_log_files() {
        let root = unique_temp_root("local-log-read");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.log");
        std::fs::write(&path, b"2026-06-16T00:00:00Z INFO LDV public LOG fixture\n")
            .expect("log sample should be written");

        let view = read_local_text_document_for_test(&path).expect("UTF-8 log should read");

        assert_eq!(view.file_type, "log");
        assert_eq!(view.display_name, "sample.log");
        assert!(view.text.contains("LDV public LOG fixture"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn read_local_text_document_accepts_public_csv_and_markdown_fixtures() {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .nth(3)
            .expect("repo root should be above src-tauri");
        let cases = [
            (
                repo_root.join("testdata/public/text/simple-csv.csv"),
                "csv",
                "LDV public CSV fixture",
                "公开人工 CSV 样本第 1 行",
            ),
            (
                repo_root.join("testdata/public/text/simple-markdown.md"),
                "md",
                "LDV public Markdown fixture",
                "公开人工 Markdown 样本第 1 段",
            ),
        ];

        for (path, file_type, english_marker, chinese_marker) in cases {
            let view = read_local_text_document_for_test(&path)
                .expect("public CSV/Markdown fixture should read as UTF-8 text");

            assert_eq!(view.file_type, file_type);
            assert!(view.text.contains(english_marker));
            assert!(view.text.contains(chinese_marker));
            assert!(view.session_id.starts_with("text-"));
        }
    }

    #[test]
    fn read_local_text_document_keeps_source_file_unchanged() {
        let root = unique_temp_root("source-safety-text");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.txt");
        std::fs::write(&path, b"LDV public TXT fixture").expect("sample should be written");
        let before = source_file_snapshot(&path);

        let view = read_local_text_document_for_test(&path).expect("text should be read");

        assert_eq!(view.text, "LDV public TXT fixture");
        assert_source_file_unchanged(&path, before);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn read_local_text_document_rejects_invalid_utf8() {
        let root = unique_temp_root("local-text-invalid-utf8");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.txt");
        std::fs::write(&path, [0xFF, 0xFE, 0x00]).expect("invalid text should be written");

        let error = read_local_text_document_for_test(&path)
            .expect_err("invalid UTF-8 text should fail");

        assert_eq!(error.code, "TEXT_UNSUPPORTED_ENCODING");
        assert_eq!(error.message, "暂不支持该文本文件编码。");
        assert!(error.safe_to_show);
        assert!(!error.detail_for_report.contains("LDV public"));
        assert_error_does_not_expose_path(&error, &path);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn read_local_text_document_rejects_over_budget_text() {
        let root = unique_temp_root("local-text-huge");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("huge.txt");
        let file = std::fs::File::create(&path).expect("huge text should be created");
        file.set_len(DEFAULT_MAX_LOCAL_TEXT_BYTES + 1)
            .expect("huge text should be resized");

        let error = read_local_text_document_for_test(&path).expect_err("huge text should fail");

        assert_eq!(error.code, "TEXT_FILE_TOO_LARGE");
        assert_eq!(error.message, "文本文件过大，暂不支持打开。");
        assert!(error.safe_to_show);
        assert_error_does_not_expose_path(&error, &path);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_files_accept_text_file_types() {
        let root = unique_temp_root("recent-text-files");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let txt_path = root.join("sample.txt");
        let log_path = root.join("sample.log");
        std::fs::write(&txt_path, b"LDV public TXT fixture").expect("txt should be written");
        std::fs::write(&log_path, b"LDV public LOG fixture").expect("log should be written");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);

        store
            .record_opened_text(&txt_path, "txt", "2026-06-16T00:00:00Z")
            .expect("txt recent file should record");
        store
            .record_opened_text(&log_path, "log", "2026-06-16T00:01:00Z")
            .expect("log recent file should record");

        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.entries.len(), 2);
        assert_eq!(view.entries[0].file_type, "log");
        assert_eq!(view.entries[1].file_type, "txt");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_files_accept_csv_and_md_file_types() {
        let root = unique_temp_root("recent-csv-md-files");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let csv_path = root.join("sample.csv");
        let md_path = root.join("sample.md");
        std::fs::write(&csv_path, b"name,value\nLDV public CSV fixture,1\n")
            .expect("csv should be written");
        std::fs::write(&md_path, b"# LDV public Markdown fixture\n")
            .expect("markdown should be written");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);

        store
            .record_opened_text(&csv_path, "csv", "2026-06-17T00:00:00Z")
            .expect("csv recent file should record");
        store
            .record_opened_text(&md_path, "md", "2026-06-17T00:01:00Z")
            .expect("markdown recent file should record");

        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.entries.len(), 2);
        assert_eq!(view.entries[0].file_type, "md");
        assert_eq!(view.entries[1].file_type, "csv");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn validate_local_pdf_rejects_non_pdf_extension() {
        let root = unique_temp_root("local-pdf-validation");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.txt");
        std::fs::write(&path, b"%PDF-1.4\n").expect("sample should be written");

        let error = validate_local_pdf_path(&path).expect_err("non-PDF extension should fail");

        assert_eq!(error.code, "UNSUPPORTED_FILE_TYPE");
        assert!(error.safe_to_show);
        assert_error_does_not_expose_path(&error, &path);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn validate_local_pdf_rejects_missing_file() {
        let path = std::env::temp_dir().join("ldv-missing-file.pdf");

        let error = validate_local_pdf_path(&path).expect_err("missing PDF should fail");

        assert_eq!(error.code, "FILE_NOT_FOUND");
        assert!(error.safe_to_show);
        assert_error_does_not_expose_path(&error, &path);
    }

    #[test]
    fn read_local_pdf_bytes_accepts_small_pdf_without_exposing_path() {
        let root = unique_temp_root("local-pdf-read");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.pdf");
        std::fs::write(&path, b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n")
            .expect("sample should be written");
        let before = source_file_snapshot(&path);

        let bytes = read_local_pdf_bytes_for_test(&path).expect("small PDF should be readable");

        assert!(bytes.starts_with(b"%PDF-1."));
        assert_source_file_unchanged(&path, before);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn read_local_pdf_bytes_rejects_renamed_non_pdf_with_safe_message() {
        let root = unique_temp_root("local-pdf-read-invalid");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.pdf");
        std::fs::write(&path, b"not a pdf").expect("sample should be written");

        let error = read_local_pdf_bytes_for_test(&path).expect_err("non-PDF content should fail");

        assert_eq!(error.code, "PDF_STRUCTURE_ERROR");
        assert_eq!(error.message, "无法打开该 PDF 文件。");
        assert!(error.safe_to_show);
        assert_error_does_not_expose_path(&error, &path);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn read_local_pdf_bytes_rejects_file_over_size_budget() {
        let root = unique_temp_root("local-pdf-read-huge");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("huge.pdf");
        let file = std::fs::File::create(&path).expect("huge sample should be created");
        file.set_len(DEFAULT_MAX_LOCAL_PDF_BYTES + 1)
            .expect("huge sample should be resized");

        let error = read_local_pdf_bytes_for_test(&path).expect_err("huge PDF should fail");

        assert_eq!(error.code, "FILE_TOO_LARGE");
        assert!(error.safe_to_show);
        assert_error_does_not_expose_path(&error, &path);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_session_uses_runner_after_validation() {
        let root = unique_temp_root("local-file-session");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
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
                "pageSizes": [
                    {"index": 0, "widthPt": 210.0, "heightPt": 297.0}
                ]
            },
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());

        let session = local_ofd_session_with_runner(&runner, &path)
            .expect("validated local OFD should inspect through runner");

        assert_eq!(session.file_type, "ofd");
        assert_eq!(session.page_count, 1);
        assert!(!session.id.contains("sample.ofd"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_session_uses_safe_message_for_renderer_error() {
        let root = unique_temp_root("local-file-session");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("private-broken.ofd");
        std::fs::write(&path, b"fake broken ofd bytes").expect("sample should be written");
        let path_text = path.to_string_lossy().replace('\\', "/");
        let output = format!(
            r#"{{
                "ok": false,
                "protocolVersion": "1.0",
                "error": {{
                    "code": "OFD_INVALID_PACKAGE",
                    "message": "{path_text} Zip signature not found",
                    "detailForReport": "{path_text} Zip signature not found",
                    "recoverable": false,
                    "safeToShow": true
                }}
            }}"#
        );
        let runner = FakeCommandRunner::new(3, output, String::new());

        let error = local_ofd_session_with_runner(&runner, &path)
            .expect_err("renderer error should map to safe document error");

        assert_eq!(error.code, "OFD_INVALID_PACKAGE");
        assert_eq!(error.message, "无法打开该 OFD 文件。");
        assert!(error.safe_to_show);
        assert!(!error.message.contains(&path_text));
        assert!(error.detail_for_report.contains(&path_text));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_session_forces_known_safe_message_when_renderer_marks_detail_unsafe() {
        let root = unique_temp_root("local-file-session-unsafe-renderer-message");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("private-structure-error.ofd");
        std::fs::write(&path, b"fake broken ofd bytes").expect("sample should be written");
        let path_text = path.to_string_lossy().replace('\\', "/");
        let output = format!(
            r#"{{
                "ok": false,
                "protocolVersion": "1.0",
                "error": {{
                    "code": "OFD_STRUCTURE_ERROR",
                    "message": "{path_text} missing OFD.xml",
                    "detailForReport": "{path_text} missing OFD.xml",
                    "recoverable": false,
                    "safeToShow": false
                }}
            }}"#
        );
        let runner = FakeCommandRunner::new(3, output, String::new());

        let error = local_ofd_session_with_runner(&runner, &path)
            .expect_err("renderer structure error should map to safe document error");

        assert_eq!(error.code, "OFD_STRUCTURE_ERROR");
        assert_eq!(error.message, "无法打开该 OFD 文件。");
        assert!(error.safe_to_show);
        assert!(!error.message.contains(&path_text));
        assert!(error.detail_for_report.contains(&path_text));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_document_registry_stores_path_by_session_id() {
        let registry = LocalDocumentRegistry::default();
        let path = PathBuf::from("D:/public/artificial.ofd");

        registry.remember("local-selected-ofd", &path);

        assert_eq!(registry.path_for("local-selected-ofd"), Some(path));
    }

    #[test]
    fn local_document_registry_forgets_session_id() {
        let registry = LocalDocumentRegistry::default();
        let path = PathBuf::from("D:/public/artificial.ofd");

        registry.remember("local-selected-ofd", &path);
        assert!(registry.forget("local-selected-ofd"));

        assert_eq!(registry.path_for("local-selected-ofd"), None);
    }

    #[test]
    fn office_conversion_registry_remembers_converted_pdf_by_session_id() {
        let registry = LocalDocumentRegistry::default();
        let root = unique_temp_root("office-registry");
        let original = root.join("simple-text.docx");
        let converted = root
            .join("cache")
            .join("office-session")
            .join("out")
            .join("simple-text.pdf");
        std::fs::create_dir_all(converted.parent().unwrap())
            .expect("converted parent should exist");
        std::fs::write(&original, b"docx").expect("original should exist");
        std::fs::write(&converted, b"%PDF-1.7\n").expect("converted should exist");

        registry.remember_office_conversion("office-session-001", &original, &converted);

        let stored = registry
            .office_conversion_for("office-session-001")
            .expect("office conversion should be remembered");
        assert_eq!(stored.original_path, original);
        assert_eq!(stored.converted_pdf_path, converted);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn open_local_office_returns_not_configured_when_converter_disabled() {
        let root = unique_temp_root("office-disabled");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let input = root.join("simple-text.docx");
        std::fs::write(&input, b"placeholder").expect("input should exist");
        let registry = LocalDocumentRegistry::default();
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);

        let error = open_local_office_as_pdf_with_state_for_test(
            &registry,
            &store,
            OfficeConverterConfig::disabled(),
            &root.join("cache").join("office"),
            input.to_string_lossy().to_string(),
            OfficeConversionLayout::Preserve,
            "2026-06-15T12:00:00Z",
        )
        .expect_err("disabled converter should fail safely");

        assert_eq!(error.code, "CONVERTER_NOT_CONFIGURED");
        assert_eq!(store.list_recent_files().unwrap().entries.len(), 0);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn office_conversion_layout_only_accepts_controlled_values() {
        assert_eq!(
            office_conversion_layout_from_option(None).unwrap(),
            OfficeConversionLayout::Preserve
        );
        assert_eq!(
            office_conversion_layout_from_option(Some("preserve")).unwrap(),
            OfficeConversionLayout::Preserve
        );
        assert_eq!(
            office_conversion_layout_from_option(Some("fit_width_preview")).unwrap(),
            OfficeConversionLayout::FitWidthPreview
        );

        let error = office_conversion_layout_from_option(Some("--convert-to=html"))
            .expect_err("arbitrary converter args must be rejected");

        assert_eq!(error.code, "UNSUPPORTED_OFFICE_LAYOUT");
        assert_eq!(error.detail_for_report, "unsupported office layout");
    }

    #[test]
    fn office_converter_config_from_env_requires_explicit_absolute_file() {
        let root = unique_temp_root("office-config-env");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let exe_name = if cfg!(windows) {
            "soffice.exe"
        } else {
            "soffice"
        };
        let exe = root.join(exe_name);
        std::fs::write(&exe, b"placeholder").expect("explicit executable should exist");

        assert!(OfficeConverterConfig::from_env_value(None).is_disabled());
        assert!(OfficeConverterConfig::from_env_value(Some("soffice")).is_disabled());
        assert!(OfficeConverterConfig::from_env_value(Some(
            root.join("missing").to_string_lossy().as_ref()
        ))
        .is_disabled());

        let config = OfficeConverterConfig::from_env_value(Some(exe.to_string_lossy().as_ref()));
        assert_eq!(config.executable_path.as_deref(), Some(exe.as_path()));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn office_converter_config_prefers_explicit_setting_over_env() {
        let root = unique_temp_root("office-config-setting");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let setting_exe = root.join("setting-soffice.exe");
        let env_exe = root.join("env-soffice.exe");
        std::fs::write(&setting_exe, b"setting").expect("setting executable should exist");
        std::fs::write(&env_exe, b"env").expect("env executable should exist");

        let config = OfficeConverterConfig::from_setting_or_env_value(
            Some(setting_exe.to_string_lossy().as_ref()),
            Some(env_exe.to_string_lossy().as_ref()),
        );

        assert_eq!(config.executable_path.as_deref(), Some(setting_exe.as_path()));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn office_converter_config_does_not_fallback_to_env_when_explicit_setting_is_invalid() {
        let root = unique_temp_root("office-config-invalid-setting");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let env_exe = root.join("env-soffice.exe");
        std::fs::write(&env_exe, b"env").expect("env executable should exist");

        let config = OfficeConverterConfig::from_setting_or_env_value(
            Some(root.join("missing-soffice.exe").to_string_lossy().as_ref()),
            Some(env_exe.to_string_lossy().as_ref()),
        );

        assert!(config.is_disabled());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn open_local_office_with_fake_runner_records_original_and_converted_session() {
        for extension in ["docx", "doc", "xls", "ppt", "wps", "et", "dps"] {
            let root = unique_temp_root(&format!("office-open-{extension}"));
            std::fs::create_dir_all(&root).expect("temp root should be created");
            let input = root.join(format!("sample.{extension}"));
            let cache_root = root.join("cache").join("office");
            if extension == "docx" {
                write_minimal_docx(&input);
            } else {
                std::fs::write(&input, b"placeholder").expect("input should exist");
            }
            let before = source_file_snapshot(&input);
            let registry = LocalDocumentRegistry::default();
            let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
            let runner = FakeOfficeConverterRunner::writes_pdf();

            let opened = open_local_office_as_pdf_with_runner_for_test(
                &registry,
                &store,
                &runner,
                &cache_root,
                input.to_string_lossy().to_string(),
                OfficeConversionLayout::Preserve,
                "2026-06-15T12:00:00Z",
            )
            .expect("office should convert");

            assert_eq!(opened.original_file_type, extension);
            assert_eq!(opened.display_name, format!("sample.{extension}"));
            assert!(opened.output_pdf_size_bytes > 0);
            assert!(registry.office_conversion_for(&opened.session_id).is_some());
            assert_source_file_unchanged(&input, before);
            let recent = store.list_recent_files().unwrap();
            assert_eq!(recent.entries[0].file_type, extension);

            let _ = std::fs::remove_dir_all(root);
        }
    }

    #[test]
    fn open_local_office_converter_errors_do_not_record_success_state() {
        for (code, expected_message, expected_recoverable) in [
            (
                "OFFICE_PASSWORD_PROTECTED",
                "该 Office 文档受密码保护，暂不支持打开。",
                true,
            ),
            ("OFFICE_CONVERSION_TIMEOUT", "Office 文档转换超时。", true),
            (
                "OFFICE_CONVERTER_OUTPUT_TOO_LARGE",
                "转换器输出过大，已停止处理。",
                false,
            ),
            (
                "OFFICE_OUTPUT_TOO_LARGE",
                "转换结果过大，已停止处理。",
                false,
            ),
        ] {
            let root = unique_temp_root(&format!("office-converter-error-{code}"));
            std::fs::create_dir_all(&root).expect("temp root should be created");
            let input = root.join("simple-text.docx");
            let cache_root = root.join("cache").join("office");
            write_minimal_docx(&input);
            let registry = LocalDocumentRegistry::default();
            let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
            let runner = FakeOfficeConverterRunner::protocol_error(code, expected_recoverable);

            let error = open_local_office_as_pdf_with_runner_for_test(
                &registry,
                &store,
                &runner,
                &cache_root,
                input.to_string_lossy().to_string(),
                OfficeConversionLayout::Preserve,
                "2026-06-16T12:00:00Z",
            )
            .expect_err("converter error should fail safely");

            assert_eq!(error.code, code);
            assert_eq!(error.message, expected_message);
            assert_eq!(error.recoverable, expected_recoverable);
            assert!(error.safe_to_show);
            assert_eq!(store.list_recent_files().unwrap().entries.len(), 0);
            assert!(registry
                .office_conversion_for(&office_session_id_for_path(&input))
                .is_none());

            let _ = std::fs::remove_dir_all(root);
        }
    }

    #[test]
    fn open_local_legacy_office_conversion_failures_do_not_record_success_state() {
        for extension in ["doc", "xls", "ppt"] {
            let root = unique_temp_root(&format!("legacy-office-conversion-failed-{extension}"));
            std::fs::create_dir_all(&root).expect("temp root should be created");
            let input = root.join(format!("corrupt.{extension}"));
            let cache_root = root.join("cache").join("office");
            std::fs::write(&input, b"not a valid legacy office binary")
                .expect("legacy placeholder should exist");
            let registry = LocalDocumentRegistry::default();
            let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
            let runner = FakeOfficeConverterRunner::nonzero_exit();

            let error = open_local_office_as_pdf_with_runner_for_test(
                &registry,
                &store,
                &runner,
                &cache_root,
                input.to_string_lossy().to_string(),
                OfficeConversionLayout::Preserve,
                "2026-06-16T12:00:00Z",
            )
            .expect_err("legacy conversion failure should fail safely");

            assert_eq!(error.code, "OFFICE_CONVERSION_FAILED");
            assert_eq!(error.message, "Office 文档转换失败。");
            assert!(error.recoverable);
            assert!(error.safe_to_show);
            assert_eq!(store.list_recent_files().unwrap().entries.len(), 0);
            assert!(registry
                .office_conversion_for(&office_session_id_for_path(&input))
                .is_none());

            let _ = std::fs::remove_dir_all(root);
        }
    }

    #[test]
    fn open_local_office_rejects_damaged_ooxml_before_conversion() {
        let root = unique_temp_root("office-damaged-input");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let input = root.join("corrupt-not-zip.docx");
        let cache_root = root.join("cache").join("office");
        std::fs::write(&input, b"not an OOXML zip package").expect("input should exist");
        let registry = LocalDocumentRegistry::default();
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
        let runner = FakeOfficeConverterRunner::writes_pdf();

        let error = open_local_office_as_pdf_with_runner_for_test(
            &registry,
            &store,
            &runner,
            &cache_root,
            input.to_string_lossy().to_string(),
            OfficeConversionLayout::Preserve,
            "2026-06-16T12:00:00Z",
        )
        .expect_err("damaged OOXML should fail before conversion");

        assert_eq!(error.code, "OFFICE_INPUT_INVALID_PACKAGE");
        assert_eq!(error.message, "无法读取该 Office 文档。");
        assert!(error.safe_to_show);
        assert_eq!(store.list_recent_files().unwrap().entries.len(), 0);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn open_local_office_rejects_ooxml_missing_main_entry_before_conversion() {
        let root = unique_temp_root("office-missing-main-input");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let input = root.join("corrupt-missing-main.docx");
        let cache_root = root.join("cache").join("office");
        write_docx_missing_main_entry(&input);
        let registry = LocalDocumentRegistry::default();
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
        let runner = FakeOfficeConverterRunner::writes_pdf();

        let error = open_local_office_as_pdf_with_runner_for_test(
            &registry,
            &store,
            &runner,
            &cache_root,
            input.to_string_lossy().to_string(),
            OfficeConversionLayout::Preserve,
            "2026-06-16T12:00:00Z",
        )
        .expect_err("OOXML without main document entry should fail before conversion");

        assert_eq!(error.code, "OFFICE_INPUT_INVALID_PACKAGE");
        assert_eq!(error.message, "无法读取该 Office 文档。");
        assert!(error.safe_to_show);
        assert_eq!(store.list_recent_files().unwrap().entries.len(), 0);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn open_recent_office_returns_not_configured_when_converter_disabled() {
        let root = unique_temp_root("office-recent-disabled");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let input = root.join("simple-text.docx");
        std::fs::write(&input, b"placeholder").expect("input should exist");
        let registry = LocalDocumentRegistry::default();
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
        store
            .record_opened_office(&input, "docx", "2026-06-15T12:00:00Z")
            .expect("recent office original should be recorded");
        let recent = store.list_recent_files().expect("recent files should load");

        let error = open_recent_office_as_pdf_with_store_for_test(
            &registry,
            &store,
            OfficeConverterConfig::disabled(),
            &root.join("cache").join("office"),
            recent.entries[0].id.clone(),
            OfficeConversionLayout::Preserve,
            "2026-06-15T12:01:00Z",
        )
        .expect_err("disabled converter should fail safely for recent office");

        assert_eq!(error.code, "CONVERTER_NOT_CONFIGURED");
        assert!(registry.office_conversion_for("missing").is_none());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_files_store_records_successful_open_without_exposing_path_in_view() {
        let root = unique_temp_root("recent-files-store");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
        let path = root.join("private-contract.ofd");

        store
            .record_opened_ofd(&path, "2026-06-09T12:00:00Z")
            .expect("recent file should be recorded");

        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.enabled, true);
        assert_eq!(view.entries.len(), 1);
        assert_eq!(view.entries[0].display_name, "private-contract.ofd");
        assert_eq!(view.entries[0].file_type, "ofd");
        assert!(view.entries[0].location_hint.is_some());
        assert!(!view.entries[0]
            .location_hint
            .as_deref()
            .unwrap()
            .contains("private-contract.ofd"));
        let view_json = serde_json::to_string(&view).expect("view should serialize");
        assert!(view_json.contains("private-contract.ofd"));
        assert!(!view_json.contains("absolute_path"));
        assert!(!view_json.contains(&root.to_string_lossy().to_string()));
        assert!(!view_json.contains(&root.to_string_lossy().replace('\\', "/")));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_files_store_records_pdf_without_exposing_path_in_view() {
        let root = unique_temp_root("recent-files-store-pdf");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
        let path = root.join("simple-text.pdf");

        store
            .record_opened_pdf(&path, "2026-06-10T12:00:00Z")
            .expect("recent PDF file should be recorded");

        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.entries.len(), 1);
        assert_eq!(view.entries[0].display_name, "simple-text.pdf");
        assert_eq!(view.entries[0].file_type, "pdf");
        let view_json = serde_json::to_string(&view).expect("view should serialize");
        assert!(view_json.contains("simple-text.pdf"));
        assert!(!view_json.contains("absolute_path"));
        assert!(!view_json.contains(&root.to_string_lossy().to_string()));
        assert!(!view_json.contains(&root.to_string_lossy().replace('\\', "/")));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_files_store_records_office_original_not_converted_pdf() {
        let root = unique_temp_root("recent-office");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
        let original = root.join("simple-text.docx");
        let converted = root
            .join("cache")
            .join("office-session")
            .join("out")
            .join("simple-text.pdf");
        std::fs::create_dir_all(converted.parent().unwrap())
            .expect("converted parent should exist");
        std::fs::write(&original, b"docx").expect("original should exist");
        std::fs::write(&converted, b"%PDF-1.7").expect("converted pdf should exist");

        store
            .record_opened_office(&original, "docx", "2026-06-15T12:00:00Z")
            .expect("office original should be recorded");

        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.entries[0].display_name, "simple-text.docx");
        assert_eq!(view.entries[0].file_type, "docx");
        assert_eq!(
            store.path_for_recent_id(&view.entries[0].id),
            Some(original)
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_pdf_reopen_refreshes_existing_entry() {
        let root = unique_temp_root("recent-files-store-pdf-refresh");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
        let first_path = root.join("first.pdf");
        let second_path = root.join("second.pdf");
        std::fs::write(&first_path, b"%PDF-1.4\n% first\n").expect("first PDF should be written");
        std::fs::write(&second_path, b"%PDF-1.4\n% second\n")
            .expect("second PDF should be written");

        let first_id = store
            .record_opened_pdf(&first_path, "2026-06-10T12:00:00Z")
            .expect("first PDF should be recorded")
            .id;
        store
            .record_opened_pdf(&second_path, "2026-06-10T12:01:00Z")
            .expect("second PDF should be recorded");

        let view =
            record_recent_pdf_opened_with_store_for_test(&store, &first_id, "2026-06-10T12:02:00Z")
                .expect("reopened recent PDF should refresh");

        assert_eq!(view.entries.len(), 2);
        assert_eq!(view.entries[0].display_name, "first.pdf");
        assert_eq!(view.entries[0].file_type, "pdf");
        assert_eq!(view.entries[0].opened_at, "2026-06-10T12:02:00Z");
        assert_eq!(view.entries[1].display_name, "second.pdf");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_files_store_updates_duplicate_path_and_trims_old_entries() {
        let root = unique_temp_root("recent-files-store");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 3);

        for index in 0..5 {
            store
                .record_opened_ofd(
                    &root.join(format!("sample-{index}.ofd")),
                    &format!("2026-06-09T12:00:0{index}Z"),
                )
                .expect("recent file should be recorded");
        }
        store
            .record_opened_ofd(&root.join("sample-3.ofd"), "2026-06-09T12:01:00Z")
            .expect("duplicate recent file should update");

        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.entries.len(), 3);
        assert_eq!(view.entries[0].display_name, "sample-3.ofd");
        assert_eq!(view.entries[0].opened_at, "2026-06-09T12:01:00Z");
        assert_eq!(
            view.entries
                .iter()
                .filter(|entry| entry.display_name == "sample-3.ofd")
                .count(),
            1
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_files_view_includes_short_location_hint_for_same_name_files() {
        let root = unique_temp_root("recent-files-store");
        let first_root = root.join("team-a").join("archive");
        let second_root = root.join("team-b").join("archive");
        std::fs::create_dir_all(&first_root).expect("first nested root should be created");
        std::fs::create_dir_all(&second_root).expect("second nested root should be created");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);

        store
            .record_opened_ofd(&first_root.join("same-name.ofd"), "2026-06-09T12:00:00Z")
            .expect("first recent file should be recorded");
        store
            .record_opened_ofd(&second_root.join("same-name.ofd"), "2026-06-09T12:01:00Z")
            .expect("second recent file should be recorded");

        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.entries.len(), 2);
        assert_eq!(view.entries[0].display_name, "same-name.ofd");
        assert_eq!(view.entries[1].display_name, "same-name.ofd");

        let expected_latest_hint = format!(
            "...{}team-b{}archive",
            std::path::MAIN_SEPARATOR,
            std::path::MAIN_SEPARATOR
        );
        assert_eq!(
            view.entries[0].location_hint.as_deref(),
            Some(expected_latest_hint.as_str())
        );
        assert!(!view.entries[0]
            .location_hint
            .as_deref()
            .unwrap()
            .contains("same-name.ofd"));

        let view_json = serde_json::to_string(&view).expect("view should serialize");
        assert!(!view_json.contains(&root.to_string_lossy().to_string()));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_files_store_can_disable_clear_and_remove_entries() {
        let root = unique_temp_root("recent-files-store");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);
        let first = root.join("first.ofd");
        let second = root.join("second.ofd");
        std::fs::write(&first, b"first source").expect("first source should exist");
        std::fs::write(&second, b"second source").expect("second source should exist");
        let first_before = source_file_snapshot(&first);
        let second_before = source_file_snapshot(&second);

        let first_id = store
            .record_opened_ofd(&first, "2026-06-09T12:00:00Z")
            .expect("recent file should be recorded")
            .id;
        store
            .record_opened_ofd(&second, "2026-06-09T12:01:00Z")
            .expect("recent file should be recorded");
        assert!(store
            .remove_recent_file(&first_id)
            .expect("recent file should be removed"));
        assert_eq!(store.path_for_recent_id(&first_id), None);
        assert_source_file_unchanged(&first, first_before);

        store
            .set_recent_files_enabled(false)
            .expect("recent files should disable");
        store
            .record_opened_ofd(&root.join("third.ofd"), "2026-06-09T12:02:00Z")
            .expect("disabled recent store should ignore new records");
        let disabled_view = store.list_recent_files().expect("recent files should load");
        assert_eq!(disabled_view.enabled, false);
        assert_eq!(disabled_view.entries.len(), 1);

        store
            .clear_recent_files()
            .expect("recent files should clear");
        let cleared_view = store.list_recent_files().expect("recent files should load");
        assert_eq!(cleared_view.entries.len(), 0);
        assert_eq!(cleared_view.enabled, false);
        assert_source_file_unchanged(&second, second_before);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recent_files_store_for_app_data_dir_uses_dedicated_json_file() {
        let root = unique_temp_root("recent-files-app-data");
        let store = recent_files_store_for_app_data_dir(&root);

        assert_eq!(store.storage_path, root.join("recent-files.json"));
        assert_eq!(store.max_entries, DEFAULT_MAX_RECENT_FILES);
    }

    #[test]
    fn recent_file_path_for_id_rejects_unknown_id_safely() {
        let root = unique_temp_root("recent-files-open");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);

        let error = recent_file_path_for_id(&store, "missing-id")
            .expect_err("unknown recent file id should fail safely");

        assert_eq!(error.code, "RECENT_FILE_NOT_FOUND");
        assert!(error.safe_to_show);
        assert!(!error.detail_for_report.contains('\\'));
        assert!(!error.detail_for_report.contains('/'));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_session_with_registry_remembers_selected_path() {
        let root = unique_temp_root("local-file-registry-session");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
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
                "pageSizes": [
                    {"index": 0, "widthPt": 210.0, "heightPt": 297.0}
                ]
            },
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());
        let registry = LocalDocumentRegistry::default();

        let session = local_ofd_session_with_registry(&registry, &runner, &path)
            .expect("validated local OFD should inspect and register path");

        assert!(session.id.starts_with("local-"));
        assert!(!session.id.contains("sample"));
        assert_eq!(registry.path_for(&session.id), Some(path));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_session_with_registry_reuses_cached_inspect_for_same_file_version() {
        struct RecordingInspectRunner {
            result: CommandResult,
            calls: std::sync::Mutex<Vec<Vec<String>>>,
        }

        impl CommandRunner for RecordingInspectRunner {
            fn run(&self, args: &[String]) -> CommandResult {
                self.calls
                    .lock()
                    .expect("calls mutex should not be poisoned")
                    .push(args.to_vec());
                self.result.clone()
            }
        }

        let root = unique_temp_root("local-file-registry-session-cache");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("private-name.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
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
                "pageSizes": [
                    {"index": 0, "widthPt": 210.0, "heightPt": 297.0}
                ]
            },
            "warnings": []
        }"#;
        let runner = RecordingInspectRunner {
            result: CommandResult {
                exit_code: 0,
                stdout: output.to_string(),
                stderr: String::new(),
            },
            calls: std::sync::Mutex::new(vec![]),
        };
        let registry = LocalDocumentRegistry::default();

        let first_session = local_ofd_session_with_registry(&registry, &runner, &path)
            .expect("first local OFD should inspect and register path");
        let second_session = local_ofd_session_with_registry(&registry, &runner, &path)
            .expect("second local OFD should reuse cached inspect");

        assert_eq!(first_session.id, second_session.id);
        assert_eq!(first_session.page_count, second_session.page_count);
        assert_eq!(
            runner
                .calls
                .lock()
                .expect("calls mutex should not be poisoned")
                .len(),
            1,
            "same path and file version should not inspect twice"
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_session_id_is_path_scoped_without_exposing_filename() {
        let root = unique_temp_root("local-file-registry-session-id");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let first_path = root.join("first-private-name.ofd");
        let second_path = root.join("second-private-name.ofd");
        std::fs::write(&first_path, b"fake ofd bytes").expect("first sample should be written");
        std::fs::write(&second_path, b"fake ofd bytes").expect("second sample should be written");
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
                "pageSizes": [
                    {"index": 0, "widthPt": 210.0, "heightPt": 297.0}
                ]
            },
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());
        let registry = LocalDocumentRegistry::default();

        let first_session = local_ofd_session_with_registry(&registry, &runner, &first_path)
            .expect("first local OFD should inspect and register path");
        let second_session = local_ofd_session_with_registry(&registry, &runner, &second_path)
            .expect("second local OFD should inspect and register path");

        assert_ne!(first_session.id, second_session.id);
        assert!(first_session.id.starts_with("local-"));
        assert!(second_session.id.starts_with("local-"));
        assert!(!first_session.id.contains("private-name"));
        assert!(!second_session.id.contains("private-name"));
        assert_eq!(registry.path_for(&first_session.id), Some(first_path));
        assert_eq!(registry.path_for(&second_session.id), Some(second_path));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_session_id_changes_when_same_path_file_version_changes() {
        let root = unique_temp_root("local-file-registry-session-version");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("private-name.ofd");
        std::fs::write(&path, b"first fake ofd bytes").expect("first sample should be written");
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
                "pageSizes": [
                    {"index": 0, "widthPt": 210.0, "heightPt": 297.0}
                ]
            },
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());
        let registry = LocalDocumentRegistry::default();

        let first_session = local_ofd_session_with_registry(&registry, &runner, &path)
            .expect("first local OFD should inspect and register path");
        std::fs::write(&path, b"second fake ofd bytes with new size")
            .expect("second sample should replace first sample");
        let second_session = local_ofd_session_with_registry(&registry, &runner, &path)
            .expect("second local OFD should inspect and register path");

        assert_ne!(first_session.id, second_session.id);
        assert!(first_session.id.starts_with("local-"));
        assert!(second_session.id.starts_with("local-"));
        assert!(!first_session.id.contains("private-name"));
        assert!(!second_session.id.contains("private-name"));
        assert_eq!(registry.path_for(&first_session.id), Some(path.clone()));
        assert_eq!(registry.path_for(&second_session.id), Some(path.clone()));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_session_with_recent_files_records_successful_open() {
        let root = unique_temp_root("local-file-recent-session");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
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
                "pageSizes": [
                    {"index": 0, "widthPt": 210.0, "heightPt": 297.0}
                ]
            },
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());
        let registry = LocalDocumentRegistry::default();
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);

        let session = local_ofd_session_with_recent_files(
            &registry,
            &runner,
            &path,
            &store,
            "2026-06-09T12:00:00Z",
        )
        .expect("validated local OFD should inspect and record recent file");

        assert!(session.id.starts_with("local-"));
        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.entries.len(), 1);
        assert_eq!(view.entries[0].display_name, "sample.ofd");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_session_with_recent_files_refreshes_existing_recent_entry() {
        let root = unique_temp_root("local-file-recent-session");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let first_path = root.join("first.ofd");
        let second_path = root.join("second.ofd");
        std::fs::write(&first_path, b"fake first ofd bytes")
            .expect("first sample should be written");
        std::fs::write(&second_path, b"fake second ofd bytes")
            .expect("second sample should be written");
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
                "pageSizes": [
                    {"index": 0, "widthPt": 210.0, "heightPt": 297.0}
                ]
            },
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());
        let registry = LocalDocumentRegistry::default();
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);

        local_ofd_session_with_recent_files(
            &registry,
            &runner,
            &first_path,
            &store,
            "2026-06-09T12:00:00Z",
        )
        .expect("first local OFD should record");
        local_ofd_session_with_recent_files(
            &registry,
            &runner,
            &second_path,
            &store,
            "2026-06-09T12:01:00Z",
        )
        .expect("second local OFD should record");
        let first_id = recent_file_id_for_path(&first_path);
        open_recent_file_with_runner(
            &registry,
            &runner,
            &store,
            &first_id,
            "2026-06-09T12:02:00Z",
        )
        .expect("reopening from recent file should refresh the entry");

        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.entries.len(), 2);
        assert_eq!(view.entries[0].display_name, "first.ofd");
        assert_eq!(view.entries[0].opened_at, "2026-06-09T12:02:00Z");
        assert_eq!(view.entries[1].display_name, "second.ofd");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_session_with_recent_files_does_not_record_failed_open() {
        let root = unique_temp_root("local-file-recent-session");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.txt");
        std::fs::write(&path, b"not an ofd").expect("sample should be written");
        let runner = FakeCommandRunner::new(0, "{}".to_string(), String::new());
        let registry = LocalDocumentRegistry::default();
        let store = RecentFilesStore::new(root.join("recent-files.json"), 10);

        let error = local_ofd_session_with_recent_files(
            &registry,
            &runner,
            &path,
            &store,
            "2026-06-09T12:00:00Z",
        )
        .expect_err("invalid local file should fail before recording");

        assert_eq!(error.code, "UNSUPPORTED_FILE_TYPE");
        let view = store.list_recent_files().expect("recent files should load");
        assert_eq!(view.entries.len(), 0);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn open_local_ofd_with_dev_renderer_rejects_non_ofd_before_renderer() {
        let root = unique_temp_root("local-file-command");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.txt");
        std::fs::write(&path, b"not an ofd").expect("sample should be written");
        let registry = LocalDocumentRegistry::default();

        let error =
            open_local_ofd_with_dev_renderer_state(&registry, path.to_string_lossy().to_string())
                .expect_err("non-OFD path should fail before renderer");

        assert_eq!(error.code, "UNSUPPORTED_FILE_TYPE");
        assert!(error.safe_to_show);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn startup_document_path_from_args_uses_first_supported_document_argument() {
        let args = [
            "local-doc-viewer",
            "--ignored",
            "/tmp/not-supported.tmp",
            "/home/ldv/sample.ofd",
            "/home/ldv/sample.pdf",
            "/home/ldv/second.ofd",
        ];

        assert_eq!(
            startup_document_path_from_args(args),
            Some("/home/ldv/sample.ofd".to_string())
        );
    }

    #[test]
    fn startup_document_path_from_args_accepts_uppercase_extension() {
        let args = ["local-doc-viewer", "/home/ldv/sample.PDF"];

        assert_eq!(
            startup_document_path_from_args(args),
            Some("/home/ldv/sample.PDF".to_string())
        );
    }

    #[test]
    fn startup_document_path_from_args_accepts_current_office_and_wps_extensions() {
        let args = ["local-doc-viewer", "/home/ldv/simple-text.docx"];

        assert_eq!(
            startup_document_path_from_args(args),
            Some("/home/ldv/simple-text.docx".to_string())
        );

        let legacy_args = ["local-doc-viewer", "/home/ldv/simple-text.doc"];

        assert_eq!(
            startup_document_path_from_args(legacy_args),
            Some("/home/ldv/simple-text.doc".to_string())
        );

        for path in [
            "/home/ldv/simple-text.wps",
            "/home/ldv/simple-sheet.et",
            "/home/ldv/simple-slide.dps",
        ] {
            assert_eq!(
                startup_document_path_from_args(["local-doc-viewer", path]),
                Some(path.to_string())
            );
        }
    }

    #[test]
    fn startup_document_path_from_args_accepts_text_extensions() {
        for path in ["/home/ldv/simple-text.txt", "/home/ldv/simple-log.log"] {
            assert_eq!(
                startup_document_path_from_args(["local-doc-viewer", path]),
                Some(path.to_string())
            );
        }
    }

    #[test]
    fn startup_document_path_from_args_accepts_csv_and_md_extensions() {
        for path in ["/home/ldv/simple-sheet.csv", "/home/ldv/simple-note.md"] {
            assert_eq!(
                startup_document_path_from_args(["local-doc-viewer", path]),
                Some(path.to_string())
            );
        }
    }

    #[test]
    fn startup_document_path_from_args_accepts_image_extensions() {
        for path in [
            "/home/ldv/simple-image.png",
            "/home/ldv/simple-photo.jpg",
            "/home/ldv/simple-photo.jpeg",
            "/home/ldv/simple-web.webp",
        ] {
            assert_eq!(
                startup_document_path_from_args(["local-doc-viewer", path]),
                Some(path.to_string())
            );
        }
    }

    #[test]
    fn startup_document_path_from_args_ignores_missing_supported_document_argument() {
        let args = ["local-doc-viewer", "--flag", "/home/ldv/readme.tmp"];

        assert_eq!(startup_document_path_from_args(args), None);
    }

    #[test]
    fn local_ofd_page_rejects_unknown_session_id() {
        let registry = LocalDocumentRegistry::default();
        let runner = FakeCommandRunner::new(0, "{}".to_string(), String::new());

        let error = local_ofd_page_with_runner(
            &registry,
            &runner,
            std::path::Path::new("D:/cache"),
            "missing-session",
            0,
            1.0,
        )
        .expect_err("unknown local session should be rejected");

        assert_eq!(error.code, "INVALID_ARGUMENT");
        assert!(error.safe_to_show);
    }

    #[test]
    fn local_ofd_page_uses_registered_path_and_fake_render_runner() {
        let root = unique_temp_root("local-file-page");
        let cache_root = root.join("cache");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
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
                    "index": 0,
                    "widthPx": 595,
                    "heightPx": 842,
                    "imagePath": "D:/cache/local-selected-ofd/0.png"
                }
            ],
            "durationMs": 70,
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());
        let registry = LocalDocumentRegistry::default();
        registry.remember("local-selected-ofd", &path);

        let bitmap = local_ofd_page_with_runner(
            &registry,
            &runner,
            &cache_root,
            "local-selected-ofd",
            0,
            1.0,
        )
        .expect("registered local session should render");

        assert_eq!(bitmap.session_id, "local-selected-ofd");
        assert_eq!(bitmap.page_index, 0);
        assert_eq!(bitmap.width_px, 595);
        assert_eq!(bitmap.image_ref, "D:/cache/local-selected-ofd/0.png");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_page_uses_screen_preview_dpi_instead_of_print_density() {
        struct RecordingRenderRunner {
            result: CommandResult,
            calls: std::sync::Mutex<Vec<Vec<String>>>,
        }

        impl CommandRunner for RecordingRenderRunner {
            fn run(&self, args: &[String]) -> CommandResult {
                self.calls
                    .lock()
                    .expect("calls mutex should not be poisoned")
                    .push(args.to_vec());
                self.result.clone()
            }
        }

        let root = unique_temp_root("local-file-page-dpi");
        let cache_root = root.join("cache");
        let renderer_output_dir = root.join("renderer-output");
        std::fs::create_dir_all(&renderer_output_dir)
            .expect("renderer output dir should be created");
        std::fs::write(renderer_output_dir.join("0.png"), b"rendered page bytes")
            .expect("renderer image should be written");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
        let image_path = renderer_output_dir
            .join("0.png")
            .to_string_lossy()
            .replace('\\', "\\\\");
        let output = format!(
            r#"{{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {{
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["renderPagePng"]
            }},
            "pages": [
                {{
                    "index": 0,
                    "widthPx": 840,
                    "heightPx": 1188,
                    "imagePath": "{image_path}"
                }}
            ],
            "durationMs": 64,
            "warnings": []
        }}"#
        );
        let runner = RecordingRenderRunner {
            result: CommandResult {
                exit_code: 0,
                stdout: output,
                stderr: String::new(),
            },
            calls: std::sync::Mutex::new(vec![]),
        };
        let registry = LocalDocumentRegistry::default();
        registry.remember("local-selected-ofd", &path);

        let bitmap = local_ofd_page_with_runner(
            &registry,
            &runner,
            &cache_root,
            "local-selected-ofd",
            0,
            1.0,
        )
        .expect("registered local session should render");

        assert_eq!(bitmap.scale, 1.0);
        let calls = runner
            .calls
            .lock()
            .expect("calls mutex should not be poisoned");
        let dpi_index = calls[0]
            .iter()
            .position(|arg| arg == "--dpi")
            .expect("render args should include dpi");
        assert_eq!(calls[0][dpi_index + 1], "4.00");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn ofd_screen_preview_dpi_scales_with_view_scale_and_clamps_extremes() {
        assert_eq!(ofd_screen_preview_dpi(1.0), 4.0);
        assert_eq!(ofd_screen_preview_dpi(2.0), 8.0);
        assert_eq!(ofd_screen_preview_dpi(0.1), 2.0);
        assert_eq!(ofd_screen_preview_dpi(9.0), 12.0);
    }

    #[test]
    fn local_ofd_page_returns_page_scoped_image_refs_when_renderer_reuses_filename() {
        let root = unique_temp_root("local-file-page-stable-image-ref");
        let cache_root = root.join("cache");
        let renderer_output_dir = root.join("renderer-output");
        std::fs::create_dir_all(&renderer_output_dir)
            .expect("renderer output dir should be created");
        std::fs::write(&renderer_output_dir.join("0.png"), b"rendered page bytes")
            .expect("renderer image should be written");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
        let reused_image_path = renderer_output_dir
            .join("0.png")
            .to_string_lossy()
            .replace('\\', "\\\\");
        let output = format!(
            r#"{{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {{
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["renderPagePng"]
            }},
            "pages": [
                {{
                    "index": 3,
                    "widthPx": 595,
                    "heightPx": 842,
                    "imagePath": "{reused_image_path}"
                }}
            ],
            "durationMs": 70,
            "warnings": []
        }}"#
        );
        let runner = FakeCommandRunner::new(0, output, String::new());
        let registry = LocalDocumentRegistry::default();
        registry.remember("local-selected-ofd", &path);

        let bitmap = local_ofd_page_with_runner(
            &registry,
            &runner,
            &cache_root,
            "local-selected-ofd",
            3,
            1.0,
        )
        .expect("registered local session should render");

        assert_eq!(bitmap.page_index, 3);
        assert!(
            bitmap.image_ref.ends_with("page-0003@1.00x.png"),
            "image_ref should be stable and page-scoped, got {}",
            bitmap.image_ref
        );
        assert!(
            std::path::Path::new(&bitmap.image_ref).exists(),
            "page-scoped image ref should point to a copied PNG"
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_page_uses_existing_page_cache_without_renderer_call() {
        struct RecordingRenderRunner {
            result: CommandResult,
            calls: std::sync::Mutex<Vec<Vec<String>>>,
        }

        impl CommandRunner for RecordingRenderRunner {
            fn run(&self, args: &[String]) -> CommandResult {
                self.calls
                    .lock()
                    .expect("calls mutex should not be poisoned")
                    .push(args.to_vec());
                self.result.clone()
            }
        }

        let root = unique_temp_root("local-file-page-cache-hit");
        let cache_root = root.join("cache");
        let session_id = "local-selected-ofd";
        let cache_dir = session_cache_dir(&cache_root, session_id);
        std::fs::create_dir_all(&cache_dir).expect("page cache dir should be created");
        let cached_page = cache_dir.join(page_image_name(2, 1.5));
        std::fs::write(
            &cached_page,
            [
                0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n', 0, 0, 0, 13, b'I', b'H',
                b'D', b'R', 0, 0, 1, 65, 0, 0, 2, 142,
            ],
        )
        .expect("cached png header should be written");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
        let runner = RecordingRenderRunner {
            result: CommandResult {
                exit_code: 0,
                stdout: "{}".to_string(),
                stderr: String::new(),
            },
            calls: std::sync::Mutex::new(vec![]),
        };
        let registry = LocalDocumentRegistry::default();
        registry.remember(session_id, &path);

        let bitmap = local_ofd_page_with_runner(
            &registry,
            &runner,
            &cache_root,
            session_id,
            2,
            1.5,
        )
        .expect("existing page cache should satisfy render request");

        assert_eq!(bitmap.session_id, session_id);
        assert_eq!(bitmap.page_index, 2);
        assert_eq!(bitmap.scale, 1.5);
        assert_eq!(bitmap.width_px, 321);
        assert_eq!(bitmap.height_px, 654);
        assert_eq!(bitmap.duration_ms, 0);
        assert_eq!(bitmap.image_ref, cached_page.to_string_lossy().replace('\\', "/"));
        assert!(
            runner
                .calls
                .lock()
                .expect("calls mutex should not be poisoned")
                .is_empty(),
            "renderer should not be called when page cache already exists"
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_text_uses_registered_path_and_fake_text_runner() {
        let root = unique_temp_root("local-file-text");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
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
            "durationMs": 9,
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());
        let registry = LocalDocumentRegistry::default();
        registry.remember("local-selected-ofd", &path);

        let text = local_ofd_text_with_runner(&registry, &runner, "local-selected-ofd", 5, None)
            .expect("registered local session should extract text");

        assert_eq!(text.session_id, "local-selected-ofd");
        assert_eq!(text.page_count, 1);
        assert_eq!(text.pages[0].index, 0);
        assert_eq!(text.pages[0].text, "MVP0 OFD Sample - Single Page Text");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_text_can_request_single_registered_page() {
        struct RecordingTextRunner {
            result: CommandResult,
            calls: std::sync::Mutex<Vec<Vec<String>>>,
        }

        impl CommandRunner for RecordingTextRunner {
            fn run(&self, args: &[String]) -> CommandResult {
                self.calls
                    .lock()
                    .expect("calls mutex should not be poisoned")
                    .push(args.to_vec());
                self.result.clone()
            }
        }

        let root = unique_temp_root("local-file-text-page");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
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
                "pageCount": 3
            },
            "pages": [
                {
                    "index": 2,
                    "widthPt": 210.0,
                    "heightPt": 297.0,
                    "text": "third page text",
                    "fragments": []
                }
            ],
            "durationMs": 9,
            "warnings": []
        }"#;
        let runner = RecordingTextRunner {
            result: CommandResult {
                exit_code: 0,
                stdout: output.to_string(),
                stderr: String::new(),
            },
            calls: std::sync::Mutex::new(vec![]),
        };
        let registry = LocalDocumentRegistry::default();
        registry.remember("local-selected-ofd", &path);

        let text = local_ofd_text_with_runner(&registry, &runner, "local-selected-ofd", 1, Some(2))
            .expect("registered local session should extract one page");

        assert_eq!(text.pages[0].index, 2);
        assert_eq!(text.pages[0].text, "third page text");
        assert_eq!(
            runner
                .calls
                .lock()
                .expect("calls mutex should not be poisoned")[0],
            vec![
                "text".to_string(),
                "--input".to_string(),
                path.to_string_lossy().to_string(),
                "--max-pages".to_string(),
                "1".to_string(),
                "--page".to_string(),
                "2".to_string(),
            ]
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_ofd_page_uses_safe_message_for_renderer_error() {
        let root = unique_temp_root("local-file-page-error");
        let cache_root = root.join("cache");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
        let output = r#"{
            "ok": false,
            "protocolVersion": "1.0",
            "error": {
                "code": "OFD_RENDER_FAILED",
                "message": "D:/private/sample.ofd render failed",
                "detailForReport": "D:/private/sample.ofd render failed",
                "recoverable": true,
                "safeToShow": false
            }
        }"#;
        let runner = FakeCommandRunner::new(3, output.to_string(), String::new());
        let registry = LocalDocumentRegistry::default();
        registry.remember("local-selected-ofd", &path);

        let error = local_ofd_page_with_runner(
            &registry,
            &runner,
            &cache_root,
            "local-selected-ofd",
            0,
            1.0,
        )
        .expect_err("renderer error should map to safe render error");

        assert_eq!(error.code, "OFD_RENDER_FAILED");
        assert_eq!(error.message, "页面渲染失败。");
        assert!(error.safe_to_show);
        assert_eq!(
            error.detail_for_report,
            "D:/private/sample.ofd render failed"
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn document_session_maps_from_sidecar_inspect() {
        let inspect = InspectSuccess {
            protocol_version: "1.0".to_string(),
            engine: SidecarEngine {
                name: "ofdrw".to_string(),
                version: "2.3.9".to_string(),
                capabilities: vec!["metadata".to_string(), "renderPagePng".to_string()],
            },
            document: SidecarDocument {
                file_type: "ofd".to_string(),
                page_count: 1,
                page_sizes: vec![SidecarPageInfo {
                    index: 0,
                    width_pt: 210.0,
                    height_pt: 297.0,
                }],
            },
            warnings: vec!["font fallback".to_string()],
        };

        let session = document_session_from_inspect("session-123", inspect);

        assert_eq!(session.id, "session-123");
        assert_eq!(session.file_type, "ofd");
        assert_eq!(session.page_count, 1);
        assert_eq!(session.engine.name, "ofdrw");
        assert_eq!(session.engine.protocol_version, "1.0");
        assert_eq!(session.page_sizes[0].width_pt, 210.0);
        assert_eq!(session.warnings, vec!["font fallback"]);
    }

    #[test]
    fn engine_info_maps_from_sidecar_version() {
        let version = VersionSuccess {
            protocol_version: "1.0".to_string(),
            engine: SidecarEngine {
                name: "ofdrw".to_string(),
                version: "2.3.9".to_string(),
                capabilities: vec!["metadata".to_string(), "renderPagePng".to_string()],
            },
        };

        let engine = engine_info_from_version(version);

        assert_eq!(engine.name, "ofdrw");
        assert_eq!(engine.version, "2.3.9");
        assert_eq!(engine.protocol_version, "1.0");
        assert_eq!(engine.capabilities, vec!["metadata", "renderPagePng"]);
    }

    #[test]
    fn renderer_engine_info_uses_fake_version_runner() {
        let output = r#"{
            "ok": true,
            "protocolVersion": "1.0",
            "engine": {
                "name": "ofdrw",
                "version": "2.3.9",
                "capabilities": ["metadata", "renderPagePng"]
            }
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());

        let engine =
            renderer_engine_info_with_runner(&runner).expect("renderer engine info should probe");

        assert_eq!(engine.name, "ofdrw");
        assert_eq!(engine.version, "2.3.9");
        assert_eq!(engine.protocol_version, "1.0");
        assert_eq!(engine.capabilities, vec!["metadata", "renderPagePng"]);
    }

    #[cfg(windows)]
    #[test]
    fn renderer_engine_info_uses_windows_command_spec() {
        let stub = write_stub_script(
            "cmd",
            "@echo off\r\necho {\"ok\":true,\"protocolVersion\":\"1.0\",\"engine\":{\"name\":\"stub\",\"version\":\"0.0.1\",\"capabilities\":[\"metadata\"]}}\r\n",
        );
        let spec = SidecarCommandSpec::new("cmd")
            .with_fixed_arg("/C")
            .with_fixed_arg(stub.to_string_lossy());

        let engine = renderer_engine_info_with_command_spec(spec)
            .expect("command spec should probe renderer version");

        assert_eq!(engine.name, "stub");
        assert_eq!(engine.version, "0.0.1");
        assert_eq!(engine.capabilities, vec!["metadata"]);
    }

    #[cfg(windows)]
    #[test]
    fn renderer_engine_info_uses_dev_wrapper_script() {
        let stub = write_stub_script(
            "ps1",
            "param([switch]$Run,[Parameter(ValueFromRemainingArguments=$true)][string[]]$RendererArgs)\nWrite-Output '{\"ok\":true,\"protocolVersion\":\"1.0\",\"engine\":{\"name\":\"wrapper-stub\",\"version\":\"0.0.2\",\"capabilities\":[\"metadata\"]}}'\n",
        );

        let engine = renderer_engine_info_with_dev_wrapper(&stub, true)
            .expect("dev wrapper script should probe renderer version");

        assert_eq!(engine.name, "wrapper-stub");
        assert_eq!(engine.version, "0.0.2");
        assert_eq!(engine.capabilities, vec!["metadata"]);
    }

    #[cfg(unix)]
    #[test]
    fn renderer_engine_info_uses_linux_and_unix_like_command_spec() {
        let stub = write_stub_script(
            "sh",
            "printf '%s\n' '{\"ok\":true,\"protocolVersion\":\"1.0\",\"engine\":{\"name\":\"stub\",\"version\":\"0.0.1\",\"capabilities\":[\"metadata\"]}}'\n",
        );
        let spec = SidecarCommandSpec::new("sh").with_fixed_arg(stub.to_string_lossy());

        let engine = renderer_engine_info_with_command_spec(spec)
            .expect("command spec should probe renderer version");

        assert_eq!(engine.name, "stub");
        assert_eq!(engine.version, "0.0.1");
        assert_eq!(engine.capabilities, vec!["metadata"]);
    }

    #[test]
    fn packaged_renderer_default_prefers_resource_root_over_dev_wrapper() {
        let spec = default_ofd_renderer_command_spec(
            Some(std::path::Path::new("C:/app/resources")),
            Some(std::path::Path::new(
                "D:/repo/scripts/dev/ofd-renderer-cli.ps1",
            )),
        )
        .expect("packaged resource root should build renderer spec");
        let (executable, fixed_args) = debug_command_spec_parts(&spec);

        assert!(executable.contains("ofd-renderer"));
        assert!(executable.ends_with(if cfg!(windows) { "java.exe" } else { "java" }));
        assert_eq!(fixed_args[0], "-Dfile.encoding=UTF-8");
        assert_eq!(fixed_args[1], "-Dsun.stdout.encoding=UTF-8");
        assert_eq!(fixed_args[2], "-jar");
        assert!(fixed_args[3].contains("ofd-renderer-cli.jar"));
        assert!(!executable.contains("Docker"));
        assert!(!fixed_args
            .iter()
            .any(|arg| arg.contains("ofd-renderer-cli.ps1")));
    }

    #[test]
    fn packaged_renderer_default_uses_explicit_dev_wrapper_fallback() {
        let spec = default_ofd_renderer_command_spec(
            None,
            Some(std::path::Path::new(
                "D:/repo/scripts/dev/ofd-renderer-cli.ps1",
            )),
        )
        .expect("explicit dev wrapper should remain available as fallback");
        let (executable, fixed_args) = debug_command_spec_parts(&spec);
        let expected_executable = if cfg!(windows) { "pwsh.exe" } else { "pwsh" };

        assert_eq!(executable, expected_executable);
        assert!(fixed_args.iter().any(|arg| arg == "-Run"));
        assert!(fixed_args
            .iter()
            .any(|arg| arg.contains("ofd-renderer-cli.ps1")));
    }

    #[test]
    fn packaged_renderer_default_errors_when_no_renderer_path_is_available() {
        let error = match default_ofd_renderer_command_spec(None, None) {
            Ok(_) => panic!("missing packaged and dev renderer should be a safe error"),
            Err(error) => error,
        };

        assert_eq!(error.code, "PACKAGED_RENDERER_UNAVAILABLE");
        assert!(error.safe_to_show);
        assert!(!error.detail_for_report.contains("java"));
        assert!(!error.detail_for_report.contains("ofd-renderer-cli.jar"));
    }

    #[test]
    fn packaged_renderer_available_resources_skip_missing_packaged_root() {
        let missing_resource_root = unique_temp_root("missing-packaged-renderer");
        let spec = default_ofd_renderer_command_spec_for_available_resources(
            Some(&missing_resource_root),
            Some(std::path::Path::new(
                "D:/repo/scripts/dev/ofd-renderer-cli.ps1",
            )),
        )
        .expect("missing packaged resources should use explicit dev fallback");
        let (executable, fixed_args) = debug_command_spec_parts(&spec);
        let expected_executable = if cfg!(windows) { "pwsh.exe" } else { "pwsh" };

        assert_eq!(executable, expected_executable);
        assert!(fixed_args
            .iter()
            .any(|arg| arg.contains("ofd-renderer-cli.ps1")));
    }

    #[test]
    fn packaged_renderer_available_resources_prefer_complete_packaged_root() {
        let resource_root = unique_temp_root("complete-packaged-renderer");
        let java_name = if cfg!(windows) { "java.exe" } else { "java" };
        let java_path = resource_root
            .join("ofd-renderer")
            .join("runtime")
            .join("bin")
            .join(java_name);
        let jar_path = resource_root
            .join("ofd-renderer")
            .join("ofd-renderer-cli.jar");
        std::fs::create_dir_all(java_path.parent().expect("java path should have parent"))
            .expect("resource dir should be created");
        std::fs::write(&java_path, b"java").expect("java placeholder should be written");
        std::fs::write(&jar_path, b"jar").expect("jar placeholder should be written");

        let spec = default_ofd_renderer_command_spec_for_available_resources(
            Some(&resource_root),
            Some(std::path::Path::new(
                "D:/repo/scripts/dev/ofd-renderer-cli.ps1",
            )),
        )
        .expect("complete packaged resources should be preferred");
        let (executable, fixed_args) = debug_command_spec_parts(&spec);

        assert_eq!(executable, java_path.to_string_lossy().to_string());
        assert_eq!(
            fixed_args,
            vec![
                "-Dfile.encoding=UTF-8".to_string(),
                "-Dsun.stdout.encoding=UTF-8".to_string(),
                "-jar".to_string(),
                jar_path.to_string_lossy().to_string()
            ]
        );

        let _ = std::fs::remove_dir_all(resource_root);
    }

    #[test]
    fn packaged_renderer_available_resources_accept_exe_parent_candidate() {
        let missing_resource_root = unique_temp_root("missing-resource-candidate");
        let exe_parent_root = unique_temp_root("exe-parent-resource-candidate");
        let java_name = if cfg!(windows) { "java.exe" } else { "java" };
        let java_path = exe_parent_root
            .join("ofd-renderer")
            .join("runtime")
            .join("bin")
            .join(java_name);
        let jar_path = exe_parent_root
            .join("ofd-renderer")
            .join("ofd-renderer-cli.jar");
        std::fs::create_dir_all(java_path.parent().expect("java path should have parent"))
            .expect("resource dir should be created");
        std::fs::write(&java_path, b"java").expect("java placeholder should be written");
        std::fs::write(&jar_path, b"jar").expect("jar placeholder should be written");

        let selected = first_available_packaged_resource_root([
            missing_resource_root.as_path(),
            exe_parent_root.as_path(),
        ])
        .expect("exe parent resource root should be selected");

        assert_eq!(selected, exe_parent_root);

        let _ = std::fs::remove_dir_all(missing_resource_root);
        let _ = std::fs::remove_dir_all(exe_parent_root);
    }

    #[cfg(windows)]
    #[test]
    fn local_ofd_default_renderer_uses_explicit_dev_fallback_when_packaged_missing() {
        let root = unique_temp_root("local-default-renderer");
        std::fs::create_dir_all(&root).expect("temp root should be created");
        let path = root.join("sample.ofd");
        std::fs::write(&path, b"fake ofd bytes").expect("sample should be written");
        let missing_resource_root = root.join("missing-resources");
        let stub = write_stub_script(
            "ps1",
            "param([switch]$Run,[Parameter(ValueFromRemainingArguments=$true)][string[]]$RendererArgs)\nif ($RendererArgs[0] -ne 'inspect') { exit 2 }\nWrite-Output '{\"ok\":true,\"protocolVersion\":\"1.0\",\"engine\":{\"name\":\"default-fallback\",\"version\":\"0.0.3\",\"capabilities\":[\"metadata\"]},\"document\":{\"fileType\":\"ofd\",\"pageCount\":1,\"pageSizes\":[{\"index\":0,\"widthPt\":210.0,\"heightPt\":297.0}]},\"warnings\":[]}'\n",
        );
        let registry = LocalDocumentRegistry::default();

        let session = open_local_ofd_with_default_renderer_state(
            &registry,
            path.to_string_lossy().to_string(),
            Some(&missing_resource_root),
            Some(&stub),
        )
        .expect("default renderer should use explicit dev fallback when packaged resources miss");

        assert_eq!(session.engine.name, "default-fallback");
        assert_eq!(session.file_type, "ofd");
        assert_eq!(registry.path_for(&session.id), Some(path));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn document_session_model_does_not_expose_renderer_paths() {
        let inspect = InspectSuccess {
            protocol_version: "1.0".to_string(),
            engine: SidecarEngine {
                name: "ofdrw".to_string(),
                version: "2.3.9".to_string(),
                capabilities: vec!["metadata".to_string()],
            },
            document: SidecarDocument {
                file_type: "ofd".to_string(),
                page_count: 1,
                page_sizes: vec![SidecarPageInfo {
                    index: 0,
                    width_pt: 210.0,
                    height_pt: 297.0,
                }],
            },
            warnings: vec![],
        };

        let session = document_session_from_inspect("public-sample", inspect);
        let json = serde_json::to_string(&session).expect("session should serialize");

        assert!(!json.contains("java"));
        assert!(!json.contains("ofd-renderer-cli.jar"));
        assert!(!json.contains("Docker"));
        assert!(!json.contains("Maven"));
        assert!(!json.contains("resource"));
    }

    #[test]
    #[ignore = "Requires local packaged OFD renderer runtime and jar; public-safe smoke only"]
    fn packaged_renderer_smoke_reports_version() {
        let java = std::env::var("LDV_OFD_RENDERER_JAVA")
            .expect("LDV_OFD_RENDERER_JAVA must point to a packaged Java executable");
        let jar = std::env::var("LDV_OFD_RENDERER_JAR")
            .expect("LDV_OFD_RENDERER_JAR must point to ofd-renderer-cli.jar");
        let spec = packaged_renderer_command_spec(Path::new(&java), Path::new(&jar));

        let engine = renderer_engine_info_with_command_spec(spec)
            .expect("packaged renderer should report version");

        assert_eq!(engine.name, "ofdrw");
        assert_eq!(engine.protocol_version, "1.0");
    }

    #[test]
    #[ignore = "Requires local packaged OFD renderer resource layout; public-safe smoke only"]
    fn packaged_ofd_renderer_resource_smoke_reports_version() {
        let resource_root = std::env::var("LDV_OFD_RENDERER_RESOURCE_ROOT")
            .expect("LDV_OFD_RENDERER_RESOURCE_ROOT must point to bundled resources root");
        let spec = packaged_ofd_renderer_resource_command_spec(Path::new(&resource_root));

        let engine = renderer_engine_info_with_command_spec(spec)
            .expect("packaged OFD renderer resource layout should report version");

        assert_eq!(engine.name, "ofdrw");
        assert_eq!(engine.protocol_version, "1.0");
    }

    #[test]
    #[ignore = "Requires local packaged OFD renderer resource layout; public-safe smoke only"]
    fn packaged_ofd_renderer_resource_smoke_renders_public_s4c_sample() {
        let resource_root = std::env::var("LDV_OFD_RENDERER_RESOURCE_ROOT")
            .expect("LDV_OFD_RENDERER_RESOURCE_ROOT must point to bundled resources root");
        let spec = packaged_ofd_renderer_resource_command_spec(Path::new(&resource_root));
        let runner = spec.into_process_runner();
        let repo_root = repo_root_from_manifest_dir();
        let public_root = repo_root.join("testdata/public/ofd");
        let cache_root = repo_root.join("tmp/ofd-renderer-cli/packaged-resource-smoke");

        let session = public_sample_session_with_runner(
            &runner,
            &public_root,
            "s4c-public-embedded-font-text",
        )
        .expect("packaged resource renderer should inspect public S4C sample");
        assert_eq!(session.file_type, "ofd");
        assert_eq!(session.page_count, 1);
        assert_eq!(session.engine.name, "ofdrw");

        let bitmap = public_sample_page_with_runner(
            &runner,
            &public_root,
            &cache_root,
            "s4c-public-embedded-font-text",
            0,
            1.0,
        )
        .expect("packaged resource renderer should render public S4C sample");
        assert_eq!(bitmap.session_id, "public-s4c-public-embedded-font-text");
        assert_eq!(bitmap.page_index, 0);
        assert!(bitmap.width_px > 0);
        assert!(bitmap.height_px > 0);
        assert!(
            std::path::Path::new(&bitmap.image_ref).exists(),
            "packaged resource render should write PNG"
        );
    }

    #[test]
    #[ignore = "Requires local packaged OFD renderer resource layout; public-safe smoke only"]
    fn packaged_ofd_renderer_resource_smoke_returns_distinct_public_multi_page_images() {
        let resource_root = std::env::var("LDV_OFD_RENDERER_RESOURCE_ROOT")
            .expect("LDV_OFD_RENDERER_RESOURCE_ROOT must point to bundled resources root");
        let spec = packaged_ofd_renderer_resource_command_spec(Path::new(&resource_root));
        let runner = spec.into_process_runner();
        let repo_root = repo_root_from_manifest_dir();
        let public_path = repo_root.join("testdata/public/ofd/p0-multi-page-text.ofd");
        let cache_root = repo_root.join("tmp/ofd-renderer-cli/packaged-resource-smoke");
        let registry = LocalDocumentRegistry::default();
        registry.remember("public-multi-page-local-smoke", &public_path);

        let first = local_ofd_page_with_runner(
            &registry,
            &runner,
            &cache_root,
            "public-multi-page-local-smoke",
            0,
            1.0,
        )
        .expect("packaged resource renderer should render first public multi-page page");
        let later = local_ofd_page_with_runner(
            &registry,
            &runner,
            &cache_root,
            "public-multi-page-local-smoke",
            3,
            1.0,
        )
        .expect("packaged resource renderer should render later public multi-page page");

        assert_eq!(first.page_index, 0);
        assert_eq!(later.page_index, 3);
        assert!(first.image_ref.ends_with("page-0000@1.00x.png"));
        assert!(later.image_ref.ends_with("page-0003@1.00x.png"));
        assert_ne!(first.image_ref, later.image_ref);
        assert!(std::path::Path::new(&first.image_ref).exists());
        assert!(std::path::Path::new(&later.image_ref).exists());
    }

    #[test]
    fn cleanup_cache_session_removes_named_session_dir() {
        let root = unique_temp_root("document-core-cache-cleanup");
        let session_dir = root.join("session-001");
        std::fs::create_dir_all(&session_dir).expect("session dir should be created");
        std::fs::write(session_dir.join("page.png"), b"cache")
            .expect("cache file should be written");

        let removed = cleanup_cache_session(&root, "session-001")
            .expect("cache session cleanup should succeed");

        assert!(removed);
        assert!(!session_dir.exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn cleanup_cache_session_ignores_parent_escape() {
        let root = unique_temp_root("document-core-cache-cleanup");
        let outside = root.with_file_name(format!(
            "{}-outside",
            root.file_name()
                .expect("temp root should have file name")
                .to_string_lossy()
        ));
        std::fs::create_dir_all(&outside).expect("outside dir should be created");

        let removed = cleanup_cache_session(&root, "../outside")
            .expect("escaped cache session cleanup should be ignored");

        assert!(!removed);
        assert!(outside.exists());

        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(outside);
    }

    #[test]
    fn cleanup_render_cache_session_at_root_removes_session_dir() {
        let root = unique_temp_root("document-core-render-cache-cleanup");
        let session_dir = root.join("public-sample");
        std::fs::create_dir_all(&session_dir).expect("session dir should be created");
        std::fs::write(session_dir.join("page.png"), b"cache")
            .expect("cache file should be written");

        let removed = cleanup_render_cache_session_at_root(&root, "public-sample")
            .expect("render cache cleanup should succeed");

        assert!(removed);
        assert!(!session_dir.exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn clear_render_cache_at_root_keeps_current_session_dir() {
        let root = unique_temp_root("document-core-render-cache-clear");
        let current_dir = root.join("session-current");
        let old_dir = root.join("session-old");
        std::fs::create_dir_all(&current_dir).expect("current session dir should be created");
        std::fs::create_dir_all(&old_dir).expect("old session dir should be created");
        std::fs::write(current_dir.join("page.png"), b"current")
            .expect("current cache file should be written");
        std::fs::write(old_dir.join("page-1.png"), b"old-one")
            .expect("old cache file should be written");
        std::fs::write(old_dir.join("page-2.png"), b"old-two")
            .expect("second old cache file should be written");

        let summary = clear_render_cache_at_root(&root, Some("session-current"))
            .expect("render cache cleanup should succeed");

        assert_eq!(summary.removed_session_count, 1);
        assert_eq!(summary.removed_file_count, 2);
        assert!(current_dir.exists());
        assert!(!old_dir.exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn clear_render_cache_at_root_does_not_touch_source_file_outside_cache_root() {
        let root = unique_temp_root("clear-render-cache-source-safety");
        let cache_root = root.join("cache");
        let source_dir = root.join("source");
        let stale_cache_dir = cache_root.join("old-session");
        std::fs::create_dir_all(&stale_cache_dir).expect("cache dir should be created");
        std::fs::create_dir_all(&source_dir).expect("source dir should be created");
        std::fs::write(stale_cache_dir.join("page.png"), b"cache")
            .expect("cache file should be written");
        let source = source_dir.join("sample.pdf");
        std::fs::write(&source, b"%PDF-1.4\n% source\n").expect("source should be written");
        let before = source_file_snapshot(&source);

        let summary =
            clear_render_cache_at_root(&cache_root, None).expect("cache cleanup should work");

        assert_eq!(summary.removed_session_count, 1);
        assert_source_file_unchanged(&source, before);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn clear_render_cache_at_root_handles_missing_root() {
        let root = unique_temp_root("document-core-render-cache-clear-missing");

        let summary = clear_render_cache_at_root(&root, None)
            .expect("missing render cache root should be treated as already clean");

        assert_eq!(summary.removed_session_count, 0);
        assert_eq!(summary.removed_file_count, 0);
        assert!(!root.exists());
    }

    #[test]
    fn public_sample_session_uses_fake_inspect_runner() {
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
                "pageSizes": [
                    {"index": 0, "widthPt": 210.0, "heightPt": 297.0}
                ]
            },
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());

        let session = public_sample_session_with_runner(
            &runner,
            std::path::Path::new("D:/repo/testdata/public/ofd"),
            "s4c-public-embedded-font-text",
        )
        .expect("known public sample should inspect");

        assert_eq!(session.file_type, "ofd");
        assert_eq!(session.page_count, 1);
        assert_eq!(session.engine.name, "ofdrw");
    }

    #[cfg(windows)]
    #[test]
    fn public_sample_session_uses_dev_wrapper_script() {
        let stub = write_stub_script(
            "ps1",
            "param([switch]$Run,[Parameter(ValueFromRemainingArguments=$true)][string[]]$RendererArgs)\nif ($RendererArgs[0] -ne 'inspect') { exit 2 }\nWrite-Output '{\"ok\":true,\"protocolVersion\":\"1.0\",\"engine\":{\"name\":\"wrapper-stub\",\"version\":\"0.0.2\",\"capabilities\":[\"metadata\"]},\"document\":{\"fileType\":\"ofd\",\"pageCount\":1,\"pageSizes\":[{\"index\":0,\"widthPt\":210.0,\"heightPt\":297.0}]},\"warnings\":[]}'\n",
        );

        let session = public_sample_session_with_dev_wrapper(
            &stub,
            true,
            std::path::Path::new("D:/repo/testdata/public/ofd"),
            "s4c-public-embedded-font-text",
        )
        .expect("dev wrapper script should inspect public sample");

        assert_eq!(session.id, "public-s4c-public-embedded-font-text");
        assert_eq!(session.file_type, "ofd");
        assert_eq!(session.page_count, 1);
        assert_eq!(session.engine.name, "wrapper-stub");
    }

    #[test]
    fn public_sample_session_rejects_unknown_sample_for_runner_path() {
        let runner = FakeCommandRunner::new(0, "{}".to_string(), String::new());

        let error = public_sample_session_with_runner(
            &runner,
            std::path::Path::new("D:/repo/testdata/public/ofd"),
            "local-secret",
        )
        .expect_err("unknown public sample should be rejected");

        assert_eq!(error.code, "INVALID_ARGUMENT");
        assert!(error.safe_to_show);
    }

    #[test]
    fn public_sample_session_allows_corrupt_public_sample_for_error_regression() {
        let output = r#"{
            "ok": false,
            "protocolVersion": "1.0",
            "error": {
                "code": "OFD_INVALID_PACKAGE",
                "message": "D:/repo/testdata/public/ofd/p0-corrupt-missing-ofdxml.ofd missing OFD.xml",
                "detailForReport": "D:/repo/testdata/public/ofd/p0-corrupt-missing-ofdxml.ofd missing OFD.xml",
                "recoverable": false,
                "safeToShow": false
            }
        }"#;
        let runner = FakeCommandRunner::new(2, output.to_string(), String::new());

        let error = public_sample_session_with_runner(
            &runner,
            std::path::Path::new("D:/repo/testdata/public/ofd"),
            "p0-corrupt-missing-ofdxml",
        )
        .expect_err("corrupt public sample should reach renderer error path");

        assert_eq!(error.code, "OFD_INVALID_PACKAGE");
        assert_eq!(error.message, "无法打开该 OFD 文件。");
        assert!(!error.recoverable);
        assert!(error.safe_to_show);
        assert_eq!(
            error.detail_for_report,
            "D:/repo/testdata/public/ofd/p0-corrupt-missing-ofdxml.ofd missing OFD.xml"
        );
    }

    #[test]
    fn public_sample_session_uses_safe_message_for_not_ofd_regression_sample() {
        let output = r#"{
            "ok": false,
            "protocolVersion": "1.0",
            "error": {
                "code": "OFD_INVALID_PACKAGE",
                "message": "D:/repo/testdata/public/ofd/p0-not-ofd-renamed.ofd Zip signature not found",
                "detailForReport": "D:/repo/testdata/public/ofd/p0-not-ofd-renamed.ofd Zip signature not found",
                "recoverable": false,
                "safeToShow": false
            }
        }"#;
        let runner = FakeCommandRunner::new(2, output.to_string(), String::new());

        let error = public_sample_session_with_runner(
            &runner,
            std::path::Path::new("D:/repo/testdata/public/ofd"),
            "p0-not-ofd-renamed",
        )
        .expect_err("non-OFD public regression sample should reach renderer error path");

        assert_eq!(error.code, "OFD_INVALID_PACKAGE");
        assert_eq!(error.message, "无法打开该 OFD 文件。");
        assert!(!error.recoverable);
        assert!(error.safe_to_show);
        assert_eq!(
            error.detail_for_report,
            "D:/repo/testdata/public/ofd/p0-not-ofd-renamed.ofd Zip signature not found"
        );
    }

    #[test]
    fn render_error_preserves_sidecar_recoverable_and_detail() {
        let error = render_error_from_sidecar(SidecarError {
            code: "OFD_INVALID_PACKAGE".to_string(),
            message: "无法打开该 OFD 文件。".to_string(),
            recoverable: false,
            safe_to_show: true,
            detail_for_report: "Zip signature not found".to_string(),
        });

        assert_eq!(error.code, "OFD_INVALID_PACKAGE");
        assert!(!error.recoverable);
        assert!(error.safe_to_show);
        assert_eq!(error.detail_for_report, "Zip signature not found");
    }

    #[test]
    fn page_bitmap_maps_from_sidecar_render() {
        let render = RenderSuccess {
            protocol_version: "1.0".to_string(),
            engine: SidecarEngine {
                name: "ofdrw".to_string(),
                version: "2.3.9".to_string(),
                capabilities: vec!["renderPagePng".to_string()],
            },
            pages: vec![SidecarRenderedPage {
                index: 1,
                width_px: 595,
                height_px: 842,
                image_path: "C:/cache/session-001/1.png".to_string(),
            }],
            duration_ms: 64,
            warnings: vec!["render warning".to_string()],
        };

        let bitmap = page_bitmap_from_render("session-001", 1.5, render)
            .expect("render result should map to page bitmap");

        assert_eq!(bitmap.session_id, "session-001");
        assert_eq!(bitmap.page_index, 1);
        assert_eq!(bitmap.scale, 1.5);
        assert_eq!(bitmap.width_px, 595);
        assert_eq!(bitmap.height_px, 842);
        assert_eq!(bitmap.image_ref, "C:/cache/session-001/1.png");
        assert_eq!(bitmap.duration_ms, 64);
        assert_eq!(bitmap.warnings, vec!["render warning"]);
    }

    #[test]
    fn public_sample_page_uses_fake_render_runner() {
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
                    "index": 0,
                    "widthPx": 595,
                    "heightPx": 842,
                    "imagePath": "D:/cache/public-s4c-public-embedded-font-text/0.png"
                }
            ],
            "durationMs": 70,
            "warnings": []
        }"#;
        let runner = FakeCommandRunner::new(0, output.to_string(), String::new());

        let bitmap = public_sample_page_with_runner(
            &runner,
            std::path::Path::new("D:/repo/testdata/public/ofd"),
            std::path::Path::new("D:/cache"),
            "s4c-public-embedded-font-text",
            0,
            1.0,
        )
        .expect("known public sample page should render");

        assert_eq!(bitmap.session_id, "public-s4c-public-embedded-font-text");
        assert_eq!(bitmap.page_index, 0);
        assert_eq!(
            bitmap.image_ref,
            "D:/cache/public-s4c-public-embedded-font-text/0.png"
        );
    }

    #[cfg(windows)]
    #[test]
    fn public_sample_page_uses_dev_wrapper_script() {
        let stub = write_stub_script(
            "ps1",
            "param([switch]$Run,[Parameter(ValueFromRemainingArguments=$true)][string[]]$RendererArgs)\nif ($RendererArgs[0] -ne 'render') { exit 2 }\nWrite-Output '{\"ok\":true,\"protocolVersion\":\"1.0\",\"engine\":{\"name\":\"wrapper-stub\",\"version\":\"0.0.2\",\"capabilities\":[\"renderPagePng\"]},\"pages\":[{\"index\":0,\"widthPx\":3150,\"heightPx\":4455,\"imagePath\":\"/workspace/tmp/ofd-renderer-cli/public-s4c-public-embedded-font-text/0.png\"}],\"durationMs\":80,\"warnings\":[]}'\n",
        );

        let bitmap = public_sample_page_with_dev_wrapper(
            &stub,
            true,
            std::path::Path::new("D:/repo"),
            std::path::Path::new("D:/repo/testdata/public/ofd"),
            std::path::Path::new("D:/cache"),
            "s4c-public-embedded-font-text",
            0,
            1.0,
        )
        .expect("dev wrapper script should render public sample page");

        assert_eq!(bitmap.session_id, "public-s4c-public-embedded-font-text");
        assert_eq!(bitmap.page_index, 0);
        assert_eq!(bitmap.width_px, 3150);
        assert_eq!(bitmap.height_px, 4455);
        assert_eq!(
            bitmap.image_ref,
            "D:/repo/tmp/ofd-renderer-cli/public-s4c-public-embedded-font-text/0.png"
        );
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Runs Docker Compose via scripts/dev/ofd-renderer-cli.ps1 against public testdata only"]
    fn real_dev_wrapper_smoke_uses_public_s4c_sample() {
        let repo_root = repo_root_from_manifest_dir();
        let script = repo_root.join("scripts/dev/ofd-renderer-cli.ps1");
        let public_root = repo_root.join("testdata/public/ofd");
        let cache_root = repo_root.join("tmp/ofd-renderer-cli/rust-wrapper-smoke");

        let engine = renderer_engine_info_with_dev_wrapper(&script, true)
            .expect("real dev wrapper should report renderer version");
        assert_eq!(engine.name, "ofdrw");
        assert_eq!(engine.protocol_version, "1.0");
        assert!(engine.capabilities.contains(&"metadata".to_string()));

        let session = public_sample_session_with_dev_wrapper(
            &script,
            true,
            &public_root,
            "s4c-public-embedded-font-text",
        )
        .expect("real dev wrapper should inspect public S4C sample");
        assert_eq!(session.file_type, "ofd");
        assert_eq!(session.page_count, 1);
        assert_eq!(session.page_sizes[0].width_pt, 210.0);

        let bitmap = public_sample_page_with_dev_wrapper(
            &script,
            true,
            &repo_root,
            &public_root,
            &cache_root,
            "s4c-public-embedded-font-text",
            0,
            1.0,
        )
        .expect("real dev wrapper should render public S4C sample page");
        assert_eq!(bitmap.page_index, 0);
        assert!(bitmap.width_px > 0);
        assert!(bitmap.height_px > 0);
        assert!(
            bitmap.image_ref.ends_with("/page-0000@1.00x.png")
                || bitmap.image_ref.ends_with("\\page-0000@1.00x.png")
        );
        assert!(
            std::path::Path::new(&bitmap.image_ref).exists(),
            "mapped host image_ref should point to rendered PNG"
        );
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Runs Docker Compose via scripts/dev/ofd-renderer-cli.ps1 against public testdata only"]
    fn real_dev_wrapper_smoke_maps_public_invalid_samples_to_errors() {
        let repo_root = repo_root_from_manifest_dir();
        let script = repo_root.join("scripts/dev/ofd-renderer-cli.ps1");
        let public_root = repo_root.join("testdata/public/ofd");

        let corrupt = public_sample_session_with_dev_wrapper(
            &script,
            true,
            &public_root,
            "p0-corrupt-missing-ofdxml",
        )
        .expect_err("corrupt public sample should return renderer error");
        assert_eq!(corrupt.code, "OFD_STRUCTURE_ERROR");
        assert!(!corrupt.recoverable);
        assert!(corrupt.safe_to_show);

        let not_ofd = public_sample_session_with_dev_wrapper(
            &script,
            true,
            &public_root,
            "p0-not-ofd-renamed",
        )
        .expect_err("renamed non-OFD public sample should return renderer error");
        assert_eq!(not_ofd.code, "OFD_INVALID_PACKAGE");
        assert!(!not_ofd.recoverable);
        assert!(not_ofd.safe_to_show);
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Runs Docker Compose via scripts/dev/ofd-renderer-cli.ps1 against public testdata only"]
    fn real_dev_wrapper_smoke_inspects_public_multi_page_sample() {
        let repo_root = repo_root_from_manifest_dir();
        let script = repo_root.join("scripts/dev/ofd-renderer-cli.ps1");
        let public_root = repo_root.join("testdata/public/ofd");

        let session = public_sample_session_with_dev_wrapper(
            &script,
            true,
            &public_root,
            "p0-multi-page-text",
        )
        .expect("real dev wrapper should inspect public multi-page sample");

        assert_eq!(session.file_type, "ofd");
        assert_eq!(session.page_count, 5);
        assert_eq!(session.page_sizes.len(), 5);
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Runs Docker Compose via scripts/dev/ofd-renderer-cli.ps1 against public testdata only"]
    fn real_dev_wrapper_smoke_renders_public_multi_page_sample_page() {
        let repo_root = repo_root_from_manifest_dir();
        let script = repo_root.join("scripts/dev/ofd-renderer-cli.ps1");
        let public_root = repo_root.join("testdata/public/ofd");
        let cache_root = repo_root.join("tmp/ofd-renderer-cli/rust-wrapper-smoke");

        let bitmap = public_sample_page_with_dev_wrapper(
            &script,
            true,
            &repo_root,
            &public_root,
            &cache_root,
            "p0-multi-page-text",
            2,
            1.0,
        )
        .expect("real dev wrapper should render public multi-page sample page");

        assert_eq!(bitmap.session_id, "public-p0-multi-page-text");
        assert_eq!(bitmap.page_index, 2);
        assert!(bitmap.width_px > 0);
        assert!(bitmap.height_px > 0);
        assert!(std::path::Path::new(&bitmap.image_ref).exists());
    }

    fn write_stub_script(extension: &str, body: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ldv-document-core-sidecar-stub-{}-{}.{}",
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

    enum FakeOfficeConverterRunner {
        WritesPdf,
        ProtocolError { code: String, recoverable: bool },
        NonzeroExit,
    }

    impl FakeOfficeConverterRunner {
        fn writes_pdf() -> Self {
            Self::WritesPdf
        }

        fn protocol_error(code: &str, recoverable: bool) -> Self {
            Self::ProtocolError {
                code: code.to_string(),
                recoverable,
            }
        }

        fn nonzero_exit() -> Self {
            Self::NonzeroExit
        }
    }

    impl ConverterCommandRunner for FakeOfficeConverterRunner {
        fn run(&self, args: &[String]) -> crate::office_converter::ConverterCommandResult {
            if let Self::NonzeroExit = self {
                return crate::office_converter::ConverterCommandResult {
                    exit_code: 1,
                    stdout: String::new(),
                    stderr: "converter failed without document text".to_string(),
                };
            }

            if let Self::ProtocolError { code, recoverable } = self {
                return crate::office_converter::ConverterCommandResult {
                    exit_code: 1,
                    stdout: format!(
                        r#"{{
                            "ok": false,
                            "protocolVersion": "1.0",
                            "error": {{
                                "code": "{code}",
                                "message": "unsafe converter message",
                                "detailForReport": "converter failed without document text",
                                "recoverable": {recoverable},
                                "safeToShow": false
                            }}
                        }}"#
                    ),
                    stderr: "converter failed".to_string(),
                };
            }

            let outdir_index = args
                .iter()
                .position(|arg| arg == "--outdir")
                .expect("outdir arg should exist");
            let output_dir = PathBuf::from(&args[outdir_index + 1]);
            let input_path = PathBuf::from(args.last().expect("input arg should exist"));
            std::fs::create_dir_all(&output_dir).expect("output dir should be created");
            let output_pdf = output_dir
                .join(
                    input_path
                        .file_stem()
                        .and_then(|value| value.to_str())
                        .unwrap_or("converted"),
                )
                .with_extension("pdf");
            std::fs::write(&output_pdf, b"%PDF-1.7\n% fake office conversion\n")
                .expect("fake PDF should be written");
            let file_type = input_path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("docx");
            let size_bytes = std::fs::metadata(&output_pdf)
                .expect("fake PDF metadata should be readable")
                .len();

            crate::office_converter::ConverterCommandResult {
                exit_code: 0,
                stdout: format!(
                    r#"{{
                        "ok": true,
                        "protocolVersion": "1.0",
                        "converter": {{"name": "fake-office", "version": "1.0", "source": "test"}},
                        "input": {{"fileType": "{file_type}", "sizeBytes": 11}},
                        "output": {{"fileType": "pdf", "path": "{}", "sizeBytes": {size_bytes}}},
                        "durationMs": 1,
                        "warnings": []
                    }}"#,
                    output_pdf.to_string_lossy().replace('\\', "\\\\")
                ),
                stderr: String::new(),
            }
        }
    }

    fn unique_temp_root(prefix: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "ldv-{prefix}-{}-{}",
            std::process::id(),
            unique_stub_id()
        ))
    }

    struct SourceFileSnapshot {
        bytes: Vec<u8>,
        len: u64,
        modified: std::time::SystemTime,
    }

    fn source_file_snapshot(path: &std::path::Path) -> SourceFileSnapshot {
        let metadata = std::fs::metadata(path).expect("source metadata should be readable");
        SourceFileSnapshot {
            bytes: std::fs::read(path).expect("source bytes should be readable"),
            len: metadata.len(),
            modified: metadata
                .modified()
                .expect("source modified time should be readable"),
        }
    }

    fn assert_source_file_unchanged(path: &std::path::Path, before: SourceFileSnapshot) {
        let after = source_file_snapshot(path);
        assert_eq!(after.bytes, before.bytes);
        assert_eq!(after.len, before.len);
        assert_eq!(after.modified, before.modified);
    }

    fn write_minimal_docx(path: &std::path::Path) {
        write_docx_zip(
            path,
            &[
                (
                    "[Content_Types].xml",
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#,
                ),
                (
                    "_rels/.rels",
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#,
                ),
                (
                    "word/document.xml",
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>LDV public DOCX fixture</w:t></w:r></w:p></w:body>
</w:document>"#,
                ),
            ],
        );
    }

    fn write_docx_missing_main_entry(path: &std::path::Path) {
        write_docx_zip(
            path,
            &[
                (
                    "[Content_Types].xml",
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#,
                ),
                (
                    "_rels/.rels",
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#,
                ),
            ],
        );
    }

    fn write_docx_zip(path: &std::path::Path, entries: &[(&str, &str)]) {
        let file = std::fs::File::create(path).expect("docx should be created");
        let mut writer = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, data) in entries {
            writer
                .start_file(*name, options)
                .expect("entry should start");
            std::io::Write::write_all(&mut writer, data.as_bytes())
                .expect("entry should be written");
        }
        writer.finish().expect("docx should finish");
    }

    fn repo_root_from_manifest_dir() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..")
    }
}
