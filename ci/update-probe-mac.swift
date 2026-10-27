// Test tool only (not shipped). Built together with Sources/Updater.swift (or an older release's copy):
//   swiftc -O -parse-as-library Updater.swift ci/update-probe-mac.swift -o probe
//   ./probe RESULTFILE /path/to/older/Ludus.app
// Checks the latest release like the app does, then runs the real Updater.install over the given (older) app
// bundle, logging progress with times. Exit 0 = every check passed. It never opens the app.
import Foundation

@main
struct Probe {
    nonisolated(unsafe) static var lines: [String] = []
    static let start = Date()
    static func log(_ s: String) {
        let l = String(format: "[%6.1fs] ", Date().timeIntervalSince(start)) + s
        lines.append(l); print(l); fflush(stdout)
    }

    static func main() async {
        let args = CommandLine.arguments
        let result = URL(fileURLWithPath: args[1]); let bundle = URL(fileURLWithPath: args[2])
        var fails = 0
        func check(_ ok: Bool, _ what: String) { log((ok ? "PASS " : "FAIL ") + what); if !ok { fails += 1 } }
        do {
            var req = URLRequest(url: URL(string: "https://api.github.com/repos/Solomon-69/Ludus/releases/latest")!)
            req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            let (data, _) = try await URLSession.shared.data(for: req)
            let rel = try JSONSerialization.jsonObject(with: data) as! [String: Any]
            let tag = (rel["tag_name"] as! String).replacingOccurrences(of: "v", with: "")
            let assets = rel["assets"] as! [[String: Any]]
            func url(_ n: String) -> URL { URL(string: assets.first { $0["name"] as? String == n }!["browser_download_url"] as! String)! }
            log("latest = \(tag)")
            let before = (NSDictionary(contentsOf: bundle.appendingPathComponent("Contents/Info.plist"))?["CFBundleShortVersionString"] as? String) ?? "?"
            log("installed before: \(before)")
            final class Box: @unchecked Sendable { var max = 0.0; var first = -1.0 }
            let box = Box(); let t0 = Date()
            try await Updater.install(zip: url("Ludus-mac.zip"), sums: url("SHA256SUMS.txt"), name: "Ludus-mac.zip", bundle: bundle,
                progress: { p in
                    if p > box.max { box.max = p; if box.first < 0, p > 0 { box.first = Date().timeIntervalSince(t0) }
                        if p.truncatingRemainder(dividingBy: 10) == 0 || p >= 99 { log("progress \(Int(p))%") } }
                }, relaunch: { _ in log("relaunch requested (not opened in the probe)") })
            let secs = Date().timeIntervalSince(t0)
            log(String(format: "download+verify+install took %.1fs, progress first above 0 at %.1fs", secs, box.first))
            check(box.max >= 100, "progress reached 100%")
            check(box.first > 0 && box.first < 30, "progress moved above 0% within 30 seconds")
            check(secs < 300, "finished within 5 minutes")
            let after = (NSDictionary(contentsOf: bundle.appendingPathComponent("Contents/Info.plist"))?["CFBundleShortVersionString"] as? String) ?? "?"
            check(after == tag, "app bundle now holds Ludus \(tag) (found \(after))")
        } catch { log("FAIL \(error)"); fails += 1 }
        try? lines.joined(separator: "\n").write(to: result, atomically: true, encoding: .utf8)
        exit(fails == 0 ? 0 : 1)
    }
}
