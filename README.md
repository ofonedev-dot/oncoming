# Oncoming

Arcade open-world crash racer in the browser. Low-poly Ember Bay. Original IP.

**Play (demo):** [oncoming.grok.me](https://oncoming.grok.me)

This repo is the source of truth. Keep editing here. Home on metal later: [oncoming.of1.dev](https://oncoming.of1.dev).

Tagged **v0.2.0**. Still **0.x**. `v1.0.0` is reserved for when it is actually a game.

Main is **0.2.1**: A is left, D is right. **M** opens a pull-up map. Pick a pack waypoint and a gold GPS line plus the compass take you there. Garage is Hats Off Works (gold **G** on the minimap). Junction is the orange pillar.

## What this is

I want a game you can open in a tab, grab a pad, and drive. Smash traffic, farm boost, take a junction event, pull into a garage and actually feel the parts you bolt on. Not a strategy deck. A car.

Ember Bay is fictional, but the bones are this bay: water, a span, hills inland, port vs downtown. East Bay energy without copying real streets or anyone else's city.

The handling is supposed to sit between arcade and real. Sticky tires bite harder and drag more. Big brakes stop shorter and add mass. Engine swaps shove harder. If you change a part and the car doesn't feel different, that's a bug.

This is **not** a sequel, remake, or clone of any published racer. Names, city, cars, and modes are ours. Inspired by the *feeling* of open-world crash racing — free roam, takedowns that take a few hits, a wreck mode where you keep the pileup going — with our own map and rules.

## First PR (about 15 minutes)

The loader is `src/pack.js`. Data lives in `src/pack.json`. If you can change a number and feel it in the car, that's a good PR.

1. Fork this repo.
2. `npm install && npm run dev`
3. Add a traffic car that `extends` `base-car` in `src/pack.json` (drop it in the `vehicles` array).
4. Drive it. If it doesn't feel different from stock traffic, change `hp`, `scale`, or `color` until it does.
5. Open a PR. One idea per PR.

Tiny example:

```json
{
  "id": "ridge-hatch",
  "extends": "base-car",
  "name": "Ridge Hatch",
  "color": 12105912,
  "scale": 0.94,
  "traffic": true,
  "hp": 75,
  "armor": 0
}
```

Same pattern for a tire, brake, or engine in `parts`. Override only what you change.

## Useful PRs

- A pack: a new car that `extends` `base-car`, or a tire/brake/engine that changes the spec
- Map: more road, a better landmark, districts that read at speed
- Feel: takedown HP, wreck scoring, race gate layouts — numbers in `src/pack.json` first, code only if the data model can't express it
- HUD/UX: minimap, waypoints, garage UI that a stranger can use without a lecture
- Performance: keep it cheap. Low-poly is the point so it runs on a laptop in Chrome

Prefab types: `vehicles`, `parts`, `props`, `pois`, `events`. Player Vesper GT and traffic cars all come from `base-car`.

## Not useful

A rewrite, a new engine, or anything that puts someone else's IP in the tree. No one else's cars, city, or trademarks.

House style: JSON packs, one file per job. Don't grow `src/main.js` or `src/world.js` unless `pack.json` can't say it.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

```bash
npm run build
npm run preview
```

### Controls

Keyboard: WASD / arrows drive, Shift boost, Space brake, M map. A is left, D is right. Pick a waypoint on the map and follow the gold GPS line.

Garage (Hats Off Works): drive into the bay slow. `1` tires, `2` brakes, `3` engine. Enter / Esc / E to roll out.

Pad: left stick steer, RT / A throttle, B brake, RB / X boost.

## Modes (in progress)

Named for Ember Bay, not anyone else's menu:

- Race — gates in order on a longer course
- Takedown — wreck cars; HP, not one-shot
- Route — point to point, beat a time
- Wreck — crash, then keep the pileup going for score
- Stunt / Marked — in the pack; not all wired yet

## License

MIT. Fork it. If you ship a descendant, keep the original-IP rule: no one else's cars, city, or trademarks.

Hats Off IT · [ofone.dev](https://ofone.dev) · Ember Bay
