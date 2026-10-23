// Mac updater test: no GUI. usage: updater-test <installedApp> <baseURL> <zipName>
// Runs Updater.install against a local fake release server and prints PASS/FAIL lines.
import Foundation

let a = CommandLine.arguments
let bundle = URL(fileURLWithPath: a[1]), base = a[2], zipName = a[3]
Updater.testHosts = ["127.0.0.1"]
var fails = 0
func ok(_ c: Bool, _ m: String) { print((c ? "PASS " : "FAIL ") + m); if !c { fails += 1 } }
func version() -> String { (NSDictionary(contentsOf: bundle.appendingPathComponent("Contents/Info.plist"))?["CFBundleShortVersionString"] as? String) ?? "?" }

ok(Updater.allowed(URL(string: "https://github.com/x/y/releases/download/v1/a.zip")!), "github https allowed")
ok(!Updater.allowed(URL(string: "https://evil.example.com/a.zip")!), "other host refused")
ok(!Updater.allowed(URL(string: "http://github.com/a.zip")!), "plain http to github refused")
ok(Updater.expectedHash(in: "\(String(repeating: "a", count: 64))  Ludus-mac.zip\n", for: "Ludus-mac.zip") != nil, "checksum line parsed")

func run(_ zip: String, _ sums: String) async -> (Error?, [Double], Bool) {
    var prog: [Double] = []; let lock = NSLock(); var relaunched = false
    do {
        try await Updater.install(zip: URL(string: base + "/" + zip)!, sums: URL(string: base + "/" + sums)!, name: zipName, bundle: bundle,
            progress: { p in lock.lock(); prog.append(p); lock.unlock() }, relaunch: { _ in relaunched = true })
        return (nil, prog, relaunched)
    } catch { return (error, prog, relaunched) }
}
let before = version()
// 1. wrong checksum: refuses, old app untouched
let bad = await run(zipName, "SUMS-BAD.txt")
ok(bad.0 != nil && version() == before && !bad.2, "wrong checksum: refused, app unchanged (\(before))")
// 2. missing checksum file
let none = await run(zipName, "NOPE.txt")
ok(none.0 != nil && version() == before, "missing checksum file: refused")
// 3. good release
let good = await run(zipName, "SHA256SUMS.txt")
ok(good.0 == nil && good.2, "good release installs and asks to relaunch \(good.0.map { "\($0)" } ?? "")")
ok(version() != before && version() == "9.9.9", "installed app is now \(version())")
ok(good.1.last == 100 && good.1.contains { $0 < 100 } || good.1.last == 100, "progress reported up to 100 (\(good.1.count) steps)")
let q = Process(); q.executableURL = URL(fileURLWithPath: "/usr/bin/xattr"); q.arguments = ["-p", "com.apple.quarantine", bundle.path]
q.standardError = Pipe(); q.standardOutput = Pipe(); try? q.run(); q.waitUntilExit()
ok(q.terminationStatus != 0, "no quarantine flag on the new app")
ok(!FileManager.default.fileExists(atPath: bundle.path + ".old"), "no leftover old copy")
print(fails == 0 ? "ALL PASSED" : "\(fails) FAILED"); exit(fails == 0 ? 0 : 1)
