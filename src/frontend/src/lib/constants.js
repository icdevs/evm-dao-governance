/**
 * Application-wide constants and configuration - Enhanced and organized
 */

import { CHAIN_CONFIGS } from './chainConfig.js';

// Re-export chain configs for backward compatibility
export const NETWORKS = CHAIN_CONFIGS;
export { getChainConfig as getNetworkConfig } from './chainConfig.js';

// Validation constants
export const VALIDATION = {
    MIN_CANISTER_ID_LENGTH: 5,
    ETH_ADDRESS_LENGTH: 42, // Including '0x'
    ETH_ADDRESS_REGEX: /^0x[a-fA-F0-9]{40}$/,
    HEX_REGEX: /^0x[a-fA-F0-9]*$/,
    CANISTER_ID_REGEX: /^[a-z0-9-]+$/,
    MAX_PROPOSAL_TITLE_LENGTH: 100,
    MAX_PROPOSAL_DESCRIPTION_LENGTH: 2000,
    MIN_VOTE_AMOUNT: 1, // Minimum tokens required to vote
    MAX_PROPOSAL_DURATION_DAYS: 30
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
    ANIMATION_DURATION: 300,
    REFRESH_INTERVAL: 30000, // 30 seconds
    BALANCE_CACHE_TIME: 60000, // 1 minute
    PROPOSALS_CACHE_TIME: 30000 // 30 seconds
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
    EXPIRED: 'expired',
    PENDING: 'pending',
    REJECTED: 'rejected'
};

// Voting options
export const VOTE_OPTIONS = {
    FOR: 'for',
    AGAINST: 'against',
    ABSTAIN: 'abstain',
    YES: 'yes',
    NO: 'no'
};

// Vote choice mapping for backend
export const VOTE_CHOICE_MAPPING = {
    [VOTE_OPTIONS.FOR]: { Yes: null },
    [VOTE_OPTIONS.YES]: { Yes: null },
    [VOTE_OPTIONS.AGAINST]: { No: null },
    [VOTE_OPTIONS.NO]: { No: null },
    [VOTE_OPTIONS.ABSTAIN]: { Abstain: null }
};

// Storage keys for localStorage
export const STORAGE_KEYS = {
    CONFIG: 'evm-dao-config',
    WALLET_PREFERENCE: 'evm-dao-wallet-preference',
    THEME: 'evm-dao-theme',
    SIWE_SESSION: 'evm-dao-siwe-session',
    BALANCE_CACHE: 'evm-dao-balance-cache',
    PROPOSALS_CACHE: 'evm-dao-proposals-cache'
};

// Default configuration values
export const DEFAULT_CONFIG = {
    canisterId: '',
    contractAddress: '',
    environment: 'local',
    chainId: 31337,
    isConfigured: false
};

// Gas estimation defaults (in wei)
export const GAS_DEFAULTS = {
    ETH_TRANSFER: 21000,
    ERC20_TRANSFER: 65000,
    CONTRACT_CALL: 100000,
    COMPLEX_CONTRACT_CALL: 200000,
    MAX_FEE_PER_GAS: '20000000000', // 20 gwei
    MAX_PRIORITY_FEE_PER_GAS: '2000000000', // 2 gwei
    GAS_LIMIT_BUFFER: 1.2 // 20% buffer
};

// Time constants (in milliseconds)
export const TIME = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000
};

// Address formatting
export const ADDRESS_FORMAT = {
    SHORT_LENGTH: 6, // Characters to show at start and end when truncating
    FULL_LENGTH: 42, // Full Ethereum address length
    DISPLAY_LENGTH: 10 // For medium-length displays
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
    USER_REJECTED: 'Transaction was rejected by user',
    UNSUPPORTED_NETWORK: 'Unsupported network. Please switch to a supported network.',
    CANISTER_NOT_INITIALIZED: 'Canister not initialized. Please check configuration.',
    VOTING_FAILED: 'Failed to submit vote. Please try again.',
    PROPOSAL_NOT_FOUND: 'Proposal not found',
    ALREADY_VOTED: 'You have already voted on this proposal',
    VOTING_ENDED: 'Voting period has ended for this proposal',
    INSUFFICIENT_VOTING_POWER: 'Insufficient voting power to participate'
};

// Success messages
export const SUCCESS_MESSAGES = {
    WALLET_CONNECTED: 'Wallet connected successfully',
    TRANSACTION_SENT: 'Transaction sent successfully',
    PROPOSAL_CREATED: 'Proposal created successfully',
    VOTE_SUBMITTED: 'Vote submitted successfully',
    CONFIG_SAVED: 'Configuration saved successfully',
    BALANCE_REFRESHED: 'Balances refreshed successfully',
    PROPOSALS_REFRESHED: 'Proposals refreshed successfully'
};

// Contract interaction constants
export const CONTRACT = {
    ERC20_BALANCE_SLOT: 0, // Most common storage slot for ERC20 balances
    BALANCE_OF_SELECTOR: '0x70a08231', // balanceOf(address) function selector
    TRANSFER_SELECTOR: '0xa9059cbb', // transfer(address,uint256) function selector
    APPROVE_SELECTOR: '0x095ea7b3', // approve(address,uint256) function selector
    TOTAL_SUPPLY_SELECTOR: '0x18160ddd', // totalSupply() function selector
    SYMBOL_SELECTOR: '0x95d89b41', // symbol() function selector
    NAME_SELECTOR: '0x06fdde03', // name() function selector
    DECIMALS_SELECTOR: '0x313ce567' // decimals() function selector
};

// SIWE (Sign-In With Ethereum) constants
export const SIWE = {
    VERSION: '1',
    DOMAIN: typeof window !== 'undefined' ? window.location.host : 'localhost',
    STATEMENT_CREATE_PROPOSAL: 'Create proposal for DAO governance',
    STATEMENT_VOTE: 'Vote on DAO proposal',
    EXPIRATION_TIME: 10 * TIME.MINUTE, // 10 minutes
    NONCE_LENGTH: 8
};

// Wallet types
export const WALLET_TYPES = {
    METAMASK: 'metamask',
    COINBASE: 'coinbase',
    WALLET_CONNECT: 'walletconnect',
    INJECTED: 'injected'
};

// Theme constants
export const THEMES = {
    DARK: 'dark',
    LIGHT: 'light',
    AUTO: 'auto'
};

// Environment constants
export const ENVIRONMENTS = {
    LOCAL: 'local',
    TESTNET: 'testnet',
    MAINNET: 'mainnet',
    IC: 'ic'
};

// Export all networks as an array for dropdowns
export const NETWORK_OPTIONS = Object.entries(NETWORKS).map(([chainId, network]) => ({
    value: parseInt(chainId),
    label: `${network.name} (${chainId})`,
    symbol: network.symbol,
    type: network.type || 'unknown'
}));

// Environment options
export const ENVIRONMENT_OPTIONS = [
    { value: ENVIRONMENTS.LOCAL, label: 'Local Development' },
    { value: ENVIRONMENTS.IC, label: 'Internet Computer' }
];

// Proposal filter options
export const PROPOSAL_FILTER_OPTIONS = [
    { value: 'any', label: 'All Proposals' },
    { value: PROPOSAL_STATUS.ACTIVE, label: 'Active' },
    { value: PROPOSAL_STATUS.PENDING, label: 'Pending' },
    { value: PROPOSAL_STATUS.EXECUTED, label: 'Executed' },
    { value: PROPOSAL_STATUS.EXPIRED, label: 'Expired' },
    { value: PROPOSAL_STATUS.REJECTED, label: 'Rejected' }
];

// Vote choice options for UI
export const VOTE_CHOICE_OPTIONS = [
    { value: VOTE_OPTIONS.YES, label: 'Yes', description: 'Support this proposal' },
    { value: VOTE_OPTIONS.NO, label: 'No', description: 'Oppose this proposal' },
    { value: VOTE_OPTIONS.ABSTAIN, label: 'Abstain', description: 'No strong preference' }
];

// API endpoints (for future use)
export const API_ENDPOINTS = {
    IC_MAINNET: 'https://ic0.app',
    IC_LOCAL: 'http://127.0.0.1:4943',
    SOURCIFY: 'https://sourcify.dev/server',
    ETHERSCAN_API: 'https://api.etherscan.io/api',
    POLYGONSCAN_API: 'https://api.polygonscan.com/api'
};

// Feature flags
export const FEATURES = {
    ENABLE_VOTE_DELEGATION: false,
    ENABLE_PROPOSAL_TEMPLATES: true,
    ENABLE_ADVANCED_VOTING: false,
    ENABLE_PROPOSAL_DISCUSSION: false,
    ENABLE_TREASURY_MANAGEMENT: true,
    ENABLE_MULTI_SIG_PROPOSALS: false
};

// Limits and thresholds
export const LIMITS = {
    MAX_PROPOSALS_PER_PAGE: 50,
    MAX_CONTRACTS_PER_DAO: 10,
    MIN_PROPOSAL_DURATION: TIME.HOUR, // 1 hour
    MAX_PROPOSAL_DURATION: 30 * TIME.DAY, // 30 days
    DEFAULT_PROPOSAL_DURATION: 7 * TIME.DAY, // 7 days
    MAX_SIWE_MESSAGE_SIZE: 2048,
    MAX_METADATA_LENGTH: 10000
};