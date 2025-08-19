// votingAPI.js - Core voting API functions using stores

import { ethers } from 'ethers';
import { get } from 'svelte/store';
import { userAddress } from './stores/wallet.js';
import { canisterActor, storageSlot } from './stores/canister.js';
import { generateSIWEProof, generateWitnessProof } from './proofUtils.js';
import { CHAIN_CONFIGS } from './chainConfig.js';

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