export type TestIds = {
  next(kind: string): string;
};

/** Creates deterministic, per-test identifiers without module-level mutable state. */
export function createTestIds(prefix = "test"): TestIds {
  let sequence = 1;
  return {
    next(kind) {
      return `${prefix}-${kind}-${sequence++}`;
    },
  };
}
