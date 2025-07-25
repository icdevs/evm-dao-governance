
|ICRC|Title|Author|Discussions|Status|Type|Category|Created|
|:---:|:----|:----|:-----------|:-----|:---|:------|:------|
|149|Ethereum DAO Bridge Voting Standard|Austin Fatheree (@skilesare)|https://github.com/dfinity/ICRC/issues/149|Pre-Draft|Standards Track|Bridge|2025-05-22|

# ICRC-149: Ethereum DAO Bridge (EthDAOBridge)


ICRC-149 defines the standard interface for bridging Ethereum-based DAO governance with the Internet Computer (IC) ecosystem, with cryptographic proofs of Ethereum token-holder balances at a specified block for IC-side voting/quorum mapping.

## Key Principles & Voting Model

1. **DAO contract selection**
   - The "governance canister" for a DAO MUST be configured to reference a particular Ethereum contract (ERC-20, ERC-721, or other).
   - The canister tracks the chain, contract address, and the snapshot block number used for its latest vote/proposal.

2. **Finalized snapshot for each proposal**
   - Upon creation of each new proposal, the canister MUST retrieve and store the latest finalized Ethereum block header (including `stateRoot`) and the token's total supply (from the tracked ERC contract).
   - The canister references this block, chain, contract, and `stateRoot` for all votes on that proposal.

3. **Voting with Merkle/EVM proof and SIWE**
   - Users who want to vote on a proposal MUST provide:
     - The proposal id.
     - Their ETH address (as a string, hex-encoded).
     - Their vote choice (e.g., Yes, No, Abstain).
     - A valid EIP-4361 SIWE proof (to bind their Internet Identity Principal to an ETH address and add anti-replay/nonce).
     - A Merkle (or EVM trie) proof that their ETH address held a balance (or meets another condition) at the referenced block and contract (the "proof root" stored by the canister for the proposal).

4. **Proof/coding conventions**
   - The canister MUST implement methods for RLP-decode/EVM/Merkle proof verification.
   - SIWE signatures must be validated against proposal-specific nonce or using the SIWE issued_at timestamp to prevent replay.
   - Each vote checks balance > 0 (or alternative weight logic).
   - The canister MUST store (and return upon query) per-proposal tallies (yes/no/abstain counts and a list of who has voted).
   - Voting weights MUST be determined by off-chain balance proof at the referenced block, not by mutable on-chain/calldata state.

---

## Data Representation

## Data Representation

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
      issued_at: Nat;
      proposal_id: opt Nat;   // Proposal explicitly referenced
      nonce: opt Text;        // Nonce used for anti-replay
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
    snapshot: opt Nat;     // Snapshot id/height used for voting
    deadline: Nat;         // Voting deadline
    metadata: opt Text;
};


type VoteArgs = record {
   proposal_id: Nat;
   voter: Text;           // ETH address
   choice: variant { Yes; No; Abstain };
   siwe: SIWEProof;
   witness: Witness;
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

#### proposal_snapshot
```candid
proposal_snapshot: query (Nat) -> ProposalSnapshot;
```
Returns the snapshot config (block, stateRoot, supply, etc) for a given proposal.

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


## Additional Guidance, Tips, and Security

- **Proof verification:** For EVM contracts, implement RLP/MPT/Binary Merkle proof logic as needed. Simpler off-chain balance snapshot and Merkle tree is recommended for efficiency.
- **Replay protection:** SIWE proof must encode the proposal_id or unique nonce, and `issued_at` must be checked for expiry.
- **Gas and cycles:** No Ethereum gas is ever spent. However, complex proof verification may consume IC cycles and incur fees.
- **Audit and privacy:** Tallies and vote proofs MAY be published for auditability, but revealing all voting addresses is optional.
- **Resilience:** Canister must be upgradeable. Orchestrator/backup for governance migration is RECOMMENDED.

