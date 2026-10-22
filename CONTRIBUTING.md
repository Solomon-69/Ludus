# Contributing

Thanks for your interest in Ludus. Bug reports, ideas and pull requests are welcome.

- **Bugs and ideas:** open an issue. Say which system (Mac or Windows, and version), which game,
  and what happened.
- **New games:** each game is one file in `web/games/`. Copy the contract described at the top
  of `web/engine.js` (`web/games/g2048.js` is the reference example), add a `<script>` line in
  `web/index.html`, and keep it offline, keyboard friendly, light and dark aware, and quick to
  play in a short break.
- **Trying changes:** open `web/index.html` in a browser, or build the apps (see README).
- **Pull requests:** keep them small and focused, describe what changed and how you tested it,
  and make sure both CI builds pass.
- **Style:** match the code around you. No third-party code or assets unless the licence allows
  it and it is added to `NOTICE`.

By contributing you agree that your contribution is released under the MIT licence.
