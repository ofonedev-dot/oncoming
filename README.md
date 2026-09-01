# Oncoming

Arcade open-world crash racer in the browser. Low-poly Ember Bay. Original IP.

Hats Off IT / [ofone.dev](https://ofone.dev). Play host (soon): [oncoming.of1.dev](https://oncoming.of1.dev)

## What this is

I want a game you can open in a tab, grab a pad, and drive. Smash traffic, farm boost, take a junction event, pull into a garage and actually feel the parts you bolt on. Not a strategy deck. A car.

Ember Bay is fictional, but the bones are this bay: water, a span, hills inland, port vs downtown. East Bay energy without copying real streets or anyone else's city.

The handling is supposed to sit between arcade and real. Sticky tires bite harder and drag more. Big brakes stop shorter and add mass. Engine swaps shove harder. If you change a part and the car doesn't feel different, that's a bug.

This is **not** a sequel, remake, or clone of any published racer. Names, city, cars, and modes are ours. Inspired by the *feeling* of open-world crash racing — free roam, takedowns that take a few hits, a wreck mode where you keep the pileup going — with our own map and rules.

We're still in **0.x**. Far from v1. v0.1.0 was the first playable slice. Current work is v0.2.0: garage, packs, a bigger bay, real HP on cars, more modes.

## Why it's public

I want people to fork it and send PRs.

Useful PRs look like:

- A pack: a new car that `extends` `base-car`, or a tire/brake/engine that changes the spec
- Map: more road, a better landmark, districts that read at speed
- Feel: takedown HP, wreck scoring, race gate layouts — numbers in `src/pack.json` first, code only if the data model can't express it
- HUD/UX: minimap, waypoints, garage UI that a stranger can use without a lecture
- Performance: keep it cheap. Low-poly is the point so it runs on a laptop in Chrome

Less useful: a rewrite, a new engine, or anything that puts someone else's IP in the tree.

## Run

```
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

```
npm run build
npm run preview
```

### Controls

Keyboard: WASD / arrows drive, Shift boost, Space brake. A is left, D is right.

Garage (Hats Off Works): drive into the bay slow. `1` tires, `2` brakes, `3` engine. Enter / Esc / E to roll out.

Pad: left stick steer, RT / A throttle, B brake, RB / X boost.

## Packs / mods

Oncoming loads `src/pack.json`. Entries are plain objects. If something has `"extends": "parent-id"`, the loader merges it onto the parent. A later pack should only override what it changes.

Prefab types: `vehicles`, `parts`, `props`, `pois`, `events`.

Player Vesper GT and traffic cars all come from `base-car` (chassis, wheel hardpoints, collision, spec). Traffic is color / scale / name.

Tiny mod example — paint the Vesper and bolt sticky tires:

```json
{
  "id": "sunset-mod",
  "vehicles": [
    {
      "id": "vesper-sunset",
      "extends": "vesper-gt",
      "color": 16737792,
      "tires": "sticky"
    }
  ]
}
```

## Modes (in progress)

Named for Ember Bay, not anyone else's menu:

- Race — gates in order on a longer course
- Takedown — wreck cars; HP, not one-shot
- Route — point to point, beat a time
- Wreck — crash, then keep the pileup going for score
- Stunt / Marked — in the pack; not all wired yet

## License

MIT. Fork it. If you ship a descendant, keep the original-IP rule: no one else's cars, city, or trademarks.

Hats Off IT · ofone.dev · Ember Bay
