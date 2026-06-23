mod cache_policy;
mod document_core;
mod office_converter;
mod renderer_sidecar;
mod webview_print;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(document_core::LocalDocumentRegistry::default())
        .invoke_handler(tauri::generate_handler![
            document_core::clear_render_cache,
            document_core::cleanup_render_cache_session,
            document_core::clear_recent_files,
            document_core::list_recent_files,
            document_core::open_fake_document,
            document_core::open_local_document,
            document_core::open_local_image_document,
            document_core::open_local_office_as_pdf,
            document_core::open_local_ofd,
            document_core::open_local_ofd_with_dev_renderer,
            document_core::open_public_sample,
            document_core::open_public_sample_with_dev_renderer,
            document_core::open_recent_image_document,
            document_core::open_recent_office_as_pdf,
            document_core::read_converted_office_pdf_bytes,
            document_core::read_local_pdf_bytes,
            document_core::read_local_text_document,
            document_core::local_ofd_text,
            document_core::read_recent_pdf_bytes,
            document_core::read_recent_text_document,
            document_core::record_recent_pdf_opened,
            document_core::record_opened_pdf,
            document_core::test_office_converter_executable,
            document_core::open_recent_file,
            document_core::remove_recent_file,
            document_core::render_public_sample_page_with_dev_renderer,
            document_core::render_local_ofd_page,
            document_core::render_local_ofd_page_with_dev_renderer,
            document_core::render_fake_page,
            document_core::set_recent_files_enabled,
            document_core::startup_document_path,
            webview_print::show_webview_print_ui
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use crate::document_core::{open_fake_document, render_fake_page};

    #[test]
    fn fake_document_has_three_pages() {
        let session = open_fake_document().expect("fake document should open");

        assert_eq!(session.file_type, "fake");
        assert_eq!(session.page_count, 3);
        assert_eq!(session.engine.name, "fake");
        assert_eq!(session.page_sizes[0].index, 0);
    }

    #[test]
    fn fake_render_clamps_scale() {
        let bitmap = render_fake_page(1, 9.0).expect("fake page should render");

        assert_eq!(bitmap.page_index, 1);
        assert_eq!(bitmap.scale, 3.0);
        assert_eq!(bitmap.width_px, 1260);
        assert_eq!(bitmap.height_px, 1782);
    }

    #[test]
    fn fake_render_rejects_out_of_range_page() {
        let error = render_fake_page(99, 1.0).expect_err("page should be rejected");

        assert_eq!(error.code, "INVALID_ARGUMENT");
        assert!(error.recoverable);
        assert!(error.safe_to_show);
    }
}
