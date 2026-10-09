import { describe, expect, it } from 'vitest';
import { makeDisc } from '../src/sim/physics';
import { RACE_TARGET, CLASSIC, TOURNAMENT_ROUNDS, completeTournamentRound, discsPerPlayer, discsPerSide, formatAllowsMode, formatKey, gamesToWin, isGameOver, parseFormatKey, readFormat, roundPoints, startingPlayer, type MatchFormat } from '../src/game/format';
import { readMatch } from '../src/game/session';

const single: MatchFormat = { scoring: 'tournament', games: 1 };
const best3: MatchFormat = { scoring: 'tournament', games: 3 };
// A twenty-hole disc is worth 20 and a disc at 3" from centre is worth 15.
const fifteen = (id: number, owner: number) => makeDisc(id, owner, 3, 0);
const ten = (id: number, owner: number) => makeDisc(id, owner, 5, 0);

describe('tournament round points', () => {
  it('gives 2 to the higher total, 1 each on a tie and 0 to the lower', () => {
    expect(roundPoints(30, 15)).toBe(2);
    expect(roundPoints(15, 15)).toBe(1);
    expect(roundPoints(0, 15)).toBe(0);
  });
  it('awards round points instead of the score difference', () => {
    const discs = [fifteen(1, 0), fifteen(2, 0), ten(3, 1)];
    const result = completeTournamentRound(discs, 'duel', [0, 0], 1, single, [0, 0]);
    expect(result.sides.map(s => s.total)).toEqual([30, 10]);
    expect(result.after).toEqual([2, 0]);
    expect(result.gameOver).toBe(false);
  });
  it('splits a tied round', () => {
    const result = completeTournamentRound([fifteen(1, 0), fifteen(2, 1)], 'duel', [2, 0], 2, single, [0, 0]);
    expect(result.after).toEqual([3, 1]);
  });
  it('scores teams as two sides', () => {
    const result = completeTournamentRound([fifteen(1, 0), ten(2, 1), ten(3, 3)], 'teams', [0, 0], 1, single, [0, 0]);
    expect(result.sides.map(s => s.total)).toEqual([15, 20]);
    expect(result.after).toEqual([0, 2]);
  });
});

describe('tournament game and match end', () => {
  it('keeps playing until the fourth round has been scored', () => {
    expect(completeTournamentRound([fifteen(1, 0)], 'duel', [6, 0], TOURNAMENT_ROUNDS - 1, single, [0, 0]).gameOver).toBe(false);
    const done = completeTournamentRound([fifteen(1, 0)], 'duel', [6, 0], TOURNAMENT_ROUNDS, single, [0, 0]);
    expect(done.gameOver).toBe(true); expect(done.gameWinner).toBe(0); expect(done.winner).toBe(0);
  });
  it('plays an extra round when the game is tied after four rounds', () => {
    const tied = completeTournamentRound([fifteen(1, 0), fifteen(2, 1)], 'duel', [5, 5], 4, single, [0, 0]);
    expect(tied.after).toEqual([6, 6]); expect(tied.gameOver).toBe(false); expect(tied.winner).toBeNull();
    const extra = completeTournamentRound([fifteen(1, 0)], 'duel', [6, 6], 5, single, [0, 0]);
    expect(extra.gameOver).toBe(true); expect(extra.winner).toBe(0);
  });
  it('lets the match continue after a game when playing the best of three', () => {
    const first = completeTournamentRound([fifteen(1, 0)], 'duel', [6, 0], 4, best3, [0, 0]);
    expect(first.gameOver).toBe(true); expect(first.gamesWon).toEqual([1, 0]); expect(first.winner).toBeNull();
    expect(isGameOver(first)).toBe(true);
    const clinch = completeTournamentRound([fifteen(1, 1)], 'duel', [0, 6], 4, best3, [1, 0]);
    expect(clinch.gamesWon).toEqual([1, 1]); expect(clinch.winner).toBeNull();
    const last = completeTournamentRound([fifteen(1, 0)], 'duel', [6, 0], 4, best3, [1, 1]);
    expect(last.gamesWon).toEqual([2, 1]); expect(last.winner).toBe(0);
    expect(gamesToWin(best3)).toBe(2); expect(gamesToWin(single)).toBe(1);
  });
  it('does not report a round before the fourth as a finished game', () => {
    expect(isGameOver(completeTournamentRound([fifteen(1, 0)], 'duel', [0, 0], 1, single, [0, 0]))).toBe(false);
    expect(isGameOver(null)).toBe(false);
  });
});

describe('race to 9', () => {
  const race = parseFormatKey('tournament-race9')!;
  it('parses and round-trips', () => {
    expect(race).toEqual({ scoring: 'tournament', games: 1, raceTo: RACE_TARGET }); expect(formatKey(race)).toBe('tournament-race9');
  });
  it('does not end at four rounds while nobody has reached 9', () => {
    const r = completeTournamentRound([fifteen(1, 0)], 'duel', [4, 2], 4, race, [0, 0]);
    expect(r.after).toEqual([6, 2]); expect(r.gameOver).toBe(false); expect(r.winner).toBeNull();
  });
  it('finishes the round that reaches 9 and names the leader', () => {
    const r = completeTournamentRound([fifteen(1, 0)], 'duel', [7, 6], 5, race, [0, 0]);
    expect(r.after).toEqual([9, 6]); expect(r.winner).toBe(0); expect(r.gameOver).toBe(true);
  });
  it('plays on when both reach 9 level, and a tied round can pass 9 together', () => {
    const tied = completeTournamentRound([fifteen(1, 0), fifteen(2, 1)], 'duel', [8, 8], 6, race, [0, 0]);
    expect(tied.after).toEqual([9, 9]); expect(tied.winner).toBeNull();
    const next = completeTournamentRound([fifteen(1, 1)], 'duel', [9, 9], 7, race, [0, 0]);
    expect(next.winner).toBe(1);
  });
  it('is not allowed in free-for-all and loads from a save', () => {
    expect(formatAllowsMode(race, 'ffa')).toBe(false);
    expect(readFormat({ mode: 'duel', scores: [3, 2], used: [0, 0] }, { scoring: 'tournament-race9' })?.format).toEqual(race);
  });
});

describe('format setup', () => {
  it('uses 8 discs each in tournament duels and keeps classic at 12', () => {
    expect(discsPerPlayer('duel', single)).toBe(8); expect(discsPerPlayer('duel', CLASSIC)).toBe(12);
    expect(discsPerPlayer('teams', single)).toBe(6); expect(discsPerSide('teams', single)).toBe(12); expect(discsPerSide('duel', single)).toBe(8);
  });
  it('rotates the first shooter by round and by game', () => {
    expect([1, 2, 3, 4].map(r => startingPlayer(r, 1, 2))).toEqual([0, 1, 0, 1]);
    expect(startingPlayer(1, 2, 2)).toBe(1); expect(startingPlayer(1, 2, 4)).toBe(1);
  });
  it('round-trips format keys and keeps free-for-all classic', () => {
    for (const f of [CLASSIC, single, best3]) expect(parseFormatKey(formatKey(f))).toEqual(f);
    expect(parseFormatKey('nonsense')).toBeNull();
    expect(formatAllowsMode(single, 'ffa')).toBe(false); expect(formatAllowsMode(CLASSIC, 'ffa')).toBe(true); expect(formatAllowsMode(best3, 'teams')).toBe(true);
  });
});

describe('saved format validation', () => {
  const duel = { mode: 'duel' as const, scores: [0, 0], used: [3, 3] };
  it('reads a save with no format fields as a classic one-game match', () => {
    expect(readFormat(duel, {})).toEqual({ format: CLASSIC, game: 1, gamesWon: [0, 0] });
  });
  it('accepts a tournament save and rejects impossible ones', () => {
    expect(readFormat(duel, { scoring: 'tournament-3', game: 2, gamesWon: [1, 0] })).toEqual({ format: best3, game: 2, gamesWon: [1, 0] });
    expect(readFormat(duel, { scoring: 'bogus' })).toBeNull();
    expect(readFormat({ ...duel, mode: 'ffa', scores: [0, 0, 0, 0], used: [0, 0, 0, 0] }, { scoring: 'tournament-1' })).toBeNull();
    expect(readFormat(duel, { scoring: 'tournament-1', game: 2 })).toBeNull();
    expect(readFormat(duel, { scoring: 'tournament-3', game: 1, gamesWon: [3, 0] })).toBeNull();
    expect(readFormat(duel, { scoring: 'tournament-3', gamesWon: [0] })).toBeNull();
    expect(readFormat({ ...duel, used: [9, 0] }, { scoring: 'tournament-1' })).toBeNull();
    expect(readFormat({ ...duel, used: [9, 0] }, {})).not.toBeNull();
  });
  it('survives the existing session reader so format fields can ride along', () => {
    const raw = JSON.stringify({ version: 2, mode: 'duel', player: 0, round: 2, id: 0, discs: [], scores: [2, 0], used: [0, 0], phase: 'pass', scoring: 'tournament-1', game: 1, gamesWon: [0, 0] });
    const data = readMatch(raw)!; expect(data).not.toBeNull();
    expect(readFormat(data, data as unknown as Record<string, unknown>)?.format).toEqual(single);
  });
});
