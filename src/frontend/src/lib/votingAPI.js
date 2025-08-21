// votingAPI.js - Core voting API functions (refactored to eliminate get() usage)

import { ethers } from 'ethers';
import { createTransferData, parseTokenAmount, getNetworkInfo } from './utils.js';
import { getERC20BalanceStorageKey } from "./storageUtils.js"
import { Principal } from "@dfinity/principal";

// Get contract configuration from canister
export async function getContractConfig(backendActor, contractAddress) {
    if (!backendActor) {
        throw new Error('Backend actor not provided');
    }

    const result = await backendActor.icrc149_get_snapshot_contracts();

    // Find the contract in the list
    const contractConfig = result.find(([address, config]) => address === contractAddress);

    if (contractConfig) {
        const [, config] = contractConfig;
        return {
            config,
            storageSlot: Number(config.balance_storage_slot)
        };
    } else {
        throw new Error(`Contract ${contractAddress} not found in snapshot contracts`);
    }
}

// Create a new proposal
export async function createProposal(proposalData, dependencies) {
    const { backendActor, userAddress, contractAddress, chainId, signer } = dependencies;

    if (!userAddress) {
        throw new Error('Wallet not connected');
    }

    if (!backendActor) {
        throw new Error('Backend actor not available');
    }

    if (!contractAddress) {
        throw new Error('No governance contract configured');
    }

    const networkInfo = getNetworkInfo(chainId);

    // Generate SIWE proof
    const siweProof = await generateSIWEProof(proposalData, contractAddress, chainId, signer);

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
            proposal.canister = Principal.fromText(proposalData.icpCanister);
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

    const result = await backendActor.icrc149_create_proposal(candidProposal);

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
                    data: hexToBytes(proposal.data),
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
                    args: hexToBytes(proposal.args),
                    cycles: BigInt(proposal.cycles),
                    best_effort_timeout: [],
                    result: [],
                },
            };

        default:
            throw new Error(`Unknown proposal type: ${proposal.type}`);
    }
}

// Helper: convert hex string to Uint8Array
function hexToBytes(hex) {
    hex = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (hex.length === 0) return new Uint8Array();
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

// Load proposals with optional filtering
export async function getProposals(backendActor, limit = 10, offset = null, filters = []) {
    if (!backendActor) {
        throw new Error('Backend actor not provided');
    }

    const limitOpt = limit ? [BigInt(limit)] : [];
    const prevOpt = offset ? [BigInt(offset)] : null;

    const result = await backendActor.icrc149_get_proposals(prevOpt, limitOpt, filters);

    return result.map(proposal => ({
        id: Number(proposal.id),
        action: proposal.action,
        metadata: proposal.metadata || null,
        deadline: Number(proposal.deadline),
        created_at: Number(proposal.created_at),
        proposer: proposal.proposer,
        snapshot: proposal.snapshot || null,
        tally: proposal.tally || { yes: 0, no: 0, abstain: 0, total: 0, result: 'Pending' }
    }));
}

// Get single proposal
export async function getProposal(backendActor, proposalId) {
    if (!backendActor) {
        throw new Error('Backend actor not provided');
    }

    return await backendActor.icrc149_get_proposal(BigInt(proposalId));
}

// Cast a vote on a proposal
export async function castVote(proposalId, choice, backendActor, userAddress, contractAddress, chainId, signer, provider) {

    // Generate SIWE proof
    const siweProof = await generateSIWEProofForVoting(proposalId, choice, contractAddress, chainId, signer);
    console.log("proof", siweProof);
    // Generate witness proof
    const witness = await generateWitnessProof(contractAddress, userAddress, provider);

    // Prepare vote choice
    const voteChoice = choice === 'Yes' ? { Yes: null } :
        choice === 'No' ? { No: null } :
            { Abstain: null };

    const voteArgs = {
        proposal_id: BigInt(proposalId),
        voter: ethers.getBytes(userAddress),
        choice: voteChoice,
        siwe: siweProof,
        witness: witness
    };

    // Submit vote to canister
    const result = await backendActor.icrc149_vote_proposal(voteArgs);

    if ('Ok' in result) {
        return 'Vote submitted successfully';
    } else {
        throw new Error(`Vote failed: ${result.Err}`);
    }
}

// Execute a proposal (end vote)
export async function executeProposal(backendActor, proposalId) {
    if (!backendActor) {
        throw new Error('Backend actor not provided');
    }

    const result = await backendActor.icrc149_execute_proposal(BigInt(proposalId));

    if ('Ok' in result) {
        return result.Ok;
    } else {
        throw new Error(`Execution failed: ${result.Err}`);
    }
}

// Get vote tally for a proposal
export async function getVoteTally(backendActor, proposalId) {
    if (!backendActor) {
        throw new Error('Backend actor not provided');
    }

    const result = await backendActor.icrc149_tally_votes(BigInt(proposalId));

    return {
        yes: Number(result.yes),
        no: Number(result.no),
        abstain: Number(result.abstain),
        total: Number(result.total),
        result: result.result
    };
}

// Check if user has already voted on a proposal
export async function hasUserVoted(backendActor, proposalId, userAddress) {
    if (!backendActor || !userAddress) {
        return false;
    }

    try {
        const voteRequests = [{
            proposal_id: BigInt(proposalId),
            user_address: userAddress
        }];

        const voteResults = await backendActor.icrc149_get_user_votes(voteRequests);

        if (voteResults && voteResults.length > 0) {
            const result = voteResults[0];
            return result.vote && result.vote.length > 0;
        }

        return false;
    } catch (error) {
        console.error('Failed to check user vote:', error);
        return false;
    }
}

// Generate SIWE proof for proposal creation
async function generateSIWEProof(proposalData, contractAddress, chainId, signer) {
    if (!signer) {
        throw new Error('Signer not available');
    }

    const address = await signer.getAddress();
    const currentTime = Date.now();
    const currentTimeNanos = BigInt(currentTime) * 1_000_000n;
    const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes

    const currentTimeISO = new Date(currentTime).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();

    const domain = window.location.host;
    const origin = window.location.origin;

    const statement = `Create proposal for contract ${contractAddress}`;

    const message = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${origin}
Version: 1
Chain ID: ${chainId}
Nonce: ${expirationTimeNanos.toString()}
Issued At: ${currentTimeISO}
Expiration Time: ${expirationTimeISO}
Resources:
- contract:${contractAddress}`;

    const signature = await signer.signMessage(message);

    return {
        message: message,
        signature: ethers.getBytes(signature)
    };
}

// Generate SIWE proof for voting
async function generateSIWEProofForVoting(proposalId, choice, contractAddress, chainId, signer) {
    if (!signer) {
        throw new Error('Signer not available');
    }

    const address = await signer.getAddress();
    const currentTime = Date.now();
    const currentTimeNanos = BigInt(currentTime) * 1_000_000n;
    const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes

    const currentTimeISO = new Date(currentTime).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();

    const domain = window.location.host;
    const origin = window.location.origin;

    const statement = `Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}`;

    const message = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${origin}
Version: 1
Chain ID: ${chainId}
Nonce: ${expirationTimeNanos.toString()}
Issued At: ${currentTimeISO}
Expiration Time: ${expirationTimeISO}
Resources:
- proposal:${proposalId}
- contract:${contractAddress}`;

    const signature = await signer.signMessage(message);

    return {
        message: message,
        signature: ethers.getBytes(signature)
    };
}

// Generate witness proof for user's token balance
async function generateWitnessProof(contractAddress, userAddress, provider) {
    if (!provider || !userAddress) {
        throw new Error('Provider or user address not available');
    }

    // For now, use latest block - in a real implementation, you'd use the proposal's snapshot block
    const blockNumber = await provider.getBlockNumber();

    // Generate storage key for ERC20 balance mapping (assuming slot 0)
    const storageKey = getERC20BalanceStorageKey(userAddress, 0);

    // Get proof from Ethereum node
    const proof = await provider.send('eth_getProof', [
        contractAddress,
        [storageKey],
        `0x${blockNumber.toString(16)}`
    ]);

    const block = await provider.send('eth_getBlockByNumber', [
        `0x${blockNumber.toString(16)}`,
        false
    ]);

    const rawStorageValue = BigInt(proof.storageProof[0]?.value ?? '0x0');
    const storageValue = '0x' + rawStorageValue.toString(16).padStart(64, '0');

    return {
        blockHash: ethers.getBytes(block.hash),
        blockNumber: BigInt(blockNumber),
        userAddress: ethers.getBytes(userAddress),
        contractAddress: ethers.getBytes(contractAddress),
        storageKey: ethers.getBytes(storageKey),
        storageValue: ethers.getBytes(storageValue),
        accountProof: proof.accountProof.map(p => ethers.getBytes(p)),
        storageProof: proof.storageProof[0]?.proof.map(p => ethers.getBytes(p)) || []
    };
}