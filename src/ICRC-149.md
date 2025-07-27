
|ICRC|Title|Author|Discussions|Status|Type|Category|Created|
|:---:|:----|:----|:-----------|:-----|:---|:------|:------|
|149|Ethereum DAO Bridge Voting Standard|Austin Fatheree (@skilesare)|https://github.com/dfinity/ICRC/issues/149|Pre-Draft|Standards Track|Bridge|2025-05-22|

# ICRC-149: Ethereum DAO Bridge (EthDAOBridge)


ICRC-149 defines the standard interface for bridging Ethereum-based DAO governance with the Internet Computer (IC) ecosystem, with cryptographic proofs of Ethereum token-holder balances at a specified block for IC-side voting/quorum mapping.

## Key Principles & Voting Model

1. **DAO contract selection**
   - The "governance canister" for a DAO MUST be configured to reference one or more Ethereum contracts (ERC-20, ERC-721, or other) for voter eligibility.
   - The canister maintains a registry of approved snapshot contracts (for voting eligibility), execution contracts (for transaction targets), and ICP method calls.
   - Each proposal can specify which snapshot contract to use for voter eligibility, or use the default if none specified.

2. **Finalized snapshot for each proposal**
   - Upon creation of each new proposal, the canister MUST retrieve and store the latest finalized Ethereum block header (including `stateRoot`) and the token's total supply (from the specified snapshot contract).
   - The canister references this block, chain, contract, and `stateRoot` for all votes on that proposal.

3. **Voting with Merkle/EVM proof and SIWE**
   - Users who want to vote on a proposal MUST provide:
     - The proposal id.
     - Their ETH address (as 20-byte Blob).
     - Their vote choice (e.g., Yes, No, Abstain).
     - A valid EIP-4361 SIWE proof (to bind their Internet Identity Principal to an ETH address and add anti-replay/nonce).
     - A Merkle (or EVM trie) proof that their ETH address held a balance (or meets another condition) at the referenced block and contract (the "proof root" stored by the canister for the proposal).

4. **Proof/coding conventions**
   - The canister MUST implement methods for RLP-decode/EVM/Merkle proof verification.
   - SIWE signatures must be validated against proposal-specific nonce or using the SIWE issued_at timestamp to prevent replay.
   - Each vote checks balance > 0 (or alternative weight logic).
   - The canister MUST store (and return upon query) per-proposal tallies (yes/no/abstain counts and a list of who has voted).
   - Voting weights MUST be determined by off-chain balance proof at the referenced block, not by mutable on-chain/calldata state.

5. **Multi-action execution**
   - Proposals can execute three types of actions: Motion (text-only), EthTransaction (Ethereum transactions with ECDSA signing), or ICPCall (calls to IC canisters with best-effort timeout support).
   - Ethereum transactions support EIP-1559 fee structure with gas management and nonce tracking per subaccount.
   - ECDSA signing uses derivation paths for multiple Ethereum addresses from the same canister.
   - The canister maintains a cache of ECDSA public keys and their corresponding Ethereum addresses to optimize performance and reduce costs.

---

## Data Representation

### Governance Configuration Types
The bridge supports multiple contract configurations for flexibility in DAO operations.

```candid
// Configuration for approved snapshot contracts (ERC-20/721 tokens for voter eligibility)
type SnapshotContractConfig = record {
    contract_address: Text;
    chain: EthereumNetwork;
    rpc_service: EthereumRPCService;
    contract_type: variant {ERC20; ERC721; Other: Text}; // Type of token contract
    balance_storage_slot: Nat; // Storage slot number for balance mapping (security requirement)
    enabled: Bool;
};

// Configuration for approved execution contracts (targets for ETH transactions)
type ExecutionContractConfig = record {
    contract_address: Text;
    chain: EthereumNetwork;
    description: opt Text; // Human readable description of what this contract does
    enabled: Bool;
};

type ICPMethodConfig = record {
    canister: Principal;
    method: Text;
    enabled: Bool;
};

type EthereumRPCService = record {
    rpc_type: Text; // "mainnet", "sepolia", "custom", etc.
    canister_id: Principal;
    custom_config: opt vec record { Text; Text }; // For custom RPC configurations
};

type GovernanceConfigShared = record {
    snapshot_contracts: vec record { Text; SnapshotContractConfig };
    execution_contracts: vec record { Text; ExecutionContractConfig };
    approved_icp_methods: vec record { Text; ICPMethodConfig };
    admin_principals: vec Principal;
    default_snapshot_contract: opt Text;
};
```

### Network
```candid
type Network = variant {
    Ethereum: EthereumNetwork;
    ICP: Text;
    Other: record { key: Text; value: Value };
};
type EthereumNetwork = record {
    chain_id: Nat;
    network_name: Text; // e.g. "mainnet", "sepolia"
};
```


### ProposalSnapshot
Each proposal stores the configuration for its voting snapshot, including:

```candid
type ProposalSnapshot = record {
   contract_address: Text;     // Tracked token contract
   chain: EthereumNetwork;    // Network (chain-id, network name)
   block_number: Nat;         // Used block height
   state_root: Blob;          // EVM stateRoot or simplified balances Merkle root
   total_supply: Nat;         // Total token supply at snapshot block
   snapshot_time: Nat;        // Block timestamp (optional)
};
```

---


### Witness (Balance Proof)
A cryptographically verifiable proof (e.g., Merkle or EVM trie inclusion proof) that a given ETH address held a balance at the block used for a given proposal.

```candid
type Witness = record {
  blockHash: Blob;        // Block hash for the proof
  blockNumber: Nat;       // Block number for the proof
  userAddress: Blob;      // 20 bytes - ETH address
  contractAddress: Blob;  // 20 bytes - Contract address
  storageKey: Blob;       // 32 bytes - Storage key for balance mapping
  storageValue: Blob;     // Variable length, typically 32 bytes - Storage value
  accountProof: vec Blob; // Array of RLP-encoded proof nodes for account
  storageProof: vec Blob; // Array of RLP-encoded proof nodes for storage
};
```


### SIWE Verification
Input and result for EIP-4361 Sign-In With Ethereum used to prevent signature replay and to tie a vote to a concrete proposal. SIWE message must encode proposal id and a unique, time-limited nonce.

```candid
type SIWEProof = record {
  message: Text;
  signature: Blob;
};
type SIWEResult = variant {
   Ok: record {
      address: Text;
      domain: Text;
      statement: opt Text;
      issued_at: Nat;           // Nanoseconds timestamp
      issued_at_iso: Text;      // ISO 8601 format for human readability  
      expiration_time: Nat;     // Nanoseconds timestamp, must be within 10 minutes of issued_at
      expiration_time_iso: Text; // ISO 8601 format for human readability
      proposal_id: Nat;         // Extracted from message
      vote_choice: Text;        // Extracted from message ("Yes", "No", "Abstain")
      contract_address: Text;   // Extracted from message
      chain_id: Nat;           // Extracted from message
      nonce: Text;             // Should match expiration_time nanoseconds
   };
   Err: Text;
};
```

### Proposal/Tx Specification
Describes a generic transaction proposal to be voted on and, if successful, executed on Ethereum L1/L2 by the canister.

```candid
type EthTx = record {
    to: Text;                    // Target ETH contract address
    value: Nat;                  // ETH value in wei
    data: Blob;                  // Encoded call data (ABI)
    chain: EthereumNetwork;      // Chain for execution
    subaccount: opt Blob;        // Subaccount for derivation path in ECDSA signing
    maxPriorityFeePerGas: Nat;   // Gas parameters for EIP-1559 transactions
    maxFeePerGas: Nat;           // Maximum fee per gas unit
    gasLimit: Nat;               // Gas limit for the transaction
    signature: opt Blob;         // Optional signature for the transaction after execution
    nonce: opt Nat;              // Transaction nonce, set during execution
};

type ICPCall = record {
    canister: Principal;         // ICP canister ID
    method: Text;                // Method to call
    args: Blob;                  // Arguments for the method
    cycles: Nat;                 // Cycles to pay for the call
    best_effort_timeout: opt Nat32; // Best effort timeout for the call in nanoseconds
    result: opt variant { Ok: Blob; Err: Text }; // Result of the call once executed
};

type Proposal = record {
    id: Nat;
    proposer: Principal;
    action: variant {
      Motion: Text;
      EthTransaction: EthTx;
      ICPCall: ICPCall;
    };
    created_at: Nat;
    snapshot: opt ProposalSnapshot;  // Include full snapshot data instead of just ID
    deadline: Nat;         // Voting deadline
    metadata: opt Text;
};


type VoteArgs = record {
   proposal_id: Nat;
   voter: Blob;             // 20 bytes - Ethereum address
   choice: variant { Yes; No; Abstain };
   siwe: SIWEProof;
   witness: Witness;
};

type WitnessResult = variant {
    Ok: record {
      valid: Bool;
      user_address: Text;
      contract_address: Text;
      balance: Nat;
      block_number: Nat;
      state_root_verified: Bool;
    };
    Err: Text;
};

type TallyResult = record {
    yes: Nat;
    no: Nat;
    abstain: Nat;
    total: Nat;
    result: Text;
};

// Result types for consensus
type Result<Ok, Err> = variant {
    Ok: Ok;
    Err: Err;
};

type CreateProposalRequest = record {
    action: variant { Motion: Text; EthTransaction: EthTx; ICPCall: ICPCall };
    metadata: opt Text;
    members: vec record { id: Principal; votingPower: Nat };
    snapshot_contract: opt Text; // Optional snapshot contract for proposal
};

// ICRC-149 filters & supporting types following ICRC-137 pattern
type ProposalInfoFilter = variant {
    by_id: Nat;
    by_proposer: Principal;
    by_status: ProposalStatusFilter;
    by_action_type: ActionTypeFilter;
};

type ProposalStatusFilter = variant {
    pending;
    active;
    executed;
    rejected;
    expired;
    any;
};

type ActionTypeFilter = variant {
    motion;
    eth_transaction;
    icp_call;
    any;
};

type Value = variant {
    Nat: Nat;
    Nat8: Nat8;
    Int: Int;
    Text: Text;
    Blob: Blob;
    Bool: Bool;
    Array: vec Value;
    Map: vec record { Text; Value };
};
```

## Interface and Methods

### General Principles
- Query and update methods adhere to ICRC best practices for error handling and batch operation.
- All public calls must provide sufficient error information.
- Cycle costs MAY be associated with costly ETH operations, but the wallet/caller is always refunded for overages; see ICRC-10 for conventions.


### Bridge Governance & Snapshot Management

#### icrc149_governance_config
```candid
icrc149_governance_config: query() -> GovernanceConfigShared;
```
Returns the complete governance configuration including all snapshot contracts, execution contracts, approved ICP methods, and admin principals.

#### icrc149_get_snapshot_contracts
```candid
icrc149_get_snapshot_contracts: query() -> vec record { Text; SnapshotContractConfig };
```
Returns all approved snapshot contracts used for voter eligibility verification.

#### icrc149_get_execution_contracts
```candid
icrc149_get_execution_contracts: query() -> vec record { Text; ExecutionContractConfig };
```
Returns all approved execution contracts that can be targets for ETH transactions.

#### icrc149_get_approved_icp_methods
```candid
icrc149_get_approved_icp_methods: query() -> vec record { Text; ICPMethodConfig };
```
Returns all approved ICP method calls that can be executed through proposals.

#### icrc149_update_snapshot_contract_config
```candid
icrc149_update_snapshot_contract_config: (Text, opt SnapshotContractConfig) -> async Result<(), Text>;
```
Admin function to add, update, or remove (pass null) snapshot contract configurations.

#### icrc149_update_execution_contract_config
```candid
icrc149_update_execution_contract_config: (Text, opt ExecutionContractConfig) -> async Result<(), Text>;
```
Admin function to add, update, or remove (pass null) execution contract configurations.

#### icrc149_update_icp_method_config
```candid
icrc149_update_icp_method_config: (Principal, Text, opt ICPMethodConfig) -> async Result<(), Text>;
```
Admin function to add, update, or remove (pass null) ICP method configurations.

#### icrc149_update_admin_principal
```candid
icrc149_update_admin_principal: (Principal, Bool) -> async Result<(), Text>;
```
Admin function to add or remove admin principals.

#### icrc149_proposal_snapshot
```candid
icrc149_proposal_snapshot: query (Nat) -> ProposalSnapshot;
```
Returns the snapshot config (block, stateRoot, supply, etc) for a given proposal.

### SIWE Authentication

#### icrc149_verify_siwe
```candid
icrc149_verify_siwe: (SIWEProof) -> async SIWEResult;
```
Verifies SIWE proof and returns ETH address and other details including proposal context and anti-replay validation.

### Witness Verification

#### icrc149_verify_witness
```candid
icrc149_verify_witness: (Witness, opt Nat) -> async WitnessResult;
```
Verifies a witness proof against stored canister state, optionally for a specific proposal.

### Proposal Management

#### icrc149_get_proposals
```candid
icrc149_get_proposals: query (opt Nat, opt Nat, vec ProposalInfoFilter) -> vec Proposal;
```
Get proposals with pagination and filtering. Parameters: prev (for pagination), take (limit), filters (status, proposer, action type, etc).

#### icrc149_create_proposal
```candid
icrc149_create_proposal: (CreateProposalRequest) -> async Result<Nat, Text>;
```
On call, the canister fetches and stores the current finalized block header, total supply, and stores a snapshot for this proposal. Returns proposal ID.

#### icrc149_vote_proposal
```candid
icrc149_vote_proposal: (VoteArgs) -> async Result<(), Text>;
```
Caller submits:
  - proposal id
  - ETH voter address (as Blob)
  - binary choice (Yes/No/Abstain)
  - SIWE signature (proves ownership, binds to proposal)
  - Merkle (or EVM trie) proof showing balance at referenced block.
Canister verifies both proofs and updates per-proposal tallies, refusing double-voting.

#### icrc149_tally_votes
```candid
icrc149_tally_votes: (Nat) -> async TallyResult;
```
Returns the current per-proposal tally, computed from checked proofs.

#### icrc149_execute_proposal
```candid
icrc149_execute_proposal: (Nat) -> async Result<Text, Text>;
```
If proposal passes: triggers ETH transaction, ICP call, or motion. Returns execution result/txid or error.

### ETH Integration

#### icrc149_get_eth_tx_status
```candid
icrc149_get_eth_tx_status: query (Text) -> Text;
```
Checks ETH transaction hash for status/confirmation.

*Note: Ethereum transaction execution is handled internally by the canister when proposals are executed. There is no direct public interface for sending arbitrary ETH transactions - they must go through the proposal and voting process.*

### ECDSA Address Management

#### icrc149_get_ethereum_address
```candid
icrc149_get_ethereum_address: query (opt Blob) -> Text;
```
Returns the Ethereum address for a given subaccount (or default if none provided). The canister maintains a cache of ECDSA public keys to avoid expensive repeated calls to the IC management canister. This function is essential for users to know which Ethereum address will be used for transaction execution for different subaccounts.

### Admin & Upgrade



### Standard Compliance

#### icrc10_supported_standards
```candid
icrc10_supported_standards: query () -> vec record { name: Text; url: Text };
```
Lists supported standards as in ICRC-10. Must include ICRC-149, ICRC-10.

## Block Types and State Changes


### Block: proposal_snapshot_stored
```json
{
  "btype": "149proposalSnapshotStored",
  "tx": {
    "proposal_id": <Nat>,
    "snapshot": <ProposalSnapshot>,
    "ts": <Nat>
  }
}
```


### Block: vote_cast_proof
```json
{
  "btype": "149voteCastProof",
  "tx": {
    "proposal_id": <Nat>,
    "voter": <Text>,
    "choice": <Text>,
    "proof": <Witness>,
    "balance": <Nat>,
    "ts": <Nat>
  }
}
```

### Block: proposal_created
```json
{
  "btype": "149proposalCreated",
  "tx": {
    "proposal": <Proposal>,
    "proposer": <Principal>,
    "ts": <Nat>
  }
}
```

### Block: vote_cast
```json
{
  "btype": "149voteCast",
  "tx": {
    "proposal_id": <Nat>,
    "voter": <Text>,
    "weight": <Nat>,
    "ts": <Nat>
  }
}
```

### Block: proposal_executed
```json
{
  "btype": "149proposalExecuted",
  "tx": {
    "proposal_id": <Nat>,
    "execution_tx": <Text>,
    "result": <Text>,
    "execution_type": <Text>, // "eth_transaction", "icp_call", or "motion"
    "ts": <Nat>
  }
}
```




