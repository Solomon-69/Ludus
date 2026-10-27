import AppKit

/// What a click on the menu bar icon does. Left click opens or closes the panel; right click (or Control-click)
/// opens it straight on Settings, and switches an open panel to Settings instead of closing it.
enum StatusClick: Equatable {
    case open, close, openSettings, showSettings

    static func action(panelShown: Bool, settingsClick: Bool) -> StatusClick {
        if settingsClick { return panelShown ? .showSettings : .openSettings }
        return panelShown ? .close : .open
    }

    /// Right mouse button, or the left one with Control held (the Mac's other way to right-click).
    static func isSettingsClick(type: NSEvent.EventType?, modifiers: NSEvent.ModifierFlags) -> Bool {
        type == .rightMouseUp || type == .rightMouseDown || modifiers.contains(.control)
    }
}
