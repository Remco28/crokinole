# Discussion notes for the next session

The user approved these proposals and resumed development on September 15.
The original discussion is preserved below; this implementation summary supersedes
its pending decisions.

## Implemented after approval

- Audited round arithmetic with explicit duel, teams, tie, and FFA examples.
  Fixed scoring boundaries to match the visible line width and beveled disc's
  bottom footprint. Outer-line discs remain hittable until the shot settles.
- Added a round breakdown with raw totals and points added to the match.
- Hold ordinary shots for 1.25 seconds and fouls for 2 seconds, then animate
  removals for 0.65 seconds. Automatically hand over afterward. Round summaries
  remain visible until **Next round** is clicked (updated after user feedback).
- Pulse and fade a contrasting outlined X marker while retaining player colors.
- Keep out-of-play discs flat in a widened 1.75-inch ditch. Use the nearest
  free parking spot when another disc occupies the landing area.
- Shortened exposed pegs to 0.8 inches and added rubber bodies and brass caps.
- Persist review and completed-round states so reloading does not award twice.

## 1. Confirm scoring and make it understandable

User concern: scores may not be calculating correctly. No specific incorrect
shot or round has been identified yet; correctness is not confirmed by this review.

Current implementation, inspected in `src/game/rules.ts` and `src/main.ts`:

- Ring values are 15, 10, and 5; a sunk disc is worth 20.
- Touching a scoring line yields the lower value. Out-of-play discs score zero.
- Match totals update at the end of a round, after all discs are played.
- Two-player and teams modes award the difference between the two sides' totals.
  Example: Coral totals 65 and Blue totals 40; Coral adds 25 match points and
  Blue adds zero. Partners' points are combined in teams mode.
- Free-for-all currently adds each player's own round total, without subtraction.
  This is the project's selected variant, not a claim about a standard FFA rule.
- The target is 100 match points. A tied lead at or above 100 continues another round.
- Foul resolution removes affected friendly discs, including twenties from that
  shot. Earlier valid twenties remain credited for the round.
- The HUD's large number is the match score. The twenties count is separate;
  it is a count of discs, not points already added to the match score.

Reference: [Crokinole Depot scoring rules](https://www.crokinoledepot.com/crokinole-rules.html)
distinguish conventional scoring by the difference (generally to 100) from
tournament scoring by round wins. Confirm which experience the user expects.

Next-session audit:

- Get a concrete example of an unexpected result and identify the game mode.
- Check twenties, foul cancellation, team ownership, and round-to-match arithmetic.
- Check borderline scoring against the visible line widths and the disc's
  actual contact footprint, particularly after the recent tilt/roll changes.
- Consider a round breakdown showing twenties + rings = raw total, followed by
  the difference awarded to the match score.
- Consider clearer labels for match score, round points, and twenty count.

## 2. Give players time to understand the shot

User request: slightly more time to process the result before the game moves on.

Current behavior: as soon as motion settles, the game resolves the shot and
either rotates to the next player or presents the round result. Fouled discs
disappear immediately.

Proposal, timings not yet agreed:

1. Let all physical motion settle.
2. Hold the shooter's camera for roughly 1–1.5 seconds on an ordinary shot.
3. For a foul, identify the reason and affected discs for roughly 2 seconds,
   then remove them visibly.
4. Rotate and hand over only after the result can be understood.

Consider a longer hold for a round's final shot so the board can be compared with
the score breakdown. Discuss automatic progression versus a Continue button.

## 3. Show which discs a foul removes

User idea: blink affected discs with a slightly transparent red highlight.
Concern: Coral already resembles red. More player colors or a contrasting
removal color could help, but may also make ownership harder to follow.

Suggested direction, not a decision:

- Preserve the disc's ownership color throughout the explanation.
- Use a separate removal marker: a gently pulsing outline/halo with a light
  center and dark border, plus a small X or removal symbol.
- Optionally add a translucent tint, but do not rely on its color alone.
- Use one consistent removal treatment across every player color and board skin.
- Pulse gently once or twice, then fade/remove the marked discs. A static marker
  can convey the same result when reduced motion is preferred.
- Explain the foul in plain language, e.g. “No opponent disc hit — remove these
  two discs.” If a twenty is revoked, explain that in the twenty counter too.

Alternative to discuss: let players choose disc colors before a match, keeping
their assignments stable during play. This can be a separate cosmetic feature;
it need not solve the removal-highlighting problem.

## Open discussion

- Remove the **Preview sounds** button from Settings before the UI is finalized;
  it is a testing tool. Keep it for now (user requested a follow-up note).

- Is the scoring concern about a round's final arithmetic, points not appearing
  immediately after shots, or particular discs being judged incorrectly?
- How much pause feels comfortable, especially for fouls?
- Prefer automatic handover after the explanation, or an explicit Continue?
- Is a pulse-and-fade marker enough, or should removed discs visibly move to the ditch?
