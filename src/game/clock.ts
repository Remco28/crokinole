// Keep the exact remaining budget across a pause, including an expired clock.
export function remainingTime(deadline: number | null, now: number): number | null {
  return deadline === null ? null : Math.max(0, deadline - now);
}
export function resumeDeadline(remaining: number | null, now: number): number | null {
  return remaining === null ? null : now + remaining;
}
