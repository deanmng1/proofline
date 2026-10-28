const BASIS_POINTS_PER_WHOLE = 10_000;

export function moneyFromBasisPoints(amountCents: number, rateBasisPoints: number): number {
  if (!Number.isSafeInteger(amountCents) || !Number.isSafeInteger(rateBasisPoints)) {
    throw new Error("Money and basis points must be safe integers.");
  }

  const sign = Math.sign(amountCents) || 1;
  const numerator = Math.abs(amountCents) * rateBasisPoints;
  if (!Number.isSafeInteger(numerator)) {
    throw new Error("Money calculation exceeds the safe integer range.");
  }

  return sign * Math.floor((numerator + BASIS_POINTS_PER_WHOLE / 2) / BASIS_POINTS_PER_WHOLE);
}
