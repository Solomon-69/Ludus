import AppKit

// Draws the Windows icon for Ludus (assets/Ludus.ico): a warm terracotta tile with a cream game
// controller on it, d-pad on the left and the Claude-style spark as the buttons. Same controller
// shape as the Mac menu bar icon (Sources/App.swift, menuBarIcon), filled so it reads at 16 px.
//
// Usage (on a Mac): swiftc -O -framework AppKit make-ico.swift -o /tmp/mkico && /tmp/mkico ../assets
// Writes Ludus.ico (16, 20, 24, 32, 40, 48, 64, 256 px) and a 256 px preview PNG.

let outDir = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? ".")
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let terracottaTop = CGColor(red: 0.90, green: 0.52, blue: 0.40, alpha: 1)
let terracottaBottom = CGColor(red: 0.78, green: 0.38, blue: 0.26, alpha: 1)
let cream = CGColor(red: 1, green: 0.97, blue: 0.93, alpha: 1)
let cutout = CGColor(red: 0.80, green: 0.41, blue: 0.29, alpha: 1)

/// Controller body in the menu bar icon's 20 x 16 box (y grows downwards).
func controllerPath() -> CGPath {
    let p = CGMutablePath()
    p.move(to: CGPoint(x: 6, y: 3.2))
    p.addLine(to: CGPoint(x: 14, y: 3.2))
    p.addCurve(to: CGPoint(x: 18.6, y: 11.6), control1: CGPoint(x: 17.4, y: 3.2), control2: CGPoint(x: 19.2, y: 8.4))
    p.addCurve(to: CGPoint(x: 15.1, y: 13.4), control1: CGPoint(x: 18.2, y: 13.8), control2: CGPoint(x: 16.4, y: 14.4))
    p.addLine(to: CGPoint(x: 13.2, y: 11.2))
    p.addLine(to: CGPoint(x: 6.8, y: 11.2))
    p.addLine(to: CGPoint(x: 4.9, y: 13.4))
    p.addCurve(to: CGPoint(x: 1.4, y: 11.6), control1: CGPoint(x: 3.6, y: 14.4), control2: CGPoint(x: 1.8, y: 13.8))
    p.addCurve(to: CGPoint(x: 6, y: 3.2), control1: CGPoint(x: 0.8, y: 8.4), control2: CGPoint(x: 2.6, y: 3.2))
    p.closeSubpath()
    return p
}

/// Renders one square icon and returns its BGRA pixels (top-down rows) plus a CGImage.
func render(_ px: Int) -> (pixels: [UInt8], image: CGImage) {
    let s = CGFloat(px)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: px * 4, space: space,
                        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.setShouldAntialias(true)
    ctx.interpolationQuality = .high

    // Tile (nearly full bleed, as Windows icons usually are).
    let inset = max(0.5, s * 0.05)
    let tile = CGRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2)
    let radius = tile.width * 0.24
    ctx.saveGState()
    ctx.addPath(CGPath(roundedRect: tile, cornerWidth: radius, cornerHeight: radius, transform: nil))
    ctx.clip()
    let gradient = CGGradient(colorsSpace: space, colors: [terracottaTop, terracottaBottom] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: tile.maxY), end: CGPoint(x: 0, y: tile.minY), options: [])
    ctx.restoreGState()

    // Map the 20 x 16 controller box (y down) into the tile, centred, about 80% of its width.
    let boxW: CGFloat = 18.4, boxH: CGFloat = 11.6          // visible extent of the body (x 0.9...19.3, y 3.2...14.8)
    let k = tile.width * 0.82 / boxW
    let ox = tile.midX - (0.95 + boxW / 2) * k
    let oy = tile.midY + (3.2 + boxH / 2) * k               // flip: box y=0 sits above the centre
    ctx.saveGState()
    ctx.translateBy(x: ox, y: oy)
    ctx.scaleBy(x: k, y: -k)

    ctx.setFillColor(cream)
    ctx.addPath(controllerPath())
    ctx.fillPath()

    // D-pad, cut out in terracotta.
    ctx.setFillColor(cutout)
    let small = px <= 24
    let arm: CGFloat = small ? 1.9 : 1.5
    ctx.addPath(CGPath(roundedRect: CGRect(x: 4.3, y: 7.4 - arm / 2, width: 4.4, height: arm), cornerWidth: 0.5, cornerHeight: 0.5, transform: nil))
    ctx.addPath(CGPath(roundedRect: CGRect(x: 6.5 - arm / 2, y: 5.2, width: arm, height: 4.4), cornerWidth: 0.5, cornerHeight: 0.5, transform: nil))
    ctx.fillPath()

    // Spark buttons: four crossing rays (eight points), like the Mac icon.
    ctx.setStrokeColor(cutout)
    ctx.setLineCap(.round)
    ctx.setLineWidth(max(small ? 1.7 : 1.25, 1.1 / k))
    let c = CGPoint(x: 13.9, y: 7.4)
    let r: CGFloat = small ? 2.0 : 2.3
    for i in 0..<4 {
        let a = CGFloat(i) * .pi / 4
        ctx.move(to: CGPoint(x: c.x - cos(a) * r, y: c.y - sin(a) * r))
        ctx.addLine(to: CGPoint(x: c.x + cos(a) * r, y: c.y + sin(a) * r))
    }
    ctx.strokePath()
    ctx.restoreGState()

    let image = ctx.makeImage()!
    // Un-premultiply into straight BGRA for the ICO's DIB entries.
    let data = ctx.data!.assumingMemoryBound(to: UInt8.self)
    var pixels = [UInt8](repeating: 0, count: px * px * 4)
    for i in 0..<(px * px) {
        let b = data[i * 4], g = data[i * 4 + 1], r = data[i * 4 + 2], a = data[i * 4 + 3]
        func un(_ v: UInt8) -> UInt8 { a == 0 ? 0 : UInt8(min(255, (Int(v) * 255 + Int(a) / 2) / Int(a))) }
        pixels[i * 4] = un(b); pixels[i * 4 + 1] = un(g); pixels[i * 4 + 2] = un(r); pixels[i * 4 + 3] = a
    }
    return (pixels, image)
}

func png(_ image: CGImage) -> Data {
    NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])!
}

/// 32-bit DIB entry: BITMAPINFOHEADER, bottom-up BGRA rows, then an all-zero AND mask.
func dib(_ px: Int, _ pixels: [UInt8]) -> Data {
    var d = Data()
    func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
    func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
    let maskRow = ((px + 31) / 32) * 4
    u32(40); u32(UInt32(px)); u32(UInt32(px * 2)); u16(1); u16(32); u32(0)
    u32(UInt32(px * px * 4 + maskRow * px)); u32(0); u32(0); u32(0); u32(0)
    for row in (0..<px).reversed() { d.append(contentsOf: pixels[(row * px * 4)..<((row + 1) * px * 4)]) }
    d.append(Data(count: maskRow * px))
    return d
}

let sizes = [16, 20, 24, 32, 40, 48, 64, 256]
var entries: [(Int, Data)] = []
for px in sizes {
    let (pixels, image) = render(px)
    entries.append((px, px == 256 ? png(image) : dib(px, pixels)))
    if px == 256 { try! png(image).write(to: outDir.appendingPathComponent("Ludus-256.png")) }
}

var ico = Data()
func put16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { ico.append(contentsOf: $0) } }
func put32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { ico.append(contentsOf: $0) } }
put16(0); put16(1); put16(UInt16(entries.count))
var offset = 6 + 16 * entries.count
for (px, data) in entries {
    ico.append(UInt8(px >= 256 ? 0 : px)); ico.append(UInt8(px >= 256 ? 0 : px)); ico.append(0); ico.append(0)
    put16(1); put16(32); put32(UInt32(data.count)); put32(UInt32(offset))
    offset += data.count
}
for (_, data) in entries { ico.append(data) }
try! ico.write(to: outDir.appendingPathComponent("Ludus.ico"))
print("Wrote \(outDir.appendingPathComponent("Ludus.ico").path)")
