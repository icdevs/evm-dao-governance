# SIWE Utilities

This directory contains utilities for creating SIWE (Sign-In with Ethereum) proofs for the EVM DAO Bridge project.

## Files

- `siwe-utils.ts` - TypeScript utilities for use in test files
- `siwe-utils.js` - JavaScript utilities for use in script files (like `create_real_proposal.js`)

## Usage

### In TypeScript tests

```typescript
import { createSIWEProofForProposal, createSIWEMessageForVoting } from "../utils/siwe-utils.js";

// Create SIWE proof for proposal creation
const adminWallet = new ethers.Wallet(privateKey, provider);
const siweProof = await createSIWEProofForProposal(
    adminWallet,
    contractAddress,
    pic // PocketIC instance for time calculations
);

// Use in proposal creation
const proposalArgs = {
    action: { Motion: "Test motion" },
    metadata: [] as [] | [string],
    siwe: siweProof,
    snapshot_contract: [] as [] | [string],
};
```

### In JavaScript scripts

```javascript
import { createSIWEProofForProposal, siweProofToCandid, createTransferData } from './siwe-utils.js';

// Create SIWE proof
const wallet = new ethers.Wallet(privateKey, provider);
const siweProof = await createSIWEProofForProposal(
    wallet,
    contractAddress,
    chainId // Default: 31337 for Anvil
);

// Convert to Candid format for dfx calls
const proposal = {
    action: { /* ... */ },
    metadata: "Proposal description",
    siwe: siweProofToCandid(siweProof),
    snapshot_contract: contractAddress
};
```

## Functions

### `createSIWEProofForProposal(wallet, contractAddress, picOrChainId)`
Creates a SIWE proof for proposal creation.

### `createSIWEMessageForVoting(address, proposalId, choice, contractAddress, picOrChainId)`
Creates a SIWE message for voting (message only, no signature).

### `createSimpleSIWEProof(wallet, action, contractAddress, chainId)`
Creates a simple SIWE proof for test cases.

### `siweProofToCandid(siweProof)` (JavaScript only)
Converts a SIWE proof to Candid-compatible format.

### `createTransferData(recipient, amount)` (JavaScript only)
Creates ERC20 transfer data for Ethereum transactions.

## SIWE Message Format

The utilities create SIWE messages in this format:

```
example.com wants you to sign in with your Ethereum account:
0x1234...

[Action description] for contract 0xabcd...

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: [timestamp in nanoseconds]
Issued At Nanos: [timestamp in nanoseconds]
Issued At: [ISO timestamp]
Expiration Nanos: [timestamp in nanoseconds + 10 minutes]
Expiration Time: [ISO timestamp + 10 minutes]
```

## Notes

- All SIWE messages have a 10-minute expiration window
- Nonces are generated using timestamp in nanoseconds
- The TypeScript version uses PocketIC time for consistency with canister execution
- The JavaScript version uses `Date.now()` for simplicity in scripts
