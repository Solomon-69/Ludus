import AppKit
import ServiceManagement
import WebKit

/// Ludus: Claude mini games in the menu bar. The games and their screens are bundled web files
/// (Resources/web) shown in a WKWebView inside a real NSPopover, so the same games can run on Windows.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSPopoverDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private var statusItem: NSStatusItem!
    private let popover = NSPopover()
    private var webView: WKWebView!
    private var clickMonitor: Any?
    private var appearanceObserver: NSKeyValueObservation?
    private var styled = false
    private var quitting = false
    private var themeAppearance: NSAppearance?

    private let stateKey = "ludusState"
    private let sizeKey = "ludusSize"
    private static let compact = NSSize(width: 400, height: 600)
    private static let large = NSSize(width: 520, height: 740)
    private let testNotification = Notification.Name("com.solomon.Ludus.test")

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Keep "open at login" valid after the app is moved or renamed.
        if SMAppService.mainApp.status == .enabled { try? SMAppService.mainApp.register() }

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = Self.menuBarIcon()
            button.wantsLayer = true
            button.target = self
            button.action = #selector(statusClicked)
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
            button.setAccessibilityLabel("Ludus games")
        }

        setUpWebView()
        let controller = NSViewController()
        controller.view = webView
        controller.preferredContentSize = currentSize()
        popover.contentViewController = controller
        popover.behavior = .applicationDefined
        popover.animates = true
        popover.delegate = self

        appearanceObserver = NSApp.observe(\.effectiveAppearance) { [weak self] _, _ in
            Task { @MainActor in self?.pushAppearance() }
        }
        #if LUDUS_TEST
        // UI test hook, compiled only into local test builds (build.sh adds -D LUDUS_TEST unless RELEASE=1).
        DistributedNotificationCenter.default().addObserver(
            self, selector: #selector(testCommand(_:)), name: testNotification, object: nil)
        #endif
    }

    // MARK: - Web view

    private func setUpWebView() {
        let config = WKWebViewConfiguration()
        let content = WKUserContentController()
        content.add(self, name: "ludus")
        content.addUserScript(WKUserScript(source: bootScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController = content
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        webView = WKWebView(frame: NSRect(origin: .zero, size: currentSize()), configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsMagnification = false
        webView.navigationDelegate = self
        if let dir = Bundle.main.resourceURL?.appendingPathComponent("web"),
           FileManager.default.fileExists(atPath: dir.appendingPathComponent("index.html").path) {
            webView.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
        }
    }

    /// Runs before the page's own scripts: hands over saved scores/settings and the Mac's state.
    private func bootScript() -> String {
        let login = SMAppService.mainApp.status == .enabled
        return """
        window.__LUDUS_NATIVE__ = true;
        window.__LUDUS_STATE__ = \(savedStateLiteral());
        window.__LUDUS_LOGIN__ = \(login);
        window.__LUDUS_DARK__ = \(isDark());
        """
    }

    /// The saved state as a JS expression: the JSON travels as a quoted string and is parsed by
    /// JSON.parse, so nothing stored in preferences can ever run as code. Bad data means "no state".
    private func savedStateLiteral() -> String {
        guard let saved = UserDefaults.standard.string(forKey: stateKey),
              let data = saved.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: data)) is [String: Any],
              let quoted = try? JSONSerialization.data(withJSONObject: [saved]),
              let array = String(data: quoted, encoding: .utf8) else { return "null" }
        return "JSON.parse(\(array)[0])"
    }

    private var webRoot: URL? { Bundle.main.resourceURL?.appendingPathComponent("web").standardizedFileURL }

    /// Only the bundled game files may load; anything else (a stray link, another local file) is refused.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, url.isFileURL, let root = webRoot?.path else { return decisionHandler(.cancel) }
        decisionHandler(url.standardizedFileURL.path.hasPrefix(root + "/") ? .allow : .cancel)
    }

    private func isDark() -> Bool {
        NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
    }

    private func pushAppearance() {
        webView.evaluateJavaScript("window.ludusSetSystemDark && ludusSetSystemDark(\(isDark()))")
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "save":
            if let state = body["state"],
               let data = try? JSONSerialization.data(withJSONObject: state),
               let json = String(data: data, encoding: .utf8) {
                UserDefaults.standard.set(json, forKey: stateKey)
            }
        case "size":
            UserDefaults.standard.set(body["size"] as? String ?? "compact", forKey: sizeKey)
            resizePopover()
        case "theme":
            // Light or Dark picked in Ludus wins over the Mac's own look, panel background included.
            themeAppearance = switch body["mode"] as? String {
            case "light": NSAppearance(named: .aqua)
            case "dark": NSAppearance(named: .darkAqua)
            default: nil
            }
            applyThemeAppearance()
        case "login":
            setLogin(body["on"] as? Bool ?? false)
        case "quit":
            // Let the panel fold away with its normal animation, then quit (popoverDidClose).
            // Write the running game's snapshot first, then fold the panel away and quit.
            quitting = true
            webView.evaluateJavaScript("window.ludusClosed && ludusClosed()") { [weak self] _, _ in
                guard let self else { return }
                if self.popover.isShown { self.closePopover() } else { NSApp.terminate(nil) }
                // If the close animation never reports back (display asleep), quit anyway.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { NSApp.terminate(nil) }
            }
        default:
            break
        }
    }

    /// Compact <-> Large without the popover's own resize animation, which made the web page
    /// reflow on every frame and flicker. The page lays out once at the new size instead.
    private func resizePopover() {
        let size = currentSize()
        guard popover.isShown else { popover.contentViewController?.preferredContentSize = size; return }
        popover.animates = false
        popover.contentViewController?.preferredContentSize = size
        popover.contentSize = size
        DispatchQueue.main.async { [weak self] in self?.popover.animates = true }
    }

    private func applyThemeAppearance() {
        popover.appearance = themeAppearance
        popover.contentViewController?.view.window?.appearance = themeAppearance
        webView.appearance = themeAppearance
    }

    private func currentSize() -> NSSize {
        UserDefaults.standard.string(forKey: sizeKey) == "large" ? Self.large : Self.compact
    }

    private func setLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            NSLog("Ludus: open at login change failed: %@", error.localizedDescription)
        }
        let now = SMAppService.mainApp.status == .enabled
        webView.evaluateJavaScript("window.__LUDUS_LOGIN__ = \(now)")
    }

    // MARK: - Popover

    @objc private func statusClicked() {
        if popover.isShown { closePopover() } else { openPopover() }
    }

    private func openPopover() {
        guard let button = statusItem.button else { return }
        bounceIcon()
        popover.contentViewController?.preferredContentSize = currentSize()
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        applyThemeAppearance()
        if let window = popover.contentViewController?.view.window {
            // Take keys for the games without activating the app (the menu bar stays as it was).
            if !styled, let panel = window as? NSPanel { panel.styleMask.insert(.nonactivatingPanel); styled = true }
            window.makeKey()
            window.makeFirstResponder(webView)
        }
        webView.evaluateJavaScript("window.ludusOpened && ludusOpened()")
        clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            Task { @MainActor in self?.closePopover() }
        }
    }

    private func closePopover() {
        popover.performClose(nil)
    }

    func popoverDidClose(_ notification: Notification) {
        if let monitor = clickMonitor { NSEvent.removeMonitor(monitor); clickMonitor = nil }
        if quitting {
            // The save message from ludusClosed was already handled; give the bridge a moment, then quit.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { NSApp.terminate(nil) }
            return
        }
        webView.evaluateJavaScript("window.ludusClosed && ludusClosed()")
    }

    /// Menu bar icon: a game controller with a d-pad and the Claude spark as its buttons (template, adapts to the menu bar).
    private static func menuBarIcon() -> NSImage {
        let image = NSImage(size: NSSize(width: 20, height: 16), flipped: true) { _ in
            NSColor.black.setStroke(); NSColor.black.setFill()
            let body = NSBezierPath()
            body.move(to: NSPoint(x: 6, y: 3.2))
            body.line(to: NSPoint(x: 14, y: 3.2))
            body.curve(to: NSPoint(x: 18.6, y: 11.6), controlPoint1: NSPoint(x: 17.4, y: 3.2), controlPoint2: NSPoint(x: 19.2, y: 8.4))
            body.curve(to: NSPoint(x: 15.1, y: 13.4), controlPoint1: NSPoint(x: 18.2, y: 13.8), controlPoint2: NSPoint(x: 16.4, y: 14.4))
            body.line(to: NSPoint(x: 13.2, y: 11.2))
            body.line(to: NSPoint(x: 6.8, y: 11.2))
            body.line(to: NSPoint(x: 4.9, y: 13.4))
            body.curve(to: NSPoint(x: 1.4, y: 11.6), controlPoint1: NSPoint(x: 3.6, y: 14.4), controlPoint2: NSPoint(x: 1.8, y: 13.8))
            body.curve(to: NSPoint(x: 6, y: 3.2), controlPoint1: NSPoint(x: 0.8, y: 8.4), controlPoint2: NSPoint(x: 2.6, y: 3.2))
            body.close()
            body.lineWidth = 1.5; body.lineJoinStyle = .round; body.stroke()
            // d-pad
            NSBezierPath(roundedRect: NSRect(x: 4.4, y: 6.6, width: 4.2, height: 1.4), xRadius: 0.5, yRadius: 0.5).fill()
            NSBezierPath(roundedRect: NSRect(x: 5.8, y: 5.2, width: 1.4, height: 4.2), xRadius: 0.5, yRadius: 0.5).fill()
            // spark buttons
            let spark = NSBezierPath(); spark.lineWidth = 1.2; spark.lineCapStyle = .round
            let c = NSPoint(x: 13.9, y: 7.3)
            for i in 0..<4 {
                let a = CGFloat(i) * .pi / 4
                spark.move(to: NSPoint(x: c.x - cos(a) * 2.2, y: c.y - sin(a) * 2.2))
                spark.line(to: NSPoint(x: c.x + cos(a) * 2.2, y: c.y + sin(a) * 2.2))
            }
            spark.stroke()
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "Ludus"
        return image
    }

    private func bounceIcon() {
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion,
              let button = statusItem.button, let layer = button.layer else { return }
        let b = button.bounds
        var from = CATransform3DMakeTranslation(b.midX, b.midY, 0)
        from = CATransform3DScale(from, 1.12, 1.12, 1)
        from = CATransform3DTranslate(from, -b.midX, -b.midY, 0)
        let bounce = CASpringAnimation(keyPath: "transform")
        bounce.fromValue = from
        bounce.toValue = CATransform3DIdentity
        bounce.mass = 1; bounce.stiffness = 320; bounce.damping = 11
        bounce.duration = bounce.settlingDuration
        layer.add(bounce, forKey: "bounce")
    }

    // MARK: - Test hook (UI-only: open/close the panel, open a game, report state)

    @objc private func testCommand(_ note: Notification) {
        guard let command = note.object as? String else { return }
        switch command {
        case "panel": if !popover.isShown { openPopover() }
        case "close": closePopover()
        case "home": webView.evaluateJavaScript("document.getElementById('backBtn').click()")
        case "settings": webView.evaluateJavaScript("document.getElementById('openSettings').click()")
        case "state":
            webView.evaluateJavaScript("window.ludusState && ludusState()") { result, _ in
                let line = "\(Date()) \(result as? String ?? "nil")\n"
                let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Ludus.log")
                if let handle = try? FileHandle(forWritingTo: url) { handle.seekToEndOfFile(); handle.write(Data(line.utf8)); try? handle.close() }
                else { try? line.write(to: url, atomically: true, encoding: .utf8) }
            }
        default:
            if command.hasPrefix("tap:") {
                // Press an on-screen button by its label, exactly like a click would.
                let label = String(command.dropFirst(4)).filter { $0.isLetter || $0.isNumber || $0 == " " }
                webView.evaluateJavaScript("""
                  (()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='\(label)'||b.textContent.trim()==='\(label)');if(b){b.scrollIntoView();b.click()}})()
                  """)
            } else if command.hasPrefix("game:") {
                let id = command.dropFirst(5).filter { $0.isLetter || $0.isNumber }
                if !popover.isShown { openPopover() }
                webView.evaluateJavaScript("window.ludusOpenGame && ludusOpenGame('\(id)')")
            }
        }
    }
}

@main
enum LudusApp {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) { app.run() }
    }
}
