namespace Ludus;

/// <summary>
/// Which build this is. The classic build is plain "Ludus". Building with -p:LudusVariant=raised makes the
/// side-by-side "Ludus Raised" test build: its own exe name, data folder, single-instance names, Start menu entry and
/// login entry, no ludus:// link registration (invites keep opening the classic app) and no in-app updates, so it can
/// never replace or be replaced by the classic Ludus.
/// </summary>
internal static class Variant
{
#if LUDUS_RAISED
    public const string Id = "raised";
    public const string Name = "Ludus Raised";
    public const string Slug = "LudusRaised";
#else
    public const string Id = "";
    public const string Name = "Ludus";
    public const string Slug = "Ludus";
#endif
    public static bool IsVariant => Id.Length > 0;
}
