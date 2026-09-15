# Crokinole — Browser Pass-and-Play Game

Location: `~/Dev/crokinole` · Frontend-only SPA · No backend · No online play.

## 1. Vision

A beautiful, touch-first browser crokinole board. Flick discs with your finger.
Real 2D sliding physics with pseudo-3D hops, correct bumper play, custom board
skins, board rotation for the active player. Playful realism: 3D rendering over
a deterministic 2D sim.

Optimized for 1v1, supports up to 4 players.

## 2. Locked v1 Scope

- Modes: 1v1 (12 discs each), 4-player toggle: **2v2 teams** (6 discs each,
  partners opposite) and **FFA cutthroat** (6 discs each).
- Classic match to **100 points**, round-based NCA-style scoring.
- **Strictly human pass-and-play.** No AI opponent in v1.
- Touch primary, mouse fallback for dev. Flick-only shooting: no power meter,
  no cue stick, no spin control.
- 3 built-in board skins + custom image upload with guaranteed-visible lines.
- Board/camera rotates per active player: 2P = 0°/180°, 4P = 0/90/180/270°.
- Static hosting ready (`dist/` only, works from `file://` or GitHub Pages).

Explicitly out of v1: online multiplayer, accounts, AI, manual lob-height
gesture, spin/english, tournament brackets, soundboard.

## 3. Official Geometry (NCA tournament, sim source of truth)

Sim units: **1 unit = 1 inch**, board center at (0,0).

| Element | Spec | Sim value |
|---|---|---|
| Playing surface dia | 26" (660 mm) | radius 13.0 |
| Scoring rings (radius) | 4" / 8" / 12" | 15pts < 4, 10pts < 8, 5pts < 12 |
| Center 20-hole dia | 1-3/8" (34.9 mm), ~5mm deep | radius 0.6875 |
| Disc (tournament) | 1-1/4" dia x 3/8" thick (31.8 x 9.5mm) | radius 0.625, height 0.375 |
| Pegs x8 | ~1cm dia latex sleeve, 3.6cm tall | radius ~0.197, on 4" circle every 45°, offset 22.5° |
| Disc-peg collision radius | peg r + disc r | ~0.822 |
| Outer rail / ditch | beyond 13" radius | out if center > 13.0 or touching outer line at rest |
| Shooting quadrants | 4 quadrants, stage arc between lines in 12–13" band | per player index |

Line width 1/16"–1/8". Disc sinks in 20-hole only if flat (low z) and center
within capture radius (~0.55" tuned so near-misses lip out, not snap in).

## 4. Physics Model

Custom deterministic 2D engine + height channel. Fixed-step 120 Hz substeps,
render interpolates at rAF. No Rapier/Matter/Cannon — they add jitter and
tunneling for small fast discs and can't do hole-capture / wax-glide cleanly.

- **Integration:** semi-implicit Euler. Position in inches, velocity in in/s.
- **Friction:** Coulomb-ish constant deceleration + small viscous term:
  `v -= (mu*G + c*v) * dt`, direction preserved. Tunables: `mu ~ 0.08–0.15`
  (waxed + powder, faster than dry wood 0.3–0.5), `c ~ 0.05`. Target feel:
  firm flick crosses center and stops near far rail; soft touch dies mid-board.
- **Disc-disc:** equal-mass elastic impulse, `e_disc ~ 0.75–0.85`, positional
  de-penetration split 50/50. Moving disc transfers momentum; follow-through
  preserved (no full stop unless head-on).
- **Disc-peg (the hard part):** static circle collision. Relative velocity
  along normal reflected with `e_peg ~ 0.55–0.70` (deader than wood due to
  latex), tangential damped `* 0.98`. CCD via substeps (max move < 0.2" per
  substep). Slight radius padding (+2%) so pegs feel fair, never "pass-through".
- **Rail:** outer circle reflect with `e_rail ~ 0.45`, plus ditch test.
  Anything crossing 13" at speed bounces once then drops in ditch; slow
  rollers that stop touching the outer line are dead per NCA rule.
- **20-hole:** capture funnel: if `z < 0.2"` and `dist < captureR`, apply
  inward pull + extra damping; if center within hole radius at low speed,
  sink: remove from play, credit 20. Fast lip passes skip capture.
- **Airborne (pseudo-3D):** each disc has `z, vz`. Impacts impart
  `vz = k * impactSpeed * rand(0.05–0.15)`. Gravity `g ~ 180 in/s²` tuned.
  Land bounce `vz *= -0.35` below threshold stick. While `z > 0.375"`
  (disc thickness) skip disc-disc collisions → hop-overs work. Pegs are
  1.4" tall so only extreme pops clear them (correct). Toggleable
  `airborne: on/off` for tuning.
- **Settle:** sleep when `|v| < 0.15 in/s` and `|vz| < 1 in/s` for 3 frames.

All constants live in `src/sim/constants.ts` with a debug slider panel
(hidden by default, `?debug=1`).

## 5. Input — Flick Only

- `pointerdown` must start on/near the staged disc in your quadrant arc.
- Track `pointermove` trail (last 80–120 ms, weighted average).
- `pointerup`: `v = trailVelocity * powerCurve`, clamped `[minFlick, maxFlick]`.
  Below min → cancel, disc re-stages, turn not consumed.
- `powerCurve`: low-end boost for delicate 20 attempts, high-end soft clamp
  so board-clearing shots need commitment but stay possible.
- Screen-space flick vector rotated by current camera yaw so "push up" is
  always toward center from shooter's side.
- No power meter UI. Open question (default: brief 150 ms fading dotted ghost
  on release-drag for learnability, disappears — preserves skill).
- `navigator.vibrate(10)` tick on hard impacts (mobile).

## 6. Rendering — Three.js for Looks, Not Physics

- Three.js scene: wood/skin circle mesh, raised rail torus, 8 peg cylinders
  with latex material, discs as beveled cylinders with team colors, soft
  shadows (one directional + ambient), subtle board sheen.
- Camera: perspective tilted top-down (~55–65° polar) on a yaw rig. Turn
  change animates yaw 800 ms ease. No user orbit in v1 (keeps flick mapping
  1:1); pinch-zoom maybe later.
- Shadows scale/blur with disc `z` for air readability. 20-sink: scale-down +
  fade + particle puff (no physics change).
- 60 fps target on mid phones: cap pixel ratio at 2, share geometries /
  materials, no postprocessing in v1.

2D canvas fallback only if WebGL missing (message, not full port).

## 7. Skins / Custom Backgrounds

Two-layer board material — art never hides rules:

1. Bottom: skin image clipped to 26" circle (built-in PBR wood ×3 + user upload).
2. Top: always-opaque line layer (rings, quadrant lines, numbers) as transparent
   canvas texture drawn over art.

Custom upload: `<input type=file>` → downscale to 1024, circular clip,
preview, opacity slider (art alpha 0.5–1.0, lines stay 1.0), persist to
IndexedDB/localStorage. Validate: lines contrast-checked against art luminance;
auto-switch line color black/white if needed.

## 8. Rules Engine

`src/game/rules.ts` — pure functions, testable without rendering.

- Turn order clockwise, partners opposite in teams.
- Open board: must attempt 20 (no contact required). Opponent discs present:
  must make contact (direct or via own chain) + follow-through: at least one
  own disc touching/in 15-circle at end, else foul → own touched discs removed
  (incl. 20s sunk that shot).
- Ditch discs dead for round. Re-entering disc removed. 20s removed immediately,
  scored at round end if shot valid.
- Round ends when all discs shot. Score 20/15/10/5, line-touch = lower value.
  Match to 100. Tie → extra round.
- Pass-and-play interstitial: "Pass to Red" + board rotates before staging.

## 9. Architecture

```
src/
  main.ts            boot, fixed-step loop, mode select
  sim/constants.ts   NCA dims + tunables (mu, e_disc, e_peg, e_rail, g, k_pop)
  sim/physics.ts     integrate, disc-disc, disc-peg, rail/ditch, hole, height
  board/board.ts     ring tests, quadrants, stage positions
  board/skins.ts     built-ins, upload, line-overlay compositor
  input/flick.ts     pointer trail -> velocity, yaw transform
  render/scene.ts    Three.js meshes, lights, shadows, sink animation
  render/rotate.ts   camera yaw rig per player
  game/rules.ts      turns, fouls, scoring, match to 100
  game/store.ts      local state, persistence (scores, skin choice)
  ui/hud.ts          scores, 20s, turn banner, debug sliders
assets/skins/        wood-a.jpg, wood-b.jpg, slate.jpg (+ generated thumbs)
tests/               physics + rules unit tests (vitest)
```

No framework in v1 (vanilla TS). Add React only if UI outgrows hud.ts.

## 10. Build Phases

1. **Scaffold** — Vite TS + Three, static board + line overlay, yaw camera.
2. **Flat sim** — friction glide, rail/ditch, hole sink, disc-disc.
3. **Pegs** — 8-post collision + tuning panel.
4. **Air** — height channel + shadows, toggleable.
5. **Flick** — touch trail mapping, quadrant staging.
6. **Rules** — teams/FFA toggle, fouls, rounds to 100.
7. **Beauty** — PBR skins, particles, pass-and-play flow.
8. **Skins** — custom upload + contrast guard.
9. **Polish** — PWA manifest, persist, 60fps pass, deploy to Pages.

Verification per phase: glide-length test, peg rebound angle test, 20-drop /
lip-out test, 4P rotation test, touch flick latency check, `npm run build`
clean + `vite preview` smoke.

## 11. Locked Decisions (answered 2026-09-15)

1. Airborne v1 = **impact-pops only**, no manual lob gesture.
2. Aim aid: **brief 150 ms fading ghost** while dragging, disappears on release.
3. FFA 4P scoring: **cutthroat** (each own score to 100).

## Handoff — playable core, September 2026

Implemented phases 2–6 as a playable first pass, plus responsive HUD, pass flow,
three procedural finishes, persisted custom image upload, and completed-turn
persistence. `npm test` covers physics and rules; `npm run build` verifies types
and production output. See README for controls and remaining polish.

Corrections to the original plan:
- Inner-ring finish is required on open-board shots only, not after valid opponent contact.
- Duel/teams use traditional differential scoring to 100; FFA uses individual totals.
- Discs crossing the playing edge are removed; an outer-edge bounce is not simulated.
- Production must be served over HTTP(S); plain file:// is unsupported by ES modules.

Still pending: aim ghost, sink animation/particles, real-device tuning, debug
sliders, haptics, art opacity/contrast controls, and full PWA/offline support.

Board geometry correction: outward-facing solid frame walls; pegs offset 22.5°
to clear each central shooting lane; quadrant dividers span the 8–12 inch
5-point band.


## Seated play and table sound

- Standing preserves the original 25° polar overview; seated uses 62° polar
  (roughly 22 inches of eye height above the board at the base framing distance).
- Shooting and placement require the seated view and a settled camera.
- Web Audio effects follow physics events, with distinct disc/peg/drop materials,
  speed-dependent dynamics, stereo positioning, and grounded sliding noise.
- Sound is synthesized, not a measured or recorded reproduction of a real board.
- View, mute, and volume persist; sound preview is available in Settings.
- Custom artwork rotates 90° at render time, including previously saved artwork.
- Rim wall width is now 1/4 inch, retaining its structural height.


### Artwork and sound refinement

Custom art receives a further 180° correction (net -90° canvas rotation). Remove
artwork clears storage and restores the selected finish; pending image loads
cannot reapply removed artwork. Sliding noise is removed. Impact synthesis now
uses short noise transients through broad low-Q filters instead of pitched modes
and a bass tone. Preview compares soft, medium, and firm wooden contacts.


### Twenty-hole contact first pass

Implemented local dip/exit-lip response with deterministic radial impulses and
energy-budgeted hop/tipping. Brief edge rolling dissipates speed and settles;
collision footprint/height follow tilt. Fine substeps near the hole avoid
skipping its clearance. A twenty requires the disc center to fit the opening,
with slow inward settling and a short drop; supported lip hangers stay in play.
Airborne motion no longer incurs sliding friction. Lip contacts emit a wooden
clack; the disc sound has slightly fuller, still brief wooden body.

This remains a local approximation requiring real-board play/footage tuning,
not a full 3D rigid-body or calibrated contact model. No random kicks are used.


### Board zoom and playing-surface edge

Added persisted 75–250% projection zoom (default 120%) with buttons, reset,
mouse wheel, and two-finger pinch. Pinches cancel pending flicks; input waits
for camera zoom to settle; zoom/view controls lock during a moving shot.
Removed the frame's duplicate inner wall, which overlapped the playing-surface
cylinder and caused the striped edge shown in the user's screenshot. The
surface cylinder now owns that wall; adjacent circular meshes share 192 segments.


### Pre-shot quadrant orbit

Mouse/one-finger drag adjusts camera yaw within ±45° of the active player's side
and elevation within seated (48–68° polar) or standing (20–40° polar) limits.
Center resets the angle. Each pass centers on the next player via the shortest
rotation. Ready preserves the seated angle (or seats a standing player), then
locks angle and zoom until the next pass. Two-finger pinch cancels a view drag;
release/cancellation cannot turn a camera drag into a shot. Flick input waits
for yaw as well as elevation/zoom to settle.
