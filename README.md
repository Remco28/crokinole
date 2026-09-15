# Crokinole · Around the board

A frontend-only, touch-first pass-and-play crokinole game built with TypeScript,
Vite, and Three.js.

## Run

```sh
npm install
npm run dev
```

Open the URL printed by Vite. Tap **Ready to shoot**, then flick the colored disc
toward the center. Tap elsewhere on your shooting arc to reposition before a shot.
Before **Ready to shoot**, drag the board with a mouse or one finger to adjust
your angle within your shooting quadrant (45° either side). Vertical dragging
adjusts your elevation within the selected seated or standing view. **Center**
resets the angle. Each turn starts facing the next player's side.

Use **Seated / Standing** above the board before getting ready. **Ready to shoot**
seats you if needed, preserves a chosen seated angle, and locks the camera and
zoom for the shot. Shooting and disc placement are available only while seated;
camera transitions finish before accepting a flick.

Zoom with the **− / +** buttons, the mouse wheel over the board, or a two-finger
pinch. Click the percentage to reset to the full-board framing. Zoom ranges from
75% to 250%, starts at 120%, and persists across reloads. At high zoom the edges
can leave the viewport; reset or zoom out to see them again. Pinching cancels a
view drag, and zoom is locked once you press Ready to shoot.

Use **Settings** for rules, board finishes, image uploads, new matches, and sound
volume. **Preview sounds** plays soft, medium, and firm wood clicks, then a peg knock, twenty, and ditch
clatter. The **Sound on/off** button above the board mutes the table.

## Implemented

- Two-player, four-player teams (opposite partners), and four-player free-for-all.
- Fixed-step physics with adaptive collision substeps, friction, pegs, disc
  collisions, impact hops, hole-lip deflection, brief edge rolls, and ditch removal.
- Opponent-contact and open-board shot validation, foul removal, line-aware
  scoring, rounds and matches to 100, including tied-match continuation.
- Rotating player views, mouse/touch flicks, responsive scores and pass screen.
- Seated and standing cameras, smooth transitions, and reduced-motion support.
- Physics-driven stereo sound: wooden disc clicks, damped peg knocks, landings,
  and hole/ditch clatter. Volume, mute, and view preferences persist.
- Three procedural board finishes and persisted custom artwork (1024px), with
  a Remove artwork button to restore the selected finish.
- Match saved after completed shots; reloading during a shot restores the last
  completed turn. Storage is optional when unavailable.

## Verify and deploy

```sh
npm test
npm run build
npm run preview
```

Serve `dist/` from a static HTTP host, including GitHub Pages. Opening `index.html`
via `file://` is not supported by Vite's ES module build. No backend is required.

## Twenty-hole behavior

The hole now has a local contact model: a supported disc can dip into the opening,
strike the far lip, lose speed, tip, and hop. Off-center contact changes direction;
identical inputs stay deterministic and centered crossings stay symmetric.
Some fast skips can leave the board. Tipped discs have a narrower collision
profile and can roll briefly before rocking flat. Airborne discs have no sliding
friction. Slow twenties require clearance inside the opening; supported lip
hangers remain in play.

This is a tuned approximation, not a full 3D rigid-body simulation or a model
validated against measured real-board trajectories. Lip response and rocking
constants are in `src/sim/constants.ts`; isolated hole tests cover symmetry,
energy loss, capture, airborne clearance, rolling, and timestep sensitivity.

## Sound design

Effects are synthesized locally with Web Audio: very short noise bursts through
broad, damped filters, aiming for the dry contact of two small wooden pieces.
There are no sustained pitched tones, bass oscillators, or sliding noise.
They are not recordings of a real board. Impact strength controls loudness and
brightness; stereo position follows the active camera. Five variations per sound
avoid identical repeated clicks. Audio
starts after a user gesture and suspends when the tab is hidden, following
[Web Audio browser guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
No audio downloads or third-party sound licenses are required. Real-board
recordings and listening comparisons would be the next step for greater fidelity.

## Remaining polish

The playable core is in place. The original visual wishlist still includes a
fading aim ghost, sink particles, richer surface materials, adjustable artwork
opacity/contrast checks, impact haptics, and a physics debug panel. Physics feel
needs testing on real touch devices. The manifest is a starting point, not an
offline PWA. External Google Fonts are optional; system fonts are the fallback.

Rules clarification: the inner-ring finishing requirement applies only when
there are no opponent discs in play. See the
[NCA rules](https://nationalcrokinoleassociation.com/resources/NCA%20Rules%20Feb%209%2C%202011.pdf).
This game uses traditional differential scoring to 100 for duel/teams and the
planned individual point totals for free-for-all, rather than tournament round
match points.
