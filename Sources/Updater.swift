// Updater.swift. In-app update for Ludus (Mac). The page decides when (the user taps, then confirms); this file
// downloads the release zip, checks its SHA-256 against the release's checksums file, unzips it to a temp folder,
// clears the quarantine flag, swaps the app bundle and relaunches. Nothing happens silently and no token is stored.
import CryptoKit
import Foundation

enum Updater {
    struct Failure: Error { let why: String }

    /// Hosts a release download may come from. Tests add 127.0.0.1 (see `testHosts`).
    static let hosts: Set<String> = ["github.com", "api.github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]
    nonisolated(unsafe) static var testHosts: Set<String> = []

    static func allowed(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        if url.scheme == "https" { return hosts.contains(host) || host.hasSuffix(".githubusercontent.com") }
        return url.scheme == "http" && testHosts.contains(host)   // plain http only for a local test server
    }

    /// "<hash>  <name>" lines (sha256sum style, a leading * on the name allowed). Returns the lowercase hash for `name`.
    static func expectedHash(in sums: String, for name: String) -> String? {
        for line in sums.split(whereSeparator: \.isNewline) {
            let parts = line.split(maxSplits: 1, whereSeparator: { $0 == " " || $0 == "\t" })
            guard parts.count == 2 else { continue }
            let file = parts[1].trimmingCharacters(in: CharacterSet(charactersIn: " *\t"))
            let hash = parts[0].lowercased()
            if file == name, hash.count == 64, hash.allSatisfy({ $0.isHexDigit }) { return hash }
        }
        return nil
    }

    private static func shell(_ path: String, _ args: [String]) throws {
        let p = Process(); p.executableURL = URL(fileURLWithPath: path); p.arguments = args
        p.standardOutput = Pipe(); p.standardError = Pipe()
        try p.run(); p.waitUntilExit()
        guard p.terminationStatus == 0 else { throw Failure(why: "\(path) \(p.terminationStatus)") }
    }

    /// Downloads, verifies and installs. `progress` gets 0...100. On success the new bundle is already in place and
    /// `relaunch` is called with its URL (the caller quits and reopens it). Throws Failure on any problem; the old app is untouched then.
    static func install(zip: URL, sums: URL, name: String, bundle: URL, progress: @escaping @Sendable (Double) -> Void,
                        relaunch: @escaping @Sendable (URL) -> Void) async throws {
        guard allowed(zip), allowed(sums), !name.contains("/") else { throw Failure(why: "source not allowed") }
        let work = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("ludus-update-\(UUID().uuidString)", isDirectory: true)
        let fm = FileManager.default
        try fm.createDirectory(at: work, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: work) }

        let (sumData, sumResp) = try await URLSession.shared.data(from: sums)
        guard (sumResp as? HTTPURLResponse)?.statusCode == 200, let text = String(data: sumData, encoding: .utf8),
              let want = expectedHash(in: text, for: name) else { throw Failure(why: "no checksum") }

        // Stream the zip to disk, hashing as it arrives.
        let file = work.appendingPathComponent(name)
        fm.createFile(atPath: file.path, contents: nil)
        let out = try FileHandle(forWritingTo: file)
        var hasher = SHA256()
        let (bytes, resp) = try await URLSession.shared.bytes(from: zip)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw Failure(why: "download failed") }
        let total = Double(resp.expectedContentLength)
        var buf = Data(); var got = 0.0; var last = -1.0
        for try await b in bytes {
            buf.append(b)
            if buf.count >= 65536 {
                hasher.update(data: buf); try out.write(contentsOf: buf); got += Double(buf.count); buf.removeAll(keepingCapacity: true)
                if total > 0 { let p = min(99, (got / total * 100).rounded()); if p != last { last = p; progress(p) } }
            }
        }
        if !buf.isEmpty { hasher.update(data: buf); try out.write(contentsOf: buf) }
        try out.close()
        let have = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        guard have == want else { throw Failure(why: "checksum mismatch") }
        progress(100)

        // Unzip, check it is really this app, clear quarantine, swap.
        let unzipped = work.appendingPathComponent("x", isDirectory: true)
        try shell("/usr/bin/ditto", ["-x", "-k", file.path, unzipped.path])
        let newApp = unzipped.appendingPathComponent(bundle.lastPathComponent)
        guard let plist = NSDictionary(contentsOf: newApp.appendingPathComponent("Contents/Info.plist")),
              plist["CFBundleIdentifier"] as? String == (Bundle(url: bundle)?.bundleIdentifier ?? "com.solomon.Ludus"),
              fm.fileExists(atPath: newApp.appendingPathComponent("Contents/MacOS").path) else { throw Failure(why: "not a Ludus app") }
        try? shell("/usr/bin/xattr", ["-dr", "com.apple.quarantine", newApp.path])
        _ = try fm.replaceItemAt(bundle, withItemAt: newApp)
        relaunch(bundle)
    }

    /// Waits for this process to exit, then opens the (new) app again.
    static func relaunchAfterExit(_ app: URL) {
        let pid = ProcessInfo.processInfo.processIdentifier
        let p = Process(); p.executableURL = URL(fileURLWithPath: "/bin/sh")
        p.arguments = ["-c", "while kill -0 \(pid) 2>/dev/null; do sleep 0.2; done; /usr/bin/open \"$0\"", app.path]
        p.standardOutput = nil; p.standardError = nil
        try? p.run()
    }
}
