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
Use **Settings** for rules, board finishes, image uploads, and new matches.

## Implemented

- Two-player, four-player teams (opposite partners), and four-player free-for-all.
- Fixed-step physics with adaptive collision substeps, friction, pegs, disc
  collisions, small impact hops, center capture, and ditch removal.
- Opponent-contact and open-board shot validation, foul removal, line-aware
  scoring, rounds and matches to 100, including tied-match continuation.
- Rotating player views, mouse/touch flicks, responsive scores and pass screen.
- Three procedural board finishes and persisted custom artwork (1024px).
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
