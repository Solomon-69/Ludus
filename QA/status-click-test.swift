// Menu bar click logic. Run: swiftc QA/status-click-test.swift Sources/StatusClick.swift -o /tmp/sc && /tmp/sc
import AppKit
var fails = 0
func check(_ ok: Bool, _ what: String) { print((ok ? "ok   " : "FAIL ") + what); if !ok { fails += 1 } }
check(StatusClick.action(panelShown: false, settingsClick: false) == .open, "left click, closed -> open")
check(StatusClick.action(panelShown: true, settingsClick: false) == .close, "left click, open -> close")
check(StatusClick.action(panelShown: false, settingsClick: true) == .openSettings, "right click, closed -> open on Settings")
check(StatusClick.action(panelShown: true, settingsClick: true) == .showSettings, "right click, open -> switch to Settings (stays open)")
check(StatusClick.isSettingsClick(type: .rightMouseUp, modifiers: []), "right mouse up is a settings click")
check(StatusClick.isSettingsClick(type: .leftMouseUp, modifiers: [.control]), "control-click is a settings click")
check(!StatusClick.isSettingsClick(type: .leftMouseUp, modifiers: []), "plain left click is not")
check(!StatusClick.isSettingsClick(type: .leftMouseUp, modifiers: [.option]), "option-click is not")
check(!StatusClick.isSettingsClick(type: nil, modifiers: []), "no event (test hook) is a left click")
exit(fails == 0 ? 0 : 1)
