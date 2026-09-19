/**
 * Pure floor comparison for the ADR-0036 schema gate's per-category baselines (ADR-0052). Split out so
 * the DROP-ONLY semantics can be unit-tested without prod / the real corpus, and so the comparison has
 * a single owner.
 *
 * A committed BASELINE is a FLOOR, not an exact band. The gate fails only when a category's derived
 * object count DROPS more than `tol` below its floor — a partial-capture regression that would silently
 * under-verify the schema. Benign GROWTH never fails: more derived objects are simply more objects
 * verified against prod, and a phantom over-derivation is caught downstream by the declared-vs-prod
 * reconciliation. The old symmetric `Math.abs(size - floor) > tol` band failed on ANY growth, so every
 * unrelated migration re-tripped the gate and forced a manual baseline bump (the #345 whack-a-mole);
 * the floor removes that while keeping the drop tripwire that catches real under-verification.
 *
 * @param {Array<{kind:string,size:number}>} cats  active categories with their derived counts
 * @param {Record<string,number>} floors           committed per-category floors (BASELINES)
 * @param {number} tol                              tolerance below the floor before a drop fails
 * @returns {{drops:Array<{kind,size,floor,delta}>, noFloor:Array<{kind,size}>, grown:Array<{kind,size,floor,delta}>}}
 *   drops   = counts that fell more than `tol` below their floor (FAIL — under-verification regression)
 *   noFloor = active categories with no committed floor (FAIL — a new category shipped without a tripwire)
 *   grown   = counts above their floor (benign; advisory to raise the floor to keep drop-detection tight)
 */
export function floorReport(cats, floors, tol) {
  const drops = [];
  const noFloor = [];
  const grown = [];
  for (const { kind, size } of cats) {
    const floor = floors[kind];
    if (floor == null) {
      noFloor.push({ kind, size });
      continue;
    }
    if (size < floor - tol) drops.push({ kind, size, floor, delta: floor - size });
    else if (size > floor) grown.push({ kind, size, floor, delta: size - floor });
  }
  return { drops, noFloor, grown };
}
