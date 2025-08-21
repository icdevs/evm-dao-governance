import { ethers } from 'ethers';

// ERC20 ABI for common functions
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function totalSupply() view returns (uint256)"
];

// Create transaction data for ERC20 transfer
export function createTransferData(recipient, amount) {
    const iface = new ethers.Interface(ERC20_ABI);
    return iface.encodeFunctionData("transfer", [recipient, amount]);
}

// Create transaction data for arbitrary contract call
export function createContractCallData(abi, functionName, args) {
    const iface = new ethers.Interface(abi);
    return iface.encodeFunctionData(functionName, args);
}

// Parse amount with decimals
export function parseTokenAmount(amount, decimals = 18) {
    return ethers.parseUnits(amount.toString(), decimals);
}

// Format amount from wei
export function formatTokenAmount(amount, decimals = 18, precision = 4) {
    return parseFloat(ethers.formatUnits(amount, decimals)).toFixed(precision);
}

// Network configurations
export const NETWORKS = {
    1: { name: 'Ethereum Mainnet', rpc: 'https://eth.llamarpc.com', explorer: 'https://etherscan.io' },
    5: { name: 'Goerli Testnet', rpc: 'https://rpc.ankr.com/eth_goerli', explorer: 'https://goerli.etherscan.io' },
    11155111: { name: 'Sepolia Testnet', rpc: 'https://rpc.ankr.com/eth_sepolia', explorer: 'https://sepolia.etherscan.io' },
    31337: { name: 'Anvil Local', rpc: 'http://127.0.0.1:8545', explorer: 'http://localhost:8545' },
    137: { name: 'Polygon Mainnet', rpc: 'https://polygon-rpc.com/', explorer: 'https://polygonscan.com' },
    80001: { name: 'Polygon Mumbai', rpc: 'https://rpc-mumbai.maticvigil.com', explorer: 'https://mumbai.polygonscan.com' },
    42161: { name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc', explorer: 'https://arbiscan.io' },
    421613: { name: 'Arbitrum Goerli', rpc: 'https://goerli-rollup.arbitrum.io/rpc', explorer: 'https://goerli.arbiscan.io' },
    10: { name: 'Optimism', rpc: 'https://mainnet.optimism.io', explorer: 'https://optimistic.etherscan.io' },
    420: { name: 'Optimism Goerli', rpc: 'https://goerli.optimism.io', explorer: 'https://goerli-optimism.etherscan.io' }
};

// Get network info
export function getNetworkInfo(chainId) {
    return NETWORKS[chainId] || { name: `Unknown Network (${chainId})`, rpc: '', explorer: '' };
}

// Validate Ethereum address
export function isValidAddress(address) {
    return ethers.isAddress(address);
}

// Validate amount
export function isValidAmount(amount) {
    try {
        const parsed = ethers.parseEther(amount.toString());
        return parsed > 0n;
    } catch {
        return false;
    }
}

// Format address for display (shortened)
export function formatAddress(address) {
    if (!address) return '';
    if (!isValidAddress(address)) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Get native currency symbol for a chain
export function getNativeCurrencySymbol(chainId) {
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

// Token information functions that accept provider as parameter
export async function getTokenInfo(provider, contractAddress) {
    try {
        const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);

        const [name, symbol, decimals, totalSupply] = await Promise.all([
            contract.name(),
            contract.symbol(),
            contract.decimals(),
            contract.totalSupply()
        ]);

        return {
            name,
            symbol,
            decimals: Number(decimals),
            totalSupply: totalSupply.toString()
        };
    } catch (error) {
        throw new Error(`Failed to get token info:`, error);
    }
}

// Get token balance for a specific address
export async function getTokenBalance(provider, contractAddress, userAddress) {
    try {
        const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
        const balance = await contract.balanceOf(userAddress);
        return balance.toString();
    } catch (error) {
        console.error('Failed to get token balance:', error);
        return '0';
    }
}


export async function getCanisterEthereumAddress(backendActor) {
    try {
        // Get the canister's default Ethereum address from the default subaccount
        // Pass empty array [] for optional Blob parameter in Candid
        const result = await backendActor.icrc149_get_ethereum_address([]);
        return result;
    } catch (error) {
        console.error('Failed to get canister Ethereum address:', error);
        throw new Error(`Failed to get canister address: ${error.message}`);
    }
}

// Get formatted token balance with symbol
export async function getTokenBalanceInfo(provider, contractAddress, userAddress, tokenInfo) {
    try {
        const balance = await getTokenBalance(provider, contractAddress, userAddress)

        const formattedBalance = formatTokenAmount(balance, tokenInfo.decimals);
        return {
            balance: balance,
            tokenInfo: tokenInfo,
            formatted: `${formattedBalance} ${tokenInfo.symbol}`
        };
    } catch (error) {
        console.error('Failed to get formatted token balance:', error);
        return 'Error';
    }
}

// Utility to create provider from chain config
export function createProviderFromChain(chainId) {
    const networkConfig = NETWORKS[chainId];
    if (!networkConfig) {
        throw new Error(`No RPC configuration for chain ID: ${chainId}`);
    }

    return new ethers.JsonRpcProvider(networkConfig.rpc);
}

// Time formatting utilities
export function formatTimeRemaining(deadline) {
    const now = Date.now();
    const endTime = new Date(deadline).getTime();
    const timeDiff = endTime - now;

    if (timeDiff <= 0) {
        return "Expired";
    }

    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
        return `${days}d ${hours}h remaining`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m remaining`;
    } else {
        return `${minutes}m remaining`;
    }
}

// Format date for display
export function formatDate(date) {
    if (!date) return 'Unknown';

    const dateObj = date instanceof Date ? date : new Date(date);

    return dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// Percentage calculation utility
export function calculatePercentage(value, total) {
    if (!total || total === 0) return 0;
    return Math.round((Number(value) / Number(total)) * 100);
}

// Proposal type utilities
export function getActionTypeDisplay(action) {
    if (action.Motion) return "Motion";
    if (action.EthTransaction) return "Ethereum Transaction";
    if (action.ICPCall) return "ICP Call";
    return "Unknown";
}

export function getActionDetails(action, networkInfo) {
    if (action.Motion) {
        return action.Motion;
    }
    if (action.EthTransaction) {
        const tx = action.EthTransaction;
        const network = networkInfo || getNetworkInfo(Number(tx.chain.chain_id));
        return `To: ${formatAddress(tx.to)} on ${network.name}`;
    }
    if (action.ICPCall) {
        const call = action.ICPCall;
        return `${call.method} on ${call.canister}`;
    }
    return "Unknown action";
}

// Status badge utilities
export function getStatusBadgeClass(proposal) {
    if (proposal.isExecuted) return "status-executed";
    if (proposal.isFailed) return "status-failed";
    if (proposal.isExecuting) return "status-executing";
    if (proposal.isActive) return "status-active";
    return "status-pending";
}

export function getStatusText(proposal) {
    if (proposal.isExecuted) return "Executed";
    if (proposal.isFailed) return "Failed";
    if (proposal.isExecuting) return "Executing";
    if (proposal.isActive) return "Active";
    return "Pending";
}

// Error formatting
export function formatError(error) {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.reason) return error.reason;
    return 'An unknown error occurred';
}

// Validation utilities
export function validateProposalForm(formData) {
    const errors = [];

    if (!formData.type) {
        errors.push('Proposal type is required');
    }

    switch (formData.type) {
        case 'motion':
            if (!formData.motionText?.trim()) {
                errors.push('Motion text is required');
            }
            break;

        case 'eth_transaction':
            if (!isValidAddress(formData.ethTo)) {
                errors.push('Invalid recipient address');
            }

            if (formData.erc20Mode) {
                if (!isValidAddress(formData.erc20Recipient)) {
                    errors.push('Invalid ERC20 recipient address');
                }
                if (!formData.erc20Amount || parseFloat(formData.erc20Amount) <= 0) {
                    errors.push('Invalid ERC20 amount');
                }
            }
            break;

        case 'icp_call':
            if (!formData.icpCanister?.trim()) {
                errors.push('Canister ID is required');
            }
            if (!formData.icpMethod?.trim()) {
                errors.push('Method name is required');
            }
            break;
    }

    return errors;
}