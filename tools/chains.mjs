// Thông số mạng — lấy từ docs chính thức (docs.arc.network, docs.giwa.io, 11/2026)
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
  giwa: {
    key: "giwa",
    name: "GIWA Sepolia",
    chainId: 91342,
    rpc: process.env.GIWA_RPC || "https://sepolia-rpc.giwa.io",
    explorer: "https://sepolia-explorer.giwa.io",
    faucet: "https://faucet.giwa.io",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    // Faucet chỉ cho 0.005–0.01 ETH/ngày → ngưỡng "sắp hết gas" phải nhỏ
    minBalance: 0.0005,
    // WETH là predeploy chuẩn của OP Stack (GIWA chạy OP Stack)
    weth: "0x4200000000000000000000000000000000000006",
    mocks: {
      "0x4200000000000000000000000000000000000006": `contract M { mapping(address=>uint) public balanceOf;
        event Deposit(address indexed d,uint v); event Withdrawal(address indexed s,uint v);
        function deposit() public payable { balanceOf[msg.sender]+=msg.value; emit Deposit(msg.sender,msg.value); }
        function withdraw(uint v) external { require(balanceOf[msg.sender]>=v); balanceOf[msg.sender]-=v; payable(msg.sender).transfer(v); emit Withdrawal(msg.sender,v); }
        receive() external payable { deposit(); } }`,
    },
  },
};
