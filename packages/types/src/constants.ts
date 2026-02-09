// CIP-10 metadata labels for Prisma DIDs
export const L_DID = 199674;  // Prisma DID events (§3.1)
export const L_VC = 199675;   // Prisma VC anchors (§6.1)

export const NETWORK = {
  PREPROD: 0,
  MAINNET: 1
} as const;

export type NetworkType = typeof NETWORK[keyof typeof NETWORK];
