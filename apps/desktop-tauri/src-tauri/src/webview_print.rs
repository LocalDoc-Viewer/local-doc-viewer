#[tauri::command]
pub fn show_webview_print_ui(window: tauri::WebviewWindow) -> Result<(), String> {
    show_webview_print_ui_impl(window)
}

#[tauri::command]
pub fn export_webview_print_pdf_diagnostic(window: tauri::WebviewWindow) -> Result<String, String> {
    export_webview_print_pdf_diagnostic_impl(window)
}

#[cfg(windows)]
fn show_webview_print_ui_impl(window: tauri::WebviewWindow) -> Result<(), String> {
    use std::sync::mpsc;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM,
    };
    use windows_core::Interface;

    let (tx, rx) = mpsc::channel();
    window
        .with_webview(move |platform_webview| {
            let result = unsafe {
                platform_webview
                    .controller()
                    .CoreWebView2()
                    .and_then(|webview| {
                        let webview_with_print: ICoreWebView2_16 = webview.cast()?;
                        webview_with_print.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM)
                    })
            }
            .map_err(|error| error.to_string());

            let _ = tx.send(result);
        })
        .map_err(|error| error.to_string())?;

    rx.recv().map_err(|error| error.to_string())?
}

#[cfg(windows)]
fn export_webview_print_pdf_diagnostic_impl(window: tauri::WebviewWindow) -> Result<String, String> {
    use std::fs;
    use std::sync::mpsc;
    use std::time::{SystemTime, UNIX_EPOCH};
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7;
    use webview2_com::{CoTaskMemPWSTR, PrintToPdfCompletedHandler};
    use windows_core::Interface;

    let output_dir = std::env::current_dir()
        .map_err(|error| error.to_string())?
        .join("tmp/print-diagnostics");
    fs::create_dir_all(&output_dir).map_err(|error| error.to_string())?;

    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let output_path = output_dir.join(format!("webview-print-diagnostic-{timestamp_ms}.pdf"));
    let output_path_text = output_path.to_string_lossy().to_string();
    let print_path = output_path_text.clone();

    let (tx, rx) = mpsc::channel();
    window
        .with_webview(move |platform_webview| {
            let result = unsafe {
                platform_webview
                    .controller()
                    .CoreWebView2()
                    .and_then(|webview| {
                        let printable_webview: ICoreWebView2_7 = webview.cast()?;
                        PrintToPdfCompletedHandler::wait_for_async_operation(
                            Box::new(move |handler| {
                                let result_path = CoTaskMemPWSTR::from(print_path.as_str());
                                printable_webview
                                    .PrintToPdf(
                                        *result_path.as_ref().as_pcwstr(),
                                        None,
                                        &handler,
                                    )
                                    .map_err(webview2_com::Error::WindowsError)
                            }),
                            Box::new(|error_code, is_successful| {
                                error_code?;
                                if !is_successful {
                                    return Err(windows_core::Error::from_win32());
                                }
                                Ok(())
                            }),
                        )
                        .map_err(|error| windows_core::Error::new(
                            windows_core::HRESULT(0x80004005u32 as i32),
                            error.to_string(),
                        ))
                    })
            }
            .map(|_| output_path_text)
            .map_err(|error| error.to_string());

            let _ = tx.send(result);
        })
        .map_err(|error| error.to_string())?;

    rx.recv().map_err(|error| error.to_string())?
}

#[cfg(not(windows))]
fn show_webview_print_ui_impl(_window: tauri::WebviewWindow) -> Result<(), String> {
    Err("WebView native print UI is only available on Windows".to_string())
}

#[cfg(not(windows))]
fn export_webview_print_pdf_diagnostic_impl(_window: tauri::WebviewWindow) -> Result<String, String> {
    Err("WebView print PDF diagnostic is only available on Windows".to_string())
}
