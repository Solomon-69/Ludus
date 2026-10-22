import AppKit

// Draws the Ludus app icon. Usage: mkicon <outdir>
// Writes <outdir>/Ludus.iconset (light look, for the classic .icns) and <outdir>/Ludus.icon
// (Icon Composer bundle with a light and a dark image, so macOS 26+ can follow the Mac's appearance).
// Light: a cream game controller on a warm terracotta squircle. Dark: a terracotta controller on near-black.
// The face buttons are four round buttons in a diamond. Soft top light, embossed glyph, gentle shadow.
let out = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? ".")
let fm = FileManager.default

struct Style {
    let tileTop: UInt32, tileBottom: UInt32
    let glyphTop: UInt32, glyphBottom: UInt32
    let shadow: CGColor
}

func rgb(_ h: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((h >> 16) & 255) / 255, green: CGFloat((h >> 8) & 255) / 255, blue: CGFloat(h & 255) / 255, alpha: a)
}

let light = Style(tileTop: 0xEC9273, tileBottom: 0xB0502F, glyphTop: 0xFFFBF5, glyphBottom: 0xF3E4D3, shadow: rgb(0x5A1E0B, 0.45))
let dark = Style(tileTop: 0x2E2925, tileBottom: 0x161210, glyphTop: 0xEE9475, glyphBottom: 0xC45A3A, shadow: rgb(0x000000, 0.6))

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

/// D-pad plus four round face buttons in a diamond.
func controls() -> CGPath {
    let d = CGPoint(x: 30.5, y: 45)
    let plus = CGMutablePath()
    plus.addRoundedRect(in: CGRect(x: d.x - 8.2, y: d.y - 2.9, width: 16.4, height: 5.8), cornerWidth: 1.6, cornerHeight: 1.6)
    plus.addRoundedRect(in: CGRect(x: d.x - 2.9, y: d.y - 8.2, width: 5.8, height: 16.4), cornerWidth: 1.6, cornerHeight: 1.6)
    var holes = plus.union(CGPath(rect: .zero, transform: nil))
    let c = CGPoint(x: 69.5, y: 45)
    for (dx, dy) in [(0.0, -5.9), (5.9, 0.0), (0.0, 5.9), (-5.9, 0.0)] {
        holes = holes.union(CGPath(ellipseIn: CGRect(x: c.x + dx - 3.1, y: c.y + dy - 3.1, width: 6.2, height: 6.2), transform: nil))
    }
    return holes
}

/// fullBleed: the tile fills the whole canvas (no outer shadow or rim) for the Icon Composer layer,
/// where macOS applies its own mask, edge and shadow.
func render(_ st: Style, _ px: Int, fullBleed: Bool = false) -> Data {
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
    let tileRect = fullBleed ? CGRect(x: 0, y: 0, width: s, height: s)
                             : CGRect(x: s * 100 / 1024, y: s * 100 / 1024, width: s * 824 / 1024, height: s * 824 / 1024)
    let tile = fullBleed ? CGPath(rect: tileRect, transform: nil)
                         : CGPath(roundedRect: tileRect, cornerWidth: tileRect.width * 0.2237, cornerHeight: tileRect.width * 0.2237, transform: nil)
    if !fullBleed {
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -s * 0.012), blur: s * 0.03, color: rgb(0x000000, 0.28))
        ctx.addPath(tile); ctx.setFillColor(rgb(st.tileBottom)); ctx.fillPath()
        ctx.restoreGState()
    }
    ctx.saveGState()
    ctx.addPath(tile); ctx.clip()
    ctx.drawLinearGradient(grad(rgb(st.tileTop), rgb(st.tileBottom)), start: CGPoint(x: 0, y: tileRect.maxY), end: CGPoint(x: 0, y: tileRect.minY), options: [])
    ctx.drawRadialGradient(grad(rgb(0xFFFFFF, 0.22), rgb(0xFFFFFF, 0)), startCenter: CGPoint(x: tileRect.midX, y: tileRect.maxY), startRadius: 0,
                           endCenter: CGPoint(x: tileRect.midX, y: tileRect.maxY), endRadius: tileRect.width * 0.75, options: [])
    if !fullBleed {
        // Thin inner rim: lighter on top, a touch darker at the bottom.
        ctx.addPath(tile); ctx.setLineWidth(max(1, s * 0.004)); ctx.replacePathWithStrokedPath(); ctx.clip()
        ctx.drawLinearGradient(grad(rgb(0xFFFFFF, 0.45), rgb(0x000000, 0.12)), start: CGPoint(x: 0, y: tileRect.maxY), end: CGPoint(x: 0, y: tileRect.minY), options: [])
    }
    ctx.restoreGState()

    // Glyph: design space -> tile (flip y, centre the controller).
    let scale = tileRect.width * 0.0084
    var t = CGAffineTransform(translationX: tileRect.midX, y: tileRect.midY).scaledBy(x: scale, y: -scale).translatedBy(x: -50, y: -53)
    let body = controllerBody().copy(using: &t)!
    let glyph = body.subtracting(controls().copy(using: &t)!)
    let bounds = body.boundingBox
    // Drop shadow under the glyph, fill with a soft vertical falloff.
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -s * 0.014), blur: s * 0.035, color: st.shadow)
    ctx.beginTransparencyLayer(auxiliaryInfo: nil)
    ctx.addPath(glyph); ctx.clip()
    ctx.drawLinearGradient(grad(rgb(st.glyphTop), rgb(st.glyphBottom)), start: CGPoint(x: 0, y: bounds.maxY), end: CGPoint(x: 0, y: bounds.minY), options: [])
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

// 1. Classic iconset (light look) for iconutil -> Ludus.icns, the fallback on every macOS version.
let set = out.appendingPathComponent("Ludus.iconset")
try? fm.createDirectory(at: set, withIntermediateDirectories: true)
for (name, px) in [("16x16", 16), ("16x16@2x", 32), ("32x32", 32), ("32x32@2x", 64), ("128x128", 128),
                   ("128x128@2x", 256), ("256x256", 256), ("256x256@2x", 512), ("512x512", 512), ("512x512@2x", 1024)] {
    try! render(light, px).write(to: set.appendingPathComponent("icon_\(name).png"))
}

// 2. Icon Composer bundle: two full-bleed image layers, each hidden in the other appearance
// (actool drops image-name-specializations, but keeps hidden-specializations).
// Glass, shadow and specular are off so the artwork looks like the classic icon; macOS adds the mask.
let icon = out.appendingPathComponent("Ludus.icon")
try? fm.removeItem(at: icon)
try! fm.createDirectory(at: icon.appendingPathComponent("Assets"), withIntermediateDirectories: true)
try! render(light, 1024, fullBleed: true).write(to: icon.appendingPathComponent("Assets/light.png"))
try! render(dark, 1024, fullBleed: true).write(to: icon.appendingPathComponent("Assets/dark.png"))
// Hidden behind the opaque image layer; only a backdrop while the image loads.
func colour(_ h: UInt32) -> String {
    String(format: "display-p3:%.5f,%.5f,%.5f,1.00000", Double((h >> 16) & 255) / 255, Double((h >> 8) & 255) / 255, Double(h & 255) / 255)
}
let json = """
{
  "fill-specializations" : [
    { "value" : { "linear-gradient" : [ "\(colour(light.tileTop))", "\(colour(light.tileBottom))" ] } },
    { "appearance" : "dark", "value" : { "linear-gradient" : [ "\(colour(dark.tileTop))", "\(colour(dark.tileBottom))" ] } }
  ],
  "groups" : [
    {
      "layers" : [
        {
          "glass" : false,
          "hidden-specializations" : [ { "value" : true }, { "appearance" : "dark", "value" : false } ],
          "image-name" : "dark.png",
          "name" : "Dark"
        },
        {
          "glass" : false,
          "hidden-specializations" : [ { "value" : false }, { "appearance" : "dark", "value" : true } ],
          "image-name" : "light.png",
          "name" : "Light"
        }
      ],
      "shadow" : { "kind" : "neutral", "opacity" : 0 },
      "specular" : false,
      "translucency" : { "enabled" : false, "value" : 0 }
    }
  ],
  "supported-platforms" : { "squares" : [ "macOS" ] }
}

"""
try! json.write(to: icon.appendingPathComponent("icon.json"), atomically: true, encoding: .utf8)
