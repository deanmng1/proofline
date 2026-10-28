export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

// Contracts contain plain structured data. Own it before freezing so callers retain their input.
export const immutableSnapshot = <T>(value: T): DeepReadonly<T> => freeze(structuredClone(value));
