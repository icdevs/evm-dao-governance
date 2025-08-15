/**
 * Application-wide constants and configuration
 */

// Network configurations
export const NETWORKS = {
    ETHEREUM_MAINNET: {
        chainId: 1,
        name: 'Ethereum Mainnet',
        symbol: 'ETH',
        rpcUrl: 'https://ethereum.publicnode.com',
        explorerUrl: 'https://etherscan.io'
    },
    SEPOLIA: {
        chainId: 11155111,
        name: 'Sepolia Testnet',
        symbol: 'ETH',
        rpcUrl: 'https://sepolia.infura.io/v3/',
        explorerUrl: 'https://sepolia.etherscan.io'
    },
    POLYGON: {
        chainId: 137,
        name: 'Polygon Mainnet',
        symbol: 'MATIC',
        rpcUrl: 'https://polygon.llamarpc.com',
        explorerUrl: 'https://polygonscan.com'
    },
    ARBITRUM: {
        chainId: 42161,
        name: 'Arbitrum One',
        symbol: 'ETH',
        rpcUrl: 'https://arbitrum.llamarpc.com',
        explorerUrl: 'https://arbiscan.io'
    },
    LOCAL: {
        chainId: 31337,
        name: 'Local/Anvil',
        symbol: 'ETH',
        rpcUrl: 'http://127.0.0.1:8545',
        explorerUrl: null
    }
};

// Get network config by chain ID
export function getNetworkConfig(chainId) {
    return Object.values(NETWORKS).find(network => network.chainId === chainId) || null;
}

// Validation constants
export const VALIDATION = {
    MIN_CANISTER_ID_LENGTH: 5,
    ETH_ADDRESS_LENGTH: 42, // Including '0x'
    ETH_ADDRESS_REGEX: /^0x[a-fA-F0-9]{40}$/,
    HEX_REGEX: /^0x[a-fA-F0-9]*$/,
    CANISTER_ID_REGEX: /^[a-z0-9-]+$/,
    MAX_PROPOSAL_TITLE_LENGTH: 100,
    MAX_PROPOSAL_DESCRIPTION_LENGTH: 2000
};

// UI constants
export const UI = {
    DEFAULT_PAGINATION_SIZE: 10,
    PAGINATION_SIZES: [5, 10, 20, 50],
    TOAST_DURATION: 5000,
    SUCCESS_TOAST_DURATION: 3000,
    ERROR_TOAST_DURATION: 7000,
    COPY_FEEDBACK_DURATION: 2000,
    DEBOUNCE_DELAY: 300,
    ANIMATION_DURATION: 300
};

// Proposal types
export const PROPOSAL_TYPES = {
    MOTION: 'motion',
    ETH_TRANSACTION: 'eth_transaction',
    ICP_CALL: 'icp_call'
};

// Proposal type display names
export const PROPOSAL_TYPE_LABELS = {
    [PROPOSAL_TYPES.MOTION]: 'Motion (Text-only governance decision)',
    [PROPOSAL_TYPES.ETH_TRANSACTION]: 'Ethereum Transaction',
    [PROPOSAL_TYPES.ICP_CALL]: 'ICP Canister Call'
};

// Proposal statuses
export const PROPOSAL_STATUS = {
    ACTIVE: 'active',
    PASSED: 'passed',
    FAILED: 'failed',
    EXECUTED: 'executed',
    EXPIRED: 'expired'
};

// Voting options
export const VOTE_OPTIONS = {
    FOR: 'for',
    AGAINST: 'against',
    ABSTAIN: 'abstain'
};

// Storage keys for localStorage
export const STORAGE_KEYS = {
    CONFIG: 'evm-dao-config',
    WALLET_PREFERENCE: 'evm-dao-wallet-preference',
    THEME: 'evm-dao-theme',
    SIWE_SESSION: 'evm-dao-siwe-session'
};

// Default configuration values
export const DEFAULT_CONFIG = {
    canisterId: '',
    contractAddress: '',
    environment: 'local',
    chainId: 31337,
    isConfigured: false
};

// Gas estimation defaults
export const GAS_DEFAULTS = {
    ETH_TRANSFER: 21000,
    ERC20_TRANSFER: 65000,
    CONTRACT_CALL: 100000,
    MAX_FEE_PER_GAS: '20', // gwei
    MAX_PRIORITY_FEE_PER_GAS: '2' // gwei
};

// Time constants (in milliseconds)
export const TIME = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000
};

// Address formatting
export const ADDRESS_FORMAT = {
    SHORT_LENGTH: 6, // Characters to show at start and end when truncating
    FULL_LENGTH: 42 // Full Ethereum address length
};

// Error messages
export const ERROR_MESSAGES = {
    WALLET_NOT_CONNECTED: 'Please connect your wallet first',
    INVALID_ADDRESS: 'Invalid Ethereum address format',
    INVALID_CANISTER: 'Invalid canister ID format',
    INVALID_AMOUNT: 'Invalid amount - must be a positive number',
    NETWORK_ERROR: 'Network connection failed. Please try again.',
    TRANSACTION_FAILED: 'Transaction failed. Please check your wallet and try again.',
    INSUFFICIENT_BALANCE: 'Insufficient balance for this transaction',
    USER_REJECTED: 'Transaction was rejected by user'
};

// Success messages
export const SUCCESS_MESSAGES = {
    WALLET_CONNECTED: 'Wallet connected successfully',
    TRANSACTION_SENT: 'Transaction sent successfully',
    PROPOSAL_CREATED: 'Proposal created successfully',
    VOTE_SUBMITTED: 'Vote submitted successfully',
    CONFIG_SAVED: 'Configuration saved successfully'
};

// Contract interaction constants
export const CONTRACT = {
    ERC20_BALANCE_SLOT: 2, // Common storage slot for ERC20 balances
    BALANCE_OF_SELECTOR: '0x70a08231', // balanceOf(address) function selector
    TRANSFER_SELECTOR: '0xa9059cbb', // transfer(address,uint256) function selector
    APPROVE_SELECTOR: '0x095ea7b3' // approve(address,uint256) function selector
};

// Export all networks as an array for dropdowns
export const NETWORK_OPTIONS = Object.values(NETWORKS).map(network => ({
    value: network.chainId,
    label: `${network.name} (${network.chainId})`
}));

// Environment options
export const ENVIRONMENT_OPTIONS = [
    { value: 'local', label: 'Local Development' },
    { value: 'ic', label: 'Internet Computer' }
];
