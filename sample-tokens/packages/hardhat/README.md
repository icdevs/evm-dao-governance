# EVM DAO Bridge - ERC-20 Test Contracts

This directory contains ERC-20 token contracts for testing the EVMDAOBridge snapshot functionality with realistic token distributions.

## Overview

The contracts simulate mainnet-like token distributions for testing DAO voting scenarios where users vote based on their token balances at specific block snapshots.

## Contracts

### ICRC99Token.sol
Base ERC-20 token with snapshot functionality compatible with ICRC-99 standards. Features:
- Snapshot creation and balance tracking at specific points
- Batch minting for realistic distributions
- Owner-controlled minting for test scenarios

### MockTokens.sol
Realistic mock implementations of popular tokens:

- **MockUSDC**: 6 decimals, 1M initial supply
- **MockUSDT**: 6 decimals, 2M initial supply  
- **MockDAI**: 18 decimals, 1.5M initial supply
- **GovernanceToken**: 18 decimals, 10M initial supply with delegation features

## Setup

1. Install dependencies:
```bash
cd packages/hardhat
npm install
```

2. Compile contracts:
```bash
npm run compile
```

3. Start local Hardhat network:
```bash
npm run node
```

4. Deploy contracts with realistic distributions:
```bash
npm run deploy:local
```

## Distribution Patterns

The deployment script creates realistic token distributions:

### Whale Holders (Addresses 1-10)
- USDC: 100k to 28k tokens
- USDT: 150k to 42k tokens  
- DAI: 80k to 26k tokens
- GOV: 500k to 140k tokens

### Medium Holders (Addresses 11-50)
- USDC: 1k-11k tokens
- USDT: 2k-17k tokens
- DAI: 500-8.5k tokens
- GOV: 5k-55k tokens (first 20 addresses only)

### Small Holders (Addresses 51-100)
- USDC: 10-1010 tokens
- USDT: Random amounts
- DAI: Random amounts  
- GOV: 100-5.1k tokens (first 30 addresses only)

## Integration with EVMDAOBridge

After deployment, copy the contract addresses to your integration tests:

```typescript
// From deployment output
const USDC_ADDRESS = "0x...";
const USDT_ADDRESS = "0x..."; 
const DAI_ADDRESS = "0x...";
const GOV_TOKEN_ADDRESS = "0x...";
```

## Testing

Run contract tests:
```bash
npm test
```

## Snapshot Functionality

Each token supports:
- `snapshot()`: Creates new snapshot, returns ID
- `balanceOfAt(address, snapshotId)`: Get balance at specific snapshot
- `totalSupplyAt(snapshotId)`: Get total supply at specific snapshot

## Usage in EVMDAOBridge Tests

1. Deploy contracts with realistic distributions
2. Create snapshots at specific "blocks"
3. Test voting scenarios where users prove their balance at snapshot time
4. Verify governance token delegation affects voting power

This setup provides realistic data for testing the core EVMDAOBridge functionality: "snapshot a chain+contract at a block to get the root and then have people who had balances at that block vote by providing a proof".
