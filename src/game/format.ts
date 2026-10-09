import type { Disc } from '../sim/physics';
import { roundBreakdown, type Mode, type RoundResult } from './rules';

// Match formats live beside, not inside, rules.ts and session.ts: those stay
// byte-exact to the accepted physics release, so scoring variants build on them.
//
// Classic: 12 discs each (duel), rounds add the difference, first to 100.
// Tournament (World Crokinole Championship): 8 discs each (duel) or 6 per
// partner (teams). The side with the higher round total takes 2 points, a tie
// gives 1 each. Four rounds make a game, and a tied game plays extra rounds.
// A match is one game, or the best of three.
export type Scoring = 'classic' | 'tournament';
export interface MatchFormat { scoring: Scoring; games: 1 | 3 }
export const CLASSIC: MatchFormat = { scoring: 'classic', games: 1 };
export const TOURNAMENT_ROUNDS = 4;

export type FormatKey = 'classic' | 'tournament-1' | 'tournament-3';
export const formatKey = (f: MatchFormat): FormatKey => f.scoring === 'classic' ? 'classic' : f.games === 3 ? 'tournament-3' : 'tournament-1';
export function parseFormatKey(value: unknown): MatchFormat | null {
  if (value === 'classic') return CLASSIC;
  if (value === 'tournament-1') return { scoring: 'tournament', games: 1 };
  if (value === 'tournament-3') return { scoring: 'tournament', games: 3 };
  return null;
}
// Free-for-all has no head-to-head winner, so it cannot use round points.
export const formatAllowsMode = (f: MatchFormat, mode: Mode) => f.scoring === 'classic' || mode !== 'ffa';
export const gamesToWin = (f: MatchFormat) => (f.games + 1) / 2;
export function discsPerPlayer(mode: Mode, f: MatchFormat): number {
  if (mode === 'duel') return f.scoring === 'tournament' ? 8 : 12;
  return 6;
}
export const discsPerSide = (mode: Mode, f: MatchFormat) => discsPerPlayer(mode, f) * (mode === 'teams' ? 2 : 1);
// The first shooter alternates each round; each new game of a match starts
// with the side that did not start the previous one.
export const startingPlayer = (round: number, game: number, players: number) => (round - 1 + game - 1) % players;
export const roundPoints = (own: number, other: number) => own > other ? 2 : own === other ? 1 : 0;

export interface FormatRoundResult extends RoundResult {
  gameOver: boolean; gameWinner: number | null; gamesWon: number[];
}
export function completeTournamentRound(discs: Disc[], mode: Mode, scores: number[], round: number, format: MatchFormat, gamesWon: number[]): FormatRoundResult {
  const sides = roundBreakdown(discs, mode);
  sides.forEach((row, i) => { row.awarded = roundPoints(row.total, sides[1 - i].total); });
  const after = scores.map((score, i) => score + sides[i].awarded);
  const high = Math.max(...after), leaders = after.map((score, i) => score === high ? i : -1).filter(i => i >= 0);
  const gameWinner = round >= TOURNAMENT_ROUNDS && leaders.length === 1 ? leaders[0] : null;
  const won = gamesWon.map((n, i) => n + (i === gameWinner ? 1 : 0));
  const winner = gameWinner !== null && won[gameWinner] >= gamesToWin(format) ? gameWinner : null;
  return { sides, before: [...scores], after, winner, gameOver: gameWinner !== null, gameWinner, gamesWon: won };
}
export const isGameOver = (result: unknown): boolean => !!result && typeof result === 'object' && (result as { gameOver?: unknown }).gameOver === true;

// Format fields saved beside a match. Older saves have none and are classic.
export interface SavedFormat { format: MatchFormat; game: number; gamesWon: number[] }
const natural = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
export function readFormat(data: { mode: Mode; scores: number[]; used: number[] }, raw: Record<string, unknown>): SavedFormat | null {
  const format = raw.scoring === undefined ? CLASSIC : parseFormatKey(raw.scoring);
  if (!format || !formatAllowsMode(format, data.mode)) return null;
  const game = raw.game === undefined ? 1 : raw.game;
  const gamesWon = raw.gamesWon === undefined ? data.scores.map(() => 0) : raw.gamesWon;
  if (!natural(game) || game < 1 || game > format.games) return null;
  if (!Array.isArray(gamesWon) || gamesWon.length !== data.scores.length || !gamesWon.every(natural)) return null;
  if (gamesWon.some(n => n > gamesToWin(format))) return null;
  if (data.used.some(n => n > discsPerPlayer(data.mode, format))) return null;
  return { format, game, gamesWon };
}
