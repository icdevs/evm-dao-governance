import { ethers } from 'ethers';

// ERC20 ABI for transfer function
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)"
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

// Convert SIWE proof to Candid format
export function siweProofToCandid(siweProof) {
    const sigBytes = Array.from(siweProof.signature)
        .map(b => `\\${b.toString(16).padStart(2, '0')}`)
        .join('');
    
    return {
        message: siweProof.message.replace(/\n/g, '\\n').replace(/"/g, '\\"'),
        signature: `blob "${sigBytes}"`
    };
}

// Convert proposal data to Candid format
export function proposalToCandid(proposal) {
    let action;
    
    switch (proposal.type) {
        case 'motion':
            action = `variant { Motion = "${proposal.motion}" }`;
            break;
            
        case 'eth_transaction':
            const dataHex = proposal.data.slice(2); // Remove 0x
            const dataBytes = dataHex.match(/.{2}/g)?.map(byte => `\\${byte}`).join('') || '';
            
            action = `variant { 
                EthTransaction = record {
                    to = "${proposal.to}";
                    value = ${proposal.value} : nat;
                    data = blob "${dataBytes}";
                    chain = record { 
                        chain_id = ${proposal.chainId} : nat; 
                        network_name = "${proposal.networkName}" 
                    };
                    subaccount = null;
                    maxPriorityFeePerGas = ${proposal.maxPriorityFeePerGas} : nat;
                    maxFeePerGas = ${proposal.maxFeePerGas} : nat;
                    gasLimit = ${proposal.gasLimit} : nat;
                    signature = null;
                    nonce = null;
                }
            }`;
            break;
            
        case 'icp_call':
            const argsHex = proposal.args.slice(2); // Remove 0x if present
            const argsBytes = argsHex.match(/.{2}/g)?.map(byte => `\\${byte}`).join('') || '';
            
            action = `variant {
                ICPCall = record {
                    canister = principal "${proposal.canister}";
                    method = "${proposal.method}";
                    args = blob "${argsBytes}";
                    cycles = ${proposal.cycles} : nat;
                    best_effort_timeout = null;
                    result = null;
                }
            }`;
            break;
            
        default:
            throw new Error(`Unknown proposal type: ${proposal.type}`);
    }
    
    const siweProof = siweProofToCandid(proposal.siweProof);
    
    return `(
        record {
            action = ${action};
            metadata = opt "${proposal.metadata || ''}";
            siwe = record {
                message = "${siweProof.message}";
                signature = ${siweProof.signature};
            };
            snapshot_contract = opt "${proposal.snapshotContract || ''}";
        }
    )`;
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
