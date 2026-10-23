# Ludus online play: notes for game authors

Online play is **opt-in** and everything else in Ludus stays offline. A game that supports it adds one line
to its `Ludus.register` object and reads `api.online`. Players reach it from the **Online** tab on the home screen
(there is no Online button on game screens any more): *Create room* (a 5 character **room code**, up to 4 players) or
*Join room* (code, pasted invite or `ludus://` link). In the room the host picks the games and the rounds; when the host
presses Start every player's game is created with `api.online` set. The Online page remembers the last party (code, names,
games, rounds in the saved state as `party`) and offers **Rejoin**; only **Forget** removes it.

## Tournaments (protocol 2)

* The host picks one or more games (those whose `online.min..max` fits the players in the room) and **rounds per game**:
  1, 3, 5, or **Tournament** (every picked game once, in order). One game and one round is a plain game (old flow, no scoreboard).
* Every screen reports `won` for its round (`api.over({won})`); the host adds it up (`Session.reportResult`, message kind `tr`)
  and shows the scoreboard card ("Round 2 of 3 · Next: paddle game"), then starts the next round by itself after 6 s (or at Start now).
  Final standings with the winner; the host can **Rematch** (scores reset) or go **Back to lobby**.
* The scoreboard is keyed by the player's id, so it survives seat changes. A player who leaves keeps their wins. The host
  closes seat gaps at each round start. If the game still has enough players the tournament goes on (games that no longer fit
  are skipped); with too few the standings so far are shown. If the host leaves, guests keep the standings so far.
* `api.online.min/max` are the **running game's** seats (the room can hold more).

## Old versions (1.6.0 / 1.6.1)

Wire version `v` stays 1 and the topic stays `ludus/v1/<CODE>/m`. Protocol 2 only adds optional fields: `pv` (join, welcome,
heartbeats), `tn` (plan: games, rounds), `sr` (series state), `lg` (an older player is present), `g`/`gm` on `start`, and new
message kinds `tr`, `sb`, `lob` that old clients ignore. Roster entries stay `[seat, name, id]`.
* Old guest in a new room: the host sees no `pv` and drops the room to that single game (picks hidden, "older Ludus" note, the
  room's seats shrink to the game's). An old guest naming a different game joins an empty Online-page room by switching it to that game.
  A running tournament refuses an old guest with the usual "already started", and the host is told "your friend needs to update Ludus".
* Old host, new guest: no `pv` in the welcome, so the guest opens that host's game as before (a link or Online page code is enough).
* A host that needs a newer protocol (`mp` in the welcome) makes the new client show "Your friend needs to update Ludus".

## Files

| File | Job |
| --- | --- |
| `web/net.js` | MQTT 3.1.1 over WebSocket client (no libraries), rooms, heartbeats, sequence numbers, shared random stream, SHA-256 |
| `web/lobby.js` | The create / join / waiting sheet, game and round picker, scoreboard and standings cards, error messages |
| `web/app.js` | Online page, party memory, header chip + Leave button, round hand-over, rematch, room-closed handling |
| `web/engine.js` | `makeApi(game, stage, hooks, online)` puts `api.online` on the game's api |
| `web/rt.js` | `Ludus.rt(api, {...})`: the host-runs-it link for real-time games (see "Real-time games") |

## Invites and the ludus:// link

Online is room-code play only: no matchmaking, no accounts, no chat. *Create room* shows the code and a **Copy invite**
button that copies a short message containing the room code and a `ludus://join/CODE` link. The join field accepts the bare
code or a pasted invite / link (`Ludus.net.extractCode`). The Mac shell (`Info.plist` `CFBundleURLTypes`, `application(_:open:)` in
`Sources/App.swift`) and the Windows shell (`HKCU\Software\Classes\ludus` written at start-up by `Store.RegisterUrlScheme`, second
launches hand the code to the running copy) open the panel and call `window.ludusJoin('CODE')`; the room says which game it is,
so the right game opens already joined. Only a 5 character letters/digits code ever travels from the link into the page.

## Declaring support

```js
Ludus.register({
  id: 'fourup', versus: true,
  online: { min: 2, max: 2 },          // players needed to start / seats in the room (max 8)
  onlineHint: '...',                   // optional: replaces the hint under the stage while playing online
  create(stage, api) { ... }
});
```
Only games with `online` (and `versus: true`) show the Online button.

## `api.online`

`null` when playing locally. Otherwise:

| Member | Meaning |
| --- | --- |
| `code` | the room code, e.g. `K7M2Q` |
| `seat` | this screen's seat, 0-based. Seat 0 is the host and "Player 1" |
| `min`, `max` | players needed / seats |
| `count` | players present right now (live) |
| `isHost` | `seat === 0` |
| `names` | array of `max` display names indexed by seat (`''` for an empty seat). Names are at most 10 characters, default `Player N`. Draw them with `fitText` or the standard `duelHeader` (which now shrinks long labels) |
| `connected` | `true` while the relay connection is up |
| `send(type, data)` | send to every other player. `type` matches `/^[A-Za-z0-9_.-]{1,24}$/`; `data` is any JSON value; the whole message must stay under 4 KB. Returns `false` if it could not be sent |
| `sendTo(seat, type, data)` | same, for one seat only |
| `on(type, fn)` | `fn(data, fromSeat)` runs at once for that message type. Returns an unsubscribe function |
| `queue(fn)` | **ordered** delivery for everything else: `fn(type, data, fromSeat)` is called in arrival order; return `false` to say "I am not ready for this yet" and it is offered again every 40 ms (dropped after 15 s); return anything else once handled or ignored. This is how the board games wait for an animation to finish. Register it *after* the game has set up its first state, because messages that arrived earlier are delivered the moment you call `queue` |
| `rand()` | a **shared seeded** random number in `[0,1)`. Every screen gets the same stream, so call it in the same order everywhere (hidden wire, target line, who starts...). `randInt(a, b)` is the inclusive integer version |
| `sendFast(type, data)` / `sendFastTo(seat, type, data)` | a **fast** message: not numbered, never sent again, dropped while offline, only reaches `on()` handlers. For state sent many times a second where only the newest copy matters |
| `seats` | the seats taken right now, sorted (e.g. `[0, 1, 3]`) |
| `onLeave(fn)` | `fn(seat, name, roomClosed)` when a player leaves. The app already ends the room and returns everyone to the menu with a message when fewer than `min` players are left; use this only for games that can carry on with fewer |

Also: `api.vs` and `api.friend` read as `'friend'` / `true` online, so a game can reuse its friend-mode code
with seat 0 = Player 1 and seat 1 = Player 2. The local player controls **only their own seat**. `api.saved`
is always `null` online and the app never saves an online game.

Everything registered with `on`, `queue` or `onLeave` is cleaned up automatically when the game exits.

## Rooms for 3 or 4

`online: { min: 2, max: 4 }` makes a room with four seats. The room starts by itself when every seat is taken; before
that the host sees **Start now** as soon as `min` players are in. Seats are 0-3 (host = 0); the colours are the
accent, blue, green and purple. When a player leaves and at least `min` remain, the game goes on (use `onLeave`);
below `min` the app ends the room. The home screen has no 3-4 Player tab any more: parties of 2, 3 or 4 all start from the **Online** tab (the host picks games that fit the party).

## Real-time games (paddle game, Air Hockey, Tag, claim-the-land game, swallow-the-city game)

These use `web/rt.js`. **The host's screen runs the game** (physics, bots, scoring) and ~18 times a second sends a
compact copy of the state with `sendFast('st', ...)`. Every guest sends only its controls (`sendFastTo(0, 'in', ...)`,
on change and every 200 ms) and draws the host's copy, smoothed between the last two copies (`link.sample()`, drawn
about 90 ms in the past). Things that must not be lost go over the normal numbered messages instead: claim-the-land game sends
changed territory rows (`terr`, run-length coded), swallow-the-city game sends eaten objects (`gone`) and new cars (`spawn`), every
game sends the final result (`end`). swallow-the-city game builds its city from the shared `rand()` stream, so every screen starts
with the same city and only the changes travel. A guest validates every number it reads from a state copy.
Known limits: the host's tab must stay in front (a hidden browser tab slows its timers); a guest sees the world
about 0.1 s late; if the host leaves the room closes.

## The pattern the turn-based games use

1. Every screen runs the same deterministic game. A move is applied locally and sent as a small message
   (`on.send('drop', { c })`); the other screens apply the same move to the same state.
2. Only the player whose turn it is may act: `const mayAct = () => !on || turn === mySide`.
3. On receipt, **validate**: right sender for the current turn, integers in range, move legal. Ignore anything else.
   Never trust the data (it came from the network): no `eval`, no `innerHTML`, no unchecked indexes.
4. Secret information: use shared `rand()` only for things both players may know. For simultaneous secret choices
   use commit then reveal (see `decider.js`: SHA-256 fingerprint first, the pick once both fingerprints are in,
   and the receiver checks the pick against the fingerprint with `Ludus.net.sha256`).
5. Hidden state that is *derived from the shared stream* (Last Wire's live wire) is known to both screens;
   a player who opens developer tools could read it. Fine for friendly games, not for anything with stakes.
6. When the match ends call `api.over(...)` as usual. The over bar offers *Rematch* (host) / *Ask for rematch*
   (guest); a rematch recreates the game with a fresh shared random stream.

## Transport details (for debugging)

* Relays tried in order: `wss://broker.emqx.io:8084/mqtt`, `wss://broker.hivemq.com:8884/mqtt`,
  `wss://test.mosquitto.org:8081`. Every relay is a separate world, so the room code decides the relay:
  the host makes a code that belongs to the relay it reached, joiners try that relay first, and a room stays
  on its relay. Override the list with `window.__LUDUS_BROKERS__ = ['ws://127.0.0.1:1883']` before `net.js` loads (tests).
* One MQTT topic per room: `ludus/v1/<CODE>/m`. Messages are JSON: `v` version, `c` random sender id, `t` kind,
  `q` game message number, `r` round. Game messages are numbered per sender; a gap is noticed (also from the
  4 s heartbeat) and the missing messages are requested and sent again. Duplicates are ignored.
* Presence: everyone sends a heartbeat every 4 s; silence for 16 s means gone. The host's heartbeat carries the
  roster and the current round so a missed message heals itself. If the host leaves the room closes (no host
  migration). A connection that drops reconnects by itself (state `connecting` / `online` / `offline`).
* Room codes are 5 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `I L O 0 1`).

## Prediction and smoothing (real-time games)

`Ludus.rt` sends only what changed (a full state about every 10th time), 24-30 times a second; the guest's own controls go as
changes (at most 30/s) plus a full set every 150 ms, stamped with the guest's clock. The host echoes the stamp (`ak`) in each
state copy. `link.predictor({pick, snap})` moves the guest's **own** thing locally every frame from its own controls (paddle game
paddle, Hockey mallet, Tag player, claim-the-land game and swallow-the-city game heads) and compares the host's copy with where this screen had it at that
same moment, easing the difference away (snapping only above `snap`). Everything else is drawn about 100 ms in the past between two
copies and, when copies run late, carried on at the last speed for up to 150 ms (`sample().t` goes above 1). Rendering never waits
for the network.

## Testing

Run two to four pages against an in-memory broker (no internet needed): a tiny MQTT broker over a local WebSocket plus
two headless pages, with `__LUDUS_BROKERS__` pointing at it. `Ludus.net.WebSocket` can also be replaced with a fake.
`window.ludusSnapshot()` (the game's own `save()`) is handy for comparing the two boards.

Tests live in `QA/online/` (`npm i` once; `node online.js [scenario]`: tournament tleave tleave2 party compat futurehost paper layout lag_pong lag_hockey lag_tag lag_holeio;
`node run.js ../smoke.js [--size large --dark]` for the smoke test). `broker.js` is an in-memory MQTT relay; `broker.latency = { base, jitter }`
delays every delivery per receiver (order kept). The lag scenarios run at 150-300 ms and check that the guest's own thing moves within
60 ms of a key press, converges with the host, and that the host's thing moves on many guest frames without jumps. The old pages for the
compat scenarios come from `git archive v1.6.0 web` (made on first run into `QA/online/.old`).
