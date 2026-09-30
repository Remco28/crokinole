# Physics versions and rollback

The spin preview is published from `main` through GitHub Pages at https://crokinole.teamremco.org/. The original development branch is retained as `physics/spin-v0.2`.

## Preserved checkpoints

| Tag | Package version | Behavior |
| --- | --- | --- |
| `crokinole-v0.1.0-original` | `0.1.0` | Original game before this work; sliding grip `0.115`, no axial spin. |
| `crokinole-v0.1.1-friction` | `0.1.1` | Small grip increase to `0.120`; original flick power and normal collision bounce. |
| `crokinole-v0.2.0-spin-preview.1` | `0.2.0-preview.1` | Friction adjustment plus forgiving flick spin and physical tangential contacts. |

The original checkpoint passed all 60 unit tests, production build, and artwork/winner browser flows. The friction checkpoint passed 62 unit tests, build, and the same browser flows. The preview passes 96 unit tests, production build, and native desktop/mobile browser checks, including legacy-save preservation. All three checkpoints are pushed to GitHub with the published preview.

`main` serves the spin preview; the friction-only and original versions remain available through their tags. To roll back the public site without rewriting history, revert the spin feature commit (`0b2ea0c`) on `main`, verify, and push; reverting the separate friction commit (`2ebbd16`) as well restores original grip. Do not move tags or force-push for rollback. To compare without deleting history or resetting work, start with a clean tracked working tree (`git status --short`), then:

```sh
# Try the friction-only checkpoint on a separate local branch.
git switch -c playtest/friction-only crokinole-v0.1.1-friction
npm run build
npm run dev

# Return to the spin playtest.
git switch physics/spin-v0.2
npm run build
npm run dev
```

Use `crokinole-v0.1.0-original` with a different branch name to compare the completely original game. Stop the current dev/preview server before changing versions and reload the browser afterward. Rebuild before serving `dist/`; switching Git branches alone does not replace an already-built bundle. Do not use `git reset --hard` or `git clean` for this workflow. Unrelated review documents and artwork in the repo remain untouched.

## Saved games also have a boundary

The preview writes schema-version-2 matches to `crokinole-match-spin-v2`. If that key does not yet exist, it can copy the previous `crokinole-match` table, supplying zero spin and angle for old discs (including review copies). It never overwrites the old key.

Returning to an old physics tag therefore restores the pre-spin table on the **same browser origin**, not a spin-version match that the old code cannot understand. Returning to the preview resumes its separate table. Scores/artwork/preferences are otherwise unchanged; artwork remains shared. Start a new game when comparing fresh shot behavior. Different ports/domains have separate browser storage.

## First spin model

- Maximum translational flick power remains `105`; centered launches use the original response.
- Contact comes from the first swept gesture segment that intersects the disc. Gesture events do not have to land exactly on the disc. The final 120 milliseconds still determine launch direction and power.
- Offsets within `0.3` disc radii produce zero spin. Beyond that, a smooth bounded ramp responds to intentional side contact. Spin is capped at `18 rad/s`, also limited by the launch speed. Rotational energy is taken from the existing launch-energy budget, not added to it.
- Axial spin is positive counterclockwise in the simulation plane. Inertia per unit mass is `radius²/2`.
- Grounded rotation loses speed from board friction and viscous drag. Sliding discs get less rotational torque than discs spinning in place: the regularized face-slip model approaches full Coulomb torque at rest and the translating uniform-face limit at high speed. As sliding slows, rotational grip increases. Tipped/rolling support reduces it; airborne discs receive no board torque. Angular speed sleeps at `0.04 rad/s` and is set to exactly zero. Turn handover waits for rotational settling too.
- Disc, peg, occupied-pocket and exiting-lip contacts use relative contact-point velocity, including axial rim speed, to calculate an energy-dissipating, Coulomb-capped tangent impulse. Coefficients are `0.18` for discs, `0.28` for pegs, and `0.12` for the hole lip. These are gameplay tuning values, not measured material coefficients.
- Normal restitution remains `0.8` for discs and `0.62` for pegs. Existing hop targets are capped against dissipated normal-contact energy, including when a disc already has vertical motion.
- There is no invented sideways free-slide force, shot randomness, or spin-dependent rejection of twenties. Hole dimensions and capture gates are unchanged. Lip friction can alter a glancing skip, but a centered clean twenty remains possible.
- A small cream inlay on each disc makes simulated rotation visible without a new control or HUD.

This is an intentionally restrained extension of the existing approximate simulation, not a full 3D rigid-body solver or a model calibrated to measured real-board trajectories. Spin adds contact technique; it is **not** intended to secretly make good centered shots miss. Hole difficulty remains a separate tuning decision.

## Verification and playtest

```sh
npm test
npm run build
npm run test:browser
```

The browser suite checks legacy-save preservation, actual centered and mirrored offset mouse flicks, small-screen neutral touch contact, deliberate seated-view spin, pause/reload and resumed settling, in addition to the previous artwork/winner flows. It runs with isolated local browser storage, never a user's live table.

Human playtesting is still required for feel, particularly on a physical phone: ordinary centered shots should remain accessible; left/right offsets should be learnable rather than twitchy; glancing rebounds should be readable; rotation should die away rather than linger through handover. Compare the friction-only version if anything feels worse before tuning multiple variables together.
