import WebKit

/// Privacy blur (web/privacy.js) asks for the camera. Only the bundled page (file://, main frame) gets it,
/// and only the camera: microphone and anything else are refused. macOS still shows its own camera prompt
/// the first time (NSCameraUsageDescription in Info.plist).
extension AppDelegate: WKUIDelegate {
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
        let ownPage = origin.protocol == "file" && frame.isMainFrame
        decisionHandler(ownPage && type == .camera ? .grant : .deny)
    }
}
