/**
 * Public runtime config. Every value is public, so no secrets live here.
 * Defaults point at the live Testnet deployment (deployments/testnet.env), so
 * the app runs with no .env at all; set NEXT_PUBLIC_* to override.
 */
export const config = {
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet",
  networkPassphrase:
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
  horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  contractId:
    process.env.NEXT_PUBLIC_HODL_CONTRACT_ID ??
    "CCBBKXKT2CMMAU7CUQJBFLIECPJQKN3IGDK6EGOS5PQH56HXF4FNLLDB",
  usdcSacId:
    process.env.NEXT_PUBLIC_USDC_SAC_ID ?? "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  usdcIssuer:
    process.env.NEXT_PUBLIC_USDC_ISSUER ?? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://stellar.expert/explorer/testnet",
  friendbotUrl: "https://friendbot.stellar.org",
  usdcFaucetUrl: "https://faucet.circle.com",
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com",
} as const;

export const explorer = {
  tx: (hash: string) => `${config.explorerUrl}/tx/${hash}`,
  account: (address: string) => `${config.explorerUrl}/account/${address}`,
  contract: (id: string = config.contractId) => `${config.explorerUrl}/contract/${id}`,
};

/** USDC on Stellar has 7 decimals. */
export const USDC_DECIMALS = 7;
