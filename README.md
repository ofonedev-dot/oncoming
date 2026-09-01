# Oncoming

Arcade crash-racer set in the fictional city of **Ember Bay**. Drive the **Vesper GT**, roam the grid, farm boost from near-misses, and smash traffic for more. A glowing junction kicks off a short sprint (hit gates) or a takedown-N challenge.

Original IP. Inspired by arcade crash-racing and open-world racers. Not affiliated with Electronic Arts or any other publisher.

## Play

Install dependencies, then start the Vite dev server:

```
npm install
npm run dev
```

Open the local URL Vite prints (default http://localhost:5173).

Production build: `npm run build` then `npm run preview`.

## Controls

**Keyboard**
- W / Up accelerate
- S / Down reverse
- A D / Left Right steer
- Shift boost
- Space brake

**Gamepad**
- Left stick steer
- RT or A accelerate
- B (or LT) brake
- RB, LB, X, or Y boost

On-screen hints update when a pad is connected.

## Design

- Small low-poly city: blocks, intersections, sidewalks, buildings, harbor piers, smashable props.
- Arcade handling and a chase camera. Crashes spin you out; you recover and keep going -- no mission-fail reset.
- Boost fills from near-misses with traffic and from smashing rivals or street props.
- Junction events are win/lose with a timer, then the marker returns.

## Roster (fictional)

- City: Ember Bay
- Player: Vesper GT
- Traffic: Ashline Coupe, Forge Hauler, Kestrel Hatch, Nimbus Van, Solara Roadster

City and vehicles are original. No licensed music, third-party art packs, or copyrighted brands.

## Stack

Vite + JavaScript + Three.js. City geometry is built from primitives at runtime. Physics is a lightweight arcade model (no rigid-body engine).
