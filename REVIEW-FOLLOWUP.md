# Review follow-up — September 16, 2026

Assessment against `d0da6fd`, plus the changes in this pass. The supplied
`CODE-REVIEW.md` reviewed `8044cdd`, before the debug UI was removed.

## Findings and decisions

- **Occupied-hole snap: confirmed and fixed.** The guard relocated every
  overlapping grounded disc, including resting lip hangers. It now blocks only
  inward movement and never corrects beyond the previous radius. Regression tests
  cover resting discs, retained dip, and an already-overlapping incoming disc.
  This remains a simplified contact model for a recessed disc, not full 3D contact.
- **Labels: stale hints and README confirmed.** Current-state labels are an
  intentional product choice. Keep them, use Looking / Place and Shoot in both
  locations, and explain switching using the label currently visible. Player names
  now come from one shared palette: Red, Blue, Yellow, Green.
- **Unpaused reload expiry: intentional.** The original turn-clock rule still
  applies. Explicit Pause now freezes time and persists across reloads, giving
  players a clear way to put a game away.
- **Tests absent from deployment: confirmed and fixed.** Pages now runs the suite
  before building and publishing.
- **Unused tunables and duplicate occupancy guard: confirmed and removed.**
  Removing the unused peg damping value preserves the current feel; implementing
  it would change physics without a player request. The plan now matches that.
- **Weak saved-state checks: confirmed and improved.** Saves have a version and
  checks for player/side counts, finite disc motion, ownership, IDs, and the
  review/result/shot data needed by each phase. Valid older saves migrate. Invalid
  or unknown-version saves start fresh.
- **A permanently moving disc: not reproduced.** Do not silently alter a shot
  after an arbitrary timeout without a demonstrated failing case.
- **Duplicate Vite versions: maintenance work, not a demonstrated gameplay bug.**
  Defer the test-runner major upgrade to its own dependency pass.

## Additional findings from this pass

- **A shot in progress was not resumable.** Only earlier turn state was stored.
  Saving now includes staged placement and shot contact history, and page exit
  saves the current snapshot. Pausing in motion and reloading preserves the shot.
  Storage is still best-effort; an OS killing a tab without pagehide can lose
  unsaved progress. Pause writes immediately.
- **Round-summary visibility leaked between rounds.** Hiding the score table to
  inspect the board left the following round's table hidden too. Reset that choice
  for each round and new game.
- **The win screen already required a click.** No automatic restart was present.
  Its action is now explicitly Start a new game, with a matching accessible label;
  previous mode-switch labels no longer survive on result buttons.

## Verification and future work

Tests cover clock pause/resume (including clock-off and already-expired turns),
save validation/migration, deterministic continuation of an in-flight shot, and
occupied-hole regression cases. Existing scoring tests cover a hand-counted
65–40 round, teams, free-for-all, tied winners, boundary scoring, and revoked
twenties; no scoring arithmetic defect was found in this review.

Browser checks cover mobile controls, pause/reload/resume, four-player labels,
and explicit new-game flow. Reduced motion uses a steady disc highlight instead
of pulses. All 57 tests and the production build pass.

Remaining worthwhile work includes keyboard play, consolidating the
layered stylesheet, installable-app icons, and preserving transparent artwork in
saved uploads (currently encoded as JPEG). These deserve separate scoped passes.
