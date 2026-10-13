/** Invalidate cached read probes after a confirmed quote refresh. */
let revision = 0;
export const healthRevision = () => revision;
export function pricesChanged() {
  revision++;
}
