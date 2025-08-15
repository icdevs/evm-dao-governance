# Ethereum Balance Proof Generator

A TypeScript library for generating cryptographic proofs of ERC20 token balances and ERC721 token ownership at specific Ethereum block heights. These proofs can be RLP encoded for compact transmission and verified on-chain or off-chain.

**New in v2.0**: MetaMask integration! Generate proofs directly from user wallets without requiring RPC endpoints.

## Features

- ✅ **ERC20 Balance Proofs**: Generate proofs of token balances at specific blocks
- ✅ **ERC721 Ownership Proofs**: Generate proofs of NFT ownership at specific blocks  
- ✅ **Multi-Chain Support**: Works with Ethereum, Polygon, BSC, Arbitrum, Optimism, and other EVM chains
- ✅ **RLP Encoding**: Compact, standardized encoding for proof transmission
- ✅ **Merkle Proofs**: Uses Ethereum's native eth_getProof for cryptographic verification
- ✅ **MetaMask Integration**: Generate proofs directly from user wallets
- ✅ **Web-Ready**: Designed for integration into web applications
- ✅ **TypeScript**: Full type safety and IntelliSense support

## Installation

First, install the required dependencies:

```bash
npm install ethers rlp keccak
npm install --save-dev @types/node
```

## Quick Start

### 🦊 MetaMask Approach (Recommended for Web Apps)

The MetaMask approach is perfect for web applications where users connect their wallets. No RPC endpoints required!

#### ERC20 Balance Proof with MetaMask

```typescript
import { generateMetaMaskERC20Proof } from './metamask-balance-proof.js';

// User connects their wallet and proof is generated automatically
const proof = await generateMetaMaskERC20Proof(
  '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a', // USDC contract
  'latest' // Use latest block
);

console.log('User Address:', proof.userAddress);
console.log('Balance:', proof.balance);
console.log('RLP Proof:', proof.rlpEncodedProof);
```

#### ERC721 Ownership Proof with MetaMask

```typescript
import { generateMetaMaskERC721Proof } from './metamask-balance-proof.js';

const proof = await generateMetaMaskERC721Proof(
  '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC contract
  '1234' // Token ID
);

console.log('Owns token:', proof.balance === '1');
```

#### Advanced MetaMask Usage

```typescript
import { MetaMaskBalanceProofGenerator } from './metamask-balance-proof.js';

const generator = new MetaMaskBalanceProofGenerator();

// Connect wallet
const userAddress = await generator.connectWallet();
console.log('Connected:', userAddress);

// Generate proof with custom parameters
const proof = await generator.generateERC20BalanceProof({
  contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
  blockTag: 18500000, // Specific block number
  slotIndex: 2 // Custom storage slot
});

// Listen for account/chain changes
generator.onAccountsChanged((accounts) => {
  console.log('Account changed:', accounts[0]);
});

generator.onChainChanged((chainId) => {
  console.log('Chain changed:', parseInt(chainId, 16));
});
```

### 🌐 RPC Approach (Server-side or Advanced Use Cases)

The RPC approach is useful for server-side applications or when you need more control over the process.

#### ERC20 Balance Proof with RPC

```typescript
import { generateERC20Proof } from './ethereum-balance-proof.js';

const proof = await generateERC20Proof(
  '0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4', // User address
  '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a', // USDC contract
  1,        // Ethereum mainnet
  18500000, // Block height
  'https://eth-mainnet.g.alchemy.com/v2/your-api-key'
);

console.log('Balance:', proof.balance);
console.log('RLP Proof:', proof.rlpEncodedProof);
```

#### ERC721 Ownership Proof with RPC

```typescript
import { generateERC721Proof } from './ethereum-balance-proof.js';

const proof = await generateERC721Proof(
  '0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4', // User address
  '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC contract
  '1234',   // Token ID
  1,        // Ethereum mainnet  
  18500000, // Block height
  'https://eth-mainnet.g.alchemy.com/v2/your-api-key'
);

console.log('Owns token:', proof.balance === '1');
```

## Web Integration

### HTML Example with MetaMask

```html
<!DOCTYPE html>
<html>
<head>
    <title>MetaMask Balance Proof</title>
</head>
<body>
    <button id="connectBtn">Connect MetaMask</button>
    <button id="generateBtn" disabled>Generate Proof</button>
    
    <script type="module">
        import { MetaMaskBalanceProofGenerator } from './metamask-balance-proof.js';
        
        const generator = new MetaMaskBalanceProofGenerator();
        
        document.getElementById('connectBtn').onclick = async () => {
            const address = await generator.connectWallet();
            console.log('Connected:', address);
            document.getElementById('generateBtn').disabled = false;
        };
        
        document.getElementById('generateBtn').onclick = async () => {
            const proof = await generator.generateERC20BalanceProof({
                contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a'
            });
            console.log('Proof generated:', proof);
        };
    </script>
</body>
</html>
```

## Data Structures

### MetaMaskBalanceProofResult

```typescript
interface MetaMaskBalanceProofResult {
  userAddress: string;      // Connected wallet address
  balance: string;          // Balance (ERC20) or ownership (ERC721: "1" or "0")
  blockHash: string;        // Block hash at the specified height
  blockNumber: number;      // Block number
  accountProof: string[];   // Merkle proof for account state
  storageProof: string[];   // Merkle proof for storage slot
  storageKey: string;       // The storage key that was queried
  storageValue: string;     // The raw storage value
  rlpEncodedProof: string;  // RLP encoded complete proof
  witness: MetaMaskEthereumWitness; // Structured witness data
  chainId: number;          // Chain ID from MetaMask
}
```

### MetaMaskEthereumWitness

```typescript
interface MetaMaskEthereumWitness {
  blockHash: string;       // Block hash proving state
  blockNumber: number;     // Block number of the proof
  userAddress: string;     // Connected wallet address
  contractAddress: string; // Token contract address
  storageKey: string;      // Storage slot key
  storageValue: string;    // Storage slot value (balance/ownership)
  accountProof: string[];  // Account existence proof
  storageProof: string[];  // Storage value proof
  chainId: number;         // Chain identifier
  tokenType: 'ERC20' | 'ERC721'; // Token type
  tokenId?: string;        // Token ID (for ERC721)
}
```

### Original BalanceProofResult (RPC-based)

```typescript
interface BalanceProofResult {
  balance: string;          // Balance (ERC20) or ownership (ERC721: "1" or "0")
  blockHash: string;        // Block hash at the specified height
  accountProof: string[];   // Merkle proof for account state
  storageProof: string[];   // Merkle proof for storage slot
  rlpEncodedProof: string;  // RLP encoded complete proof
  witness: EthereumWitness; // Structured witness data
}
```

## Comparison: MetaMask vs RPC Approach

| Feature | MetaMask Approach | RPC Approach |
|---------|------------------|--------------|
| **Setup** | Just connect wallet | Need RPC endpoint |
| **User Experience** | Seamless, wallet-integrated | Requires address input |
| **Security** | User controls keys | Relies on RPC provider |
| **Use Case** | Web applications | Server-side, advanced use |
| **Rate Limits** | Uses MetaMask's provider | Subject to RPC limits |
| **Offline** | No | Possible with local node |
| **Chain Switching** | Automatic with wallet | Manual configuration |

## Advanced Examples

### Batch Proof Generation with MetaMask

```typescript
const generator = new MetaMaskBalanceProofGenerator();
await generator.connectWallet();

const tokens = [
  '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a', // USDC
  '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
  '0xdAC17F958D2ee523a2206206994597C13D831ec7'  // USDT
];

const proofs = await Promise.all(
  tokens.map(contractAddress =>
    generator.generateERC20BalanceProof({ contractAddress })
  )
);
```

### Historical Proof with Specific Block

```typescript
const historicalProof = await generateMetaMaskERC20Proof(
  '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a',
  18000000 // Specific historical block
);
```

### Custom Storage Slot

```typescript
// For tokens that use non-standard storage slots
const proof = await generator.generateERC20BalanceProof({
  contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
  slotIndex: 2 // DAI uses slot 2 for balances
});
```
  '1234',   // Token ID
  1,        // Ethereum mainnet  
  18500000, // Block height
  'https://eth-mainnet.g.alchemy.com/v2/your-api-key'
);

console.log('Owns token:', proof.balance === '1');
```

## RLP Encoding

Both MetaMask and RPC approaches use RLP encoding for compact transmission. The MetaMask encoding structure includes additional metadata:

### MetaMask RLP Structure
```
[
  blockHash,
  blockNumber,
  userAddress,
  contractAddress,
  storageKey,
  storageValue,
  accountProof[],
  storageProof[],
  chainId,
  tokenType,
  tokenId (optional)
]
```

### Original RLP Structure
```
[
  blockHash,
  blockHeight,
  accountAddress,
  contractAddress,
  storageKey,
  storageValue,
  accountProof[],
  storageProof[],
  chainId
]
```

## Chain Support

Both approaches support any EVM-compatible chain:

| Chain | Chain ID | Notes |
|-------|----------|-------|
| Ethereum Mainnet | 1 | Full support |
| Polygon | 137 | Full support |
| BSC | 56 | Full support |
| Arbitrum | 42161 | Full support |
| Optimism | 10 | Full support |
| Goerli Testnet | 5 | Deprecated |
| Sepolia | 11155111 | Current testnet |

### MetaMask Chain Detection

```typescript
const generator = new MetaMaskBalanceProofGenerator();
await generator.connectWallet();

const chainId = await generator.getChainId();
console.log('Current chain:', chainId);

// Listen for chain changes
generator.onChainChanged((newChainId) => {
  console.log('Switched to chain:', parseInt(newChainId, 16));
});
```

## Storage Slot Calculation

### ERC20 Balances
Standard ERC20 contracts store balances in a mapping at slot 0:
```
storageKey = keccak256(abi.encode(userAddress, slotIndex))
```

### ERC721 Ownership
Standard ERC721 contracts store ownership in a mapping at slot 2:
```
storageKey = keccak256(abi.encode(tokenId, slotIndex))
```

### Custom Slot Detection

Some tokens use non-standard storage layouts. You can specify custom slots:

```typescript
// Example: Some tokens use different slots
const proof = await generator.generateERC20BalanceProof({
  contractAddress: '0x...',
  slotIndex: 3 // Custom slot
});
```

## Error Handling

### MetaMask Errors

```typescript
try {
  const proof = await generateMetaMaskERC20Proof('0x...');
} catch (error) {
  if (error.message.includes('MetaMask not found')) {
    // Handle MetaMask not installed
  } else if (error.message.includes('User rejected')) {
    // Handle user rejecting connection
  } else if (error.message.includes('Failed to generate proof')) {
    // Handle proof generation errors
  }
}
```

### RPC Errors

```typescript
try {
  const proof = await generateERC20Proof(/* params */);
} catch (error) {
  if (error.message.includes('Block not found')) {
    // Handle block height issues
  } else if (error.message.includes('eth_getProof')) {
    // Handle RPC issues
  }
}
```

## Testing

### Running Tests

```bash
npm test
```

### Running Examples

MetaMask examples (requires browser):
```bash
open js/web-example.html
```

Node.js examples:
```bash
npx ts-node js/examples.ts
```

MetaMask TypeScript examples:
```bash
npx ts-node js/metamask-examples.ts
```

## Use Cases

### 1. Cross-Chain Bridges
Prove token holdings on one chain to mint wrapped tokens on another:

```typescript
// Generate proof on source chain
const proof = await generateMetaMaskERC20Proof(sourceTokenAddress);

// Submit proof to bridge contract on destination chain
await bridgeContract.deposit(proof.rlpEncodedProof);
```

### 2. Airdrops with Historical Requirements
Prove token holdings at a specific snapshot block:

```typescript
const snapshotBlock = 18000000;
const proof = await generateMetaMaskERC20Proof(tokenAddress, snapshotBlock);

// User can claim airdrop with this proof
await airdropContract.claim(proof.rlpEncodedProof);
```

### 3. Governance Voting
Prove voting power without revealing current holdings:

```typescript
const votingSnapshot = 18500000;
const proof = await generateMetaMaskERC20Proof(govTokenAddress, votingSnapshot);

// Submit vote with proof
await governanceContract.vote(proposalId, choice, proof.rlpEncodedProof);
```

### 4. NFT-Gated Access
Prove NFT ownership for exclusive access:

```typescript
const proof = await generateMetaMaskERC721Proof(nftAddress, tokenId);

if (proof.balance === '1') {
  // Grant access to exclusive content
  unlockPremiumFeatures();
}
```

## Security Considerations

### MetaMask Approach
- ✅ Users control their private keys
- ✅ No API keys to manage
- ✅ Rate limiting handled by MetaMask
- ⚠️ Requires user interaction
- ⚠️ Limited to browser environments

### RPC Approach  
- ✅ Works in any environment
- ✅ No user interaction required
- ⚠️ API keys must be secured
- ⚠️ Subject to rate limiting
- ⚠️ Trusted RPC provider required

### General Security
- Always verify block hashes against trusted sources
- Use recent block heights to prevent reorganization issues
- Validate all input addresses and parameters
- Consider using "finalized" or "safe" block tags for critical proofs
- Implement proper error handling and user feedback

## Performance Optimization

### Batch Operations
```typescript
// Generate multiple proofs efficiently
const contracts = ['0x...', '0x...', '0x...'];
const proofs = await Promise.all(
  contracts.map(addr => generateMetaMaskERC20Proof(addr))
);
```

### Caching Block Data
```typescript
// Cache recent block data to avoid repeated calls
const blockCache = new Map();
const generator = new MetaMaskBalanceProofGenerator();

// Use consistent block tags across multiple proofs
const blockTag = 'finalized';
```

## Migration Guide

### From v1 (RPC-only) to v2 (MetaMask + RPC)

1. **Install new dependencies**: No changes needed
2. **Update imports**: Add MetaMask imports alongside existing ones
3. **Choose approach**: Use MetaMask for web apps, RPC for servers
4. **Update UI**: Add wallet connection flow for MetaMask approach

```typescript
// Old approach
import { generateERC20Proof } from './ethereum-balance-proof.js';

// New approach (choose one)
import { generateERC20Proof } from './ethereum-balance-proof.js'; // RPC
import { generateMetaMaskERC20Proof } from './metamask-balance-proof.js'; // MetaMask
```

## Contributing

This library is part of the EvmDaoBridge project. Contributions are welcome!

### Development Setup
```bash
npm install
npm run build
npm test
```

### Adding New Features
- Follow existing code patterns
- Add comprehensive tests
- Update documentation
- Consider both MetaMask and RPC approaches

## License

[License information from the project root]

## Support

For issues and questions:
- Create an issue in the repository
- Check the examples in `js/metamask-examples.ts` and `js/examples.ts`
- Review the test files for usage patterns
