import AppKit

/// The screen shown when the games cannot open: one card in Ludus's own colours with a two-part pill
/// (Reload / Reset data). Follows the saved Ludus theme and the "Raised buttons" setting: raised gives the
/// sliding thumb a solid lip underneath that presses down, flat gives a plain thumb.
@MainActor
final class FallbackView: NSView {
    struct Look {
        let bg, card, line, track, ink, ink2, accent, accentSoft, thumb, thumbInk, lip, danger: NSColor
        let raised: Bool
        var calm = false   // Ludus's own Reduce motion setting
    }

    static func look(stateJSON: String?, systemDark: Bool) -> Look {
        var theme = "system", raised = true, calm = false
        if let s = stateJSON, let d = s.data(using: .utf8),
           let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            theme = o["theme"] as? String ?? "system"
            raised = (o["raised"] as? Bool) ?? true
            calm = (o["reduceMotion"] as? Bool) ?? false
        }
        let dark = theme == "dark" || (theme == "system" && systemDark)
        func c(_ hex: UInt32, _ a: CGFloat = 1) -> NSColor {
            NSColor(srgbRed: CGFloat(hex >> 16 & 255) / 255, green: CGFloat(hex >> 8 & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: a)
        }
        var l: Look = dark
            ? Look(bg: c(0x1b1814), card: c(0x2a2621), line: c(0xfff5e6, 0.08), track: c(0x322d27), ink: c(0xf3ede3), ink2: c(0xb5aa9b),
                   accent: c(0xd97757), accentSoft: c(0xd97757, 0.2), thumb: c(0xf3ede3), thumbInk: c(0x1b1814), lip: c(0xa89e90), danger: c(0xe06a78), raised: raised)
            : Look(bg: c(0xf4efe6), card: c(0xfffcf7), line: c(0x201c17, 0.09), track: c(0xebe4d7), ink: c(0x201c17), ink2: c(0x6b6256),
                   accent: c(0xd97757), accentSoft: c(0xd97757, 0.14), thumb: c(0x201c17), thumbInk: c(0xf4efe6), lip: c(0x000000), danger: c(0xd1495b), raised: raised)
        l.calm = calm
        return l
    }

    static var titleText = "Let\u{2019}s get you back in"
    private let look: Look
    private let onReload: () -> Void
    private let onReset: () -> Void
    private let thumb = NSView(), lip = NSView()
    private let track = TrackView()
    private var reload: SegmentButton!, reset: SegmentButton!
    private var selected = 0           // 0 = Reload, 1 = Reset
    private var armed = false          // Reset was tapped once: the next tap erases
    private var disarm: DispatchWorkItem?
    private static let lipH: CGFloat = 4

    init(frame: NSRect, look: Look, onReload: @escaping () -> Void, onReset: @escaping () -> Void) {
        self.look = look; self.onReload = onReload; self.onReset = onReset
        super.init(frame: frame)
        wantsLayer = true; layer?.backgroundColor = look.bg.cgColor
        build()
    }
    required init?(coder: NSCoder) { fatalError() }

    private func rounded(_ size: CGFloat, _ weight: NSFont.Weight) -> NSFont {
        let f = NSFont.systemFont(ofSize: size, weight: weight)
        return f.fontDescriptor.withDesign(.rounded).flatMap { NSFont(descriptor: $0, size: size) } ?? f
    }

    private func build() {
        let card = self
        let tile = NSImageView(image: NSApp.applicationIconImage ?? NSImage())
        tile.imageScaling = .scaleProportionallyUpOrDown; tile.translatesAutoresizingMaskIntoConstraints = false
        let title = NSTextField(labelWithString: FallbackView.titleText)
        title.font = rounded(19, .semibold); title.textColor = look.ink; title.alignment = .center
        let note = NSTextField(wrappingLabelWithString: "Reload to get back to your games. Reset data only if it keeps happening.")
        note.font = rounded(13, .regular); note.textColor = look.ink2; note.alignment = .center; note.preferredMaxLayoutWidth = 260

        track.wantsLayer = true; track.translatesAutoresizingMaskIntoConstraints = false
        track.onLayout = { [weak self] in self?.place(pressed: false) }
        track.layer?.backgroundColor = look.track.cgColor; track.layer?.cornerRadius = 28; track.layer?.cornerCurve = .continuous
        for v in [lip, thumb] {   // real views (not bare layers), added first so the two halves draw on top of them
            v.wantsLayer = true; v.layer?.cornerRadius = 23; v.layer?.cornerCurve = .continuous
            v.layer?.backgroundColor = (v === lip ? look.lip : look.thumb).cgColor; track.addSubview(v)
        }
        lip.isHidden = !look.raised

        reload = SegmentButton(title: "Reload", symbol: "arrow.clockwise", font: rounded(14, .semibold))
        reset = SegmentButton(title: "Reset data", symbol: "eraser", font: rounded(14, .semibold))
        reload.identifier = NSUserInterfaceItemIdentifier("fallbackReload"); reset.identifier = NSUserInterfaceItemIdentifier("fallbackReset")
        reload.keyEquivalent = "\r"
        reload.target = self; reload.action = #selector(tapReload); reset.target = self; reset.action = #selector(tapReset)
        for b in [reload!, reset!] {
            b.onPress = { [weak self, weak b] down in   // only the selected half sinks; the other one slides the thumb over instead
                guard let self, let b else { return }
                if (b === self.reload) == (self.selected == 0) { self.press(down) }
            }
            b.translatesAutoresizingMaskIntoConstraints = false; track.addSubview(b)
        }

        let stack = NSStackView(views: [tile, title, note, track]); stack.orientation = .vertical; stack.alignment = .centerX
        stack.spacing = 12; stack.setCustomSpacing(28, after: tile); stack.setCustomSpacing(40, after: note)
        stack.translatesAutoresizingMaskIntoConstraints = false; card.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: card.centerXAnchor), stack.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            stack.widthAnchor.constraint(equalToConstant: 300),
            tile.widthAnchor.constraint(equalToConstant: 76), tile.heightAnchor.constraint(equalToConstant: 76),
            track.widthAnchor.constraint(equalTo: stack.widthAnchor), track.heightAnchor.constraint(equalToConstant: 56),
            reload.leadingAnchor.constraint(equalTo: track.leadingAnchor, constant: 5), reload.topAnchor.constraint(equalTo: track.topAnchor, constant: 5),
            reload.bottomAnchor.constraint(equalTo: track.bottomAnchor, constant: -5),
            reset.trailingAnchor.constraint(equalTo: track.trailingAnchor, constant: -5), reset.topAnchor.constraint(equalTo: reload.topAnchor),
            reset.bottomAnchor.constraint(equalTo: reload.bottomAnchor), reset.leadingAnchor.constraint(equalTo: reload.trailingAnchor),
            reset.widthAnchor.constraint(equalTo: reload.widthAnchor),
        ])
        paint()
    }

    override func layout() {
        super.layout()
        CATransaction.begin(); CATransaction.setDisableActions(true); place(pressed: false); CATransaction.commit()
    }

    /// Thumb sits under the selected half; raised mode lifts it by the lip height so the lip shows below.
    private func place(pressed: Bool) {
        let seg = selected == 0 ? reload.frame : reset.frame
        guard seg.width > 0 else { return }
        let lipH = look.raised ? Self.lipH : 0
        let sink = pressed ? lipH - 1 : 0
        lip.frame = seg.insetBy(dx: 0, dy: 0)
        thumb.frame = CGRect(x: seg.minX, y: seg.minY + lipH - sink, width: seg.width, height: seg.height - lipH)
    }

    private func move(animated: Bool) {
        guard animated, !look.calm, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { place(pressed: false); return }
        for v in [thumb, lip] {
            guard let l = v.layer else { continue }
            let a = CASpringAnimation(keyPath: "position")
            a.fromValue = NSValue(point: l.presentation()?.position ?? l.position)
            a.mass = 1; a.stiffness = 420; a.damping = 30; a.duration = a.settlingDuration
            l.add(a, forKey: "slide")
        }
        CATransaction.begin(); CATransaction.setDisableActions(true); place(pressed: false); CATransaction.commit()
    }

    private func press(_ down: Bool) {
        guard look.raised, !look.calm, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return }
        CATransaction.begin(); CATransaction.setAnimationDuration(0.08); place(pressed: down); CATransaction.commit()
    }

    private func paint() {
        reload.tint(selected == 0 ? look.thumbInk : look.ink2)
        reset.tint(selected == 1 ? (armed ? .white : look.thumbInk) : look.ink2)
        thumb.layer?.backgroundColor = (armed ? look.danger : look.thumb).cgColor
        lip.layer?.backgroundColor = (armed ? (look.danger.blended(withFraction: 0.35, of: .black) ?? look.danger) : look.lip).cgColor
        reset.label = armed ? "Tap to erase" : "Reset data"
    }

    @objc private func tapReload() {
        disarm?.cancel(); armed = false
        let moved = selected != 0; selected = 0; paint(); move(animated: moved)
        onReload()
    }

    @objc private func tapReset() {
        if armed { disarm?.cancel(); onReset(); return }
        armed = true; selected = 1; paint(); move(animated: true)   // two taps, so a stray click cannot wipe scores
        let w = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.armed = false; self.selected = 0; self.paint(); self.move(animated: true)
        }
        disarm = w; DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: w)
    }
}

/// The pill's track: tells the screen whenever its halves are laid out, so the thumb always sits under the selected half.
@MainActor
final class TrackView: NSView {
    var onLayout: (() -> Void)?
    override func layout() {
        super.layout()
        CATransaction.begin(); CATransaction.setDisableActions(true); onLayout?(); CATransaction.commit()
    }
}

/// One half of the pill: icon plus label, no bezel; reports press and release so the thumb can sink.
@MainActor
final class SegmentButton: NSButton {
    var onPress: ((Bool) -> Void)?
    private let symbol: String, font0: NSFont
    private var color: NSColor = .labelColor
    var label: String { get { title } set { title = newValue; restyle() } }

    init(title: String, symbol: String, font: NSFont) {
        self.symbol = symbol; self.font0 = font
        super.init(frame: .zero)
        self.title = title; isBordered = false; bezelStyle = .regularSquare; focusRingType = .none
        imagePosition = .imageLeading; imageHugsTitle = true
        image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)?.withSymbolConfiguration(.init(pointSize: 13, weight: .semibold))
        restyle()
    }
    required init?(coder: NSCoder) { fatalError() }

    func tint(_ c: NSColor) { color = c; restyle() }
    private func restyle() {
        setAccessibilityLabel(title.trimmingCharacters(in: .whitespaces))
        contentTintColor = color
        attributedTitle = NSAttributedString(string: " " + title.trimmingCharacters(in: .whitespaces), attributes: [.font: font0, .foregroundColor: color])
    }
    override func mouseDown(with event: NSEvent) { onPress?(true); super.mouseDown(with: event); onPress?(false) }
}
