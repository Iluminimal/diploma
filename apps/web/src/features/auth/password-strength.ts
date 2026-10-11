export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

/**
 * How long enough is, in words. Length is the only thing measured, like the API's rule (10 to 128
 * characters, nothing about digits or symbols): a long passphrase beats a short "complex" one.
 */
export function passwordStrength(password: string): Strength {
  const length = [...password].length;
  if (length === 0) return { score: 0, label: "" };
  if (length < 10) {
    const missing = 10 - length;
    return { score: 1, label: `${missing} more character${missing === 1 ? "" : "s"} needed` };
  }
  if (length < 14) return { score: 2, label: "Okay. Longer is stronger." };
  if (length < 20) return { score: 3, label: "Good" };
  return { score: 4, label: "Excellent" };
}
