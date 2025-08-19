export const CHAIN_CONFIGS = {
    1: { name: 'Ethereum Mainnet', symbol: 'ETH', rpc: 'https://eth.llamarpc.com' },
    11155111: { name: 'Sepolia Testnet', symbol: 'ETH', rpc: 'https://sepolia.infura.io/v3/' },
    137: { name: 'Polygon Mainnet', symbol: 'MATIC', rpc: 'https://polygon-rpc.com' },
    80001: { name: 'Polygon Mumbai', symbol: 'MATIC', rpc: 'https://rpc-mumbai.maticvigil.com' },
    42161: { name: 'Arbitrum One', symbol: 'ETH', rpc: 'https://arb1.arbitrum.io/rpc' },
    421613: { name: 'Arbitrum Goerli', symbol: 'ETH', rpc: 'https://goerli-rollup.arbitrum.io/rpc' },
    10: { name: 'Optimism', symbol: 'ETH', rpc: 'https://mainnet.optimism.io' },
    420: { name: 'Optimism Goerli', symbol: 'ETH', rpc: 'https://goerli.optimism.io' },
    31337: { name: 'Local/Anvil', symbol: 'ETH', rpc: 'http://127.0.0.1:8545' }
};

export function getChainConfig(chainId) {
    return CHAIN_CONFIGS[chainId] || { name: 'Unknown', symbol: 'ETH', rpc: null };
}