import { ethers } from 'ethers';
import { backend } from './canisters.js';
import { NETWORKS } from './utils.js';

// ERC20 ABI for token balance queries
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)"
];

/**
 * Get the canister's derived Ethereum address
 * @param {string} canisterId - The canister ID (optional, uses default subaccount if not provided)
 * @returns {Promise<string>} The Ethereum address
 */
export async function getCanisterEthereumAddress(canisterId = null) {
    try {
        // Get the canister's default Ethereum address from the default subaccount
        // Pass empty array [] for optional Blob parameter in Candid
        const result = await backend.icrc149_get_ethereum_address([]);
        return result;
    } catch (error) {
        console.error('Failed to get canister Ethereum address:', error);
        throw new Error(`Failed to get canister address: ${error.message}`);
    }
}

/**
 * Get the native ETH balance of an address
 * @param {string} address - The Ethereum address
 * @param {number} chainId - The chain ID
 * @returns {Promise<string>} The balance in ETH
 */
export async function getEthBalance(address, chainId) {
    try {
        const chainConfig = NETWORKS[chainId];
        if (!chainConfig) {
            throw new Error(`Unknown chain ID: ${chainId}`);
        }
        
        const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
        const balance = await provider.getBalance(address);
        return ethers.formatEther(balance);
    } catch (error) {
        console.error('Failed to check ETH balance:', error);
        throw new Error(`Failed to get ETH balance: ${error.message}`);
    }
}

/**
 * Get the token balance of an address
 * @param {string} address - The Ethereum address
 * @param {string} contractAddress - The token contract address
 * @param {number} chainId - The chain ID
 * @returns {Promise<string>} The formatted token balance with symbol
 */
export async function getTokenBalance(address, contractAddress, chainId) {
    try {
        if (!contractAddress || contractAddress === '0x...' || contractAddress.length !== 42) {
            return 'N/A';
        }
        
        const chainConfig = NETWORKS[chainId];
        if (!chainConfig) {
            throw new Error(`Unknown chain ID: ${chainId}`);
        }
        
        const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
        
        const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
        const [balance, decimals, symbol] = await Promise.all([
            contract.balanceOf(address),
            contract.decimals(),
            contract.symbol()
        ]);
        
        const formattedBalance = ethers.formatUnits(balance, decimals);
        
        // Format the number to a reasonable number of decimal places
        const num = parseFloat(formattedBalance);
        const formatted = num < 1 ? num.toFixed(6) : num.toFixed(2);
        
        return `${formatted} ${symbol}`;
    } catch (error) {
        console.error('Failed to check token balance:', error);
        return 'Error';
    }
}

/**
 * Get comprehensive balance information for an address
 * @param {string} address - The Ethereum address
 * @param {string} contractAddress - The token contract address
 * @param {number} chainId - The chain ID
 * @returns {Promise<object>} Object with eth and token balances
 */
export async function getBalanceInfo(address, contractAddress, chainId) {
    try {
        const [ethBalance, tokenBalance] = await Promise.all([
            getEthBalance(address, chainId),
            getTokenBalance(address, contractAddress, chainId)
        ]);
        
        return {
            address,
            chainId,
            ethBalance,
            tokenBalance,
            chainName: NETWORKS[chainId]?.name || `Unknown (${chainId})`
        };
    } catch (error) {
        console.error('Failed to get balance info:', error);
        throw error;
    }
}

/**
 * Check if an address is a valid Ethereum address
 * @param {string} address - The address to validate
 * @returns {boolean} True if valid
 */
export function isValidEthereumAddress(address) {
    return ethers.isAddress(address);
}

/**
 * Format an address for display (shortened)
 * @param {string} address - The full address
 * @returns {string} Formatted address like "0x1234...5678"
 */
export function formatAddress(address) {
    if (!address) return '';
    if (!isValidEthereumAddress(address)) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Get the native currency symbol for a chain
 * @param {number} chainId - The chain ID
 * @returns {string} The currency symbol
 */
export function getNativeCurrencySymbol(chainId) {
    const chainConfig = NETWORKS[chainId];
    if (!chainConfig) return 'ETH';
    
    // Most chains use ETH, but some have their own native tokens
    switch (chainId) {
        case 137: // Polygon Mainnet
        case 80001: // Polygon Mumbai
            return 'MATIC';
        case 56: // BSC Mainnet
        case 97: // BSC Testnet
            return 'BNB';
        case 43114: // Avalanche Mainnet
        case 43113: // Avalanche Testnet
            return 'AVAX';
        default:
            return 'ETH';
    }
}

/**
 * Create a provider for a specific chain
 * @param {number} chainId - The chain ID
 * @returns {ethers.JsonRpcProvider} The provider instance
 */
export function createProvider(chainId) {
    const chainConfig = NETWORKS[chainId];
    if (!chainConfig) {
        throw new Error(`No RPC configuration for chain ID: ${chainId}`);
    }
    
    return new ethers.JsonRpcProvider(chainConfig.rpc);
}
