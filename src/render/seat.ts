// The one-cheek rule, from a body instead of a fraction of the tilt range.
//
// A seated player's eye cannot be higher than this. The reference player is a
// tall man: the 95th percentile of seated eye height from the 1988 US Army
// anthropometric survey (ANSUR), 33.4 inches from the seat to the outer corner
// of the eye, sitting upright. That is roughly an 80th-percentile standing
// height with a long torso (NHANES 2015-2018: men 20 and over, 75th percentile
// 71.0 in, 85th 72.0). The rule is one cheek on the chair, not sitting bolt
// upright, so the eye can be lower than this but not higher.
//
// The furniture is a standard dining set: a 30-inch table and a 17-inch seat,
// the low end of the usual 17-19 range, which puts the eye as high as that
// body allows. This board is 1.8 inches thick, so the eye ends up 18.6 inches
// above the playing surface. A camera higher than that cannot belong to him.
// The limit is then eased by 20% of the angle, so a player may lean back a
// little and still count as seated. At the Table framing distance that is
// about 13 degrees of extra tilt.
export const SEAT_FORGIVENESS = 0.8;
export const SEAT = {
  eyeAboveSeat: 33.4,
  seatHeight: 17,
  tableHeight: 30,
  boardThickness: 1.8,
} as const;

// How high the eye can be above the playing surface, in inches.
export function seatedEyeHeight(seat = SEAT): number {
  return seat.seatHeight + seat.eyeAboveSeat - seat.tableHeight - seat.boardThickness;
}

// The steepest angle from vertical at which that eye, `distance` inches from
// the board centre, is still looking at the centre. Steeper than this and the
// camera is above the seated eye: the player is standing.
export function seatedLimit(distance: number, seat = SEAT): number {
  const height = seatedEyeHeight(seat);
  return Math.acos(Math.min(1, Math.max(-1, height / distance))) * SEAT_FORGIVENESS;
}
