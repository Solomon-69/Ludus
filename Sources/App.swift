import AppKit
import QuartzCore
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
    private var anchorWindow: NSPanel?

    private let stateKey = "ludusState"
    private let sizeKey = "ludusSize"
    private let invisibleKey = "ludusInvisible"
    private let dockKey = "ludusShowInDock"
    // One status item under one name for both modes, so macOS keeps a single remembered position and
    // the panel opens in the same place whether the icon is drawn or not.
    private let itemName = "Ludus"
    private var invisible: Bool { UserDefaults.standard.bool(forKey: invisibleKey) }
    private static let compact = NSSize(width: 400, height: 600)
    private static let large = NSSize(width: 520, height: 740)
    // Landscape panel used only while one of the 6 wide games is open: Tag, Rally, Air Puck, Tank Duel,
    // Light Trails and Spark Hop (jumper.js).
    private static let wideCompact = NSSize(width: 760, height: 500)
    private static let wideLarge = NSSize(width: 900, height: 600)
    private var wide = false
    private var openCount = 0   // per-open counter, so a late reveal from an earlier open does nothing
    private let testNotification = Notification.Name("com.solomon.Ludus.test")

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Keep "open at login" valid after the app is moved or renamed.
        if SMAppService.mainApp.status == .enabled { try? SMAppService.mainApp.register() }

        statusItem = makeStatusItem()
        applyDockPolicy()

        setUpWebView()
        let controller = NSViewController()
        // The page sits in a clipping container so a size change can animate the panel's outline
        // without re-laying out the page on every frame (that is what made it judder).
        let container = NSView(frame: webView.frame)
        container.wantsLayer = true
        container.layer?.masksToBounds = true
        webView.autoresizingMask = [.width, .height]
        container.addSubview(webView)
        controller.view = container
        controller.preferredContentSize = currentSize()
        popover.contentViewController = controller
        popover.behavior = .applicationDefined
        popover.animates = true
        popover.delegate = self

        appearanceObserver = NSApp.observe(\.effectiveAppearance) { [weak self] _, _ in
            Task { @MainActor in self?.pushAppearance() }
        }
        // Our menu bar apps close their panel when another of them opens one.
        PanelGroup.listen { [weak self] in Task { @MainActor in self?.closePopover() } }
        #if LUDUS_TEST
        // UI test hook, compiled only into local test builds (build.sh adds -D LUDUS_TEST unless RELEASE=1).
        DistributedNotificationCenter.default().addObserver(
            self, selector: #selector(testCommand(_:)), name: testNotification, object: nil)
        // A test copy started with LUDUS_TEST_OPEN=1 opens its panel by itself (so a screenshot can be taken without any notification).
        if ProcessInfo.processInfo.environment["LUDUS_TEST_OPEN"] != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self.openPopover() }
        }
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
        // WebKit hides navigator.mediaDevices on file:// pages unless this is on (Privacy blur needs the camera).
        config.preferences.setValue(true, forKey: "mediaDevicesEnabled")
        webView = WKWebView(frame: NSRect(origin: .zero, size: currentSize()), configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsMagnification = false
        webView.navigationDelegate = self
        webView.uiDelegate = self   // camera permission for Privacy blur (Camera.swift)
        if let dir = Bundle.main.resourceURL?.appendingPathComponent("web"),
           FileManager.default.fileExists(atPath: dir.appendingPathComponent("index.html").path) {
            webView.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
            armWatchdog()
        } else { DispatchQueue.main.async { self.showFallback() } }
    }

    /// Runs before the page's own scripts: hands over saved scores/settings and the Mac's state.
    private func bootScript() -> String {
        let login = SMAppService.mainApp.status == .enabled
        return """
        window.__LUDUS_NATIVE__ = true;
        window.__LUDUS_STATE__ = \(savedStateLiteral());
        window.__LUDUS_LOGIN__ = \(login);
        window.__LUDUS_INVISIBLE__ = \(invisible);
        window.__LUDUS_DOCK__ = \(UserDefaults.standard.bool(forKey: dockKey));
        window.__LUDUS_DARK__ = \(isDark());
        window.__LUDUS_ORIGINAL_NAMES__ = \(originalNamesLiteral());
        window.__LUDUS_VERSION__ = \(String(reflecting: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"));
        \(testBoot())
        """
    }

    /// Your own list of names from ~/Library/Application Support/Ludus/original-names.json (never shipped).
    /// Only a flat text-to-text map is accepted; anything else means "no list". Travels as a quoted string, never as code.
    private func originalNamesLiteral() -> String {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return "null" }
        let url = base.appendingPathComponent("Ludus/original-names.json")
        guard let data = try? Data(contentsOf: url), data.count < 20_000,
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: String],
              let clean = try? JSONSerialization.data(withJSONObject: [String(data: try JSONSerialization.data(withJSONObject: obj), encoding: .utf8) ?? "{}"]),
              let array = String(data: clean, encoding: .utf8) else { return "null" }
        return "JSON.parse(\(array)[0])"
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

    // MARK: - Update (the page asks, Updater does the work)

    private var updating = false
    private func startUpdate(_ body: [String: Any]) {
        guard !updating, let z = (body["zip"] as? String).flatMap(URL.init(string:)), let s = (body["sums"] as? String).flatMap(URL.init(string:)),
              let name = body["name"] as? String else { return }
        updating = true
        let bundle = Bundle.main.bundleURL
        let report: @Sendable (String) -> Void = { js in DispatchQueue.main.async { MainActor.assumeIsolated { self.webView.evaluateJavaScript(js) } } }
        let noRelaunch = ProcessInfo.processInfo.environment["LUDUS_UPDATE_NO_RELAUNCH"] != nil
        Task {
            do {
                try await Updater.install(zip: z, sums: s, name: name, bundle: bundle,
                    progress: { p in report("window.ludusUpdateState && ludusUpdateState('progress', \(p))") },
                    relaunch: { app in
                        if noRelaunch { report("window.ludusUpdateState && ludusUpdateState('done')"); return }
                        Updater.relaunchAfterExit(app)
                        DispatchQueue.main.async { MainActor.assumeIsolated { self.quitting = true; NSApp.terminate(nil) } }
                    })
            } catch {
                appendErrorLog("update failed: \(error)")
                report("window.ludusUpdateState && ludusUpdateState('error')")
            }
            await MainActor.run { self.updating = false }
        }
    }

    private func appendErrorLog(_ line: String) {
        let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Ludus")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("errors.log"), data = Data((line + "\n").utf8)
        if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(data); try? h.close() } else { try? data.write(to: url) }
    }

    /// Extra boot lines for local test builds only: a pretend startup failure and a local update server.
    private func testBoot() -> String {
        #if LUDUS_TEST
        let env = ProcessInfo.processInfo.environment
        var js = ""
        if env["LUDUS_FAIL_START"] != nil { js += "window.__LUDUS_TEST_FAIL__ = true;\n" }
        if let api = env["LUDUS_UPDATE_API"], let host = URL(string: api)?.host {
            js += "window.__LUDUS_UPDATE_API__ = \(String(reflecting: api));\n"; Updater.testHosts = [host]
        }
        return js
        #else
        return ""
        #endif
    }

    // MARK: - Failsafe: if the web UI never starts, show a plain native screen instead of a blank panel

    private var uiReady = false
    private var failTimer: Timer?
    private var fallbackView: NSView?

    private func armWatchdog(after seconds: TimeInterval = 6) {
        failTimer?.invalidate()
        failTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            Task { @MainActor in if let self, !self.uiReady { self.showFallback() } }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { if !uiReady { showFallback() } }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { if !uiReady { showFallback() } }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { uiReady = false; showFallback() }

    private func showFallback() {
        guard fallbackView == nil, let host = webView.superview else { return }
        let box = NSView(frame: host.bounds); box.autoresizingMask = [.width, .height]; box.wantsLayer = true
        box.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        let title = NSTextField(labelWithString: "Ludus couldn\u{2019}t start"); title.font = .systemFont(ofSize: 18, weight: .semibold)
        let note = NSTextField(wrappingLabelWithString: "Something went wrong while opening the games. Try reloading. If it keeps happening, reset Ludus\u{2019}s saved data (best scores and settings).")
        note.alignment = .center; note.textColor = .secondaryLabelColor; note.preferredMaxLayoutWidth = 280
        let reload = NSButton(title: "Reload Ludus", target: self, action: #selector(fallbackReload)); reload.bezelStyle = .rounded; reload.keyEquivalent = "\r"
        let reset = NSButton(title: "Reset this game\u{2019}s data", target: self, action: #selector(fallbackReset(_:))); reset.bezelStyle = .rounded
        reload.identifier = NSUserInterfaceItemIdentifier("fallbackReload"); reset.identifier = NSUserInterfaceItemIdentifier("fallbackReset")
        let stack = NSStackView(views: [title, note, reload, reset]); stack.orientation = .vertical; stack.alignment = .centerX; stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false; box.addSubview(stack)
        NSLayoutConstraint.activate([stack.centerXAnchor.constraint(equalTo: box.centerXAnchor), stack.centerYAnchor.constraint(equalTo: box.centerYAnchor), stack.widthAnchor.constraint(lessThanOrEqualToConstant: 300)])
        host.addSubview(box); fallbackView = box
        appendErrorLog("web UI did not start: fallback screen shown")
    }

    private func hideFallback() { fallbackView?.removeFromSuperview(); fallbackView = nil }

    @objc private func fallbackReload() {
        hideFallback(); uiReady = false
        if let dir = webRoot { webView.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir) }
        armWatchdog()
    }

    @objc private func fallbackReset(_ sender: NSButton) {
        if sender.title != "Tap again to erase" {   // two taps, so a stray click cannot wipe scores
            sender.title = "Tap again to erase"
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { sender.title = "Reset this game\u{2019}s data" }
            return
        }
        UserDefaults.standard.removeObject(forKey: stateKey)
        UserDefaults.standard.removeObject(forKey: sizeKey)
        webView.configuration.userContentController.removeAllUserScripts()
        webView.configuration.userContentController.addUserScript(WKUserScript(source: bootScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        fallbackReload()
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
            resizePopover(animated: true)
        case "wide":
            let on = body["on"] as? Bool ?? false
            let animate = body["animate"] as? Bool ?? false   // the rotate button: same smooth resize as Compact/Large
            if on != wide { wide = on; resizePopover(animated: animate) }
            // The page starts the game once the panel has its size (app.js ludusResized), so always confirm,
            // after the animation when there is one.
            if resizeTimer != nil { resizedPending = true } else { webView.evaluateJavaScript("window.ludusResized && ludusResized()") }
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
        case "invisible":
            setInvisible(body["on"] as? Bool ?? false)
        case "dock":
            UserDefaults.standard.set(body["on"] as? Bool ?? false, forKey: dockKey)
            applyDockPolicy()
        case "share":
            let r = NSRect(x: body["x"] as? Double ?? 0, y: body["y"] as? Double ?? 0,
                           width: body["w"] as? Double ?? 1, height: body["h"] as? Double ?? 1)
            ShareFriend.share(from: webView, rect: r) { [weak self] msg in
                self?.webView.evaluateJavaScript("window.ludusShareError && ludusShareError(\(String(reflecting: msg)))")
            }
        case "update": startUpdate(body)
        case "ready": uiReady = true; failTimer?.invalidate()
        case "uifail": DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { if !self.uiReady { self.showFallback() } }   // a startup error: unless the page still came up
        case "intro":
            // First run: open the panel by itself so the welcome is seen.
            if !popover.isShown { DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.openPopover() } }
        case "log":
            // A game error (never shown to the player): appended to ~/Library/Logs/Ludus/errors.log for us.
            if let line = body["line"] as? String {
                let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Ludus")
                try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                let url = dir.appendingPathComponent("errors.log"), data = Data((String(line.prefix(2000)) + "\n").utf8)
                if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(data); try? h.close() } else { try? data.write(to: url) }
            }
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
    private var resizeTimer: Timer?

    /// Animated (Compact/Large switch): the panel grows or shrinks smoothly under the arrow while its
    /// contents fade out and back in at the new layout. Not animated (wide games, opening): straight to
    /// the new size, so games lay out once at their final size.
    private var resizedPending = false

    private func resizePopover(animated: Bool = false) {
        let target = currentSize()
        if resizeTimer != nil { finishResize() }
        guard popover.isShown else { popover.contentViewController?.preferredContentSize = target; return }
        let start = popover.contentSize
        let calm = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        guard animated, !calm, start != target, start.width > 0 else {
            popover.animates = false
            setPanelSize(target)
            DispatchQueue.main.async { [weak self] in self?.popover.animates = true }
            return
        }
        // The page keeps its current layout (centred, top pinned) and fades out while the panel's outline
        // grows or shrinks smoothly; it re-lays out once, unseen, and fades back in at the new size. (A
        // web page can't redraw fast enough to follow a resizing panel frame by frame without tearing.)
        let page = start
        webView.autoresizingMask = []   // placed by hand each frame
        if let container = popover.contentViewController?.view { placePage(page, in: container) }
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.14
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            webView.animator().alphaValue = 0
        }
        popover.animates = false
        guard let window = popover.contentViewController?.view.window else { setPanelSize(target); finishResize(); return }
        // Driven frame by frame on the panel's own window (macOS animates a popover shrinking but not
        // growing, and per-frame popover resizes only reach the screen at the end). The window keeps its
        // top edge and centre line, so the panel grows and shrinks evenly under the arrow.
        let from = window.frame
        let chrome = NSSize(width: from.width - start.width, height: from.height - start.height)
        let top = from.maxY, mid = from.midX
        let duration: TimeInterval = 0.42
        let run = { [weak self] in
            guard let self else { return }
            let began = CACurrentMediaTime()
            let timer = Timer(timeInterval: 1.0 / 120.0, repeats: true) { [weak self] t in
                guard let self else { t.invalidate(); return }
                let p = min(1, (CACurrentMediaTime() - began) / duration)
                let e = 1 - pow(1 - p, 4)   // ease-out quart: quick start, long soft landing
                let cw = (start.width + (target.width - start.width) * e).rounded()
                let ch = (start.height + (target.height - start.height) * e).rounded()
                let w = cw + chrome.width, h = ch + chrome.height
                window.setFrame(NSRect(x: (mid - w / 2).rounded(), y: top - h, width: w, height: h), display: false)
                // The popover doesn't re-lay out its content during a manual window resize: size the
                // container and place the page (centred, top pinned) by hand, then draw once.
                if let container = self.popover.contentViewController?.view {
                    container.setFrameSize(NSSize(width: cw, height: ch))
                    self.placePage(page, in: container)
                }
                window.display()
                if p >= 1 {
                    // Hand the final size back to the popover (already on screen) in one screen update.
                    window.disableScreenUpdatesUntilFlush()
                    self.setPanelSize(target)
                    self.finishResize()
                }
            }
            RunLoop.main.add(timer, forMode: .common)
            self.resizeTimer = timer
        }
        run()
    }

    /// The page centred in the container with its top edge on the container's top edge.
    private func placePage(_ page: NSSize, in container: NSView) {
        let b = container.bounds
        webView.frame = NSRect(x: ((b.width - page.width) / 2).rounded(),
                               y: container.isFlipped ? 0 : b.height - page.height,
                               width: page.width, height: page.height)
    }

    private func finishResize() {
        resizeTimer?.invalidate(); resizeTimer = nil
        if resizedPending { resizedPending = false; webView.evaluateJavaScript("window.ludusResized && ludusResized()") }
        DispatchQueue.main.async { [weak self] in self?.popover.animates = true }
        let full = NSRect(origin: .zero, size: popover.contentViewController?.view.bounds.size ?? popover.contentSize)
        if webView.frame != full { webView.frame = full }
        webView.autoresizingMask = [.width, .height]
        // Fade the page back in once it has drawn at the new size.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { [weak self] in
            guard let self, self.resizeTimer == nil else { return }
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.22
                ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
                self.webView.animator().alphaValue = 1
            }
        }
    }

    private func setPanelSize(_ size: NSSize) {
        popover.contentViewController?.preferredContentSize = size
        popover.contentSize = size
    }

    private func applyThemeAppearance() {
        popover.appearance = themeAppearance
        popover.contentViewController?.view.window?.appearance = themeAppearance
        webView.appearance = themeAppearance
    }

    private func currentSize() -> NSSize {
        let isLarge = UserDefaults.standard.string(forKey: sizeKey) == "large"
        if wide { return isLarge ? Self.wideLarge : Self.wideCompact }
        return isLarge ? Self.large : Self.compact
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

    // MARK: - Status item

    /// The menu bar item. Invisible mode keeps the same item, width and click target but draws nothing.
    private func makeStatusItem() -> NSStatusItem {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.autosaveName = itemName
        if let button = item.button {
            button.wantsLayer = true
            button.target = self
            button.action = #selector(statusClicked)
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
            button.setAccessibilityLabel("Ludus games")
        }
        applyInvisible(to: item)
        return item
    }

    /// Draws or blanks the icon in place. The item is never recreated, so it never moves in the menu bar
    /// (recreating it on each switch made macOS shift it, and the panel with it, a little further each time).
    private func applyInvisible(to item: NSStatusItem) {
        guard let button = item.button else { return }
        let hidden = invisible
        button.image = hidden ? Self.emptyIcon() : Self.menuBarIcon()
        button.subviews.filter { $0 is ClickCatcher }.forEach { $0.removeFromSuperview() }
        if hidden {
            // No pressed pill while invisible: clicks land on a clear view above the button, so the
            // button itself is never pressed and the spot stays empty before, during and after a click.
            let catcher = ClickCatcher(frame: button.bounds)
            catcher.autoresizingMask = [.width, .height]
            catcher.onClick = { [weak self] in self?.handleStatusClick(settings: false) }
            catcher.onSettingsClick = { [weak self] in self?.handleStatusClick(settings: true) }
            button.addSubview(catcher)
        }
    }

    private func setInvisible(_ on: Bool) {
        if on != invisible {
            UserDefaults.standard.set(on, forKey: invisibleKey)
            applyInvisible(to: statusItem)
            // Move the open panel's arrow to the new anchor without its open animation, so it doesn't
            // blink. The item never moves, so the panel stays in the same place; only the pill changes.
            if popover.isShown, !on {
                // Back to visible while open: keep the panel on its clear anchor (re-anchoring to the
                // real icon makes macOS fade the panel out and in). Light the pill by hand instead.
                statusItem.button?.highlight(true)
            } else if popover.isShown, let anchor = popoverAnchor() {
                popover.animates = false
                popover.show(relativeTo: anchor.bounds, of: anchor, preferredEdge: .minY)
                DispatchQueue.main.async { [weak self] in self?.popover.animates = true }
            }
        }
        webView.evaluateJavaScript("window.__LUDUS_INVISIBLE__ = \(invisible)")
    }

    /// Dock icon only when "Show in Dock" is on. Off (the default), Ludus lives in the menu bar alone.
    private func applyDockPolicy() {
        let policy: NSApplication.ActivationPolicy = UserDefaults.standard.bool(forKey: dockKey) ? .regular : .accessory
        if NSApp.activationPolicy() != policy { NSApp.setActivationPolicy(policy) }
    }

    /// A clicked room invite (ludus://join/K7M2Q): open the panel and go straight to joining that room.
    /// Only a 5 character letters/digits code is ever taken from the link and handed to the page.
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme?.lowercased() == "ludus" && url.host?.lowercased() == "join" {
            let code = url.lastPathComponent.uppercased()
            guard code.count == 5, code.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) else { continue }
            if !popover.isShown { openPopover() }
            webView.evaluateJavaScript("window.ludusJoin && ludusJoin('\(code)')")
            return
        }
    }

    /// Safety net: opening Ludus again from Finder or Spotlight while the icon is invisible opens the panel.
    /// With the Dock icon shown, clicking it opens the panel too.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if (invisible || UserDefaults.standard.bool(forKey: dockKey)) && !popover.isShown { openPopover() }
        return false
    }

    // MARK: - Popover

    @objc private func statusClicked() {
        let event = NSApp.currentEvent
        handleStatusClick(settings: StatusClick.isSettingsClick(type: event?.type, modifiers: event?.modifierFlags ?? []))
    }

    private func handleStatusClick(settings: Bool) {
        switch StatusClick.action(panelShown: popover.isShown, settingsClick: settings) {
        case .open: openPopover()
        case .close: closePopover()
        case .openSettings: openPopover(settings: true)
        case .showSettings: webView.evaluateJavaScript("window.ludusOpenSettings && ludusOpenSettings()")
        }
    }

    /// The view the panel's arrow points at: the menu bar button, or while invisible a clear window over
    /// the empty spot (a panel shown from the menu bar button itself makes macOS draw a pill behind it).
    /// If the item can't be seen (behind the notch, pushed out of a full menu bar, off screen), the clear
    /// window sits under the menu bar near the mouse pointer instead, so the panel always opens on screen.
    private func popoverAnchor() -> NSView? {
        let itemFrame = statusItem.button?.window.flatMap { itemVisible($0) ? $0.frame : nil }
        if !invisible, itemFrame != nil { anchorWindow?.orderOut(nil); return statusItem.button }
        guard var frame = itemFrame ?? pointerAnchorFrame() else { anchorWindow?.orderOut(nil); return nil }
        // Bottom edge raised a little, so the arrow sits as snug under the menu bar as it does for the real icon.
        frame.origin.y += 4; frame.size.height -= 4
        // A clear window of its own sitting exactly over that spot, so the panel is not tied to the
        // menu bar item and macOS draws no pill. It never takes clicks; the catcher below it does.
        let window = anchorWindow ?? {
            let w = NSPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            w.isOpaque = false; w.backgroundColor = .clear; w.hasShadow = false
            w.ignoresMouseEvents = true; w.level = .statusBar
            w.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
            anchorWindow = w
            return w
        }()
        window.setFrame(frame, display: false)
        window.orderFrontRegardless()
        return window.contentView
    }

    /// Whether the menu bar item's window is really on screen: shown, not covered, fully on one screen,
    /// and on a notch screen not in the strip behind the notch.
    private func itemVisible(_ window: NSWindow) -> Bool {
        let frame = window.frame
        guard window.isVisible, window.occlusionState.contains(.visible), frame.width > 0, frame.height > 0,
              let screen = NSScreen.screens.first(where: { $0.frame.insetBy(dx: -1, dy: -1).contains(frame) }) else { return false }
        if let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea {
            // Only widths are used, so this holds whatever coordinates the areas are given in.
            let notchMinX = screen.frame.minX + left.width, notchMaxX = screen.frame.maxX - right.width
            if frame.maxX > notchMinX && frame.minX < notchMaxX { return false }
        }
        return true
    }

    /// An icon-sized spot just under the menu bar, near the mouse pointer, kept inside the pointer's screen.
    private func pointerAnchorFrame() -> NSRect? {
        let mouse = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(mouse) }) ?? NSScreen.main else { return nil }
        let bar = NSStatusBar.system.thickness   // a square item is as wide as the menu bar is tall
        let x = min(max(mouse.x - bar / 2, screen.frame.minX), screen.frame.maxX - bar)
        return NSRect(x: x, y: screen.frame.maxY - bar, width: bar, height: bar)
    }

    private func openPopover(settings: Bool = false) {
        guard let button = popoverAnchor() else { return }
        PanelGroup.announceOpen()   // close our other menu bar apps' panels
        bounceIcon()
        wide = false   // Ludus always opens on All games, so never at a wide game's landscape size
        popover.contentViewController?.preferredContentSize = currentSize()
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        applyThemeAppearance()
        if let window = popover.contentViewController?.view.window {
            // Take keys for the games without activating the app (the menu bar stays as it was).
            if !styled, let panel = window as? NSPanel { panel.styleMask.insert(.nonactivatingPanel); styled = true }
            window.makeKey()
            window.makeFirstResponder(webView)
        }
        // The web view still holds its last picture (often the game that was open) until it repaints.
        // Keep it hidden until the home screen has really been drawn, then fade it in, so opening is clean.
        webView.alphaValue = 0
        openCount += 1
        let thisOpen = openCount
        let reveal: () -> Void = { [weak self] in
            guard let self, self.openCount == thisOpen, self.webView.alphaValue < 1 else { return }
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.12
                self.webView.animator().alphaValue = 1
            }
        }
        webView.callAsyncJavaScript(
            "window.ludusOpened && ludusOpened();"
            // right-click: straight to Settings, with no slide (ludusOpened turns transitions back on next frame)
            + (settings ? " document.documentElement.classList.add('instant'); window.ludusOpenSettings && ludusOpenSettings();" : "")
            + " await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));",
            arguments: [:], in: nil, in: .page) { _ in reveal() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: reveal)   // never stay hidden
        MenuBarStrip.startEsc(window: { [weak self] in self?.popover.contentViewController?.view.window }, close: { [weak self] in self?.closePopover() })
        clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            if PanelGroup.isOnNoxSwitch() { return }   // Nox's quick dark-mode switch never closes the panel; any other click does
            Task { @MainActor in self?.closePopover() }
        }
    }

    private func closePopover() {
        popover.performClose(nil)
    }

    func popoverDidClose(_ notification: Notification) {
        anchorWindow?.orderOut(nil)
        statusItem.button?.highlight(false)
        if let monitor = clickMonitor { NSEvent.removeMonitor(monitor); clickMonitor = nil }
        MenuBarStrip.stopEsc()
        if quitting {
            // The save message from ludusClosed was already handled; give the bridge a moment, then quit.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { NSApp.terminate(nil) }
            return
        }
        webView.evaluateJavaScript("window.ludusClosed && ludusClosed()")
    }

    /// Menu bar icon: the Ludus mark, a solid controller with the d-pad and a diamond of four face buttons cut out
    /// (same silhouette as the app icon; template, so it adapts to the menu bar).
    private static func menuBarIcon() -> NSImage {
        let image = NSImage(size: NSSize(width: 20, height: 16), flipped: true) { _ in
            guard let ctx = NSGraphicsContext.current?.cgContext else { return false }
            // The mark is drawn in a 100-unit design space (y down), scaled into 20 x 16 points.
            var t = CGAffineTransform(translationX: 10, y: 8).scaledBy(x: 0.222, y: 0.222).translatedBy(x: -50, y: -54)
            guard let body = controllerBody().copy(using: &t), let holes = controllerCutouts().copy(using: &t) else { return false }
            ctx.addPath(body.subtracting(holes))
            ctx.setFillColor(NSColor.black.cgColor)
            ctx.fillPath()
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "Ludus"
        return image
    }

    /// Invisible mode: same size as the real icon, nothing drawn.
    private static func emptyIcon() -> NSImage {
        let image = NSImage(size: NSSize(width: 20, height: 16))
        image.isTemplate = true
        image.accessibilityDescription = "Ludus"
        return image
    }

    private static func controllerBody() -> CGPath {
        let p = CGMutablePath()
        p.move(to: CGPoint(x: 32, y: 29))
        p.addLine(to: CGPoint(x: 68, y: 29))
        p.addCurve(to: CGPoint(x: 89, y: 48), control1: CGPoint(x: 80, y: 29), control2: CGPoint(x: 86.5, y: 36))
        p.addCurve(to: CGPoint(x: 88, y: 75), control1: CGPoint(x: 92, y: 60), control2: CGPoint(x: 93, y: 70))
        p.addCurve(to: CGPoint(x: 72, y: 71), control1: CGPoint(x: 83, y: 80), control2: CGPoint(x: 76, y: 77.5))
        p.addLine(to: CGPoint(x: 67.5, y: 63.5))
        p.addCurve(to: CGPoint(x: 60, y: 60), control1: CGPoint(x: 65.8, y: 61), control2: CGPoint(x: 63.5, y: 60))
        p.addLine(to: CGPoint(x: 40, y: 60))
        p.addCurve(to: CGPoint(x: 32.5, y: 63.5), control1: CGPoint(x: 36.5, y: 60), control2: CGPoint(x: 34.2, y: 61))
        p.addLine(to: CGPoint(x: 28, y: 71))
        p.addCurve(to: CGPoint(x: 12, y: 75), control1: CGPoint(x: 24, y: 77.5), control2: CGPoint(x: 17, y: 80))
        p.addCurve(to: CGPoint(x: 11, y: 48), control1: CGPoint(x: 7, y: 70), control2: CGPoint(x: 8, y: 60))
        p.addCurve(to: CGPoint(x: 32, y: 29), control1: CGPoint(x: 13.5, y: 36), control2: CGPoint(x: 20, y: 29))
        p.closeSubpath()
        return p
    }

    /// D-pad and four round face buttons in a diamond, a touch bigger and wider apart than the
    /// app icon's so they stay separate at 18 pt.
    private static func controllerCutouts() -> CGPath {
        let d = CGPoint(x: 30.5, y: 45)
        let plus = CGMutablePath()
        plus.addRoundedRect(in: CGRect(x: d.x - 9, y: d.y - 3.3, width: 18, height: 6.6), cornerWidth: 1.5, cornerHeight: 1.5)
        plus.addRoundedRect(in: CGRect(x: d.x - 3.3, y: d.y - 9, width: 6.6, height: 18), cornerWidth: 1.5, cornerHeight: 1.5)
        var holes = plus.union(CGPath(rect: .zero, transform: nil))
        let c = CGPoint(x: 69.5, y: 45), offset: CGFloat = 6.5, radius: CGFloat = 3.4
        for (dx, dy) in [(0, -offset), (offset, 0), (0, offset), (-offset, 0)] as [(CGFloat, CGFloat)] {
            let button = CGRect(x: c.x + dx - radius, y: c.y + dy - radius, width: radius * 2, height: radius * 2)
            holes = holes.union(CGPath(ellipseIn: button, transform: nil))
        }
        return holes
    }

    private func bounceIcon() {
        guard !invisible, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion,
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

    #if LUDUS_TEST
    @objc private func testCommand(_ note: Notification) {
        guard let command = note.object as? String else { return }
        switch command {
        case "panel": if !popover.isShown { openPopover() }
        case "sharetest": ShareFriend.selfTest(report: "/tmp/ludus-share-test.txt")
        case "intro": webView.evaluateJavaScript("window.ludusShowIntro && ludusShowIntro(0)")
        case "close": closePopover()
        case "home": webView.evaluateJavaScript("document.getElementById('backBtn').click()")
        case "settings": webView.evaluateJavaScript("document.getElementById('openSettings').click()")
        case "focus":
            // Which element has keyboard focus, and whether it would draw a focus ring (no-focus-ring check).
            webView.evaluateJavaScript("(()=>{const a=document.activeElement;return (a&&(a.id||a.className||a.tagName))+' ring='+!!(a&&a.matches&&a.matches(':focus-visible'))})()") { [weak self] result, _ in
                self?.appendLog("\(Date()) focus \(result as? String ?? "nil")\n")
            }
        case "invisible:on": setInvisible(true)
        case "invisible:off": setInvisible(false)
        case "dock:on", "dock:off":
            UserDefaults.standard.set(command == "dock:on", forKey: dockKey); applyDockPolicy()
        case "click":
            // Same path as a real click on the menu bar spot (the clear catcher view while invisible).
            if let catcher = statusItem.button?.subviews.first(where: { $0 is ClickCatcher }) as? ClickCatcher {
                catcher.onClick?()
            } else {
                statusItem.button?.performClick(nil)
            }
        case "reopen": _ = applicationShouldHandleReopen(NSApp, hasVisibleWindows: false)
        case "status":
            // Where the menu bar item is, how wide, and whether it draws anything (for the invisible-mode check).
            let frame = statusItem.button?.window?.frame ?? .zero
            let line = "\(Date()) status invisible=\(invisible) shown=\(popover.isShown) frame=\(NSStringFromRect(frame)) "
                + "image=\(statusItem.button?.image.map { NSStringFromSize($0.size) } ?? "nil") "
                + "catcher=\(statusItem.button?.subviews.contains { $0 is ClickCatcher } ?? false) "
                + "anchor=\(NSStringFromRect(anchorWindow?.frame ?? .zero)) panel=\(NSStringFromRect(popover.contentViewController?.view.window?.frame ?? .zero))\n"
            appendLog(line)
        case "probe":
            // Mosaic Hunt photo and camera support, as this real web view sees them.
            webView.evaluateJavaScript("(()=>{const i=document.querySelector('.ih-photo img');return JSON.stringify({img:i?{src:i.currentSrc,ok:i.complete&&i.naturalWidth>0}:null,cam:!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia),privacy:!!(window.LudusPrivacy&&LudusPrivacy.supported())})})()") { [weak self] result, _ in
                self?.appendLog("\(Date()) probe \(result as? String ?? "nil")\n")
            }
        case "camera":
            // Ask for the camera like Privacy blur does; logs granted / refused, or nothing while the system prompt is up.
            webView.evaluateJavaScript("navigator.mediaDevices.getUserMedia({video:true}).then(s=>{s.getTracks().forEach(t=>t.stop());window.__camTest='granted'},e=>{window.__camTest='refused '+e.name});window.__camTest='asking';'asking'") { [weak self] result, _ in
                self?.appendLog("\(Date()) camera \(result as? String ?? "nil")\n")
            }
        case "mute":
            // Silent test runs: mutes this web view's sound only (not the Mac's volume, not the saved Sound setting).
            let sel = NSSelectorFromString("_setPageMuted:")
            if webView.responds(to: sel) {
                typealias SetMuted = @convention(c) (AnyObject, Selector, UInt) -> Void
                unsafeBitCast(webView.method(for: sel), to: SetMuted.self)(webView, sel, 1)   // 1 = audio muted
            }
            webView.evaluateJavaScript("window.__ludusTestMuted=true") { _, _ in }
            appendLog("\(Date()) mute \(webView.responds(to: sel))\n")
        case "privacy:start":
            // Starts Privacy blur exactly as the switch does; "privacy" reads back how it is doing (no pictures, only counts).
            webView.evaluateJavaScript("window.__privStart='starting';LudusPrivacy.start((b,r)=>{window.__privLast=b+' '+r}).then(ok=>{window.__privStart='ok '+ok},e=>{window.__privStart='fail '+e.message});'starting'") { [weak self] result, _ in
                self?.appendLog("\(Date()) privacy:start \(result as? String ?? "nil")\n")
            }
        case "privacy:selftest":
            // Face finder check with the window closed and no camera: draws made-up pictures (empty, one face from a
            // public MediaPipe sample portrait at two sizes, one face plus a small one behind) and logs the faces found.
            webView.callAsyncJavaScript("""
              const im = new Image(); im.crossOrigin = 'anonymous'; im.src = 'https://storage.googleapis.com/mediapipe-assets/portrait.jpg';
              await new Promise((ok, no) => { im.onload = ok; im.onerror = no; });
              const c = document.createElement('canvas'); c.width = 640; c.height = 480; const x = c.getContext('2d');
              const scenes = { none: [], one: [[180, 40, 352, 440]], small: [[240, 220, 208, 260]], watcher: [[240, 40, 352, 440], [20, 60, 160, 200]] };
              const out = [];
              for (const [name, list] of Object.entries(scenes)) {
                x.fillStyle = '#777'; x.fillRect(0, 0, 640, 480); list.forEach(r => x.drawImage(im, ...r));
                const t = performance.now(); const f = await LudusPrivacy._test.facesIn(c);
                out.push(name + '=' + f.length + (f.length ? '(' + f.map(q => q.w.toFixed(2) + (q.facing ? 'F' : 'a')).join(' ') + ')' : '') + ' ' + Math.round(performance.now() - t) + 'ms');
              }
              return out.join(' ') + ' engine=' + LudusPrivacy.engine();
              """, arguments: [:], in: nil, in: .page) { [weak self] result in
                switch result {
                case .success(let v): self?.appendLog("\(Date()) privacy:selftest \(v)\n")
                case .failure(let e): self?.appendLog("\(Date()) privacy:selftest failed \(e)\n")
                }
            }
        case "privacy:stop":
            webView.evaluateJavaScript("LudusPrivacy.stop();'stopped'") { [weak self] result, _ in self?.appendLog("\(Date()) privacy:stop \(result as? String ?? "nil")\n") }
        case "privacy":
            webView.evaluateJavaScript("JSON.stringify(Object.assign({start:String(window.__privStart),last:String(window.__privLast),running:LudusPrivacy.running(),veil:document.documentElement.classList.contains('privacy-blur')},LudusPrivacy._test.status()))") { [weak self] result, error in
                self?.appendLog("\(Date()) privacy \(result as? String ?? "nil \(String(describing: error))")\n")
            }
        case "camstate":
            webView.evaluateJavaScript("String(window.__camTest)") { [weak self] result, _ in self?.appendLog("\(Date()) camstate \(result as? String ?? "nil")\n") }
        case "state":
            webView.evaluateJavaScript("window.ludusState && ludusState()") { [weak self] result, _ in
                self?.appendLog("\(Date()) \(result as? String ?? "nil")\n")
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

    private func appendLog(_ line: String) {
        let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Ludus.log")
        if let handle = try? FileHandle(forWritingTo: url) { handle.seekToEndOfFile(); handle.write(Data(line.utf8)); try? handle.close() }
        else { try? line.write(to: url, atomically: true, encoding: .utf8) }
    }
    #endif
}

/// Clear view laid over the invisible menu bar item: takes left, right and Option clicks without
/// pressing the button underneath, so no highlight pill is ever drawn.
final class ClickCatcher: NSView {
    var onClick: (() -> Void)?
    var onSettingsClick: (() -> Void)?   // right click or Control-click: open on Settings
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) {}
    override func mouseUp(with event: NSEvent) {
        if StatusClick.isSettingsClick(type: event.type, modifiers: event.modifierFlags) { onSettingsClick?() } else { onClick?() }
    }
    override func rightMouseDown(with event: NSEvent) {}
    override func rightMouseUp(with event: NSEvent) { onSettingsClick?() }
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
