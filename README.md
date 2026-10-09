# Crokinole · Around the board

Desktop screens use a left control sidebar and a separate board on the right.
Phones keep compact scores above the board. Two small icons sit at the board's upper left: the seat badge and the camera icon (tap it to reset the view). Each turn starts seated with a highlighted disc on the shooting line. Tap the line to move it, drag elsewhere to adjust the view, pinch to move closer, or flick through the disc to shoot. Sound controls
live in Settings, with game mode and **Start a new game** at the top.
Players are named Red, Blue, Yellow, and Green; opposite colors partner in teams.

To shoot, start behind your disc (including outside the rim) and flick through
it. Slow brushes and tiny initial wobbles are provisional; a distance-based
near-contact approach records the strike direction and offset, independently of
the timed power window. Touches anywhere on the active disc can start a shot;
a continuous powered front-face stroke can finish its short registration span
after leaving the face, but a slow brush or interrupted stroke cannot. Finger coordinates
follow the visible top face of the disc, not its mid-height plane. Lifting your finger launches the disc, with power measured
from the last 120 milliseconds including follow-through. A small central strike
corridor preserves the incoming stroke direction; outside it, directional
deflection blends smoothly into the existing glancing response. The corridor is
relative to the stroke, not a fixed region behind the disc or a target on the board.
Off-center impact can still impart axial spin. Missed swipes do not shoot. A shot gesture holds the view steady until you lift your finger. Your chosen zoom and score layout persist.
Preview 7 keeps contact eligibility and offset registered, but refines aim from
the meaningful powered finish of the swipe instead of locking it to a tiny
first movement. Brief stationary lifts and small endpoint jitter retain that
finish; the existing release-power rule still rejects held or weak releases.
A symmetric diagonal-intent guard bounds opposing glancing deflection without
changing transferred speed or spin. It preserves sharp radial edge glances,
not exact clock-face heading on every off-center strike. Spin damping, holes,
scoring, slide friction and maximum power are unchanged.
Preview 8 retains preview 7's aiming and release-power behavior, but reduces
axial Coulomb resistance to retain useful spin longer. Strong stationary spins
in the model rest in roughly 1–2 seconds; weaker/centered shots need not wait.
Retained spin changes spinning rebounds. Falling disc/peg contact hops now add
an explicitly budgeted upward kick instead of replacing signed vertical speed;
normal landing rebounds remain. Shared constants/inertia are cleanup only.
Hole capture, scoring, sliding grip, maximum power and saved-game keys stay
unchanged. This is gameplay tuning, not measured real-board calibration. See
[project history](docs/history.md) for the verification summary and limitations.
Preview 9 changes playing-disc appearance only. **Settings → Playing discs**
offers stained wood or poker chips, Classic/Jewel/Pastel/Earth colors, and
individual printed emblems or pictures for Red, Blue, Yellow and Green.
Wood grain and printed faces rotate with the disc; the cream indicator dash is
removed. There is no engraving or raised decoration, and preview 8's accepted
physics, disc dimensions, input behavior and saved matches are unchanged.
Preview 5 also recognizes completed short, fast near-edge clips on lift. Powered
board-space strikes are no longer discarded as placement taps merely because
their phone-screen displacement is under five pixels. Central control and outer
deflection physics are unchanged; this fixes registration, not glance strength.
Framing shifts upward slightly to leave more room below the rim.

Flick strength uses the original power response (speed × 0.8 + 12, capped at
105), after rejecting stationary gestures. Since 2026-10-08 the speed is converted
from screen pixels per board inch at the disc (30 px reference, touch screens
×1.15), so the same finger or mouse movement gives the same power on any screen,
view or zoom. Surface friction is set to 0.1175,
a small easing from 0.120 toward the original 0.115. The speed-dependent drag
remains 0.05; power ceiling and normal collision bounce are unchanged.

The strike preview couples finger-contact geometry, deflection, and axial
rotation. Exactly centered flicks retain the original launch response; side
strikes redirect and spin the disc, and glancing strikes transfer less energy.
Directional forgiveness uses a neutral offset of `0.2` disc radii and reaches
the unchanged full-deflection response at `0.5` radii. It changes launch heading
only: transferred speed, launch spin, maximum power, board-spin damping and
disc/peg/lip collision responses are unchanged. The separate neutral **spin**
zone remains at `0.1` radii. Contacts can generate and change spin; board friction slows it until rest. Wood grain and printed disc
faces make rotation visible. No random misses or artificial curling are added.
See [physics versions and rollback](PHYSICS-VERSIONS.md) for stable checkpoints,
save compatibility, tuning details, and the GitHub Pages playtest deployment.
See [input findings](docs/physics/input-findings.md) for near-edge shot-detection
results, reusable diagnostic scripts, and the remaining separate physics issues.

Tap the painted shooting line to move your disc, including small adjustments
beside its current position. The shot clock defaults to
60 seconds; Settings offers 30 seconds or Off for subsequent turns. It starts
at handover after the camera transition, includes view adjustment, and continues
through settings, background tabs, and unpaused reloads. Expiry forfeits one shot and
moves the unplayed disc to the ditch. Shot reviews and round summaries are untimed.

The pause icon beside Settings freezes the clock, physics, camera, and review
animations. **Resume game** continues from that point. A paused table stays paused
after reload, including a shot in flight. Pause before putting the game away.
The active shooting disc blinks twice after the camera settles, then keeps a thin
outline until it is played. **Blink active disc** in Settings is on by default; turn
it off for an unmarked board. Reduced-motion preferences show the steady outline
without blinking.

Shots now pause briefly before automatic handover: 1.25 seconds normally,
2 seconds for fouls, followed by a visible removal animation. Contrasting
pulse-and-fade markers retain each disc's player color. Removed discs lie flat
in the widened ditch, occupying the nearest free spot.

Completed rounds show counts by scoring zone, raw totals, and match points
awarded until the player clicks **Next round**. Saved reviews and round results resume
without adding points twice. Scoring uses the beveled disc's bottom footprint
and the same line width drawn on the board.
After a win, the results remain visible until **Start a new game** is pressed;
the game never restarts automatically. A winner panel appears over the board with the
final match score and round count. **Inspect board** dismisses it and lets you rotate,
zoom, or change views while every final piece stays in place. **Show winner** reopens
the panel; your dismissal survives a reload.

A frontend-only, touch-first pass-and-play crokinole game built with TypeScript,
Vite, and Three.js.

## Run

```sh
npm install
npm run dev
```

Open the URL printed by Vite. Tap anywhere on your shooting arc to reposition the highlighted disc. Start behind it and flick through it to shoot toward the center. Drag elsewhere on the board with a mouse or one finger to adjust
your angle within your shooting quadrant (45° either side). Vertical dragging
tilts the camera continuously from a high overview down to seated eye level.
Each turn starts facing the next player's side.

Two icons sit at the board's upper left: the seat badge and the camera icon,
whose figure stands, sits or leans for the camera's position on one path:
Overview (standing, looking down), Table (seated) and Shooter (down behind your
disc). Drag and pinch move along it; tapping the camera icon resets to the
view each turn starts with (Table, default zoom, centered).
Crokinole's one-cheek rule applies: you shoot seated. Overview is standing, and
touching your disc while standing sits you down instead of shooting. Turns start
seated. On the badge the cheek hovers over the stool while you stand; seated, it
slides along the stool toward your end of the shooting line and perches on the
edge for shots from the quadrant lines. A shot gesture holds the camera
steady until release; camera transitions finish before accepting a flick.

Two-finger pinch adjusts zoom. Handover preserves your zoom. Pinching cancels a view
drag or shot attempt.

Pinching in past the default during your turn moves into the shooter view: the
eye comes down and in behind your disc, aimed at the center, so the disc grows
while the board ahead stays in view (full at 4×). Drags orbit around your disc and
tilt the view. The view holds through the shot and its review, glides to the
next player's disc at handover, and returns to the overview for round results,
where pinch is an ordinary lens zoom capped at 2.5×. Flick power follows screen
pixels (30 px per board inch at the disc), so the same movement shoots with the
same power in every view and zoom. Touch screens add 15%, because their pixels are
physically smaller than a monitor's.

Use **Settings** for rules, board finishes, saved artwork, new matches, and sound
volume. The artwork gallery holds four images in this browser. Tap an empty slot to
upload, tap a preview to use it, or choose **Replace** or **Delete** for that slot.
**Use board finish** returns to maple, walnut, or slate while keeping your images.
Images are cropped to a square and resized to 1024 pixels, then saved in IndexedDB.
Your previously uploaded image is moved into the first slot automatically. Images
stay local to this browser and are removed if you clear its site data. **Preview sounds** plays soft, medium, and firm wood clicks, then a peg knock, twenty, and ditch
clatter. The **Sound on/off** button in Settings mutes the table.

Playing-disc pictures are separate from board artwork. Choose a player, add a
picture, zoom its circular crop (1–4×), and drag or use arrow keys to position it.
**Reframe** edits the retained source; switching to an emblem keeps the picture
available through **Use picture**. Removing a picture affects only that player.
Pictures and crops stay in this browser's IndexedDB and are never uploaded.
Clearing site data removes them; another device/browser has its own collection.
PNG, JPEG, WebP, GIF and AVIF inputs are accepted up to 10 MB, with decoded images
capped at 64 million pixels. Sources are resized to at most 1024px on the long
edge, with a 256px circular face saved for play. Animated inputs become stills.

## Implemented

### Center-hole tuning guide

Successful captures now render a 380 ms tipping drop into a recessed pocket.
The pocket floor shares the ditch material and height; its wall is the cut edge
of the playing surface. The disc stays nearly flush in the pocket through shot
review, then is collected at handover while its twenty remains in the score.
Reduced motion shows the settled disc immediately. Board discs also display
their simulated dip, tilt, and edge rolling.

The current-turn twenty physically blocks grounded discs from entering the
occupied pocket. Collected twenties no longer block later turns. This fixes
the previous occupancy guard, which accidentally blocked the rest of the round.
The visual pocket depth follows the modeled board construction (0.395 inches);
the physics dip limit remains its existing, separately tuned value.

The center-hole behavior can be adjusted in `src/sim/constants.ts` and
`src/sim/hole.ts`. The physical dimensions are `BOARD.holeRadius` (visible
hole size) and `DISC.radius` (disc size). The softer gameplay controls are:

- `BOARD.holeCaptureRadius`: how far from the center a slow disc receives a
  gentle inward pull. Current value: `0.60` inches.
- `TUNE.holeDropOverlap`: the fraction of the disc footprint over the opening
  that allows a dipped, slow disc to tip through. Current experiment: `0.48`.
  This models weight shift more directly than a center-distance threshold.
- `TUNE.holeMaxSinkTilt`: maximum tilt allowed when a dipped disc drops through.
  Current experiment: `0.7` radians (about 40 degrees).

Only one disc can occupy the 20 hole. A disc that claims it blocks later discs
from sinking until it exits or the shot is resolved.
- `TUNE.holeCaptureSpeed`: the maximum speed for that pull and for sinking.
  Current value: `32 in/s` (a small reduction after overlap-based drop-through).
- `TUNE.holeWeightShiftSpeed`: the upper speed for a weaker grounded weight-shift
  pull while crossing the opening. Current value: `72 in/s`; this does not by
  itself make a fast disc sink.
- `BOARD.holeDepth` and `TUNE.holeSinkDip`: how much the disc must settle into
  the opening before it counts as sunk. Current values are `0.24` and `0.03`.
- `TUNE.holeLipBevel` and `TUNE.holeLipLoss`: how strongly the lip changes an
  exiting disc's speed.
- `TUNE.holeTiltSpring` and `holeTiltDamping`: how a tipped disc rocks flat.
- `TUNE.gravityZ`: how quickly a disc drops into the opening.
- `TUNE.frictionMu` and `frictionViscous`: how much speed remains when it
  reaches the hole.

For small difficulty changes, adjust `holeCaptureRadius` first, then
`holeCaptureSpeed`. Keep the visible dimensions unchanged unless the board's
physical proportions are being recalibrated. Fast shots should still be able
to catch the lip and deflect rather than being forced into the hole.

- Two-player, four-player teams (opposite partners), and four-player free-for-all.
- Fixed-step physics with adaptive collision substeps, sliding/rotational friction,
  spin-aware disc/peg/lip contacts, energy-bounded impact hops, hole-lip deflection,
  brief edge rolls, and ditch removal.
- Opponent-contact and open-board shot validation, foul removal, line-aware
  scoring, rounds and matches to 100, including tied-match continuation.
- Rotating player views, mouse/touch flicks, responsive scores and pass screen.
- One continuous camera path (Overview, Table, Shooter) with the one-cheek seat rule,
  smooth transitions, and reduced-motion support.
- Physics-driven stereo sound: wooden disc clicks, damped peg knocks, landings,
  and hole/ditch clatter. Volume, mute, and view preferences persist.
- Three procedural board finishes and persisted custom artwork (1024px), with
  a Remove artwork button to restore the selected finish.
- Versioned match saves preserve placement, axial rotation, in-flight shot contact
  history, pauses, reviews, and round results. The spin preview uses a separate save
  key and leaves the pre-spin table intact for rollback. Invalid or incompatible saves start a fresh game.
  Storage is optional when unavailable.

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
opacity/contrast checks and impact haptics. The temporary physics debug UI has
been retired; tuning values remain documented above. Physics feel
needs testing on real touch devices. The manifest is a starting point, not an
offline PWA. External Google Fonts are optional; system fonts are the fallback.

Rules clarification: the inner-ring finishing requirement applies only when
there are no opponent discs in play. See the
[NCA rules](https://nationalcrokinoleassociation.com/resources/NCA%20Rules%20Feb%209%2C%202011.pdf).
This game uses traditional differential scoring to 100 for duel/teams and the
planned individual point totals for free-for-all, rather than tournament round
match points.

## Browser verification

`npm run test:browser:discs` checks both styles and all palettes, independent
emblems/pictures, native keyboard/mouse/touch cropping, reframe/cancel, reload,
storage failures, removal and corrupt-data preservation at desktop and mobile
sizes. It uses isolated browser storage, never the player's live table.
See [disc appearance verification](docs/disc-design-verification.md).

`npm run test:browser` runs artwork, winner, and spin-control flows in fresh headless Chrome
profile with a local Vite server. It checks migration of the old image, four slots,
replacement without exceeding the limit, preserving images when a save fails,
deletion, selection and reloads, final-shot scoring, winner messages for each mode,
dismissal and reopening, final-board inspection, and starting a new game. Set
`CHROME_BIN` to your Chrome or Chromium executable if needed. Node 22 or later
is required. Spin checks cover native mouse/touch flicks, mobile neutral contact,
legacy-save preservation, and paused rotation across reload. The mobile round
checks keep the score breakdown expanded, verify that Next round is visible
before and after scrolling, and advance with native touch input in all three
modes across narrow, short, and landscape viewports. Strike checks also cover
slow initial brushes followed by side contact, tiny initial left/right wobbles
with ordinary and millisecond-dense samples, identical imperfect paths at gentle
and hard speeds, long gentle preparations and their collinear subdivisions,
coarse overshoots versus collinear subdivisions, front-face
touch starts, raw/coalesced sample extraction, post-impact follow-through,
misses, cancellation, and event timestamps. Independent projection of the
rendered top face checks picking at the seated Table view, shooting
positions and player quadrants. Native CDP input carries explicit
gesture timestamps; real rendering and physics loops remain running. `npm test` runs the
unit suite; `npm run build` checks TypeScript and
builds the production app.

Custom board artwork also enables small cream-and-dark collars at the peg bases for visibility over light, dark, or detailed images. Built-in board finishes retain their original pegs.
