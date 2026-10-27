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

        let newApp = try await stage(zip: zip, sums: sums, name: name, work: work, bundleName: bundle.lastPathComponent, progress: progress)
        guard let plist = NSDictionary(contentsOf: newApp.appendingPathComponent("Contents/Info.plist")),
              plist["CFBundleIdentifier"] as? String == (Bundle(url: bundle)?.bundleIdentifier ?? "com.solomon.Ludus") else { throw Failure(why: "not a Ludus app") }
        try? shell("/usr/bin/xattr", ["-dr", "com.apple.quarantine", newApp.path])
        _ = try fm.replaceItemAt(bundle, withItemAt: newApp)
        relaunch(bundle)
    }

    /// A session with a real User-Agent and timeouts: a stalled connection fails in 30 s instead of hanging at 0%.
    static let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 30; c.timeoutIntervalForResource = 600
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        c.httpAdditionalHeaders = ["User-Agent": "Ludus/\(v) (Mac)"]
        return URLSession(configuration: c)
    }()
    static let repo = "Solomon-69/Ludus"

    /// Download (release link, then the releases/latest/download link as a fallback), verify, unzip. Returns the unzipped app.
    static func stage(zip: URL, sums: URL, name: String, work: URL, bundleName: String, progress: @escaping @Sendable (Double) -> Void) async throws -> URL {
        do { return try await stageOnce(zip: zip, sums: sums, name: name, work: work, bundleName: bundleName, progress: progress) }
        catch let f as Failure where f.why == "checksum mismatch" { throw f }
        catch {
            let b = "https://github.com/\(repo)/releases/latest/download/"
            guard let z = URL(string: b + name), let s = URL(string: b + "SHA256SUMS.txt") else { throw error }
            try? FileManager.default.removeItem(at: work.appendingPathComponent("x")); try? FileManager.default.removeItem(at: work.appendingPathComponent(name))
            return try await stageOnce(zip: z, sums: s, name: name, work: work, bundleName: bundleName, progress: progress)
        }
    }

    private static func stageOnce(zip: URL, sums: URL, name: String, work: URL, bundleName: String, progress: @escaping @Sendable (Double) -> Void) async throws -> URL {
        let fm = FileManager.default
        let (sumData, sumResp) = try await session.data(from: sums)
        guard (sumResp as? HTTPURLResponse)?.statusCode == 200, let text = String(data: sumData, encoding: .utf8),
              let want = expectedHash(in: text, for: name) else { throw Failure(why: "no checksum") }

        // Stream the zip to disk, hashing as it arrives.
        let file = work.appendingPathComponent(name)
        fm.createFile(atPath: file.path, contents: nil)
        let out = try FileHandle(forWritingTo: file)
        var hasher = SHA256()
        progress(1)   // started: the bar moves off 0 straight away
        let (bytes, resp) = try await session.bytes(from: zip)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw Failure(why: "download failed") }
        let total = Double(resp.expectedContentLength)
        var buf = Data(); var got = 0.0; var last = -1.0
        for try await b in bytes {
            buf.append(b)
            if buf.count >= 65536 {
                hasher.update(data: buf); try out.write(contentsOf: buf); got += Double(buf.count); buf.removeAll(keepingCapacity: true)
                let p = total > 0 ? min(99, max(1, (got / total * 100).rounded())) : min(95, 1 + (got / 1_000_000).rounded())
                if p != last { last = p; progress(p) }
            }
        }
        if !buf.isEmpty { hasher.update(data: buf); try out.write(contentsOf: buf) }
        try out.close()
        let have = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        guard have == want else { throw Failure(why: "checksum mismatch") }
        progress(100)

        // Unzip and check it is an app.
        let unzipped = work.appendingPathComponent("x", isDirectory: true)
        try shell("/usr/bin/ditto", ["-x", "-k", file.path, unzipped.path])
        let newApp = unzipped.appendingPathComponent(bundleName)
        guard fm.fileExists(atPath: newApp.appendingPathComponent("Contents/MacOS").path) else { throw Failure(why: "not a Ludus app") }
        return newApp
    }

    /// Test aid (update-test workflow): `Ludus --selftest-update=RESULT`. No window. Does what Settings > Update does against
    /// the real GitHub release (check, download with progress, verify, unzip) without installing; writes JSON to RESULT.
    static func selfTestReal(result: String) async -> Bool {
        let t0 = Date(); final class Box: @unchecked Sendable { var max = 0.0 }; let box = Box()
        var ok = false, tag: String? = nil, err: String? = nil
        let work = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("ludus-update-\(UUID().uuidString)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
            var req = URLRequest(url: URL(string: "https://api.github.com/repos/\(repo)/releases/latest")!)
            req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            let (data, _) = try await session.data(for: req)
            let rel = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
            tag = rel["tag_name"] as? String
            let assets = rel["assets"] as? [[String: Any]] ?? []
            func url(_ n: String) -> URL? { (assets.first { $0["name"] as? String == n }?["browser_download_url"] as? String).flatMap(URL.init(string:)) }
            guard let z = url("Ludus-mac.zip"), let s = url("SHA256SUMS.txt") else { throw Failure(why: "release has no files") }
            let app = try await stage(zip: z, sums: s, name: "Ludus-mac.zip", work: work, bundleName: "Ludus.app", progress: { p in box.max = Swift.max(box.max, p) })
            ok = FileManager.default.fileExists(atPath: app.appendingPathComponent("Contents/Info.plist").path)
            if !ok { err = "no app in the download" }
        } catch { err = "\(error)" }
        try? FileManager.default.removeItem(at: work)
        let out: [String: Any] = ["ok": ok, "tag": tag ?? NSNull(), "maxPct": box.max, "seconds": (Date().timeIntervalSince(t0) * 10).rounded() / 10, "error": err ?? NSNull()]
        if let d = try? JSONSerialization.data(withJSONObject: out) { try? d.write(to: URL(fileURLWithPath: result)) }
        return ok
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
