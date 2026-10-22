import AppKit

// Draws the Ludus app icon into Ludus.iconset: a cream game controller on a warm terracotta squircle.
// The face buttons are arranged as a small spark. Soft top light, embossed glyph, gentle shadow.
let out = CommandLine.arguments.dropFirst().first ?? "."
let set = URL(fileURLWithPath: out).appendingPathComponent("Ludus.iconset")
try? FileManager.default.createDirectory(at: set, withIntermediateDirectories: true)

func rgb(_ h: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((h >> 16) & 255) / 255, green: CGFloat((h >> 8) & 255) / 255, blue: CGFloat(h & 255) / 255, alpha: a)
}

/// Controller outline in a 100-unit design space, y pointing down (the same shape as the menu bar icon).
func controllerBody() -> CGPath {
    let p = CGMutablePath()
    p.move(to: CGPoint(x: 32, y: 29))
    p.addLine(to: CGPoint(x: 68, y: 29))
    p.addCurve(to: CGPoint(x: 89, y: 48), control1: CGPoint(x: 80, y: 29), control2: CGPoint(x: 86.5, y: 36))
    p.addCurve(to: CGPoint(x: 88, y: 75), control1: CGPoint(x: 92, y: 60), control2: CGPoint(x: 93, y: 70))
    p.addCurve(to: CGPoint(x: 72, y: 71), control1: CGPoint(x: 83, y: 80), control2: CGPoint(x: 76, y: 77.5))
    p.addLine(to: CGPoint(x: 67.5, y: 63.5))
    p.addCurve(to: CGPoint(x: 60, y: 60), control1: CGPoint(x: 65.8, y: 61), control2: CGPoint(x: 63.5, y: 60))
    p.addLine(to: CGPoint(x: 40, y: 60))
    p.addCurve(to: CGPoint(x: 32.5, y: 63.5), control1: CGPoint(x: 36.5, y: 60), control2: CGPoint(x: 34.2, y: 61))
    p.addLine(to: CGPoint(x: 28, y: 71))
    p.addCurve(to: CGPoint(x: 12, y: 75), control1: CGPoint(x: 24, y: 77.5), control2: CGPoint(x: 17, y: 80))
    p.addCurve(to: CGPoint(x: 11, y: 48), control1: CGPoint(x: 7, y: 70), control2: CGPoint(x: 8, y: 60))
    p.addCurve(to: CGPoint(x: 32, y: 29), control1: CGPoint(x: 13.5, y: 36), control2: CGPoint(x: 20, y: 29))
    p.closeSubpath()
    return p
}

/// D-pad plus the face buttons: wide rays like buttons, thin rays between them, together the spark.
func controls() -> CGPath {
    let d = CGPoint(x: 30.5, y: 45)
    let plus = CGMutablePath()
    plus.addRoundedRect(in: CGRect(x: d.x - 8.2, y: d.y - 2.9, width: 16.4, height: 5.8), cornerWidth: 1.6, cornerHeight: 1.6)
    plus.addRoundedRect(in: CGRect(x: d.x - 2.9, y: d.y - 8.2, width: 5.8, height: 16.4), cornerWidth: 1.6, cornerHeight: 1.6)
    var holes = plus.union(CGPath(rect: .zero, transform: nil))
    let c = CGPoint(x: 69.5, y: 45)
    for i in 0..<8 {
        let a = CGFloat(i) * .pi / 4
        let cardinal = i % 2 == 0
        let ray = CGMutablePath()
        ray.move(to: CGPoint(x: c.x + cos(a) * 4.7, y: c.y + sin(a) * 4.7))
        ray.addLine(to: CGPoint(x: c.x + cos(a) * (cardinal ? 8.4 : 7.0), y: c.y + sin(a) * (cardinal ? 8.4 : 7.0)))
        holes = holes.union(ray.copy(strokingWithWidth: cardinal ? 4.4 : 2.4, lineCap: .round, lineJoin: .round, miterLimit: 1))
    }
    return holes
}

func render(_ px: Int) -> Data {
    let s = CGFloat(px)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let ctx = NSGraphicsContext.current!.cgContext
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    func grad(_ a: CGColor, _ b: CGColor) -> CGGradient {
        CGGradient(colorsSpace: space, colors: [a, b] as CFArray, locations: [0, 1])!
    }

    // Tile: 824/1024 of the canvas, like Apple's icon grid, with its own soft shadow.
    let tileRect = CGRect(x: s * 100 / 1024, y: s * 100 / 1024, width: s * 824 / 1024, height: s * 824 / 1024)
    let tile = CGPath(roundedRect: tileRect, cornerWidth: tileRect.width * 0.2237, cornerHeight: tileRect.width * 0.2237, transform: nil)
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -s * 0.012), blur: s * 0.03, color: rgb(0x000000, 0.28))
    ctx.addPath(tile); ctx.setFillColor(rgb(0xB0502F)); ctx.fillPath()
    ctx.restoreGState()
    ctx.saveGState()
    ctx.addPath(tile); ctx.clip()
    ctx.drawLinearGradient(grad(rgb(0xEC9273), rgb(0xB0502F)), start: CGPoint(x: 0, y: tileRect.maxY), end: CGPoint(x: 0, y: tileRect.minY), options: [])
    ctx.drawRadialGradient(grad(rgb(0xFFFFFF, 0.22), rgb(0xFFFFFF, 0)), startCenter: CGPoint(x: tileRect.midX, y: tileRect.maxY), startRadius: 0,
                           endCenter: CGPoint(x: tileRect.midX, y: tileRect.maxY), endRadius: tileRect.width * 0.75, options: [])
    // Thin inner rim: lighter on top, a touch darker at the bottom.
    ctx.addPath(tile); ctx.setLineWidth(max(1, s * 0.004)); ctx.replacePathWithStrokedPath(); ctx.clip()
    ctx.drawLinearGradient(grad(rgb(0xFFFFFF, 0.45), rgb(0x000000, 0.12)), start: CGPoint(x: 0, y: tileRect.maxY), end: CGPoint(x: 0, y: tileRect.minY), options: [])
    ctx.restoreGState()

    // Glyph: design space -> tile (flip y, centre the controller).
    let scale = tileRect.width * 0.0084
    var t = CGAffineTransform(translationX: tileRect.midX, y: tileRect.midY).scaledBy(x: scale, y: -scale).translatedBy(x: -50, y: -53)
    let body = controllerBody().copy(using: &t)!
    let glyph = body.subtracting(controls().copy(using: &t)!)
    let bounds = body.boundingBox
    // Drop shadow under the glyph, cream fill with a soft vertical falloff.
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -s * 0.014), blur: s * 0.035, color: rgb(0x5A1E0B, 0.45))
    ctx.beginTransparencyLayer(auxiliaryInfo: nil)
    ctx.addPath(glyph); ctx.clip()
    ctx.drawLinearGradient(grad(rgb(0xFFFBF5), rgb(0xF3E4D3)), start: CGPoint(x: 0, y: bounds.maxY), end: CGPoint(x: 0, y: bounds.minY), options: [])
    ctx.endTransparencyLayer()
    ctx.restoreGState()
    // Emboss: inner shadows cast by everything outside the glyph, light on top edges, dark on bottom edges.
    func edge(_ dy: CGFloat, _ color: CGColor, _ blur: CGFloat) {
        ctx.saveGState()
        ctx.addPath(glyph); ctx.clip()
        let outside = CGMutablePath()
        outside.addRect(tileRect.insetBy(dx: -s, dy: -s)); outside.addPath(glyph)
        ctx.setShadow(offset: CGSize(width: 0, height: dy), blur: blur, color: color)
        ctx.addPath(outside); ctx.setFillColor(rgb(0x000000)); ctx.fillPath(using: .evenOdd)
        ctx.restoreGState()
    }
    edge(-s * 0.006, rgb(0xFFFFFF, 0.9), s * 0.006)
    edge(s * 0.008, rgb(0x000000, 0.16), s * 0.012)

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

for (name, px) in [("16x16", 16), ("16x16@2x", 32), ("32x32", 32), ("32x32@2x", 64), ("128x128", 128),
                   ("128x128@2x", 256), ("256x256", 256), ("256x256@2x", 512), ("512x512", 512), ("512x512@2x", 1024)] {
    try! render(px).write(to: set.appendingPathComponent("icon_\(name).png"))
}
