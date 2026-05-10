// Memorable pairing codes: ADJECTIVE-NOUN-3DIGITS.
import { randomInt } from "node:crypto";

const ADJECTIVES = [
  "BLUE", "RED", "GOLD", "JADE", "RUST", "SILVER", "AMBER", "MIST",
  "EMBER", "FROST", "STEEL", "LUNAR", "VIVID", "QUIET", "BRAVE", "BRIGHT",
  "FERAL", "STORM", "OPAL", "QUICK", "SHARP", "SWIFT", "VAST", "WILD",
];

const NOUNS = [
  "TIGER", "FALCON", "OAK", "RIVER", "PEAK", "WOLF", "HAWK", "FIR",
  "BEACON", "EMBER", "FOREST", "LANTERN", "MOON", "ORCA", "RAVEN", "STONE",
  "TUNDRA", "VAULT", "WAVE", "YARD", "ZEPHYR", "HARBOR", "SPARK", "TRAIL",
];

export function generatePairingCode(): string {
  const a = ADJECTIVES[randomInt(0, ADJECTIVES.length)];
  const n = NOUNS[randomInt(0, NOUNS.length)];
  const num = randomInt(100, 999);
  return `${a}-${n}-${num}`;
}
