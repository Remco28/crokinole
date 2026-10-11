# Crokinole rules: findings and the plan

Researched 11 October 2026 against the rulebooks and scoring conventions
actually in use, then compared with this game's implementation in
`src/game/rules.ts` and `src/game/format.ts`. The second half of this document
is the work list that came out of that comparison. Two items from it are done
(marked below); the rest are not started.

## How to read the sources

Three layers of authority, and they do not all say the same thing.

1. **Official tournament rules.** The National Crokinole Association rulebook,
   ratified by the NCA board on 6 May 2026, governs every NCA Tour event.[1]
   The World Crokinole Championship in Tavistock publishes its own rules page
   and runs the highest-attended tournament in the game; on the rules of a
   shot the two texts agree almost word for word.[5]
2. **Tournament organization, not shot rules.** How many games, how ties are
   broken, and what a championship match looks like are set per event. The
   NCA's Season 17 Tournament Tips and Standards (ratified 1 July 2026) lists
   the accepted match methods,[3] and the WCC publishes its own format for
   2026.[6]
3. **Home, bar, and manufacturer rules.** These are where "12 discs, play to
   100, subtract the difference" lives. No association sanctions it, but it is
   what most rule sheets shipped with boards describe, and what players report
   learning from family.[8][11][15]

Where this document says "the official rule", it means the NCA 2026 text,
corroborated by the WCC page unless noted.

## What a round, a game, and a match are

The NCA defines the vocabulary and asks tournaments to use it.[3]

| Term | Official meaning |
| --- | --- |
| Round | One trip around the table until every disc has been shot |
| Game | 4 rounds |
| Match | Whatever the event says: best of X games, or a race to X points |

A round always awards **2 points** to the side with the higher board total, **1
each** on a tie, **0** for a loss.[1][5] The size of the margin does not
matter: winning a round 15–10 pays the same 2 as winning it 120–5.[8]

Disc counts per round:

| Format | Discs | Source |
| --- | --- | --- |
| NCA singles | 8 each | [1] |
| NCA doubles | 6 each, partners opposite, same colour | [1] |
| WCC adult and recreational singles | 8 each | [5] |
| WCC competitive and recreational doubles | 6 each | [5] |
| WCC cue singles | 6 each | [5] |
| WCC cue doubles | 5 each | [5] |
| WCC junior and intermediate | 6 each | [5] |
| Home / board-maker singles | 12 each | [11][10] |
| Home doubles | 6 each (the dozen split between partners) | [11][12] |

The 8-disc singles count is a tournament choice made so that many games fit in
a day, not a claim that 12 is wrong at home. Players who have done both say
exactly that.[15][16]

## Scoring the board

Both rulebooks score the same zones: the centre hole is 20, the region inside
the pegs is 15, the region outside the pegs is 10, and the outer region is
5.[1][5]

The line rule is the part most often misremembered. A disc scores **the lowest
value of any region it touches**, and the test is whether the **bottom edge of
the disc is over any part of the line**, not where the edge appears to be from
above.[1] A 20 only counts if the disc is **completely in the hole and lying
flat**; a disc leaning into the hole is not a 20.[1][11]

Sunk 20s are lifted out after the turn, kept where everyone can see them, and
added at the end of the round. They cannot be knocked back out.[1][5]

### Stacks and leans

The NCA publishes a separate edge-case sheet, marked as proposals rather than
ratified rules, for discs that are not lying flat.[2][4] It is worth knowing
because it comes up in video review and the game never models it:

- A disc leaning on a peg scores the region where it touches the board; the
  peg is ignored.
- A disc leaning on another disc scores the lower of the two regions involved.
- A disc leaning on a sunk 20 scores wherever it actually touches the board.
- A disc stacked flat on another scores exactly what the disc under it scores.
- A disc resting on two or more discs scores the lowest region among them.

## The two scoring systems

### Round points (NCA / WCC)

This is the only scoring used at NCA Tour events and at the Worlds. Four
rounds make a game, so a game score looks like 5–3 or 4–4, never 60–30.[1][5]
Ties are legal in round-robin play; a 4–4 game simply stands, and standings
use points first, then 20s, then head-to-head, then a shoot-out.[3][5]

A shoot-out is 12 discs each at the 20 (6 each in doubles), every disc removed
after the shot, and it repeats until the tie breaks.[3][5]

### Differential to 100 (home)

After the round, subtract the lower board total from the higher and give the
difference to the winner. Nothing is awarded on a tie. Play until someone
reaches 100.[8][11] Wikipedia describes this, not round points, as the ordinary
way the score is added up, and says play continues until a predetermined total
is reached.[10]

Variants that show up often enough to name:

- **Play to 50, 150, or 200** instead of 100, to shorten or lengthen the
  evening.[11]
- **Simple (non-differential) scoring**, where each side keeps its raw total
  and nobody subtracts. Woodestic lists it as a named alternative, and
  Crokinole Canada uses it for four-player free-for-all, played to 120 or
  more, because subtraction has no meaning with four separate totals.[11][12]
- **"Ahead by 100"**, reported by Tracey Boards from one family's house rules:
  each round's difference is applied against the trailing side's banked points,
  so the leader must be clear by a full 100. Games run very long.[8]
- **Best of 5 rounds** at a bar, so people can rotate onto the board instead of
  waiting out a match to 100.[15] A board maker's rules page describes the same
  split and calls race to 9 a way to keep the NCA scoring while guaranteeing a
  winner,[9] and a bar that keeps a board out for walk-up play posts both systems
  and lets the table pick.[13]

## Match formats at the top level

These are the formats used when a match has to produce a winner.

**World Crokinole Championship, 2026.**[6] Preliminary play is timed
round-robin: singles play 10 games of 8 minutes, doubles play 8 games of 13
minutes. Championship matches differ by division:

- Doubles championship and the 3rd-place match are **first to 7 points**.
- Singles quarterfinals, semifinals, and finals are **best 2 of 3 games**, and
  each game is won by the first player to **5 points**. A game tied 4–4 after
  four rounds plays a fifth round, because those games must have a winner.
  Championship matches are untimed.
- The higher-ranked player or team chooses who shoots first in game one; the
  start then alternates each game.

**NCA Tour.**[3] Elimination matches are one of three methods, chosen and
announced before the event:

1. **Best of three games.** Each game is four rounds; a tied game plays a
   fifth round. First to win two games.
2. **The Quinte Convention.** Up to three games, ties allowed. Winner is the
   first to win two games, or to tie two and win one. If still level after
   three games, play additional rounds until someone leads after an even number
   of them.
3. **Race to X**, usually **9 or 11**. Rounds continue until someone reaches
   the total.

Two Ontario refinements exist to neutralize the last-shot advantage, and both
have mostly fallen out of use because matches ran past an hour:[18]

- The **Wimbledon rule**, added to best-of-three: if the deciding game is tied
  4–4, the winner is the first to lead after an even number of further rounds
  (6, 8, 10…).[3]
- The Quinte Convention itself, which never plays a single sudden-death round.

Nathan Walsh's count of roughly 3,000 recorded games puts the last-shot
("hammer") advantage at about **55–45 in singles and 52–48 in doubles**, which
shrinks to roughly a 51–49 edge over a full race to 9. That is the published
argument for why sudden death is acceptable.[18]

**Timed play.** A singles game is given 8 minutes and a doubles game 13 to 15,
with about 2 minutes between games.[3] When time expires, one extra shot is
allowed if needed to equalize the number of shots taken; unshot discs stay
unshot, and the board is scored as it stands.[1][5] If a round was never
started, the NCA's posted additional rules award each side 1 point per round
not started.[3] There is **no per-shot clock** in any published rulebook. A
20-second or 60-second shot clock is a house or broadcast device, not a
tournament rule.

## Who starts

- Singles: the two players alternate who starts each round, and alternate who
  starts each game of a multi-game match.[1]
- Doubles: the starting seat moves one player clockwise each round. Partners
  may choose which of them starts when their team wins the first shot. Teams
  alternate who starts each game.[1]
- Home sheets are looser: either the start rotates clockwise, or the loser of
  the round chooses who starts the next one.[11]

## The rules of a shot

### Where the disc starts

The disc must start flat and stationary, touching some part of the player's
outer boundary line, and it may also touch a quadrant line.[1][5] Sitting
across the quadrant line is legal as long as contact with the line remains.
The stricter "no more than halfway over the line" placement is a house
restriction for advanced players, not an official rule.[11]

### A valid shot

If any opposing disc is in play, at least one of the shooter's discs must
strike an opposing disc, either directly or by bumping one of the shooter's own
discs into it.[1][5] In doubles, "own" includes the partner's discs, since
partners share a colour: a combination off a teammate's disc is valid, and a
failed shot removes the teammate's discs that were struck too.[12]

If no opposing disc is in play, the shot must finish with the shooting disc, or
at least one disc it struck, **touching or inside the 15 line**. A 20 counts as
inside the 15. The NCA calls this the No Hiding rule.[1][5]

### A foul

If the shot is not valid, the shooting disc and **all of the discs struck**,
including any 20s made on that shot, are removed and score nothing.[1] The WCC
text is narrower on paper: it says the shooting disc and the other discs **of
the same colour** that were struck.[5] In two-colour play that is the same
rule. The NCA wording ("all of the other discs that were struck") is the one to
follow, and it matters in a three- or four-colour game.

An illegal 20 does not count. Players answering a rules question on r/Crokinole
apply this the same way: sink a 20 without the required contact and the 20 is
pulled, along with every own disc the shot touched.[17]

### Out of play, the spinning disc, and damage

- A disc that touches or crosses the outer line is out and goes to the ditch
  before the next turn, where it stays for the round.[1]
- **Spinning disc rule:** if a disc touches or crosses the outer line, strikes
  nothing but the playing surface while out there, and spins back inside under
  its own momentum, it is still in play.[1][5]
- **Damage stays:** if a disc leaves, hits the rail or discs in the ditch, and
  re-enters, that disc is out, but every disc it moved stays moved and any 20
  it caused counts.[1][5]

Damage stays is newer than it feels. Through 2010 the Worlds repaired the
board: a re-entering disc was removed and everything it moved was put back.[21]
A 2004 player survey favoured repair by 68.5% to 27.9%. The World Crokinole
League adopted damage stays in 2009, the Worlds followed in 2010, and it has
been the rule everywhere sanctioned since.[20] It is the correct rule to
implement, with the caveat that it was a contested change and some players
still dislike it.

### The body

At least one part of the player's seat must stay on the chair (the one-cheek
rule), every leg of the chair must stay on the floor, and only the feet may
touch the floor.[1][5] During the shot only the shooting hand, wrist, and
forearm may touch the board or table. The disc must be struck with one or more
fingers; no finger guards. Cue divisions exist at the Worlds and use a cue
instead, with lower disc counts.[5]

The 2026 NCA text added two allowances the older reprints lack: a player may
clear the ditch and their own quadrant of wax before shooting, and may move the
board at the end of a round to retrieve a disc lost underneath it.[1][7]

## Free-for-all and other formats

Neither rulebook defines a four-player free-for-all. The NCA says outright that
Tier 1 and Tier 2 events accept only singles and fixed-partnership doubles, and
that three-player singles, four-player singles, progressive doubles, Waterloo
doubles, five-hole, and 100-point matches are experimental formats permitted at
Tier 3.[3]

What exists in print for free-for-all:

- Crokinole Canada: 6 discs each, four colours, each player keeps their own
  total (no cancellation), play to 120 or more, otherwise normal shot
  rules.[12]
- Woodestic, for three individual players: 8 discs each, simple scoring rather
  than differential, because subtraction does not work with three totals.[11]
- A Houston league lists cutthroat as a house format and does not specify disc
  counts.[14]

So "6 each, own total, play to 100" is a defensible house rule. It is not an
official one, and 100 rather than 120 is a choice, not a standard.

**Progressive doubles** (also called St. Jacobs doubles) keeps doubles shot
rules but rotates partners every game, so the result is an individual
ranking. The first NCA event to use it, Owen Sound 2022, ran 7 games in the
morning groups and finished each pool with a singles race.[19]

**Five-hole crokinole** is a different board, named by the NCA as an
experimental format.[3] It needs holes the standard board does not have, so it
is out of scope here. A BoardGameGeek listing for it would not load, so I have
no verified description of how those holes score.[unverified]

## Corrections after a second pass (11 October 2026)

The first draft of this document was checked again against the code, not just
the rulebooks, after Frank questioned several of its findings. Two of them do
not survive that check.

**The open-board line test is already correct.** `inspectShot` accepts an
open-board shot when the disc's inner edge is at or inside the outer edge of
the 15 line:

```
Math.hypot(d.x, d.y) - DISC.contactRadius <= BOARD.ring15 + BOARD.lineWidth / 2
```

A disc that only toes the 15 line stays in play, which is what the NCA
requires ("touching or within the 15 line").[1] The first draft read that
comparison backwards. Nothing needs to change here.

**Sunk 20s are already lifted out of the hole.** `holeOccupied` in
`src/sim/physics.ts` only counts a sunk disc whose `holeCleared` flag is still
false, and `finishReview` sets that flag at the end of the turn, before the
next player shoots. Later shots in the round are not blocked. The disc stays
visible in the pocket during the shot review and is collected at handover,
which is what the README already describes. The first draft missed the flag.

**A foul removing only your own discs is the right call, and the rulebooks
agree.** The WCC text says it outright: the shooting disc and the other discs
*of the same colour* that were struck come off, and anything an opponent's
disc did stands.[5] The NCA's "all of the other discs that were struck" reads
wider, but in the only formats the NCA plays — two colours — it describes the
same thing, and the NCA has never written a rule for three or four colours.[1]
Reading it as "punish the other players too" would let a foul steal an
opponent's 20, which is the opposite of what a foul is for. The game's
behaviour matches the WCC wording and the spirit of both. No change.

**The 60-second shot clock stays as it is.** It is a house rule this game
added so a pass-and-play turn cannot run forever. Tournament time limits are
per game (8 minutes singles, 13 to 15 doubles), not per shot,[3] so the clock
should stay labelled as this game's own rule rather than as an official one.

Checked against `src/game/rules.ts` and `src/game/format.ts` as of this
writing. "Wrong" means it contradicts both the NCA text and the common home
rule. "Choice" means the sources themselves disagree and the game picked one.

### Checked again, and not a bug

1. **Discs touching the outer line are removed, and that is the rule.**
   `inspectShot` removes a disc only when its footprint reaches the 5 line:

   ```
   Math.hypot(d.x, d.y) + DISC.contactRadius >= BOARD.ring5 - BOARD.lineWidth / 2
   ```

   The 5 line is the 12-inch circle, one inch in from the edge of the surface,
   which is the outer boundary line the rules mean.[1][3] A disc halfway over
   that line is touching it and comes off; a disc sitting just inside it
   scores 5 and stays. That is what competitive players do, and it is what the
   code does. An earlier draft of this document read the comparison as
   sweeping discs near the line. It does not.

2. **Nothing leaves and comes back.** The game has no rail and no ditch
   re-entry, so it implements neither the spinning-disc rule nor damage
   stays.[1] This is a missing feature, not a wrong ruling, and it is not what
   the name suggests. It has nothing to do with waiting for a disc to stop
   spinning — both rulebooks already require a player to wait until all motion
   has ceased before shooting, and the game does that.[1][5] Damage stays is
   about a disc that leaves the surface, hits the rail or a disc in the ditch,
   and bounces back on: that disc is dead and goes to the ditch, but every disc
   it knocked on its way back stays where it landed, and any 20 it caused still
   counts. The older rule, used at the Worlds until 2010, put those discs back
   where they were.[20][21] Without a rail the game cannot reproduce either
   version, so this waits until a rail exists.

### Withdrawn after the second pass

3. **Open-board shots and the 15 line.** Withdrawn. See the corrections
   above: a disc toeing the line is already accepted.

4. **Foul removal.** Withdrawn. Removing only the shooter's own discs matches
   the WCC text and is the right reading of the NCA text.

5. **Sunk 20s blocking the hole.** Withdrawn. The hole is freed at the end of
   the turn, before the next shot.

6. **The last-round win condition.** Still a small ambiguity, not a bug.
   Classic ends when one side is alone at or above 100. Woodestic's home sheet
   says that if both sides cross 100 on the same round, the one who crossed by
   more wins, and a dead heat is a tie.[11] The game plays on whenever the lead
   is shared, which is a reasonable reading but not the stated one.

### A choice, and a defensible one

7. **Classic is 12 discs, differential, first to 100.** Correct as a home
   format, and it is what the game's own earlier notes call "traditional".[8][11]
   It is not, and has never been, the tournament game. Worth labelling as
   "house rules" in the interface so players arriving from a tournament video
   are not surprised.

8. **Tournament is 8 and 6 discs, 2/1/0, four rounds, extra round on a tied
   game, best of three.** This matches the NCA and the WCC's championship
   matches, with one caveat: the WCC's singles championship is first to 5 per
   game rather than a fixed four rounds, and its doubles championship is first
   to 7, not best of three.[6] The game's race to 9 is a real NCA elimination
   method; 11 is the other common target.[3] The Croke scoring app, built for
    league and tournament tables, offers exactly these: a fixed four games, or
    first to 5, 7, 9, or 11.[22]

9. **Free-for-all keeps raw totals instead of round points.** Right instinct,
   since round points need two sides. The disc count (6) matches Crokinole
   Canada's version; the target (100 rather than 120) is the game's own
   choice.[12]

10. **The shot clock. Done.** No time limit is now the default, with 30 and 60
    seconds still available. A saved choice is kept. It remains this game's own
    rule, not part of any published ruleset — tournament time limits are per
    game, not per shot.[3]

### Not a rules question: the one-cheek camera

The seat rule used to be a fraction of the camera's tilt range.
`SEATED_LEVEL` was 0.5, and `isSeated` returned true for any camera level at
or above it (`src/render/orbit.ts`). Level 0 is Overview (25° from vertical)
and level 1 is Table (62°), so the cutoff landed at about 43.5° from vertical —
well above the Table view. The view each turn starts in was therefore counted
as seated, and so was a good stretch of the tilt above it. The number had been
placed for feel, not derived from a person.

**Done.** The limit now comes from a body. `src/render/seat.ts` takes a seat
height, a table height, the board thickness and a seated eye height, and
returns the camera angle at which that eye is looking at the board centre.
`isSeated` compares the camera's real angle and distance against it.

The reference player is a tall man: the 95th percentile of seated eye height
from the 1988 US Army survey (ANSUR), 33.4 inches from the seat to the outer
corner of the eye, sitting upright.[25] That is roughly an 80th-percentile
standing height with a long torso — NHANES 2015–2018 puts men 20 and over at
71.0 inches for the 75th percentile and 72.0 for the 85th.[26] The furniture is
a 30-inch dining table and a 17-inch seat, the low end of the usual 17–19
range,[28] and this board is 1.8 inches thick. The eye ends up 18.6 inches above
the playing surface, which at the Table framing distance of 42 inches is 63.6°
from vertical. Table is 62°, so the view a turn starts in is the top of seated,
and anything higher is standing.

The rule is one cheek on the chair, not sitting bolt upright, so a real eye
can be lower than the erect measurement but not higher. The erect 95th
percentile is the ceiling. ANSUR II (2012) gives a slightly taller figure, 86.0
cm (33.9 in) at the male 95th, but that sample is soldiers aged 17–58 rather
than the general population, so the 1988 number is the one used.[27] The
constants are named and sourced, and `tests/seat.test.ts` pins the angle, so
the threshold can be moved later without hunting through the tilt code.

11. **Starting position.** The game alternates the opening shot correctly for
    singles and rotates it correctly for four players.[1] It does not offer the
    doubles rule that the starting team chooses which partner shoots first.

### Cosmetic, not a rules problem

The board dimensions match the NCA tournament standard: 26-inch playing
surface, rings at 4, 8, and 12 inches, the shooting line one inch inside the
edge.[3] The centre hole is specified at 1⅜ inches across; the game uses that.

## What I could not verify

- The Masters Traditional Games rules page returned no content, so a claim on
  their site is not used here.
- The NCA edge-case sheet is explicitly a set of proposals, and I found no
  record of the board ratifying it.[4]
- I found no published disc count or target score for four-player free-for-all
  from either association. Both numbers in the game come from house sources.
- Whether "all discs struck" or "own colour only" is intended for multi-colour
  play has no official answer, because multi-colour play is not an official
  format.[1][5]

## The plan

What the comparison leaves to do, in the order it should be done. Nothing here
changes physics, scoring, or the pinned audio.

### Done

- **No time limit is the default.** Settings still offers 30 and 60 seconds,
  and a saved choice is kept. A browser that has never chosen keeps the clock
  off.
- **The one-cheek limit comes from a body.** See the camera section above.
  `src/render/seat.ts` holds the numbers, `tests/seat.test.ts` pins the angle,
  and raising the camera above the Table view now counts as standing.

### Not started

1. **Say what the formats are, in the interface.** Classic is a house format
   (12 discs, the difference, first to 100) and should be labelled that way, so
   a player arriving from a tournament video is not surprised.[8][11] The
   tournament option should note that the Worlds' own finals differ: singles is
   best of three with each game first to 5, doubles is first to 7, and 11 is
   the other common race target.[3][6]
2. **The last-round tie at 100.** Decide, and write down, what happens when
   both sides cross 100 on the same round. The home sheet that states it gives
   the win to whoever crossed by more, and calls a dead heat a tie.[11] The
   game currently plays on. Either reading is defensible; it should be a
   choice rather than an accident.
3. **Damage stays, only once a rail exists.** A disc that leaves, hits the rail
   or a ditched disc, and comes back is dead, and everything it moved
   stands.[1] There is no rail today, so building the rule first would be
   guessing. It waits for that work.
4. **Leave free-for-all as it is.** Six discs each and raw totals match the
   only published house version; 100 rather than 120 is this game's choice and
   is fine.[12] No association publishes a rule for it.[3]

### Explicitly not changing

- The open-board test. A disc toeing the 15 line already stays in play.[1]
- Foul removal. Only the shooter's own discs come off, which is what the WCC
  text says and the right reading of the NCA text.[1][5]
- Sunk 20s. The hole is cleared at the end of the turn, before the next shot.
- The outer line. A disc touching it is already removed, and a disc inside it
  already scores 5.[1]
- The shot clock as a feature. Only its default changed.

## Sources

[1] NCA Official Rules of Crokinole, ratified 6 May 2026. https://nationalcrokinoleassociation.com/wp-content/uploads/2026/05/NCA-Official-Rules-of-Crokinole.docx.pdf

[2] NCA Resources page. https://nationalcrokinoleassociation.com/resources

[3] NCA Tournament Tips and Standards, Season 17, ratified 1 July 2026. https://nationalcrokinoleassociation.com/wp-content/uploads/2026/07/Season-17-Tournament-Tips-and-Standards_v2.pdf

[4] NCA Crokinole Edge Cases (stacked and leaning discs; proposals). https://nationalcrokinoleassociation.com/wp-content/uploads/2026/05/Crokinole-Edge-Cases.pdf

[5] World Crokinole Championship, The Game: rules and scoring. https://www.worldcrokinole.com/thegame.html

[6] World Crokinole Championship, 2026 tournament format. https://www.worldcrokinole.com/tournament.html

[7] Tracey Boards, reprint of the NCA rules (older than the May 2026 text). https://traceyboards.com/nca-rules

[8] Tracey Boards, the two scoring systems explained, including the "ahead by 100" house variant. https://traceyboards.com/crokinole-scoring-explained

[9] Crok Shop, rules summary including race to 9. https://crok.shop/blogs/news/crokinole-rules

[10] Wikipedia, Crokinole (gameplay and the Muskoka variation). https://en.wikipedia.org/wiki/Crokinole

[11] Woodestic / Cogitate Games, rule sheet shipped with a board (12 discs, to 100, three-player options). https://woodestic.com/wp-content/uploads/crokinole-game-rules-eng.pdf

[12] Crokinole Canada, four-player methods. https://crokinole.ca/pages/4-colors-player-crokinole

[13] Round Table Games (Carver, MA), bar-table rules card. https://www.roundtablegamesma.com/crokinole

[14] CLUTCH20 (Houston), league summary and named house variants. https://clutch20.com/rules.html

[15] r/Crokinole, "Which scoring to use", January 2021. https://www.reddit.com/r/Crokinole/comments/l1qlkn/which_scoring_to_use

[16] r/Crokinole, what "10 games" means at the Worlds, January 2020. https://www.reddit.com/r/Crokinole/comments/ekwmzv/play_10_games_world_crokinole_championship_rules

[17] r/Crokinole, an illegal 20 does not count, March 2025. https://www.reddit.com/r/Crokinole/comments/1jcakl1/crokinole_rules

[18] Nathan Walsh, CrokinoleCentre, sudden death versus the Quinte Convention, 11 September 2023. http://crokinolecentre.com/2023-09-11-sudden-death-vs-quinte-convention

[19] Nathan Walsh, CrokinoleCentre, the first NCA progressive doubles event, 11 November 2022. http://crokinolecentre.com/2022-11-11-reinman-wins-first-ever-nca

[20] Nathan Walsh, CrokinoleCentre, history of the damage rule, 12 May 2020. http://crokinolecentre.com/2020-05-12-irreparable-damage-man-yells-crokinole

[21] World Crokinole Championship rules as archived in August 2007 (damage repaired). https://web.archive.org/web/20070831050327/http://www.worldcrokinole.com:80/rules.html

[22] Croke, the community scoring app: its match setup offers fixed 4 games and first to 5, 7, 9, or 11, matching the formats above. https://croke.app/player

[25] Gordon, C.C. et al., 1988 Anthropometric Survey of US Army Personnel (ANSUR), summary statistics, March 1989. Seated eye height, 1,774 men: mean 31.18 in, 95th percentile 33.39 in, 99th percentile 34.23 in. Reproduced by the NC State Ergonomics Center. https://multisite.eos.ncsu.edu/www-ergocenter-ncsu-edu/wp-content/uploads/sites/18/2016/06/Anthropometric-Detailed-Data-Tables.pdf

[26] Fryar, C.D. et al., Anthropometric Reference Data for Children and Adults: United States, 2015–2018. National Center for Health Statistics, Vital and Health Statistics Series 3, Number 46, January 2021. Table 12, height of men 20 and over: 75th percentile 71.0 in, 85th percentile 72.0 in. https://www.cdc.gov/nchs/data/series/sr_03/sr03-046-508.pdf

[27] ANSUR II (2012 US Army survey), seated eye height, men: 5th percentile 75.0 cm, 50th 80.4 cm, 95th 86.0 cm. Tabulated by ErgoAssessment from the public data release. https://ergoassessment.cam/ansur-2-data-explorer/

[28] Coleman Furniture, standard dining table height guide: tabletop 28 to 30 inches from the floor, dining chair seat 17 to 19 inches, 10 to 12 inches of clearance between them. https://colemanfurniture.com/resources/buying-guides/standard-dining-table-height-guide
