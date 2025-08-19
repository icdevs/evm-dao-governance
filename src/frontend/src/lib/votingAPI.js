// votingAPI.js - Core voting API functions using stores

import { ethers } from 'ethers';
import { get } from 'svelte/store';
import { userAddress } from './stores/wallet.js';
import { canisterActor, storageSlot } from './stores/canister.js';
import { generateSIWEProof, generateWitnessProof } from './proofUtils.js';
import { CHAIN_CONFIGS } from './chainConfig.js';
import { createTransferData, parseTokenAmount, getNetworkInfo } from './utils.js';
import { getCurrentChainId } from './stores/wallet.js';

// Get contract configuration from canister
export async function getContractConfig(contractAddress) {
    const actor = get(canisterActor);
    if (!actor) {
        throw new Error('Canister not initialized');
    }
    
    const result = await actor.icrc149_get_snapshot_contracts();
    
    // Find the contract in the list
    const contractConfig = result.find(([address, config]) => address === contractAddress);
    
    if (contractConfig) {
        const [, config] = contractConfig;
        storageSlot.set(Number(config.balance_storage_slot));
        return config;
    } else {
        throw new Error(`Contract ${contractAddress} not found in snapshot contracts`);
    }
}

// Create a new proposal
export async function createProposal(proposalData) {
    const actor = get(canisterActor);
    const address = get(userAddress);
    
    if (!address) {
        throw new Error('Wallet not connected');
    }
    
    if (!actor) {
        throw new Error('Canister not initialized');
    }
    
    // Get contract config and chain info
    const contractConfig = await getContractConfig();
    const contractAddress = contractConfig?.contract_address || null;
    if (!contractAddress) {
        throw new Error('No governance contract available. Please configure a contract in the settings first.');
    }
    
    // Get current chain ID from voting interface
    const chainId = getCurrentChainId();
    const networkInfo = getNetworkInfo(chainId);
    
    // Generate SIWE proof
    const siweProof = await generateSIWEProof(contractAddress, chainId);
    
    // Build proposal object based on type
    let proposal = {
        metadata: proposalData.metadata || '',
        snapshotContract: contractAddress,
        siweProof,
    };
    
    // Process proposal data based on type
    switch (proposalData.type) {
        case 'motion':
            proposal.type = 'motion';
            proposal.motion = proposalData.motionText;
            break;
            
        case 'eth_transaction':
            // Handle ERC20 transfer helper if enabled
            let ethData = proposalData.ethData || '0x';
            let ethValue = proposalData.ethValue || '0';
            
            if (proposalData.erc20Mode && proposalData.erc20Recipient && proposalData.erc20Amount) {
                const amount = parseTokenAmount(
                    proposalData.erc20Amount,
                    parseInt(proposalData.erc20Decimals || '18')
                );
                ethData = createTransferData(proposalData.erc20Recipient, amount);
                ethValue = '0'; // ERC20 transfers don't send ETH value
            }
            
            proposal.type = 'eth_transaction';
            proposal.to = proposalData.ethTo;
            proposal.value = ethValue;
            proposal.data = ethData;
            proposal.chainId = chainId;
            proposal.networkName = networkInfo.name.toLowerCase().replace(/\s+/g, '_');
            proposal.gasLimit = proposalData.ethGasLimit || '100000';
            proposal.maxFeePerGas = proposalData.ethMaxFeePerGas || '2000000000';
            proposal.maxPriorityFeePerGas = proposalData.ethMaxPriorityFeePerGas || '1000000000';
            break;
            
        case 'icp_call':
            proposal.type = 'icp_call';
            proposal.canister = proposalData.icpCanister;
            proposal.method = proposalData.icpMethod;
            proposal.args = proposalData.icpArgs.startsWith('0x') 
                ? proposalData.icpArgs 
                : `0x${proposalData.icpArgs}`;
            proposal.cycles = proposalData.icpCycles || '0';
            break;
            
        default:
            throw new Error(`Unknown proposal type: ${proposalData.type}`);
    }
    
    // Convert to Candid format and submit
    const candidProposal = {
        action: getActionVariant(proposal),
        metadata: proposal.metadata ? [proposal.metadata] : [],
        siwe: {
            message: proposal.siweProof.message,
            signature: proposal.siweProof.signature,
        },
        snapshot_contract: proposal.snapshotContract ? [proposal.snapshotContract] : [],
    };
    
    console.log('Submitting proposal:', candidProposal);
    
    const result = await actor.icrc149_create_proposal(candidProposal);
    
    if ('Err' in result) {
        throw new Error(result.Err);
    }
    
    return {
        id: result.Ok,
        proposal: proposal
    };
}

// Helper function to convert proposal to Candid action variant
function getActionVariant(proposal) {
    switch (proposal.type) {
        case 'motion':
            return { Motion: proposal.motion };
            
        case 'eth_transaction':
            return {
                EthTransaction: {
                    to: proposal.to,
                    value: BigInt(proposal.value),
                    data: new Uint8Array(
                        Buffer.from(proposal.data.slice(2), 'hex')
                    ),
                    chain: {
                        chain_id: BigInt(proposal.chainId),
                        network_name: proposal.networkName,
                    },
                    subaccount: [],
                    maxPriorityFeePerGas: BigInt(proposal.maxPriorityFeePerGas),
                    maxFeePerGas: BigInt(proposal.maxFeePerGas),
                    gasLimit: BigInt(proposal.gasLimit),
                    signature: [],
                    nonce: [],
                },
            };
            
        case 'icp_call':
            return {
                ICPCall: {
                    canister: proposal.canister,
                    method: proposal.method,
                    args: new Uint8Array(
                        Buffer.from(proposal.args.replace('0x', ''), 'hex')
                    ),
                    cycles: BigInt(proposal.cycles),
                    best_effort_timeout: [],
                    result: [],
                },
            };
            
        default:
            throw new Error(`Unknown proposal type: ${proposal.type}`);
    }
}

// Load proposals with optional filtering
export async function getProposals(limit = 10, offset = null, filters = []) {
    const actor = get(canisterActor);
    if (!actor) {
        throw new Error('Canister not initialized');
    }
    
    const limitOpt = limit ? [BigInt(limit)] : [];
    const prevOpt = offset ? [BigInt(offset)] : null;
    
    const result = await actor.icrc149_get_proposals(prevOpt, limitOpt, filters);
    
    return result.map(proposal => ({
        id: Number(proposal.id),
        action: proposal.action,
        metadata: proposal.metadata || null,
        deadline: Number(proposal.deadline),
        created_at: Number(proposal.created_at),
        proposer: proposal.proposer,
        snapshot: proposal.snapshot || null
    }));
}

// Get single proposal
export async function getProposal(proposalId) {
    const actor = get(canisterActor);
    if (!actor) {
        throw new Error('Canister not initialized');
    }
    
    return await actor.icrc149_get_proposal(BigInt(proposalId));
}

// Cast a vote on a proposal
export async function castVote(proposalId, choice, contractAddress) {
    const actor = get(canisterActor);
    const address = get(userAddress);
    
    if (!address) {
        throw new Error('Wallet not connected');
    }
    
    if (!actor) {
        throw new Error('Canister not initialized');
    }
    
    // Generate SIWE proof
    const siweProof = await generateSIWEProof(proposalId, choice, contractAddress);
    
    // Generate witness proof
    const witness = await generateWitnessProof(contractAddress, proposalId);
    
    // Prepare vote choice
    const voteChoice = choice === 'Yes' ? { Yes: null } : 
                      choice === 'No' ? { No: null } : 
                      { Abstain: null };
    
    const voteArgs = {
        proposal_id: BigInt(proposalId),
        voter: ethers.getBytes(address),
        choice: voteChoice,
        siwe: siweProof,
        witness: witness
    };
    
    // Submit vote to canister
    const result = await actor.icrc149_vote_proposal(voteArgs);
    
    if ('Ok' in result) {
        return 'Vote submitted successfully';
    } else {
        throw new Error(`Vote failed: ${result.Err}`);
    }
}

// Execute a proposal (end vote)
export async function executeProposal(proposalId) {
    const actor = get(canisterActor);
    if (!actor) {
        throw new Error('Canister not initialized');
    }
    
    const result = await actor.icrc149_execute_proposal(BigInt(proposalId));
    
    if ('Ok' in result) {
        return result.Ok;
    } else {
        throw new Error(`Execution failed: ${result.Err}`);
    }
}

// Get vote tally for a proposal
export async function getVoteTally(proposalId) {
    const actor = get(canisterActor);
    if (!actor) {
        throw new Error('Canister not initialized');
    }
    
    const result = await actor.icrc149_tally_votes(BigInt(proposalId));
    
    return {
        yes: Number(result.yes),
        no: Number(result.no),
        abstain: Number(result.abstain),
        total: Number(result.total),
        result: result.result
    };
}

// Update canister with discovered storage slot
export async function updateCanisterStorageSlot(chainId, contractAddress, slot) {
    const actor = get(canisterActor);
    if (!actor) {
        throw new Error('Canister not initialized');
    }
    
    const config = {
        contract_address: contractAddress,
        chain: { 
            chain_id: BigInt(chainId), 
            network_name: CHAIN_CONFIGS[chainId]?.name || 'Unknown' 
        },
        rpc_service: {
            rpc_type: 'custom',
            canister_id: null, // Will use default EVM RPC canister
            custom_config: null
        },
        contract_type: { ERC20: null },
        balance_storage_slot: BigInt(slot),
        enabled: true
    };
    
    const result = await actor.icrc149_update_snapshot_contract_config(
        contractAddress, 
        [config]
    );
    
    if ('Ok' in result) {
        return 'Configuration updated successfully';
    } else {
        throw new Error(`Failed to update canister: ${result.Err}`);
    }
}

// Check if user has already voted on a proposal
export async function hasUserVoted(proposalId) {
    // This would need to be implemented in the canister
    // For now, return false as a placeholder
    return false;
}