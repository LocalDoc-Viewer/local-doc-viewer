use std::path::{Component, Path, PathBuf};

#[allow(dead_code)]
pub(crate) const DEFAULT_MAX_RENDER_CACHE_BYTES: u64 = 256 * 1024 * 1024;

#[allow(dead_code)]
pub(crate) const DEFAULT_MAX_RENDER_CACHE_ENTRIES: usize = 256;

#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CacheEntry {
    pub(crate) path: PathBuf,
    pub(crate) size_bytes: u64,
    pub(crate) last_access_ms: u128,
}

#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CacheRemovalSummary {
    pub(crate) removed_session_count: usize,
    pub(crate) removed_file_count: usize,
}

#[allow(dead_code)]
pub(crate) fn session_cache_dir(root: &Path, session_id: &str) -> PathBuf {
    root.join(session_id)
}

#[allow(dead_code)]
pub(crate) fn page_image_name(page_index: u32, scale: f64) -> String {
    format!("page-{page_index:04}@{scale:.2}x.png")
}

#[allow(dead_code)]
pub(crate) fn cache_prune_plan(
    entries: &[CacheEntry],
    max_bytes: u64,
    max_entries: usize,
) -> Vec<PathBuf> {
    let mut candidates = entries.to_vec();
    candidates.sort_by_key(|entry| entry.last_access_ms);

    let mut total_bytes = candidates.iter().map(|entry| entry.size_bytes).sum::<u64>();
    let mut total_entries = candidates.len();
    let mut prune = Vec::new();

    for entry in candidates {
        if total_bytes <= max_bytes && total_entries <= max_entries {
            break;
        }

        total_bytes = total_bytes.saturating_sub(entry.size_bytes);
        total_entries = total_entries.saturating_sub(1);
        prune.push(entry.path);
    }

    prune
}

#[allow(dead_code)]
pub(crate) fn is_cache_path(root: &Path, path: &Path) -> bool {
    let normalized_root = normalize_logical_path(root);
    let normalized_path = normalize_logical_path(path);

    normalized_path.starts_with(normalized_root)
}

#[allow(dead_code)]
pub(crate) fn prune_cache_files(root: &Path, paths: &[PathBuf]) -> std::io::Result<Vec<PathBuf>> {
    let mut deleted = Vec::new();
    for path in paths {
        if !is_cache_path(root, path) || !path.is_file() {
            continue;
        }

        std::fs::remove_file(path)?;
        deleted.push(path.clone());
    }

    Ok(deleted)
}

#[allow(dead_code)]
pub(crate) fn collect_cache_entries(root: &Path) -> std::io::Result<Vec<CacheEntry>> {
    let mut entries = Vec::new();
    collect_cache_entries_into(root, root, &mut entries)?;
    Ok(entries)
}

#[allow(dead_code)]
pub(crate) fn prune_cache_to_budget(
    root: &Path,
    max_bytes: u64,
    max_entries: usize,
) -> std::io::Result<Vec<PathBuf>> {
    let entries = collect_cache_entries(root)?;
    let prune = cache_prune_plan(&entries, max_bytes, max_entries);

    prune_cache_files(root, &prune)
}

#[allow(dead_code)]
pub(crate) fn remove_cache_session_dir(root: &Path, session_id: &str) -> std::io::Result<bool> {
    if !is_plain_session_id(session_id) {
        return Ok(false);
    }

    let path = session_cache_dir(root, session_id);
    if !is_cache_path(root, &path) || !path.is_dir() {
        return Ok(false);
    }

    std::fs::remove_dir_all(path)?;
    Ok(true)
}

#[allow(dead_code)]
pub(crate) fn remove_cache_session_dirs_except(
    root: &Path,
    keep_session_id: Option<&str>,
) -> std::io::Result<CacheRemovalSummary> {
    let keep_session_id = keep_session_id.filter(|session_id| is_plain_session_id(session_id));
    let mut summary = CacheRemovalSummary {
        removed_session_count: 0,
        removed_file_count: 0,
    };

    if !root.is_dir() {
        return Ok(summary);
    }

    for entry in std::fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if !entry.file_type()?.is_dir() || !is_cache_path(root, &path) {
            continue;
        }

        let Some(session_id) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !is_plain_session_id(session_id) || keep_session_id == Some(session_id) {
            continue;
        }

        let file_count = collect_cache_entries(&path)?.len();
        std::fs::remove_dir_all(&path)?;
        summary.removed_session_count += 1;
        summary.removed_file_count += file_count;
    }

    Ok(summary)
}

fn collect_cache_entries_into(
    root: &Path,
    current: &Path,
    entries: &mut Vec<CacheEntry>,
) -> std::io::Result<()> {
    if !is_cache_path(root, current) || !current.is_dir() {
        return Ok(());
    }

    for entry in std::fs::read_dir(current)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let path = entry.path();
        if file_type.is_dir() {
            collect_cache_entries_into(root, &path, entries)?;
        } else if file_type.is_file() && is_cache_path(root, &path) {
            let metadata = entry.metadata()?;
            entries.push(CacheEntry {
                path,
                size_bytes: metadata.len(),
                last_access_ms: metadata_time_ms(&metadata),
            });
        }
    }

    Ok(())
}

fn is_plain_session_id(session_id: &str) -> bool {
    !session_id.is_empty()
        && Path::new(session_id)
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn metadata_time_ms(metadata: &std::fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(1)
}

fn normalize_logical_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    normalized.push(component.as_os_str());
                }
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_cache_dir_uses_session_id_not_document_name() {
        let root = std::path::Path::new("C:/app-cache");
        let dir = session_cache_dir(root, "session-001");

        assert!(dir.ends_with("session-001"));
        assert!(!dir.to_string_lossy().contains("invoice"));
    }

    #[test]
    fn page_image_name_is_stable_and_zero_based() {
        let name = page_image_name(2, 1.5);

        assert_eq!(name, "page-0002@1.50x.png");
    }

    #[test]
    fn cache_prune_plan_removes_oldest_entries_over_byte_budget() {
        let entries = vec![
            cache_entry("new.png", 40, 300),
            cache_entry("old.png", 80, 100),
            cache_entry("middle.png", 50, 200),
        ];

        let prune = cache_prune_plan(&entries, 100, 10);

        assert_eq!(prune, vec![PathBuf::from("old.png")]);
    }

    #[test]
    fn cache_prune_plan_removes_oldest_entries_over_count_budget() {
        let entries = vec![
            cache_entry("old.png", 10, 100),
            cache_entry("middle.png", 10, 200),
            cache_entry("new.png", 10, 300),
        ];

        let prune = cache_prune_plan(&entries, 100, 2);

        assert_eq!(prune, vec![PathBuf::from("old.png")]);
    }

    #[test]
    fn cache_prune_plan_keeps_entries_within_budget() {
        let entries = vec![cache_entry("a.png", 10, 100), cache_entry("b.png", 20, 200)];

        let prune = cache_prune_plan(&entries, 100, 10);

        assert!(prune.is_empty());
    }

    #[test]
    fn cache_path_allows_descendant_path() {
        let root = Path::new("C:/app-cache");
        let path = Path::new("C:/app-cache/session-001/page-0001@1.00x.png");

        assert!(is_cache_path(root, path));
    }

    #[test]
    fn cache_path_rejects_parent_escape() {
        let root = Path::new("C:/app-cache");
        let path = Path::new("C:/app-cache/../secret/page.png");

        assert!(!is_cache_path(root, path));
    }

    #[test]
    fn cache_path_rejects_leading_relative_parent_escape() {
        let root = Path::new("cache");
        let path = Path::new("../cache/page.png");

        assert!(!is_cache_path(root, path));
    }

    #[test]
    fn prune_cache_files_deletes_only_cache_files() {
        let root = unique_temp_cache_root();
        std::fs::create_dir_all(root.join("session-001")).expect("cache dir should be created");
        let inside = root.join("session-001").join("page-0001@1.00x.png");
        let outside = root.with_file_name(format!(
            "{}-outside.png",
            root.file_name()
                .expect("temp root should have file name")
                .to_string_lossy()
        ));
        std::fs::write(&inside, b"cache").expect("inside cache file should be written");
        std::fs::write(&outside, b"outside").expect("outside file should be written");

        let deleted = prune_cache_files(&root, &[inside.clone(), outside.clone()])
            .expect("cache prune should succeed");

        assert_eq!(deleted, vec![inside.clone()]);
        assert!(!inside.exists());
        assert!(outside.exists());

        let _ = std::fs::remove_file(outside);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn collect_cache_entries_reads_nested_files() {
        let root = unique_temp_cache_root();
        let session_dir = root.join("session-001");
        std::fs::create_dir_all(&session_dir).expect("cache dir should be created");
        let first = session_dir.join("page-0001@1.00x.png");
        let second = session_dir.join("page-0002@1.00x.png");
        std::fs::write(&first, b"one").expect("first cache file should be written");
        std::fs::write(&second, b"two-two").expect("second cache file should be written");

        let mut entries = collect_cache_entries(&root).expect("cache entries should be collected");
        entries.sort_by(|left, right| left.path.cmp(&right.path));

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, first);
        assert_eq!(entries[0].size_bytes, 3);
        assert!(entries[0].last_access_ms > 0);
        assert_eq!(entries[1].path, second);
        assert_eq!(entries[1].size_bytes, 7);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn prune_cache_to_budget_removes_oldest_collected_file() {
        let root = unique_temp_cache_root();
        let session_dir = root.join("session-001");
        std::fs::create_dir_all(&session_dir).expect("cache dir should be created");
        let old = session_dir.join("page-0001@1.00x.png");
        let new = session_dir.join("page-0002@1.00x.png");
        std::fs::write(&old, b"old").expect("old cache file should be written");
        std::thread::sleep(std::time::Duration::from_millis(5));
        std::fs::write(&new, b"new").expect("new cache file should be written");

        let deleted = prune_cache_to_budget(&root, 1024, 1).expect("cache prune should succeed");

        assert_eq!(deleted, vec![old.clone()]);
        assert!(!old.exists());
        assert!(new.exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn remove_cache_session_dir_deletes_only_named_session_dir() {
        let root = unique_temp_cache_root();
        let keep_dir = root.join("session-keep");
        let delete_dir = root.join("session-delete");
        std::fs::create_dir_all(&keep_dir).expect("keep dir should be created");
        std::fs::create_dir_all(&delete_dir).expect("delete dir should be created");
        std::fs::write(keep_dir.join("page.png"), b"keep").expect("keep file should be written");
        std::fs::write(delete_dir.join("page.png"), b"delete")
            .expect("delete file should be written");

        let removed = remove_cache_session_dir(&root, "session-delete")
            .expect("cache session cleanup should succeed");

        assert!(removed);
        assert!(keep_dir.exists());
        assert!(!delete_dir.exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn remove_cache_session_dir_rejects_parent_escape() {
        let root = unique_temp_cache_root();
        let outside = root.with_file_name(format!(
            "{}-outside-session",
            root.file_name()
                .expect("temp root should have file name")
                .to_string_lossy()
        ));
        std::fs::create_dir_all(&outside).expect("outside dir should be created");
        std::fs::write(outside.join("page.png"), b"outside")
            .expect("outside file should be written");

        let removed = remove_cache_session_dir(&root, "../outside-session")
            .expect("escaped cache session cleanup should be ignored");

        assert!(!removed);
        assert!(outside.exists());

        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(outside);
    }

    fn cache_entry(path: &str, size_bytes: u64, last_access_ms: u128) -> CacheEntry {
        CacheEntry {
            path: PathBuf::from(path),
            size_bytes,
            last_access_ms,
        }
    }

    fn unique_temp_cache_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "ldv-cache-policy-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time should be after unix epoch")
                .as_nanos()
        ))
    }
}
