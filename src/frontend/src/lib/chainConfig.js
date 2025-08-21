// Chain configuration utilities - Refactored for better organization

export const CHAIN_CONFIGS = {
    // Ethereum Networks
    1: { 
        name: 'Ethereum Mainnet', 
        symbol: 'ETH', 
        rpc: 'https://eth.llamarpc.com',
        explorer: 'https://etherscan.io',
        type: 'mainnet'
    },
    11155111: { 
        name: 'Sepolia Testnet', 
        symbol: 'ETH', 
        rpc: 'https://sepolia.infura.io/v3/',
        explorer: 'https://sepolia.etherscan.io',
        type: 'testnet'
    },
    5: { 
        name: 'Goerli Testnet', 
        symbol: 'ETH', 
        rpc: 'https://rpc.ankr.com/eth_goerli',
        explorer: 'https://goerli.etherscan.io',
        type: 'testnet'
    },
    
    // Polygon Networks
    137: { 
        name: 'Polygon Mainnet', 
        symbol: 'MATIC', 
        rpc: 'https://polygon-rpc.com',
        explorer: 'https://polygonscan.com',
        type: 'mainnet'
    },
    80001: { 
        name: 'Polygon Mumbai', 
        symbol: 'MATIC', 
        rpc: 'https://rpc-mumbai.maticvigil.com',
        explorer: 'https://mumbai.polygonscan.com',
        type: 'testnet'
    },
    
    // Arbitrum Networks
    42161: { 
        name: 'Arbitrum One', 
        symbol: 'ETH', 
        rpc: 'https://arb1.arbitrum.io/rpc',
        explorer: 'https://arbiscan.io',
        type: 'mainnet'
    },
    421613: { 
        name: 'Arbitrum Goerli', 
        symbol: 'ETH', 
        rpc: 'https://goerli-rollup.arbitrum.io/rpc',
        explorer: 'https://goerli.arbiscan.io',
        type: 'testnet'
    },
    
    // Optimism Networks
    10: { 
        name: 'Optimism', 
        symbol: 'ETH', 
        rpc: 'https://mainnet.optimism.io',
        explorer: 'https://optimistic.etherscan.io',
        type: 'mainnet'
    },
    420: { 
        name: 'Optimism Goerli', 
        symbol: 'ETH', 
        rpc: 'https://goerli.optimism.io',
        explorer: 'https://goerli-optimism.etherscan.io',
        type: 'testnet'
    },
    
    // Local Development
    31337: { 
        name: 'Local/Anvil', 
        symbol: 'ETH', 
        rpc: 'http://127.0.0.1:8545',
        explorer: null,
        type: 'local'
    }
};

// Get chain configuration by chain ID
export function getChainConfig(chainId) {
    return CHAIN_CONFIGS[chainId] || null;
}

// Check if chain ID is supported
export function isSupportedChain(chainId) {
    return chainId in CHAIN_CONFIGS;
}

// Get all mainnet chains
export function getMainnetChains() {
    return Object.entries(CHAIN_CONFIGS)
        .filter(([_, config]) => config.type === 'mainnet')
        .map(([chainId, config]) => ({ chainId: parseInt(chainId), ...config }));
}

// Get all testnet chains
export function getTestnetChains() {
    return Object.entries(CHAIN_CONFIGS)
        .filter(([_, config]) => config.type === 'testnet')
        .map(([chainId, config]) => ({ chainId: parseInt(chainId), ...config }));
}

// Get chains for dropdown selection
export function getChainOptions() {
    return Object.entries(CHAIN_CONFIGS).map(([chainId, config]) => ({
        value: parseInt(chainId),
        label: `${config.name} (${chainId})`,
        symbol: config.symbol,
        type: config.type
    }));
}

// Get explorer URL for a transaction
export function getExplorerTxUrl(chainId, txHash) {
    const config = getChainConfig(chainId);
    if (!config?.explorer) return null;
    return `${config.explorer}/tx/${txHash}`;
}

// Get explorer URL for an address
export function getExplorerAddressUrl(chainId, address) {
    const config = getChainConfig(chainId);
    if (!config?.explorer) return null;
    return `${config.explorer}/address/${address}`;
}

// Get explorer URL for a contract
export function getExplorerContractUrl(chainId, contractAddress) {
    return getExplorerAddressUrl(chainId, contractAddress);
}

// Check if chain is a Layer 2
export function isLayer2(chainId) {
    const l2Chains = [137, 80001, 42161, 421613, 10, 420]; // Polygon, Arbitrum, Optimism
    return l2Chains.includes(chainId);
}

// Get native currency info
export function getNativeCurrency(chainId) {
    const config = getChainConfig(chainId);
    return {
        symbol: config?.symbol || 'ETH',
        name: config?.symbol === 'MATIC' ? 'Polygon' : 
              config?.symbol === 'BNB' ? 'Binance Coin' : 'Ethereum'
    };
}

// Validate chain configuration
export function validateChainConfig(chainId) {
    const config = getChainConfig(chainId);
    
    if (!config) {
        return {
            valid: false,
            error: `Unsupported chain ID: ${chainId}`
        };
    }
    
    if (!config.rpc) {
        return {
            valid: false,
            error: `No RPC endpoint configured for ${config.name}`
        };
    }
    
    return {
        valid: true,
        config
    };
}