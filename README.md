# Oncoming

Current version: **v0.2.0**.

Arcade crash-racer set in the fictional city of Ember Bay. Drive the Vesper GT, roam the grid, farm boost from near-misses, and smash traffic for more. Slow at the glowing junction to pick Race, Takedown, Route, or Wreck. Pull into Hats Off Works to swap tires, brakes, and engine -- parts change handling, they are not cosmetic.

Original IP. Inspired by arcade crash-racing and open-world racers. Not affiliated with Electronic Arts or any other publisher. Hats Off IT / ofone.dev.

## Play

Install dependencies, then start the Vite dev server:

    npm install
    npm run dev

Open the local URL Vite prints (default http://localhost:5173).

Production build: npm run build then npm run preview.

## Controls

Keyboard
- W / Up accelerate
- S / Down reverse
- A / Left steer left
- D / Right steer right
- Shift boost
- Space brake

Garage (Hats Off Works)
- Drive into the teal warehouse bay at low speed (or stop inside)
- 1 or Left/Right -- cycle tires (Street / Sticky)
- 2 or Up/Down -- cycle brakes (Stock / Big)
- 3 -- cycle engine (Mill / Twin)
- Enter / Esc / E -- roll out

Junction events
- Slow near the orange marker to open the picker
- 1-4 or Up/Down, Enter to start, Esc to leave
- Race -- six gates on the 10x10 grid
- Takedown -- smash four cars (HP to 0)
- Route -- one finish at Ember Point across The Span
- Wreck -- timed smash score while tumbling

Gamepad
- Left stick steer
- RT or A accelerate
- B (or LT) brake
- RB, LB, X, or Y boost

On-screen hints update when a pad is connected.

## Waypoints

World pillars bob at points of interest. A HUD compass and a cheap minimap (top-right) track the current primary target:

- GARAGE (teal) -- always, unless you are inside the shop
- JUNCTION (orange) -- when the event is idle
- GATE (cyan) -- next race checkpoint
- EMBER POINT -- route finish across The Span
- SMASH / WRECK -- HUD-only (no fake GPS route)

Follow the compass needle or the minimap dots.

## Garage handling

The Vesper reads a real-ish spec (mass, tire grip, brake force, engine, drag) with arcade boost stacked on top.

- Street tires -- stock bite, clean roll
- Sticky tires -- about 1.6x grip (tighter turn-in) but more rolling drag / faster coast-down
- Stock brakes -- 48 brake force, mass 1.0
- Big brakes -- 1.85x stop, plus 0.2 mass (slower launch)
- Mill engine -- stock accel / top / boost
- Twin engine -- 1.35x accel, 1.18x top, stronger boost, extra mass and rolling drag

Driving reads the merged spec (vehicle + tires + brakes + engine). Swap, then drive. Twin shoves harder. Sticky turns in harder. Big brakes stop shorter. Boost kit and armor exist in the pack for later UI.

## Packs

Oncoming loads a JSON core pack (src/pack.json). Entries are plain objects. If an entry has extends set to a parent id, the loader deep-merges it onto the parent. Later mods override only the fields they change -- no class framework.

Prefab types in the manifest: vehicles, parts, props, pois, events. The player Vesper GT and traffic cars all instantiate from the same base-car kit (chassis, named wheel hardpoints, collision radius, default spec). Traffic entries override color / scale / name.

Example mod that only paints the Vesper and bolts on sticky tires:

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

## Design

- Small low-poly city: blocks, intersections, sidewalks, buildings, harbor piers, smashable props, a teal garage lot away from the junction.
- Arcade handling and a chase camera. Crashes spin you out; you recover and keep going -- no mission-fail reset.
- Boost fills from near-misses with traffic and from smashing rivals or street props.
- Junction events are win/lose with a timer, then the marker returns.

## Roster (fictional)

- City: Ember Bay
- Player: Vesper GT
- Shop: Hats Off Works
- Traffic: Ashline Coupe, Forge Hauler, Kestrel Hatch, Nimbus Van, Solara Roadster

City and vehicles are original. No licensed music, third-party art packs, or copyrighted brands.

## Stack

Vite + JavaScript + Three.js. City geometry is built from primitives at runtime. Physics is a lightweight arcade model (no rigid-body engine). Content is a JSON pack with extends merge.
## Damage

Traffic cars have HP from the pack (base 100, vans more, hatches less). A glancing clip chips HP (CLIP, sparks, slight boost). A committed shunt at speed dumps a big chunk (SHUNT). The car only goes airborne as a TAKEDOWN when HP hits 0. Near-misses still fill boost without dealing damage. Designer fields: vehicles[].hp and vehicles[].armor.

## Map

Ember Bay is a 10x10 block grid (BLOCK 52) plus a west water bay. Junction is the center at 260, 260. Hats Off Works is the teal lot at grid 1,8 (Ash Wharf). West of the grid is water, The Span (gold rails at z=260), and Ember Point island at (-70, 260). The minimap paints water vs land vs the span. Race gates use outer intersections. Route finishes at Ember Point.
