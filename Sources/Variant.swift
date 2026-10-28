import Foundation

/// Which build this is. The classic app has no LudusVariant key. build.sh with LUDUS_VARIANT=raised makes the
/// side-by-side "Ludus Raised" test build: its own name, bundle id (so its own settings, saved scores and web storage),
/// a badge on the menu bar icon, no ludus:// links and no in-app updates, so it never replaces the classic Ludus.
enum Variant {
    static let id = (Bundle.main.object(forInfoDictionaryKey: "LudusVariant") as? String) ?? ""
    static var isVariant: Bool { !id.isEmpty }
    static let name = (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Ludus"
}
