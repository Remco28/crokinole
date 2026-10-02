import { PLAYER_COLORS } from './game/players';

export const DISC_STYLES = ['wood', 'poker'] as const;
export type DiscStyle = typeof DISC_STYLES[number];
export const DISC_PALETTES = [
  { id: 'classic', name: 'Classic', colors: PLAYER_COLORS },
  { id: 'jewel', name: 'Jewel', colors: ['#a63e48', '#347fa5', '#d5a237', '#4c896b'] },
  { id: 'pastel', name: 'Pastel', colors: ['#da8e91', '#89b9cf', '#dfc481', '#a5b894'] },
  { id: 'earth', name: 'Earth', colors: ['#ae6047', '#537989', '#b68b48', '#738360'] },
] as const;
export type DiscPalette = typeof DISC_PALETTES[number]['id'];
export const DISC_EMBLEMS = [
  { id: 'none', name: 'None' }, { id: 'star', name: 'Star' },
  { id: 'spade', name: 'Spade' }, { id: 'leaf', name: 'Leaf' },
  { id: 'moon', name: 'Moon' }, { id: 'bolt', name: 'Bolt' },
] as const;
export type DiscEmblem = typeof DISC_EMBLEMS[number]['id'] | 'photo';
export interface DiscAppearance {
  version: 1;
  style: DiscStyle;
  palette: DiscPalette;
  emblems: DiscEmblem[];
}
export interface DiscAppearanceChange {
  style?: DiscStyle;
  palette?: DiscPalette;
  emblem?: { owner: number; value: DiscEmblem; ifPhoto?: boolean };
}
export function mergeDiscAppearance(current: DiscAppearance, change: DiscAppearanceChange): DiscAppearance {
  return { ...current, style: change.style ?? current.style, palette: change.palette ?? current.palette,
    emblems: current.emblems.map((value, owner) => owner === change.emblem?.owner
      && (!change.emblem.ifPhoto || value === 'photo') ? change.emblem.value : value) };
}
export const DISC_APPEARANCE_KEY = 'crokinole-disc-appearance-v1';
export function defaultDiscAppearance(): DiscAppearance {
  return { version: 1, style: 'wood', palette: 'classic', emblems: ['none', 'none', 'none', 'none'] };
}
export function validDiscAppearance(value: unknown): value is DiscAppearance {
  if (!value || typeof value !== 'object') return false;
  const v = value as DiscAppearance;
  return v.version === 1 && DISC_STYLES.includes(v.style)
    && DISC_PALETTES.some(p => p.id === v.palette)
    && Array.isArray(v.emblems) && v.emblems.length === 4
    && v.emblems.every(e => e === 'photo' || DISC_EMBLEMS.some(a => a.id === e));
}
export function discColors(appearance: DiscAppearance): readonly string[] {
  return DISC_PALETTES.find(p => p.id === appearance.palette)?.colors ?? PLAYER_COLORS;
}
