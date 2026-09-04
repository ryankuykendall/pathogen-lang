// Iteration lock for arrays: while .map/.filter/.reduce/.sort or a for-each
// loop iterates an array, mutating it (push/pop/shift/unshift, arr[i] = x)
// throws. This module works on the structural shape only so it has no
// dependency on the evaluator's Value union.
//
// The lock is a COUNTER, not a boolean: nested read-only iteration of the
// same array (arr.filter {|x| ... arr.map {...} ...}) is legal, and each
// level must release exactly its own hold. Callers MUST pair lockArray with
// unlockArray in a finally block — every iteration site catches and rethrows
// callback errors, and a stranded lock would poison the array for the rest
// of the program.

interface Lockable {
  iterationLock?: number;
}

export function lockArray(arr: Lockable): void {
  arr.iterationLock = (arr.iterationLock ?? 0) + 1;
}

export function unlockArray(arr: Lockable): void {
  // Clamped so an unpaired stray unlock can't drive the counter negative and
  // silently disable the guard for a later legitimate lock.
  arr.iterationLock = Math.max(0, (arr.iterationLock ?? 0) - 1);
}

export function isArrayLocked(arr: Lockable): boolean {
  return (arr.iterationLock ?? 0) > 0;
}

/**
 * Message for a rejected mutation. `op` is a verb phrase that reads before
 * "an array", e.g. "call push() on", "assign to an element of". Callers
 * wrap this in their own error formatter (mError / formatError).
 */
export function arrayMutationError(op: string): string {
  return `Cannot ${op} an array while it is being iterated — callbacks and for-each bodies receive the array read-only. Iterate a copy with .slice(0) if you need to mutate.`;
}
