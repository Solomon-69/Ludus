# dpi.ps1: change the display scale (100%, 125%, 150%...) and resolution of the CI machine, like Settings > Display.
# Uses the same Windows calls Settings itself uses (DisplayConfigSetDeviceInfo), no admin needed.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Dpi {
  [StructLayout(LayoutKind.Sequential)] public struct LUID { public uint Low; public int High; }
  [StructLayout(LayoutKind.Sequential)] public struct Header { public int type; public uint size; public LUID adapter; public uint id; }
  [StructLayout(LayoutKind.Sequential)] public struct GetScale { public Header h; public int min; public int cur; public int max; }
  [StructLayout(LayoutKind.Sequential)] public struct SetScale { public Header h; public int rel; }
  [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
  [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags, ref uint paths, byte[] pathArr, ref uint modes, byte[] modeArr, IntPtr topo);
  [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(ref GetScale p);
  [DllImport("user32.dll")] static extern int DisplayConfigSetDeviceInfo(ref SetScale p);
  static readonly int[] Vals = { 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500 };
  static Header Source(out string err) {
    err = null; uint np, nm;
    GetDisplayConfigBufferSizes(2, out np, out nm);
    var paths = new byte[np * 72]; var modes = new byte[nm * 64];
    int r = QueryDisplayConfig(2, ref np, paths, ref nm, modes, IntPtr.Zero);
    if (r != 0 || np == 0) { err = "QueryDisplayConfig " + r; return default(Header); }
    var h = new Header();
    h.adapter.Low = BitConverter.ToUInt32(paths, 0); h.adapter.High = BitConverter.ToInt32(paths, 4);
    h.id = BitConverter.ToUInt32(paths, 8);
    return h;
  }
  // "min,cur,max" as percentages, or an error text.
  public static string Info() {
    string err; var h = Source(out err); if (err != null) return err;
    var g = new GetScale(); g.h = h; g.h.type = -3; g.h.size = (uint)Marshal.SizeOf(typeof(GetScale));
    int r = DisplayConfigGetDeviceInfo(ref g); if (r != 0) return "get " + r;
    int idx0 = -g.min;
    Func<int,int> pct = rel => { int i = idx0 + rel; return i >= 0 && i < Vals.Length ? Vals[i] : -1; };
    return pct(g.min) + "," + pct(g.cur) + "," + pct(g.max);
  }
  public static string Set(int percent) {
    string err; var h = Source(out err); if (err != null) return err;
    var g = new GetScale(); g.h = h; g.h.type = -3; g.h.size = (uint)Marshal.SizeOf(typeof(GetScale));
    int r = DisplayConfigGetDeviceInfo(ref g); if (r != 0) return "get " + r;
    int target = Array.IndexOf(Vals, percent); if (target < 0) return "bad percent";
    int rel = target + g.min;               // g.min is the offset of 100%
    if (rel > g.max) return "max is " + Vals[g.max - g.min] + "%";
    var s = new SetScale(); s.h = h; s.h.type = -4; s.h.size = (uint)Marshal.SizeOf(typeof(SetScale)); s.rel = rel;
    r = DisplayConfigSetDeviceInfo(ref s);
    return r == 0 ? "ok" : "set " + r;
  }
}
"@

function Dpi-Info { [Dpi]::Info() }
function Dpi-Set([int]$percent) {
  $r = [Dpi]::Set($percent)
  Start-Sleep -Seconds 3
  Write-Host "display scale -> $percent% : $r (now $([Dpi]::Info()))"
  return $r
}
