# Crokinole · Around the board

Desktop screens use a left control sidebar and a separate board on the right.
Phones keep compact scores above the board, with vertical view icons at its upper left. A small status label
identifies View or Shoot mode; Center is a secondary view action. Sound controls
live in Settings, with game mode and Start new match at the top.

To shoot, start behind your disc (including outside the rim) and flick through
it. Contact launches the disc immediately, so you can follow through before
lifting your finger. Missed swipes do not shoot. Tap the shooting line to place
the disc. Getting ready preserves your chosen zoom and score layout.
Framing shifts upward slightly to leave more room below the rim.

Gentle flicks have no minimum-power boost. Surface friction is tuned slightly
higher (0.12, previously 0.11) for a shorter glide without changing collision
bounce or adding disc mass.

Tap the painted shooting line to place your disc, including small adjustments
beside its current position. **Adjust view** returns from aiming to camera controls
without moving the disc or resetting your clock. The shot clock defaults to
60 seconds; Settings offers 30 seconds or Off for subsequent turns. It starts
at handover after the camera transition, includes view adjustment, and continues
through settings, background tabs, and reloads. Expiry forfeits one shot and
moves the unplayed disc to the ditch. Shot reviews and round summaries are untimed.

Shots now pause briefly before automatic handover: 1.25 seconds normally,
2 seconds for fouls, followed by a visible removal animation. Contrasting
pulse-and-fade markers retain each disc's player color. Removed discs lie flat
in the widened ditch, occupying the nearest free spot.

Completed rounds show counts by scoring zone, raw totals, and match points
awarded until the player clicks **Next round**. Saved reviews and round results resume
without adding points twice. Scoring uses the beveled disc's bottom footprint
and the same line width drawn on the board.

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

Use **Seated / Standing** under Board view before getting ready. **Ready to shoot**
seats you if needed, preserves a chosen seated angle, and locks the camera and
zoom for the shot. Shooting and disc placement are available only while seated;
camera transitions finish before accepting a flick.

Two-finger pinch adjusts zoom while viewing. Handover and getting ready preserve
your zoom. Pinching cancels a view
drag, and zoom is locked once you get ready to shoot.

Use **Settings** for rules, board finishes, image uploads, new matches, and sound
volume. **Preview sounds** plays soft, medium, and firm wood clicks, then a peg knock, twenty, and ditch
clatter. The **Sound on/off** button in Settings mutes the table.

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
