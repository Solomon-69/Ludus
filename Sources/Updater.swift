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

        let sumData = try await withFallback(sums, "SHA256SUMS.txt") { try await fetchSmall($0) }
        guard let text = String(data: sumData, encoding: .utf8), let want = expectedHash(in: text, for: name) else { throw Failure(why: "no checksum") }

        let file = work.appendingPathComponent(name)
        try await withFallback(zip, name) { try await fetchFile($0, to: file, progress: progress) }
        let have = try sha256(of: file)
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

    /// Where a release file can also be fetched if the address the page gave does not work.
    static let latestDownload = "https://github.com/Solomon-69/Ludus/releases/latest/download/"
    private static let attempts = 4
    private static let stall: TimeInterval = 30   // no bytes for this long = try again

    /// Short idle time-out, a generous total one, GitHub's requested User-Agent, no cached copies.
    private static let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = stall
        c.timeoutIntervalForResource = 30 * 60
        c.waitsForConnectivity = false
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        c.httpAdditionalHeaders = ["User-Agent": "Ludus/\(v) (Mac)"]
        return URLSession(configuration: c)
    }()

    /// Tries the address from the page, then the fixed "latest release" address (real releases only). The checksum still guards it.
    private static func withFallback<T>(_ first: URL, _ fileName: String, _ get: (URL) async throws -> T) async throws -> T {
        do { return try await get(first) } catch let e as Failure where e.why == "source not allowed" { throw e } catch {
            guard first.scheme == "https", first.path.contains("/releases/"),
                  let second = URL(string: latestDownload + (fileName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? fileName)) else { throw error }
            return try await get(second)
        }
    }

    private static func retrying<T>(_ body: (Int) async throws -> T) async throws -> T {
        var i = 1
        while true {
            do { return try await body(i) } catch let e as Failure where e.why.hasPrefix("http 4") || e.why == "source not allowed" { throw e } catch {
                if i >= attempts || Task.isCancelled { throw error }
                try? await Task.sleep(nanoseconds: UInt64(i) * 2_000_000_000); i += 1
            }
        }
    }

    private static func fetchSmall(_ url: URL) async throws -> Data {
        try await retrying { _ in
            let (data, resp) = try await session.data(from: url)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            guard code == 200 else { throw Failure(why: "http \(code)") }
            return data
        }
    }

    /// Streams the file to disk in 64 KB pieces with progress to one decimal. A dropped connection carries on from the
    /// bytes already saved when the server allows it (HTTP Range), otherwise starts again.
    private static func fetchFile(_ url: URL, to file: URL, progress: @escaping @Sendable (Double) -> Void) async throws {
        let fm = FileManager.default
        try? fm.removeItem(at: file); fm.createFile(atPath: file.path, contents: nil)
        var got: Int64 = 0, total: Int64 = 0, last = -1.0
        try await retrying { _ in
            var req = URLRequest(url: url)
            if got > 0 { req.setValue("bytes=\(got)-", forHTTPHeaderField: "Range") }
            let (bytes, resp) = try await session.bytes(for: req)
            guard let http = resp as? HTTPURLResponse, let final = http.url, allowed(final) || final == url else { throw Failure(why: "source not allowed") }
            if got > 0 && http.statusCode != 206 { got = 0; try Data().write(to: file) }
            guard http.statusCode == 200 || http.statusCode == 206 else { throw Failure(why: "http \(http.statusCode)") }
            if total == 0, resp.expectedContentLength > 0 { total = got + resp.expectedContentLength }
            let out = try FileHandle(forWritingTo: file); defer { try? out.close() }
            try out.seekToEnd()
            var buf = Data(); buf.reserveCapacity(65536)
            func flush() throws {
                try out.write(contentsOf: buf); got += Int64(buf.count); buf.removeAll(keepingCapacity: true)
                if total > 0 { let p = min(99.9, (Double(got) * 1000 / Double(total)).rounded(.down) / 10); if p != last { last = p; progress(p) } }
            }
            for try await b in bytes { buf.append(b); if buf.count >= 65536 { try flush() } }
            if !buf.isEmpty { try flush() }
            if total > 0 && got < total { throw Failure(why: "connection closed early") }
        }
    }

    private static func sha256(of file: URL) throws -> String {
        let h = try FileHandle(forReadingFrom: file); defer { try? h.close() }
        var hasher = SHA256()
        while let d = try h.read(upToCount: 1 << 20), !d.isEmpty { hasher.update(data: d) }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
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
