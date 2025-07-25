# Witness Validation for EVM DAO Bridge

This document explains how to use the witness validation functionality in the EVM DAO Bridge project.

## Overview

The witness validation module provides cryptographic verification of Ethereum storage proofs using Merkle Patricia Trie verification. This ensures that voting power claims are backed by verifiable on-chain data.

## Key Features

- **Blob-based data handling**: All proof data is handled as binary blobs for efficiency
- **Proper library usage**: Uses `motoko-rlp`, `sha3`, and `evm-proof-verifier` libraries
- **Comprehensive validation**: Validates format, addresses, storage keys, and cryptographic proofs
- **ERC20 compatibility**: Specifically designed for ERC20 token balance proofs

## Types

### Witness Structure

```motoko
public type Witness = {
  blockHash: Blob;           // 32 bytes - Ethereum block hash
  blockNumber: Nat;          // Block number for the proof
  userAddress: Blob;         // 20 bytes - Ethereum address of voter
  contractAddress: Blob;     // 20 bytes - ERC20 token contract address  
  storageKey: Blob;          // 32 bytes - Storage slot key for balance mapping
  storageValue: Blob;        // Variable length - RLP encoded balance value
  accountProof: [Blob];      // Array of RLP-encoded account proof nodes
  storageProof: [Blob];      // Array of RLP-encoded storage proof nodes
};
```

### Validation Configuration

```motoko
public type ProofValidationConfig = {
  expectedStateRoot: Blob;        // Expected Ethereum state root
  expectedContractAddress: Blob;  // Expected token contract address
  expectedUserAddress: Blob;      // Expected voter address
  expectedStorageSlot: Nat;       // Expected storage slot for balance mapping
  chainId: Nat;                   // Ethereum chain ID
};
```

## Main Functions

### 1. Format Validation

```motoko
verifyWitnessFormat(witness: Witness) : Result<(), Text>
```

Validates the basic format and structure of a witness without cryptographic verification:
- Checks that addresses are 20 bytes
- Checks that storage key is 32 bytes
- Checks that block hash is 32 bytes
- Ensures proof arrays are not empty

### 2. Cryptographic Validation

```motoko
validateWitness(witness: Witness, config: ProofValidationConfig) : WitnessValidationResult
```

Performs full cryptographic validation:
- Validates account proof against state root
- Validates storage proof against storage root
- Verifies storage key matches user address and slot
- Extracts and validates balance value

### 3. JSON Conversion

```motoko
convertJsonWitnessToBlob(...) : Result<Witness, Text>
```

Converts hex-encoded JSON witness data to the internal Blob format.

## Usage Example

### 1. Converting JSON Witness Data

```motoko
// Input JSON data (as would come from web3 proof generation)
let jsonWitness = {
  blockHash = "0xbcf4d2293056bac5a54a6670f6d6dece2cf6accbcfc1c3020d86a6a16f78a1fe";
  blockNumber = 361187563;
  userAddress = "0x4A7C969110f7358bF334b49A2FF1a2585ac372B8";
  contractAddress = "0x4F604735c1cF31399C6E711D5962b2B3E0225AD3";
  storageKey = "0x845be95a86795d8842de92b34353adbf1f820d99368dac1eca99d66b23f02e35";
  storageValue = "0x2195912da4720000";
  accountProof = ["0xf90211a0c233b74742f9f8f938c6b90fa6d231fdc92b1de3785cc30f7bfa9fc50b64b579..."];
  storageProof = ["0xf90211a00022cbc87e0ba1b6ccb7fc1b010177f5db1886704d623cfc4e41a54adba0ce18..."];
};

// Convert to internal format
switch (WitnessValidator.convertJsonWitnessToBlob(
  jsonWitness.blockHash,
  jsonWitness.blockNumber,
  jsonWitness.userAddress,
  jsonWitness.contractAddress,
  jsonWitness.storageKey,
  jsonWitness.storageValue,
  jsonWitness.accountProof,
  jsonWitness.storageProof
)) {
  case (#ok(blobWitness)) {
    // Proceed with validation
  };
  case (#err(msg)) {
    // Handle conversion error
  };
};
```

### 2. Validating Witness

```motoko
// Create validation configuration
let config = {
  expectedStateRoot = proposalSnapshot.state_root;
  expectedContractAddress = contractAddressBlob;
  expectedUserAddress = voterAddressBlob;
  expectedStorageSlot = 0; // Standard ERC20 balance slot
  chainId = 1; // Ethereum mainnet
};

// Validate the witness
switch (WitnessValidator.validateWitness(blobWitness, config)) {
  case (#Valid(result)) {
    let votingPower = result.storageValue;
    // Use voting power for proposal
  };
  case (#Invalid(error)) {
    // Handle validation failure
  };
};
```

### 3. Integration with Proposal System

```motoko
// Validate witness against a specific proposal
switch (WitnessValidator.validateWitnessForProposal(
  witness,
  proposalSnapshot,
  voterAddress,
  balanceStorageSlot
)) {
  case (#Valid(result)) {
    let votingPower = WitnessValidator.getVotingPowerFromWitness(#Valid(result));
    // Record vote with verified voting power
  };
  case (#Invalid(error)) {
    // Reject vote due to invalid proof
  };
};
```

## Security Considerations

1. **State Root Verification**: Always verify that the state root in the witness matches the expected state root from a trusted source (e.g., proposal snapshot).

2. **Block Number Matching**: Ensure the witness block number matches the proposal snapshot block number.

3. **Contract Address Validation**: Verify that the contract address matches the approved token contract for the DAO.

4. **Storage Slot Security**: The storage slot number must be verified to prevent manipulation of balance lookups.

5. **Proof Freshness**: Consider implementing time-based limits on how old a proof can be.

## Cryptographic Libraries Used

- **motoko-rlp**: RLP encoding/decoding for Ethereum data structures
- **sha3**: Keccak256 hashing (used by Ethereum)
- **evm-proof-verifier**: Merkle Patricia Trie proof verification

## Error Handling

The validation functions return detailed error messages for debugging:

- Format errors (incorrect byte lengths)
- Address mismatches
- Storage key calculation errors
- Cryptographic proof failures
- RLP decoding errors

## Performance Considerations

- Proof validation is computationally intensive
- Consider caching validation results for the same witness
- Limit the maximum size of proof arrays to prevent DoS attacks
- Use background validation for non-critical operations

## Testing

See `WitnessValidatorTest.mo` for example usage and test cases.
