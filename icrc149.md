
|ICRC|Title|Author|Discussions|Status|Type|Category|Created|
|:---:|:----|:----|:-----------|:-----|:---|:------|:------|
|149|Ethereum DAO Bridge Voting Standard|Austin Fatheree (@skilesare)|https://github.com/dfinity/ICRC/issues/149|Pre-Draft|Standards Track|Bridge|2025-05-22|

# ICRC-149: Ethereum DAO Bridge (EthDAOBridge)


ICRC-149 defines the standard interface for bridging Ethereum-based DAO governance with the Internet Computer (IC) ecosystem, with cryptographic proofs of Ethereum token-holder balances at a specified block for IC-side voting/quorum mapping.

## Key Principles & Voting Model

1. **Multi-contract governance configuration**
   - The "governance canister" for a DAO MUST be configured with a list of approved Ethereum contracts (ERC-20, ERC-721, or other).
   - Each approved contract has its own chain, RPC service configuration, and enabled/disabled status.
   - The canister maintains a set of admin principals who can manage the approved contracts and methods.

2. **Contract-specific snapshots for proposals**
   - Upon creation of each new proposal, the proposer MUST specify which approved contract to use for the voting snapshot (or use the default if configured).
   - The canister retrieves and stores the latest finalized Ethereum block header (including `stateRoot`) and the token's total supply from the specified contract.
   - The canister references this specific contract, chain, and `stateRoot` for all votes on that proposal.

3. **RPC service management**
   - Each approved contract has an associated RPC service configuration specifying which EVM RPC canister to use and any custom parameters.
   - This allows different contracts to use different RPC providers or configurations as needed.

4. **ICP method call governance**
   - The canister maintains a list of approved ICP canister methods that can be called via governance proposals.
   - This provides governance over both Ethereum transactions AND ICP canister calls.

5. **Voting with Merkle/EVM proof and SIWE**
   - Users who want to vote on a proposal MUST provide:
     - The proposal id.
     - Their ETH address (as a string, hex-encoded).
     - Their vote choice (e.g., Yes, No, Abstain).
     - A valid EIP-4361 SIWE proof (to bind their Internet Identity Principal to an ETH address and add anti-replay/nonce).
     - A Merkle (or EVM trie) proof that their ETH address held a balance (or meets another condition) at the referenced block and contract (the "proof root" stored by the canister for the proposal).

6. **Proof/coding conventions**
   - The canister MUST implement methods for RLP-decode/EVM/Merkle proof verification.
   - SIWE signatures must be validated against proposal-specific nonce or using the SIWE issued_at timestamp to prevent replay.
   - Each vote checks balance > 0 (or alternative weight logic).
   - The canister MUST store (and return upon query) per-proposal tallies (yes/no/abstain counts and a list of who has voted).
   - Voting weights MUST be determined by off-chain balance proof at the referenced block, not by mutable on-chain/calldata state.

---

## Data Representation

## Data Representation

### Governance Configuration
The governance canister maintains configuration for multiple types of approved contracts and methods:

```candid
// Configuration for snapshot contracts (ERC-20/721 tokens for voter eligibility)
type SnapshotContractConfig = record {
    contract_address: Text;
    chain: EthereumNetwork;
    rpc_service: EthereumRPCService;
    contract_type: variant { ERC20; ERC721; Other: Text };
    enabled: Bool;
};

// Configuration for execution contracts (targets for ETH transactions)
type ExecutionContractConfig = record {
    contract_address: Text;
    chain: EthereumNetwork;
    description: opt Text; // Human readable description
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

type GovernanceConfig = record {
    snapshot_contracts: vec record { Text; SnapshotContractConfig };
    execution_contracts: vec record { Text; ExecutionContractConfig };
    approved_icp_methods: vec record { Text; ICPMethodConfig };
    admin_principals: vec Principal;
    default_snapshot_contract: opt Text;
};
```

**Key Distinctions:**

- **Snapshot Contracts**: ERC-20/721 token contracts used for determining voter eligibility and voting power. These must have RPC service configurations for retrieving token balances.
- **Execution Contracts**: Any Ethereum contracts that can be targeted by governance proposals for transaction execution. These don't need RPC configurations since they're just targets.

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
  address: Text;       // ETH address (hex)
  proof: vec Blob;     // Proof nodes for EVM/Merkle inclusion
  leaf: Blob;          // Leaf encoding found in trie/Merkle
  root: Blob;          // Root hash (should match ProposalSnapshot.state_root)
};
```


### SIWE Verification
Input and result for EIP-4361 Sign-In With Ethereum used to prevent signature replay and to tie a vote to a concrete proposal. The SIWE message MUST contain specific fields to prevent replay attacks without requiring per-user nonce tracking.

**Required SIWE Message Format for Voting:**
```
{domain} wants you to sign in with your Ethereum account:
{address}

Vote {choice} on proposal {proposal_id} for contract {contract_address}

URI: {uri}
Version: 1
Chain ID: {chain_id}
Nonce: {timestamp_plus_10_minutes_nanoseconds}
Issued At: {current_timestamp_iso}
Issued At Nanos: {current_timestamp_nanoseconds}
Expiration Time: {timestamp_plus_10_minutes_iso}
Expiration Nanos: {timestamp_plus_10_minutes_nanoseconds}
```

**Anti-Replay Protection Strategy:**
- **Proposal Binding**: Message includes specific `proposal_id` 
- **Vote Binding**: Message includes specific vote `choice` (Yes/No/Abstain)
- **Contract Binding**: Message includes `contract_address` for the governance token
- **Chain Binding**: Message includes `chain_id` to prevent cross-chain replay
- **Time Window**: `Nonce` and `Expiration Nanos` set to current time + 10 minutes in nanoseconds
- **Dual Timestamps**: Both ISO 8601 text format and nanosecond timestamps for easier parsing
- **Uniqueness**: Each vote requires a fresh signature within the time window

This approach eliminates the need for per-user nonce storage while ensuring signatures cannot be replayed across different proposals, votes, contracts, chains, or time periods.

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
    to: Text;              // Target ETH contract address
    value: Nat;            // ETH value in wei
    data: Blob;            // Encoded call data (ABI)
    chain: EthereumNetwork;// Chain for execution
};

type Proposal = record {
    id: Nat;
    proposer: Principal;
    action: variant {
      Motion: Text;
      EthTransaction: EthTx;
    };
    created_at: Nat;
    snapshot: opt ProposalSnapshot;  // Full snapshot data included
    deadline: Nat;         // Voting deadline
    metadata: opt Text;
};

// ICRC-149 filters & supporting types (following ICRC-137 pattern)
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
    any;
};

type VoteArgs = record {
   proposal_id: Nat;
   voter: Text;           // ETH address  
   choice: variant { Yes; No; Abstain };
   siwe: SIWEProof;       // Must include proposal_id, choice, contract_address, chain_id in message
   witness: Witness;      // Cryptographic proof of token balance
};
```

## Interface and Methods

### General Principles
- Query and update methods adhere to ICRC best practices for error handling and batch operation.
- All public calls must provide sufficient error information.
- Cycle costs MAY be associated with costly ETH operations, but the wallet/caller is always refunded for overages; see ICRC-10 for conventions.


### Bridge Governance & Snapshot Management

#### governance_config
```candid
governance_config: query() -> record {
    contract_address: Text;
    chain: EthereumNetwork;
};
```
Returns the contract (and chain) used for DAO voting snapshots.

#### get_proposals
```candid
get_proposals: query (opt Nat, opt Nat, vec ProposalInfoFilter) -> vec Proposal;
```
Returns paginated and filtered proposals. Each proposal includes its full snapshot data.
- First parameter: `prev` - Optional previous proposal ID for pagination
- Second parameter: `take` - Optional number of proposals to return (default: 10)
- Third parameter: Filter criteria for proposals (by_id, by_proposer, by_status, by_action_type)

Each returned proposal includes the complete `ProposalSnapshot` data, eliminating the need for separate snapshot queries.

### SIWE Authentication

#### verify_siwe
```candid
verify_siwe: (SIWEProof) -> query SIWEResult;
```
Verifies SIWE proof and returns ETH address and other details.


#### create_proposal
```candid
create_proposal: (Proposal) -> async Result<Nat, Text>;
```
On call, the canister fetches and stores the current finalized block header, total supply, and stores a snapshot for this proposal.

#### vote_proposal
```candid
vote_proposal: (VoteArgs) -> async Result<(), Text>;
```
Caller submits:
  - proposal id
  - ETH voter address
  - binary choice (Yes/No/Abstain)
  - SIWE signature (proves ownership, binds to proposal)
  - Merkle (or EVM trie) proof showing balance at referenced block.
Canister verifies both proofs and updates per-proposal tallies, refusing double-voting.

#### tally_votes
```candid
tally_votes: (Nat) -> query record {
   yes: Nat;
   no: Nat;
   abstain: Nat;
   total: Nat;
   result: Text;
};
```
Returns the current per-proposal tally, computed from checked proofs.

#### execute_proposal
```candid
execute_proposal: (Nat) -> async Result<Text, Text>;
```
If proposal passes: triggers ETH transaction or motion. Returns execution result/txid or error.

### ETH Integration

#### send_eth_tx
```candid
send_eth_tx: (EthTx) -> async Result<Text, Text>;
```
Executes a generic ETH transaction via ChainFusion/ETHRPC. Returns ETH tx hash or error.

#### get_eth_tx_status
```candid
get_eth_tx_status: (Text) -> query Text;
```
Checks ETH transaction hash for status/confirmation.

### Admin & Upgrade

#### set_controller
```candid
set_controller: (Principal) -> async Result<(), Text>;
```
Transfers bridge control ownership.

#### health_check
```candid
health_check: query () -> Text;
```
Returns canister health status.

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
    "ts": <Nat>
  }
}
```


## API Functions

All ICRC-149 functions are prefixed with `icrc149_`:

### Governance Configuration
- `icrc149_governance_config()` - Get complete governance configuration including all contract types and methods
- `icrc149_get_snapshot_contracts()` - Get list of approved snapshot contracts (for voter eligibility)
- `icrc149_get_execution_contracts()` - Get list of approved execution contracts (for transaction targets)
- `icrc149_get_approved_icp_methods()` - Get list of approved ICP canister methods for governance

### Governance Management (Admin Only)
- `icrc149_update_snapshot_contract_config(address, config)` - Add, update, or remove snapshot contract configuration
- `icrc149_update_execution_contract_config(address, config)` - Add, update, or remove execution contract configuration
- `icrc149_update_icp_method_config(canister, method, config)` - Add, update, or remove approved ICP method configuration
- `icrc149_update_admin_principal(principal, is_admin)` - Add or remove admin principals

### Proposal Management
- `icrc149_create_proposal(proposal_args)` - Create a new proposal with specified snapshot contract
- `icrc149_vote_proposal(vote_args)` - Vote on a proposal with cryptographic proof
- `icrc149_tally_votes(proposal_id)` - Get current vote tally for a proposal
- `icrc149_execute_proposal(proposal_id)` - Execute a passed proposal

### Authentication & Verification
- `icrc149_verify_siwe(siwe_proof)` - Verify Sign-In With Ethereum proof
- `icrc149_proposal_snapshot(proposal_id)` - Get snapshot data used for a specific proposal

### Ethereum Integration
- `icrc149_send_eth_tx(eth_tx)` - Send an Ethereum transaction (for executed proposals)
- `icrc149_get_eth_tx_status(tx_hash)` - Check Ethereum transaction status

### System Functions
- `icrc149_health_check()` - Get system health status
- `icrc149_set_controller(new_controller)` - Change canister controller (admin only)
- `icrc10_supported_standards()` - List supported ICRC standards

## Additional Guidance, Tips, and Security

- **Proof verification:** For EVM contracts, implement RLP/MPT/Binary Merkle proof logic as needed. Simpler off-chain balance snapshot and Merkle tree is recommended for efficiency.
- **Replay protection:** SIWE proof must encode the proposal_id, vote choice, contract_address, and chain_id in the message, with `Nonce` and `Expiration Nanos` set to current time + 10 minutes in nanoseconds to create a time-bounded voting window. Both ISO 8601 text timestamps and nanosecond timestamps are included for easier parsing and validation. This eliminates the need for per-user nonce storage while preventing all replay attack vectors.
- **Gas and cycles:** No Ethereum gas is ever spent. However, complex proof verification may consume IC cycles and incur fees.
- **Audit and privacy:** Tallies and vote proofs MAY be published for auditability, but revealing all voting addresses is optional.
- **Resilience:** Canister must be upgradeable. Orchestrator/backup for governance migration is RECOMMENDED.

