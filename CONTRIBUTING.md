# Contributing to Ludus

Thanks for your interest. Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and ideas

Open an issue using the bug or idea form. For bugs, say which system you use (Mac or Windows,
and the version), which game, and what happened. Security problems go through
[SECURITY.md](SECURITY.md) instead.

## Adding a game

Each game is one file in `web/games/`.

1. Read the contract at the top of `web/engine.js`. `web/games/g2048.js` is the reference example.
2. Add a `<script>` line for your file in `web/index.html`.
3. Keep it offline, keyboard friendly, aware of light and dark, and quick to play in a short break.
4. Make sure it pauses when the panel closes and resumes exactly where it left off.

## Trying your changes

- Open `web/index.html` in a browser for a quick check.
- Build the Mac app with `./build.sh` (see the README) to try it from the menu bar.
- The Windows app builds with the .NET 8 SDK (see `windows/README.md`).

## Pull requests

- Keep them small and focused. Describe what changed and how you tested it.
- Make sure both CI builds pass.
- Match the style of the code around you.
- No third-party code or assets unless the licence allows it and it is added to `NOTICE`.

By contributing you agree that your contribution is released under the MIT licence.
