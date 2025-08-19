// ICRC149 DAO Voting Interface Core Module
// This module provides the core functionality for interacting with the ICRC149 DAO Bridge

import { ethers } from 'ethers';
import { Actor, HttpAgent, AnonymousIdentity } from '@dfinity/agent';
import { idlFactory } from '../../../declarations/backend/backend.did.js';

export class ICRC149VotingInterface {
    constructor() {
        this.metamaskProvider = null;
        this.dfxAgent = null;
        this.canisterActor = null;
        this.userAddress = null;
        this.currentChainId = null;
        this.storageSlot = null;
        this.isLocal = false;
        
        this.initializeMetaMask();
    }
    
    // Known chain configurations
    static CHAIN_CONFIGS = {
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
    
    // Initialize MetaMask connection
    initializeMetaMask() {
        if (typeof window !== 'undefined' && window.ethereum) {
            this.metamaskProvider = new ethers.BrowserProvider(window.ethereum);
            
            // Listen for account changes
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.userAddress = null;
                } else {
                    this.userAddress = accounts[0];
                }
                this.onAccountChange?.(this.userAddress);
            });
            
            // Listen for chain changes
            window.ethereum.on('chainChanged', (chainId) => {
                this.currentChainId = parseInt(chainId, 16);
                this.onChainChange?.(this.currentChainId);
            });
        }
    }
    
    // Connect to MetaMask wallet
    async connectWallet() {
        if (!this.metamaskProvider) {
            throw new Error('MetaMask not available');
        }
        
        await this.metamaskProvider.send("eth_requestAccounts", []);
        const signer = await this.metamaskProvider.getSigner();
        this.userAddress = await signer.getAddress();
        
        const network = await this.metamaskProvider.getNetwork();
        this.currentChainId = Number(network.chainId);
        
        return {
            address: this.userAddress,
            chainId: this.currentChainId
        };
    }
    
    // Initialize connection to IC canister
    async initializeCanister(canisterId, environment = 'local') {
        this.isLocal = environment === 'local';
        
        let agent;
        if (this.isLocal) {
            // Local development configuration with best practices
            agent = new HttpAgent.create({
                host: 'http://127.0.0.1:8080',
                identity: new AnonymousIdentity()
            });
            
            // Fetch root key for local development - ONLY do this in development!
            await agent.fetchRootKey();
        } else {
            // Internet Computer production configuration
            agent = new HttpAgent.create({
                host: 'https://ic0.app',
                identity: new AnonymousIdentity()
            });
        }
        
        this.dfxAgent = agent;
        
        // Create canister actor with proper IDL
        this.canisterActor = Actor.createActor(idlFactory, {
            agent: this.dfxAgent,
            canisterId: canisterId
        });
        
        return this.canisterActor;
    }
    
    // Get contract configuration from canister
    async getContractConfig(contractAddress) {
        if (!this.canisterActor) {
            throw new Error('Canister not initialized');
        }
        
        const result = await this.canisterActor.icrc149_get_snapshot_contracts();
        
        // Find the contract in the list
        const contractConfig = result.find(([address, config]) => address === contractAddress);
        
        if (contractConfig) {
            const [, config] = contractConfig;
            this.storageSlot = Number(config.balance_storage_slot);
            return config;
        } else {
            throw new Error(`Contract ${contractAddress} not found in snapshot contracts`);
        }
    }
    
    // Load proposals for a specific contract
    async loadProposals(contractAddress = null) {
        if (!this.canisterActor) {
            throw new Error('Canister not initialized');
        }
        
        const result = await this.canisterActor.icrc149_get_proposals(null, [BigInt(10)], []);
        
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
    
    // Get user's token balance
    async getUserTokenBalance(contractAddress, userAddress = this.userAddress, blockTag = 'latest') {
        if (!this.metamaskProvider || !userAddress) {
            return BigInt(0);
        }
        
        try {
            // ERC20 balanceOf function call: balanceOf(address)
            const balanceData = `0x70a08231${userAddress.slice(2).padStart(64, '0')}`;
            const result = await this.metamaskProvider.send('eth_call', [
                {
                    to: contractAddress,
                    data: balanceData
                },
                blockTag
            ]);
            
            return ethers.getBigInt(result || '0x0');
        } catch (error) {
            console.error('Failed to get token balance:', error);
            return BigInt(0);
        }
    }
    
    // Check if user has already voted on a proposal
    async hasUserVoted(proposalId, userAddress = this.userAddress) {
        // This would need to be implemented in the canister
        // For now, return false as a placeholder
        return false;
    }
    
    // Cast a vote on a proposal
    async castVote(proposalId, choice, contractAddress) {
        if (!this.userAddress) {
            throw new Error('Wallet not connected');
        }
        
        if (!this.canisterActor) {
            throw new Error('Canister not initialized');
        }
        
        // Generate SIWE proof
        const siweProof = await this.generateSIWEProof(proposalId, choice, contractAddress);
        
        // Generate witness proof
        const witness = await this.generateWitnessProof(contractAddress, this.userAddress, proposalId);
        
        // Prepare vote arguments
        const voteChoice = choice === 'Yes' ? { Yes: null } : 
                          choice === 'No' ? { No: null } : 
                          { Abstain: null };
        
        const voteArgs = {
            proposal_id: BigInt(proposalId),
            voter: ethers.getBytes(this.userAddress),
            choice: voteChoice,
            siwe: siweProof,
            witness: witness
        };
        
        // Submit vote to canister
        const result = await this.canisterActor.icrc149_vote_proposal(voteArgs);
        
        if ('Ok' in result) {
            return 'Vote submitted successfully';
        } else {
            throw new Error(`Vote failed: ${result.Err}`);
        }
    }
    
    // Execute a proposal (end vote)
    async executeProposal(proposalId) {
        if (!this.canisterActor) {
            throw new Error('Canister not initialized');
        }
        
        const result = await this.canisterActor.icrc149_execute_proposal(BigInt(proposalId));
        
        if ('Ok' in result) {
            return result.Ok;
        } else {
            throw new Error(`Execution failed: ${result.Err}`);
        }
    }
    
    // Discover storage slot for ERC20 balance mapping
    async discoverStorageSlot(contractAddress, userAddress = this.userAddress) {
        if (!userAddress) {
            throw new Error('User address not available');
        }
        
        // Get current balance via balanceOf call
        const actualBalance = await this.getUserTokenBalance(contractAddress, userAddress);
        
        if (actualBalance === BigInt(0)) {
            throw new Error('User has 0 tokens. Storage slot discovery requires a non-zero balance.');
        }
        
        // Try common storage slots (0-10)
        for (let slot = 0; slot <= 10; slot++) {
            try {
                const storageKey = this.getERC20BalanceStorageKey(userAddress, slot);
                const storageValue = await this.metamaskProvider.send('eth_getStorageAt', [
                    contractAddress,
                    storageKey,
                    'latest'
                ]);
                
                const storageBalance = ethers.getBigInt(storageValue || '0x0');
                
                if (storageBalance === actualBalance) {
                    this.storageSlot = slot;
                    return slot;
                }
            } catch (error) {
                console.log(`Slot ${slot} check failed:`, error.message);
            }
        }
        
        throw new Error('Could not find storage slot in range 0-10. The contract may use a non-standard storage layout.');
    }
    
    // Update canister with discovered storage slot
    async updateCanisterStorageSlot(chainId, contractAddress, slot) {
        if (!this.canisterActor) {
            throw new Error('Canister not initialized');
        }
        
        const config = {
            contract_address: contractAddress,
            chain: { 
                chain_id: BigInt(chainId), 
                network_name: ICRC149VotingInterface.CHAIN_CONFIGS[chainId]?.name || 'Unknown' 
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
        
        const result = await this.canisterActor.icrc149_update_snapshot_contract_config(
            contractAddress, 
            [config]
        );
        
        if ('Ok' in result) {
            return 'Configuration updated successfully';
        } else {
            throw new Error(`Failed to update canister: ${result.Err}`);
        }
    }
    
    // Generate SIWE (Sign-In With Ethereum) proof
    async generateSIWEProof(proposalId, choice, contractAddress) {
        if (!this.metamaskProvider) {
            throw new Error('MetaMask not available');
        }
        
        const signer = await this.metamaskProvider.getSigner();
        const address = await signer.getAddress();
        
        // Create SIWE message following EIP-4361
        const domain = 'dao-voting.example.com';
        const statement = `Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}`;
        const uri = `https://${domain}`;
        const version = '1';
        const chainId = this.currentChainId;
        const nonce = Date.now().toString();
        const issuedAt = new Date().toISOString();
        const expirationTime = new Date(Date.now() + 600000).toISOString(); // 10 minutes
        
        const message = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expirationTime}`;
        
        const signature = await signer.signMessage(message);
        
        return {
            message: message,
            signature: ethers.getBytes(signature)
        };
    }

    
    
    // Get all proposals with optional filtering
    async getProposals(limit = 10, offset = null, filters = []) {
        if (!this.canisterActor) {
            throw new Error('Canister not initialized');
        }
        
        const limitOpt = limit ? [BigInt(limit)] : [];
        const prevOpt = offset ? [BigInt(offset)] : null;
        
        const result = await this.canisterActor.icrc149_get_proposals(prevOpt, limitOpt, filters);
        
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
    
    // Generate witness proof for user's token balance
    async generateWitnessProof(contractAddress, userAddress, proposalId) {
        if (!this.canisterActor) {
            throw new Error('Canister not initialized');
        }
        
        // Get proposal details to find snapshot block
        const proposal = await this.canisterActor.icrc149_get_proposal(BigInt(proposalId));
        if (!proposal) {
            throw new Error(`Proposal ${proposalId} not found`);
        }
        
        const blockNumber = proposal.snapshot ? Number(proposal.snapshot.block_number) : 'latest';
        
        // Generate storage key for user's balance
        const slot = this.storageSlot || 0; // Use discovered slot or default to 0
        const storageKey = this.getERC20BalanceStorageKey(userAddress, slot);
        
        // Get proof from Ethereum node
        const proof = await this.metamaskProvider.send('eth_getProof', [
            contractAddress,
            [storageKey],
            `0x${blockNumber.toString(16)}`
        ]);
        
        const block = await this.metamaskProvider.send('eth_getBlockByNumber', [
            `0x${blockNumber.toString(16)}`,
            false
        ]);
        
        return {
            blockHash: ethers.getBytes(block.hash),
            blockNumber: BigInt(blockNumber),
            userAddress: ethers.getBytes(userAddress),
            contractAddress: ethers.getBytes(contractAddress),
            storageKey: ethers.getBytes(storageKey),
            storageValue: ethers.getBytes(proof.storageProof[0]?.value || '0x0'),
            accountProof: proof.accountProof.map(p => ethers.getBytes(p)),
            storageProof: proof.storageProof[0]?.proof.map(p => ethers.getBytes(p)) || []
        };
    }
    
    // Generate storage key for ERC20 balance mapping
    getERC20BalanceStorageKey(userAddress, slotIndex) {
        // Standard ERC20 balance mapping: mapping(address => uint256) balances
        // Storage key = keccak256(abi.encode(userAddress, slotIndex))
        const paddedAddress = ethers.zeroPadValue(userAddress, 32);
        const paddedSlot = ethers.zeroPadValue(`0x${slotIndex.toString(16)}`, 32);
        return ethers.keccak256(ethers.concat([paddedAddress, paddedSlot]));
    }
    
    // Get vote tally for a proposal
    async getVoteTally(proposalId) {
        if (!this.canisterActor) {
            throw new Error('Canister not initialized');
        }
        
        const result = await this.canisterActor.icrc149_tally_votes(BigInt(proposalId));
        
        return {
            yes: Number(result.yes),
            no: Number(result.no),
            abstain: Number(result.abstain),
            total: Number(result.total),
            result: result.result
        };
    }
    
    // Event handlers (to be set by the UI)
    onAccountChange = null;
    onChainChange = null;
    onStatusUpdate = null;
}

// Singleton instance for global use
export const votingInterface = new ICRC149VotingInterface();

// Export for use in browser environments
if (typeof window !== 'undefined') {
    window.ICRC149VotingInterface = ICRC149VotingInterface;
}

export default ICRC149VotingInterface;
