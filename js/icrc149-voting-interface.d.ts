// Type definitions for ICRC149 Voting Interface
// TypeScript definitions for better development experience

export interface ChainConfig {
    name: string;
    symbol: string;
    rpc: string;
}

export interface VoteChoice {
    Yes: null;
    No: null;
    Abstain: null;
}

export interface SIWEProof {
    message: string;
    signature: Uint8Array;
}

export interface Witness {
    blockHash: Uint8Array;
    blockNumber: bigint;
    userAddress: Uint8Array;
    contractAddress: Uint8Array;
    storageKey: Uint8Array;
    storageValue: Uint8Array;
    accountProof: Uint8Array[];
    storageProof: Uint8Array[];
}

export interface VoteArgs {
    proposal_id: bigint;
    voter: Uint8Array;
    choice: VoteChoice;
    siwe: SIWEProof;
    witness: Witness;
}

export interface VoteTally {
    yes: number;
    no: number;
    abstain: number;
    total: number;
}

export interface Proposal {
    id: number;
    status: 'Active' | 'Passed' | 'Failed' | 'Executed';
    metadata: string[];
    vote_tally: VoteTally;
    end_time: number; // Unix timestamp in milliseconds
    snapshot_block: number;
}

export interface SnapshotContractConfig {
    contract_address: string;
    chain: {
        chain_id: bigint;
        network_name: string;
    };
    rpc_service: {
        rpc_type: string;
        canister_id: string[] | null;
        custom_config: [string, string][];
    };
    contract_type: { ERC20: null };
    balance_storage_slot: bigint;
    enabled: boolean;
}

export interface WalletConnection {
    address: string;
    chainId: number;
}

export interface UserVotingData {
    balance: bigint;
    existingVotes: Map<number, string>;
}

// ICRC149 Canister Actor Interface
export interface ICRC149Actor {
    // Voting functions
    icrc149_vote_proposal(args: VoteArgs): Promise<{ Ok: string } | { Err: string }>;
    icrc149_tally_votes(proposalId: bigint): Promise<{ Ok: VoteTally } | { Err: string }>;
    icrc149_execute_proposal(proposalId: bigint): Promise<{ Ok: string } | { Err: string }>;
    
    // Proposal management
    icrc149_get_proposal(proposalId: bigint): Promise<{ Ok: Proposal } | { Err: string }>;
    icrc149_list_proposals(contractAddress?: string[]): Promise<{ Ok: Proposal[] } | { Err: string }>;
    icrc149_proposal_snapshot(proposalId: bigint): Promise<{
        block_number: bigint;
        contract_address: string;
    }>;
    
    // Configuration functions
    icrc149_update_snapshot_contract_config(
        contractAddress: string, 
        config: SnapshotContractConfig[] | null
    ): Promise<{ Ok: string } | { Err: string }>;
    icrc149_get_snapshot_contract_config(
        contractAddress: string
    ): Promise<{ Ok: SnapshotContractConfig } | { Err: string }>;
    icrc149_set_default_snapshot_contract(
        contractAddress: string[] | null
    ): Promise<{ Ok: string } | { Err: string }>;
    
    // Ethereum address
    icrc149_get_ethereum_address(subaccount?: Uint8Array[]): Promise<string>;
    
    // Witness verification
    icrc149_verify_witness(
        witness: Witness, 
        proposalId?: bigint[]
    ): Promise<{ Ok: string } | { Err: string }>;
    
    // Transaction status
    icrc149_get_eth_tx_status(txHash: string): Promise<{ Ok: string } | { Err: string }>;
}

// Event handler types
export type AccountChangeHandler = (address: string | null) => void;
export type ChainChangeHandler = (chainId: number) => void;
export type StatusUpdateHandler = (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;

// Main interface class
export declare class ICRC149VotingInterface {
    static CHAIN_CONFIGS: Record<number, ChainConfig>;
    
    metamaskProvider: any;
    dfxAgent: any;
    canisterActor: ICRC149Actor | null;
    userAddress: string | null;
    currentChainId: number | null;
    storageSlot: number | null;
    isLocal: boolean;
    
    // Event handlers
    onAccountChange: AccountChangeHandler | null;
    onChainChange: ChainChangeHandler | null;
    onStatusUpdate: StatusUpdateHandler | null;
    
    constructor();
    
    // Connection methods
    initializeMetaMask(): void;
    connectWallet(): Promise<WalletConnection>;
    initializeCanister(canisterId: string, environment?: 'local' | 'ic'): Promise<ICRC149Actor>;
    
    // Contract methods
    getContractConfig(contractAddress: string): Promise<SnapshotContractConfig>;
    loadProposals(contractAddress?: string): Promise<Proposal[]>;
    getUserTokenBalance(contractAddress: string, userAddress?: string, blockTag?: string): Promise<bigint>;
    hasUserVoted(proposalId: number, userAddress?: string): Promise<boolean>;
    
    // Voting methods
    castVote(proposalId: number, choice: 'Yes' | 'No' | 'Abstain', contractAddress: string): Promise<string>;
    executeProposal(proposalId: number): Promise<string>;
    getVoteTally(proposalId: number): Promise<VoteTally>;
    
    // Storage slot methods
    discoverStorageSlot(contractAddress: string, userAddress?: string): Promise<number>;
    updateCanisterStorageSlot(chainId: number, contractAddress: string, slot: number): Promise<string>;
    
    // Proof generation methods
    generateSIWEProof(proposalId: number, choice: string, contractAddress: string): Promise<SIWEProof>;
    generateWitnessProof(contractAddress: string, userAddress: string, proposalId: number): Promise<Witness>;
    getERC20BalanceStorageKey(userAddress: string, slotIndex: number): string;
    
    // Static methods
    static getIDLFactory(): any;
}

// Global window extension for browser usage
declare global {
    interface Window {
        ICRC149VotingInterface: typeof ICRC149VotingInterface;
        ethereum?: any;
        ethers?: any;
    }
}

export default ICRC149VotingInterface;
