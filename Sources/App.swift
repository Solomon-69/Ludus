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
        window.__LUDUS_INVISIBLE__ = \(invisible);
        window.__LUDUS_DOCK__ = \(UserDefaults.standard.bool(forKey: dockKey));
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
            resizePopover(animated: true)
        case "wide":
            let on = body["on"] as? Bool ?? false
            if on != wide { wide = on; resizePopover() }
            // The page starts the game once the panel has its size (app.js ludusResized), so always confirm.
            webView.evaluateJavaScript("window.ludusResized && ludusResized()")
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
        case "intro":
            // First run: open the panel by itself so the welcome is seen.
            if !popover.isShown { DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.openPopover() } }
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
            catcher.onClick = { [weak self] in self?.statusClicked() }
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
        if popover.isShown { closePopover() } else { openPopover() }
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

    private func openPopover() {
        guard let button = popoverAnchor() else { return }
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
            "window.ludusOpened && ludusOpened(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));",
            arguments: [:], in: nil, in: .page) { _ in reveal() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: reveal)   // never stay hidden
        clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
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
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) {}
    override func mouseUp(with event: NSEvent) { onClick?() }
    override func rightMouseDown(with event: NSEvent) {}
    override func rightMouseUp(with event: NSEvent) { onClick?() }
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
