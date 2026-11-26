---
canDie: false
hasScore: true
---

# Orbit Express: Boxity integration

The player cannot die: there is no death or game-over screen. You are a space courier.
Step on a **Cargo Pad** (on Earth or any destination) to pick up a package bound for a
random place you've unlocked. Ride the **rocket** from Earth's launch pad up to **Halo
Station** - it leaves on a fixed 40-second schedule for everyone, with whoever stands in
the boarding ring at liftoff - then walk into a **shuttle bay** to fly to that planet or
moon (Moon, Mars, Venus, Mercury, Europa, Io, Ganymede, Callisto, Titan). Step on that
world's Cargo Pad to deliver for **Money**, and you're handed the next package at once.
Return by the **shuttle beacon** (to the station) and the **re-entry pod** (to Earth), or
warp from the **Star Map** to anywhere you've been before.

Money unlocks further destinations (each pays more per delivery: $40 for the Moon up to
$7,500 for Titan) and better **suits** from the Suit Shop on Earth, which multiply pay and
walk faster, jump higher or carry a jetpack. Gravity is each world's own: jumps on the
moons are long and floaty.

Server-authoritative: every pickup, delivery, unlock, purchase and trip is validated by
the game server against where the player really stands (`shared/session.js`); the
offline mode runs the same session locally.

## Leaderboards

Scores are reported by the **game server**, never by the client
(`server/src/bloxityLeaderboards.js`, `BLOXITY_LEADERBOARDS`). Every ~20 s and when a
player leaves, each pod sends the changed scores of its verified players to
`POST {api}/v1/leaderboards/hosted/{BLOXITY_GAME_ID}/report` as `legion_<userId>`.

| Board        | Label          | Score                                | Format  |
|--------------|----------------|--------------------------------------|---------|
| `deliveries` | Deliveries     | `profile.stats.deliveries`           | number  |
| `earned`     | Money Earned   | `floor(profile.stats.totalEarned)`   | compact |
| `places`     | Places Visited | `profile.visited.length`             | number  |
| `playtime`   | Minutes Played | `floor(profile.stats.playtime / 60)` | number  |

All four are `order: desc`, `mode: best`, `reset: none`. (In the database the in-game
boards keep the column names the rows already had: `rebirths` holds deliveries,
`total_wins`/`totalWins` Money earned, `best_distance`/`bestDistance` places visited.)

## Identity and saves

- Signed in: the client sends the SDK's game token (only while `getUser()` is non-null);
  the server verifies it with `POST {api}/v1/auth/game-token/verify` and saves under the
  returned `user._id` only. Ids in the join options are ignored.
- Guests (no token, a refused/expired token, or Boxity unreachable): the server makes the
  id (`guest-<uuid>`) and sends the browser a **save ticket** - that id signed with a
  per-database secret (`server/src/saveTickets.js`). The browser keeps its last 5 tickets
  (`pp.saveTickets`) and shows them on every join, so a guest gets back into their own
  save whatever the SDK's guest identity does. Forged or edited tickets are ignored.
- Carry-over: an id with no save yet gets the first unused save among Boxity's
  `carriedFrom` guest ids and the browser's ticketed guest saves, copied once.
- Profiles are version 2 (`shared/logic.js` `PROFILE_VERSION`); a save from the earlier
  game on this slug loads as a fresh profile.

## Screen ads

`ads.declareScreens({ panel: {}, gameplay: {} })` once after init; the client then calls
`ads.screen('panel')` while a modal panel is open and `ads.screen('gameplay')` otherwise.
Gameplay banners are **off** (no `show: true`); turning them on is the developer's call.

## Gems purchases

Boxity's purchase webhook goes to `POST /api/gems/webhook` on the game server. It is
recorded in the database by `transactionId` (idempotent) and applied exactly once by
the pod the buyer plays on. Unknown skus are answered 400 so Boxity refunds them.

| Sku           | Grants                                                   |
|---------------|----------------------------------------------------------|
| `money_small` | 10 deliveries' worth of Money at your best route          |
| `money_big`   | 60 deliveries' worth of Money at your best route          |
| `money_x2`    | x2 Money pass (doubles delivery pay)                      |
| `solar_suit`  | Solar Gold suit (x2.5 pay, top speed, jetpack)            |

A pass or suit already owned turns into Money instead.

## Rewarded ads

The client sends `adReward { placement, rewardToken }`; the server verifies the token
with `POST {api}/v1/ads/reward/verify` before granting anything. Placement
`cargo-bonus`: 3 deliveries' worth of Money, once every 3 minutes.

## Open Rooms

Each pod reports its rooms every 2 s to `POST {MATCHMAKER_REPORT_URL}/{BLOXITY_GAME_ID}/rooms`
(`server/src/legionRoomReporter.js`, installed after `listen()`), so they show under
"Open Rooms" on the game page. The client joins `?roomId=` at launch and falls back to
normal matchmaking if that room is gone or full.

## Avatars

`client/src/game/PlayerAvatar.jsx` + `avatarRig.js` draw every slot: skin (with face,
shirt and pants), body parts, hat + hair + mask on `Neck1`, back on `Spine2`, neck/chest
on `Spine2` and waist on `Spine1` (rest-inverse placement), hands and shoes as mirrored
pairs following the leaf bones' position and rotation only. Over every avatar goes the
player's **space suit** (`client/src/game/suitGear.js`: a glass helmet, collar and
oxygen pack, with a crate on it while carrying a package), synced to others through
`PlayerState.suit` / `carrying`. A player wearing an uploaded character (`characterId`)
gets its GLB via `avatar.getCharacter()` / `getCharacterFor()`, with accessories fitted
by `characterAccessoryMatrix`; on any failure the regular avatar shows.

## Server environment

| Variable                | Purpose                                                       |
|-------------------------|---------------------------------------------------------------|
| `BLOXITY_REPORT_TOKEN`  | Token for leaderboard and room reports (none set = no reports) |
| `MATCHMAKER_REPORT_URL` | Where the Open Rooms reporter posts (injected by Boxity hosting) |
| `BLOXITY_GAME_ID`       | Hosted game id for reports (default `1-sword-throwing`, the slug this game is registered under) |
| `LEGION_WEBHOOK_SECRET` | Must match the webhook's `x-legion-webhook-secret` header     |
| `MONGODB_URI`           | Shared database for profiles, Gems grants and the save-ticket secret. Required when hosted: without it saves go to a file inside the pod and are lost on every redeploy (the server logs an error and `/api/health` shows `db: "sqlite"`) |
| `BLOXITY_API_URL` etc.  | Platform URLs, injected by Boxity hosting; no defaults are written in code (`server/src/bloxityEnv.js`) |
