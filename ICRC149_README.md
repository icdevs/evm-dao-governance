# ICRC-149 Ethereum DAO Bridge Implementation

This is a Motoko implementation of the ICRC-149 Ethereum DAO Bridge standard for the Internet Computer.

## Overview

The ICRC-149 standard defines an interface for bridging Ethereum-based DAO governance with the Internet Computer ecosystem, enabling cryptographic proofs of Ethereum token-holder balances for IC-side voting. This implementation supports multiple Ethereum contracts and networks within a single DAO governance canister.

## Features

### ✅ Implemented
- **Multi-Contract Governance**: Support for separate snapshot contracts (voter eligibility) and execution contracts (transaction targets)
- **Governance Configuration Management**: Admin functions to manage approved contracts, ICP methods, and admin principals
- **Contract Type Distinction**: Clear separation between ERC-20/721 snapshot contracts and arbitrary execution contracts
- **Proposal Management**: Create, vote on, and execute proposals with contract-specific snapshots and validations
- **SIWE Authentication**: Sign-In With Ethereum verification (basic implementation)
- **Vote Tallying**: Count and track votes with different choices (Yes/No/Abstain)
- **ETH Transaction Support**: Framework for executing Ethereum transactions on approved execution contracts
- **ICP Method Governance**: Control over which ICP canister methods can be called via governance
- **Standard Compliance**: ICRC-10 and ICRC-149 standard support

### 🔧 TODO (For Production)
- **Real SIWE Verification**: Parse and validate actual SIWE messages
- **Merkle Proof Verification**: Implement EVM/Merkle proof validation
- **ChainFusion Integration**: Connect to actual Ethereum via IC's ChainFusion with configured RPC services for snapshot contracts
- **Access Control**: Enhanced authorization for admin functions
- **Block Finality**: Retrieve actual finalized block headers and state roots via RPC
- **Balance Verification**: Validate token balances from Ethereum state using snapshot contract-specific RPC services

## API Functions

All ICRC-149 functions are prefixed with `icrc149_`:

### Governance Configuration
- `icrc149_governance_config()` - Get complete governance configuration including all contract types and methods
- `icrc149_get_snapshot_contracts()` - Get list of approved snapshot contracts (for voter eligibility)
- `icrc149_get_execution_contracts()` - Get list of approved execution contracts (for transaction targets)
- `icrc149_get_approved_icp_methods()` - Get list of approved ICP canister methods for governance

### Governance Management (Admin Only)
- `icrc149_update_snapshot_contract_config(address, config)` - Add, update, or remove snapshot contract configuration
  - **Security**: The `balance_storage_slot` field is required to specify the exact storage slot number where token balances are stored (typically slot 1 for most ERC-20 tokens, but can vary by implementation)
- `icrc149_update_execution_contract_config(address, config)` - Add, update, or remove execution contract configuration
- `icrc149_update_icp_method_config(canister, method, config)` - Add, update, or remove approved ICP method configuration
- `icrc149_update_admin_principal(principal, is_admin)` - Add or remove admin principals

### Proposal Management
- `icrc149_create_proposal(proposal_args)` - Create a new proposal with specified snapshot contract
- `icrc149_get_proposals(prev, take, filters)` - Query proposals with pagination and filtering, includes tally data (QUERY)
- `icrc149_vote_proposal(vote_args)` - Vote on a proposal with cryptographic proof
- `icrc149_execute_proposal(proposal_id)` - Execute a passed proposal

### Deprecated Functions
- ~~`icrc149_tally_votes(proposal_id)`~~ - **Deprecated**: Tally data is now included in `icrc149_get_proposals`

### Ethereum Integration
- `icrc149_send_eth_tx(eth_tx)` - Send an Ethereum transaction
- `icrc149_get_eth_tx_status(tx_hash)` - Check transaction status

### Admin & Health
- `icrc149_set_controller(new_controller)` - Change canister controller
- `icrc149_health_check()` - Get system health status

### Standards
- `icrc10_supported_standards()` - List supported ICRC standards

## Usage Example

```motoko
// Deploy the canister with initial configuration
let args = ?{
  evmdaobridgeArgs = ?{
    contract_address = "0x1234567890123456789012345678901234567890";
    chain = {
      chain_id = 1;
      network_name = "mainnet";
    };
  };
  ttArgs = null;
};

// Create a motion proposal
let proposal = {
  id = 0; // Will be set automatically
  proposer = caller; // Will be set from msg.caller
  action = #Motion("Increase governance participation");
  created_at = 0; // Will be set automatically
  snapshot = null;
  deadline = 1735689600000000000; // Future timestamp
  metadata = ?"Community governance proposal";
};

let result = await canister.icrc149_create_proposal(proposal);

// Vote on the proposal
let vote_args = {
  proposal_id = 1;
  voter = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  choice = #Yes;
  siwe = {
    message = "example.com wants you to sign in...";
    signature = signature_blob;
  };
  witness = {
    address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    proof = [proof_blob_1, proof_blob_2];
    leaf = leaf_blob;
    root = state_root_blob;
  };
};

let vote_result = await canister.icrc149_vote_proposal(vote_args);

// Get proposals with tally data included (no separate tally call needed)
let proposals = await canister.icrc149_get_proposals(null, ?10, []);
// Each proposal now includes tally: { yes: Nat; no: Nat; abstain: Nat; total: Nat; result: Text }
```

## Architecture

The implementation follows the class-plus pattern with proper migration support:

- `src/lib.mo` - Main library with ICRC-149 implementation
- `src/main.mo` - Example canister exposing the public API
- `src/service.mo` - Service type definitions
- `src/migrations/` - Version migration support

## Security Considerations

⚠️ **This is a reference implementation for development/testing purposes.**

For production use, you must implement:
1. Real cryptographic verification of SIWE signatures
2. Merkle proof validation against Ethereum state
3. **Storage slot validation** - The `balance_storage_slot` field in `SnapshotContractConfig` ensures that Merkle proofs are verified against the correct storage location for token balances, preventing manipulation through arbitrary storage slots
4. Proper access controls and authorization
5. Integration with IC's ChainFusion for actual Ethereum interaction
6. Comprehensive error handling and edge case management

## Dependencies

- `mo:class-plus` - Class pattern with lifecycle management
- `mo:timer-tool` - Timer and action scheduling
- `mo:stable-local-log` - Logging functionality
- `mo:map` - Stable maps for state storage
- `mo:star` - Error handling utilities
- `mo:ovs-fixed` - Cycle sharing for open source funding

## License

This implementation is provided under the MIT License for educational and development purposes.
