<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/icon-dark.png">
  <img src="docs/img/icon-light.png" width="128" height="128" alt="Ludus app icon: a game controller on a terracotta tile">
</picture>

<h1>Ludus</h1>

<p><b>33 little games in your menu bar. Take a little break.</b></p>

<p>
  <a href="https://github.com/Solomon-69/Ludus/releases/latest"><img alt="Version 1.5.0" src="https://img.shields.io/badge/version-1.5.0-d97757?style=flat-square"></a>
  <img alt="macOS 14 or later" src="https://img.shields.io/badge/macOS-14%2B-1f1d1a?style=flat-square&logo=apple&logoColor=white">
  <img alt="Windows 10 or 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-1f1d1a?style=flat-square">
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-5b8a5a?style=flat-square"></a>
</p>

<p>
  <a href="https://github.com/Solomon-69/Ludus/releases/latest/download/Ludus.dmg"><b>Download for Mac</b></a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/Solomon-69/Ludus/releases/latest/download/Ludus-windows.zip"><b>Download for Windows</b></a>
</p>

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/showcase/ludus-1-dark.png">
  <img src="docs/showcase/ludus-1-light.png" width="880" alt="The Ludus panel open under the menu bar with 2048 and Space Invaders beside it">
</picture>

</div>

Ludus is a small panel of games that lives in the Mac menu bar (and the Windows system tray).
Click the controller, play a quick round, then click anywhere else. The panel tucks itself
away and your game waits, paused, exactly where you left it.

It is free, open source, works fully offline and collects nothing.

## Contents

- [Features](#features)
- [Install](#install)
- [The games](#the-games)
- [Usage and keyboard shortcuts](#usage-and-keyboard-shortcuts)
- [Settings](#settings)
- [Privacy](#privacy)
- [Requirements](#requirements)
- [FAQ and troubleshooting](#faq-and-troubleshooting)
- [Building from source](#building-from-source)
- [Contributing](#contributing)
- [Credits](#credits)
- [Licence](#licence)

## Features

Ludus puts 33 small, polished games one click away. Here is what is inside.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/showcase/ludus-2-dark.png">
  <img src="docs/showcase/ludus-2-light.png" width="880" alt="Connect Four in vs Friend mode next to a two-player game of Tag">
</picture>

### Play a friend on one keyboard

Every board game has a <b>vs Bot / vs Friend</b> switch at the top. Pick Friend and you take turns on the same keyboard, with Player 2 in blue. The real-time games in the 2 Player group give each of you your own keys, so you can both play at once.

- <b>Turn-based with a friend:</b> Connect Four, Dots and Boxes, Ultimate Tic-Tac-Toe, Hex and Dead Centre.
- <b>Secret picks:</b> in Rock Paper Scissors, Player 1 picks with <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> and Player 2 with <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd>. Both hands show only once you have both locked in.
- <b>Real time:</b> Pong, Air Hockey, Rally, Tag, Nidhogg and Tank Trouble, with one player on <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> and the other on the arrow keys.
- All of them are in the <b>2 Player</b> tab. The panel widens by itself when a game needs the room.

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/showcase/ludus-3-dark.png">
  <img src="docs/showcase/ludus-3-light.png" width="880" alt="Space Invaders, Stack and Chomp side by side">
</picture>

### Arcade classics that feel right

Eleven arcade games built to play smoothly at 60 frames a second, each with its own best score to beat.

- <b>Space Invaders</b>: waves of invaders, shields and a mystery ship.
- <b>Stack</b>: drop each block in 3D and line it up perfectly for a combo.
- <b>Pac-Man</b>: a maze, four ghosts and power pellets.
- Plus Blocks (falling blocks with proper locking), Breakout, Drift, Flappy Bird, Plants vs. Zombies, Getting Over It, Snake and Doodle Jump.
- Three difficulty levels change the speed and how clever the computer is.

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/showcase/ludus-4-dark.png">
  <img src="docs/showcase/ludus-4-light.png" width="880" alt="2048, Wordle and Sudoku side by side">
</picture>

### Puzzles for a quick think

Eight calm puzzle games for a two-minute break or a longer think. Close the panel at any point and the game is saved exactly as it was.

- <b>2048</b>, <b>Wordle</b> (guess the word in six tries), <b>Sudoku</b> with notes and undo.
- <b>Minesweeper</b>, <b>Solitaire</b>, <b>Memory</b>, <b>Sokoban</b> and <b>Candy Crush</b>.
- Keyboard first, but every puzzle also works with clicks.

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/showcase/ludus-5-dark.png">
  <img src="docs/showcase/ludus-5-light.png" width="880" alt="The Ludus home screen with the Continue card magnified">
</picture>

### Pick up right where you left off

Clicking anywhere outside the panel pauses your game and saves it. Next time you open Ludus, a Continue card at the top takes you straight back in.

- Saves survive quitting Ludus and restarting your Mac.
- Cards show your best score and mark games that are in progress.
- Ludus always opens on the All tab, so every game is one glance away.

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/showcase/ludus-6-dark.png">
  <img src="docs/showcase/ludus-6-light.png" width="880" alt="The Ludus settings screen in light and dark">
</picture>

### Feels at home on your Mac

Ludus follows your Mac's light or dark look, or you can choose one. Everything else is up to you.

- <b>Appearance:</b> Auto, Light or Dark, and seven accent colours.
- <b>Panel size:</b> Compact or Large, with a smooth resize between them.
- <b>Invisible icon:</b> an empty-looking menu bar that still opens Ludus when clicked.
- <b>Show in Dock:</b> off by default, so Ludus stays in the menu bar only.
- <b>Sound and volume</b>, reduce motion, difficulty, and control hints under each game.


**Also:** best scores and progress for every game stay on your Mac. There are no accounts, no
ads and no analytics, and Ludus makes no network connections at all. It is one small native app,
and the games inside are plain HTML, CSS and JavaScript.


## Install

### Mac

1. Download **[Ludus.dmg](https://github.com/Solomon-69/Ludus/releases/latest/download/Ludus.dmg)** from the [latest release](https://github.com/Solomon-69/Ludus/releases/latest). A plain `Ludus-mac.zip` is there too if you prefer.
2. Open it and drag **Ludus** into **Applications**.
3. Open Ludus from Applications. A controller appears in your menu bar. Click it to play.

**First run on an unsigned build.** If a release is not notarised by Apple, macOS asks before
opening it the first time:

- Right-click Ludus in Applications and choose **Open**, then **Open** again.
- If there is no Open button, go to **System Settings > Privacy & Security**, scroll down and click **Open Anyway** next to Ludus.

You only need to do this once. Releases that are signed and notarised open straight away.

### Windows

1. Download **[Ludus-windows.zip](https://github.com/Solomon-69/Ludus/releases/latest/download/Ludus-windows.zip)**, right-click it and choose **Extract All**.
2. Keep the `Ludus` folder somewhere permanent, such as Documents. `Ludus.exe` and its `web` folder must stay together.
3. Run `Ludus.exe`. If SmartScreen says "Windows protected your PC", click **More info**, then **Run anyway**.
4. If Windows asks for the **.NET 8 Desktop Runtime** or the **WebView2 Runtime**, accept the free Microsoft download. WebView2 is built into Windows 11.
5. Click the controller in the system tray. It may be hidden behind the small arrow.

More detail for Windows is in [`windows/README.md`](windows/README.md).

### Install with Homebrew (coming soon)

There is no Homebrew tap yet. When there is, installing will be one line:

```sh
brew install --cask ludus   # not available yet
```

## The games

| Group | Games |
| --- | --- |
| **Arcade** (beat your best) | Tetris, Breakout, Pac-Man, Asteroids, Flappy Bird, Plants vs. Zombies, Getting Over It, Space Invaders, Snake, Doodle Jump, Stack |
| **Puzzle** | 2048, Sokoban, Wordle, Minesweeper, Memory, Solitaire, Candy Crush, Sudoku |
| **Duel** (you against the computer) | Dots and Boxes, Dead Centre, Connect Four, Last Wire, Ultimate Tic-Tac-Toe, Nidhogg, Hex, Rock Paper Scissors, Quoridor |
| **2 Player** (one keyboard) | Air Hockey, Pong, Tag, Tank Trouble |

Connect Four, Dots and Boxes, Ultimate Tic-Tac-Toe, Hex, Rock Paper Scissors and Dead Centre also have a **vs Friend** mode, so they show up in the 2 Player tab too.

Each game lives in its own file in [`web/games/`](web/games).

## Usage and keyboard shortcuts

Click the controller in the menu bar to open or close the panel. Clicking anywhere else closes
it and pauses the game. A right-click on the icon works too.

| Where | Keys |
| --- | --- |
| Moving | <kbd>&larr;</kbd> <kbd>&uarr;</kbd> <kbd>&rarr;</kbd> <kbd>&darr;</kbd> or <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> in most games |
| Act, jump, drop, fire | <kbd>Space</kbd> |
| Pause | <kbd>Esc</kbd> or <kbd>P</kbd> (in Wordle, <kbd>P</kbd> types a letter, so use <kbd>Esc</kbd>) |
| After a game | <kbd>Enter</kbd>, <kbd>Space</kbd> or <kbd>R</kbd> to play again, <kbd>Esc</kbd> for all games |
| Settings | <kbd>Esc</kbd> to go back |
| 2 Player games | One player on <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>, the other on the arrow keys |

Each game shows its own controls under the play area. You can turn that hint off in Settings.

## Settings

Open Settings with the gear in the top corner of the panel.

| Section | What you can change |
| --- | --- |
| **Look** | Appearance (Auto, Light, Dark), accent colour, panel size (Compact or Large), reduce motion |
| **Play** | Difficulty (Easy, Normal, Hard), sound and volume, show controls under games, open on all games or the last game |
| **App** | Open at login, invisible menu bar icon (Mac), reset best scores, quit |

## Privacy

Nothing leaves your Mac. Ludus has no accounts, no analytics, no ads and makes no network
connections. Scores, saved games and settings are stored locally. The game pages run in a
sandboxed web view that can only load files from inside the app. See [PRIVACY.md](PRIVACY.md).

## Requirements

- **Mac:** macOS 14 Sonoma or later, Apple silicon. On macOS 26 the app icon also has a dark version.
- **Windows:** Windows 10 or 11, 64-bit, with the .NET 8 Desktop Runtime and WebView2.
- About 5 MB of disk space.

## FAQ and troubleshooting

<details>
<summary><b>I can't see the icon in the menu bar.</b></summary>

On a busy menu bar, macOS hides icons that do not fit, especially on MacBooks with a notch.
Quit a few other menu bar apps, or hold <kbd>Command</kbd> and drag icons to make room. If you
turned on the invisible icon, the spot is still there: click where the controller used to be.
</details>

<details>
<summary><b>macOS says Ludus "cannot be opened" or is from an unidentified developer.</b></summary>

That build is not notarised. Right-click Ludus and choose **Open**, or use **Open Anyway** in
**System Settings > Privacy & Security**. See [Install](#install).
</details>

<details>
<summary><b>Where are my scores stored, and how do I reset them?</b></summary>

In the app's own preferences on your Mac. Use **Settings > Reset best scores**. To remove
everything, quit Ludus and run `defaults delete com.solomon.Ludus`.
</details>

<details>
<summary><b>Does Ludus use the internet?</b></summary>

No. It never connects to anything. It works the same with Wi-Fi off.
</details>

<details>
<summary><b>How do I start Ludus when I log in?</b></summary>

Turn on **Settings > Open at login**.
</details>

<details>
<summary><b>How do I uninstall it?</b></summary>

Quit Ludus from Settings, then move `Ludus.app` from Applications to the Bin. To clear its
saved data too, run `defaults delete com.solomon.Ludus`.
</details>

## Building from source

The games are plain HTML, CSS and JavaScript in [`web/`](web), shared by the Mac and Windows
apps. You can open `web/index.html` in any browser to try them (scores then live in browser storage).

### Mac

You need macOS 14 or later on Apple silicon and the Xcode command line tools
(`xcode-select --install`). There is no Xcode project.

```sh
git clone https://github.com/Solomon-69/Ludus.git
cd Ludus
./build.sh               # builds Ludus.app and installs it to ~/Applications
./build.sh --no-install  # only builds (output in /private/tmp/ludus-build)
```

Options, as environment variables:

- `SIGN_ID`: code signing identity. Defaults to `-` (ad-hoc), for example `SIGN_ID="Developer ID Application: Your Name (TEAMID)" ./build.sh`.
- `LUDUS_OUT`: where to build (default `/private/tmp/ludus-build`).
- `RELEASE=1`: leaves out the local UI test hook. CI uses this.

The app is a small Swift program in [`Sources/`](Sources): an `NSStatusItem` with an `NSPopover`
that hosts a `WKWebView` showing the bundled `web` folder.

### Windows

You need the [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0).

```powershell
cd windows
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o ..\out\Ludus
```

### Releases

Pushing a tag such as `v1.5` runs [`release.yml`](.github/workflows/release.yml). It builds both
apps and attaches `Ludus.dmg`, `Ludus-mac.zip`, `Ludus-windows.zip` and `SHA256SUMS.txt` to a
GitHub Release. If the Apple signing secrets are set in the repository, the Mac build is signed
with a Developer ID and notarised. If they are not, it is ad-hoc signed and the release notes say
so. The secrets are listed at the top of the workflow file.

## Contributing

Bug reports, ideas and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
first. New games are especially welcome: each one is a single file in `web/games/`.

To report a security problem, see [SECURITY.md](SECURITY.md).

## Credits

- Made by Solomon, built with the help of Claude.
- Settings gear icon from [Lucide](https://lucide.dev) (ISC licence).
- Many games are fresh takes on classics such as falling blocks, maze chase, Hex, Quoridor, dots
  and boxes and ultimate tic-tac-toe. The code and drawings were written for Ludus.
- Third-party notices are in [NOTICE](NOTICE).

Ludus is an independent project and is not affiliated with or endorsed by Anthropic or Apple.

## Licence

[MIT](LICENSE). Copyright (c) 2026 Solomon.
