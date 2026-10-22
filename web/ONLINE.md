# Ludus online play: notes for game authors

Online play is **opt-in** and everything else in Ludus stays offline. A game that supports it adds one line
to its `Ludus.register` object and reads `api.online`. A player starts it from the game screen:
**Online** (next to vs Bot / vs Friend) opens a sheet to *Create room* (shows a 5 character **room code**) or
*Join room* (type the code). When the host presses Start (or the room fills up) every player's game is created
with `api.online` set.

## Files

| File | Job |
| --- | --- |
| `web/net.js` | MQTT 3.1.1 over WebSocket client (no libraries), rooms, heartbeats, sequence numbers, shared random stream, SHA-256 |
| `web/lobby.js` | The create / join / waiting sheet and error messages |
| `web/app.js` | Online button, header chip + Leave button, rematch, room-closed handling |
| `web/engine.js` | `makeApi(game, stage, hooks, online)` puts `api.online` on the game's api |

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
| `onLeave(fn)` | `fn(seat, name, roomClosed)` when a player leaves. The app already ends the room and returns everyone to the menu with a message when fewer than `min` players are left; use this only for games that can carry on with fewer |

Also: `api.vs` and `api.friend` read as `'friend'` / `true` online, so a game can reuse its friend-mode code
with seat 0 = Player 1 and seat 1 = Player 2. The local player controls **only their own seat**. `api.saved`
is always `null` online and the app never saves an online game.

Everything registered with `on`, `queue` or `onLeave` is cleaned up automatically when the game exits.

## The pattern the eight shipped games use

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

## Testing

Run two pages against an in-memory broker (no internet needed): a tiny MQTT broker over a local WebSocket plus
two headless pages, with `__LUDUS_BROKERS__` pointing at it. `Ludus.net.WebSocket` can also be replaced with a fake.
`window.ludusSnapshot()` (the game's own `save()`) is handy for comparing the two boards.
