// A parent pointermove is a processed summary of its raw coalesced events.
// Process one representation, not both; empty/unsupported lists need fallback.
export function pointerMoveSamples<T extends { getCoalescedEvents?: () => T[] }>(event: T): T[] {
  const coalesced = event.getCoalescedEvents?.();
  return coalesced?.length ? coalesced : [event];
}
