import AppKit

// Draws the Ludus app icon (Claude spark on a warm terracotta tile) into Ludus.iconset.
let out = CommandLine.arguments.dropFirst().first ?? "."
let set = URL(fileURLWithPath: out).appendingPathComponent("Ludus.iconset")
try? FileManager.default.createDirectory(at: set, withIntermediateDirectories: true)

func render(_ px: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = CGFloat(px)
    let inset = s * 0.1
    let tile = NSRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2)
    let path = NSBezierPath(roundedRect: tile, xRadius: tile.width * 0.225, yRadius: tile.width * 0.225)
    NSGradient(starting: NSColor(red: 0.90, green: 0.52, blue: 0.40, alpha: 1),
               ending: NSColor(red: 0.78, green: 0.38, blue: 0.26, alpha: 1))!.draw(in: path, angle: -90)
    // Spark: 8 rounded rays, alternating long and short.
    let c = NSPoint(x: s / 2, y: s / 2)
    let r = tile.width * 0.3
    NSColor(red: 1, green: 0.97, blue: 0.93, alpha: 1).setStroke()
    for i in 0..<8 {
        let a = CGFloat(i) * .pi / 4
        let outer = i % 2 == 0 ? r : r * 0.78
        let ray = NSBezierPath()
        ray.lineWidth = r * 0.3
        ray.lineCapStyle = .round
        ray.move(to: NSPoint(x: c.x + cos(a) * r * 0.2, y: c.y + sin(a) * r * 0.2))
        ray.line(to: NSPoint(x: c.x + cos(a) * outer, y: c.y + sin(a) * outer))
        ray.stroke()
    }
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

for (name, px) in [("16x16", 16), ("16x16@2x", 32), ("32x32", 32), ("32x32@2x", 64), ("128x128", 128),
                   ("128x128@2x", 256), ("256x256", 256), ("256x256@2x", 512), ("512x512", 512), ("512x512@2x", 1024)] {
    try! render(px).write(to: set.appendingPathComponent("icon_\(name).png"))
}
