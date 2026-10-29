const capabilityPattern = /^[A-Za-z0-9_-]{32,128}$/;

const loopbackOrigin = (value: string): string => {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("Proofline test entry requires a valid loopback origin.");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    (origin.hostname !== "127.0.0.1" && origin.hostname !== "[::1]") ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("Proofline test entry may start only on a numeric loopback origin.");
  return origin.origin;
};

export const createTestCapabilityGate = (expected: string | undefined) => {
  if (!expected) throw new Error("Proofline test entry is missing its launcher capability.");
  if (!capabilityPattern.test(expected))
    throw new Error("Proofline test entry launcher capability is malformed.");

  let consumed = false;
  return {
    consume({ supplied, origin }: { supplied: string | undefined; origin: string }) {
      if (consumed) throw new Error("Proofline test entry capability was already consumed.");
      if (!supplied) throw new Error("Proofline test entry capability is missing.");
      if (!capabilityPattern.test(supplied))
        throw new Error("Proofline supplied test entry capability is malformed.");
      if (supplied !== expected)
        throw new Error("Proofline supplied test entry capability does not match the launcher.");
      const normalizedOrigin = loopbackOrigin(origin);
      consumed = true;
      return { origin: normalizedOrigin };
    },
  };
};
