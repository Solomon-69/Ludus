// Updater.swift. In-app update for Ludus (Mac). The page decides when (the user taps, then confirms); this file
// downloads the release zip, checks its SHA-256 against the release's checksums file, unzips it to a temp folder,
// clears the quarantine flag, swaps the app bundle and relaunches. Nothing happens silently and no token is stored.
import CryptoKit
import Foundation

enum Updater {
    typealias Failure = UpdateFailure

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
        let path = bundle.path
        guard !path.contains("/AppTranslocation/"), !path.hasPrefix("/Volumes/"), FileManager.default.isWritableFile(atPath: bundle.deletingLastPathComponent().path) else { throw UpdateFailure(why: "not writable") }
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
        catch {
            let b = "https://github.com/\(repo)/releases/latest/download/"
            guard let z = URL(string: b + name), let s = URL(string: b + "SHA256SUMS.txt") else { throw error }
            progress(0)
            try? FileManager.default.removeItem(at: work.appendingPathComponent("x")); try? FileManager.default.removeItem(at: work.appendingPathComponent(name))
            return try await stageOnce(zip: z, sums: s, name: name, work: work, bundleName: bundleName, progress: progress)
        }
    }

    private static func stageOnce(zip: URL, sums: URL, name: String, work: URL, bundleName: String, progress: @escaping @Sendable (Double) -> Void) async throws -> URL {
        let fm = FileManager.default
        let (sumData, sumResp) = try await session.data(from: sums)
        guard (sumResp as? HTTPURLResponse)?.statusCode == 200, let text = String(data: sumData, encoding: .utf8),
              let want = expectedHash(in: text, for: name) else { throw Failure(why: "no checksum") }

        // 0 to 90 is the real download, by bytes. The rest are the steps after it, so 100 only shows when it is really finished.
        let file = work.appendingPathComponent(name)
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        try await FileDownload.get(zip, to: file, userAgent: "Ludus/\(v) (Mac)") { got, total in if total > 0 { progress(Double(got) / Double(total) * 90) } }
        progress(92)
        guard try FileDownload.sha256(of: file) == want else { throw Failure(why: "checksum mismatch") }
        progress(96)

        // Unzip and check it is an app.
        let unzipped = work.appendingPathComponent("x", isDirectory: true)
        try shell("/usr/bin/ditto", ["-x", "-k", file.path, unzipped.path])
        let newApp = unzipped.appendingPathComponent(bundleName)
        guard fm.fileExists(atPath: newApp.appendingPathComponent("Contents/MacOS").path) else { throw Failure(why: "not a Ludus app") }
        progress(98)
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

/// Downloads to a file with real byte counts. A connection that stops sending fails within 20 s instead of sitting still.
final class FileDownload: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    private let dest: URL
    private let progress: @Sendable (Int64, Int64) -> Void
    private var done: CheckedContinuation<Void, Error>?
    private var failure: Error?

    private init(dest: URL, progress: @escaping @Sendable (Int64, Int64) -> Void) { self.dest = dest; self.progress = progress }

    static func get(_ url: URL, to dest: URL, userAgent: String, progress: @escaping @Sendable (Int64, Int64) -> Void) async throws {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 20; c.timeoutIntervalForResource = 900
        c.httpAdditionalHeaders = ["User-Agent": userAgent]
        let job = FileDownload(dest: dest, progress: progress)
        let s = URLSession(configuration: c, delegate: job, delegateQueue: nil)
        defer { s.finishTasksAndInvalidate() }
        try await withCheckedThrowingContinuation { (k: CheckedContinuation<Void, Error>) in
            job.done = k
            s.downloadTask(with: url).resume()
        }
    }
    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didWriteData b: Int64, totalBytesWritten got: Int64, totalBytesExpectedToWrite total: Int64) {
        progress(got, total)
    }
    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo tmp: URL) {
        guard (downloadTask.response as? HTTPURLResponse)?.statusCode == 200 else { failure = UpdateFailure(why: "download failed"); return }
        do { try? FileManager.default.removeItem(at: dest); try FileManager.default.moveItem(at: tmp, to: dest) } catch { failure = error }
    }
    func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let e = error ?? failure { done?.resume(throwing: e) } else { done?.resume() }
        done = nil
    }
    static func sha256(of file: URL) throws -> String {
        let h = try FileHandle(forReadingFrom: file); defer { try? h.close() }
        var hasher = SHA256()
        while let chunk = try h.read(upToCount: 1 << 20), !chunk.isEmpty { hasher.update(data: chunk) }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
struct UpdateFailure: Error { let why: String }

/// What went wrong, in words a person can act on.
func updateProblem(_ e: Error, app: String) -> String {
    let why = (e as? UpdateFailure)?.why ?? ""
    if why == "checksum mismatch" { return "The download was damaged, so it was thrown away. Try again." }
    if why == "not writable" { return "\(app) can't replace itself where it is. Move it to the Applications folder, then try again." }
    if e is URLError || why == "download failed" || why == "no checksum" { return "The download stopped. Check your internet and try again." }
    if let c = (e as NSError?), c.domain == NSCocoaErrorDomain { return "\(app) can't replace itself where it is. Move it to the Applications folder, then try again." }
    return "The update did not install, your current version is untouched."
}
