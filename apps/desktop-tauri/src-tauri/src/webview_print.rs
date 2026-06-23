#[tauri::command]
pub fn show_webview_print_ui(window: tauri::WebviewWindow) -> Result<(), String> {
    show_webview_print_ui_impl(window)
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

#[cfg(not(windows))]
fn show_webview_print_ui_impl(_window: tauri::WebviewWindow) -> Result<(), String> {
    Err("WebView native print UI is only available on Windows".to_string())
}
