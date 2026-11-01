// Thông số mạng — lấy từ docs chính thức (docs.arc.network, 11/2026)
export const CHAINS = {
  arc: {
    key: "arc",
    name: "Arc Testnet",
    chainId: 5042002,
    rpc: process.env.ARC_RPC || "https://rpc.testnet.arc.network",
    // Quy ước: biến môi trường <KEY>_RPC để ghi đè RPC (test giả lập dùng cái này)
    explorer: "https://testnet.arcscan.app",
    faucet: "https://faucet.circle.com",
    nativeSymbol: "USDC",
    nativeDecimals: 18,
    tokens: {
      // Giao diện ERC-20 của USDC native (6 decimals)
      USDC: { address: "0x3600000000000000000000000000000000000000", decimals: 6 },
      EURC: { address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6 },
    },
  },
};
