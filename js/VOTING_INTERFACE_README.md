# ICRC149 DAO Voting Interface

A comprehensive web interface for interacting with ICRC149 DAO Bridge canisters, enabling Ethereum-based governance voting through the Internet Computer.

## Features

✅ **Chain Selection**: Dropdown selector with common chains + custom input  
✅ **Contract Configuration**: Text input for contract addresses  
✅ **Automatic Environment Detection**: Localhost vs IC with best practices  
✅ **Proposal Loading**: Query canister for proposals by chain/contract  
✅ **Voting Power Verification**: Check token balances via MetaMask  
✅ **Vote Casting**: Yes/No/Abstain voting with SIWE and witness proofs  
✅ **Proposal Execution**: End vote functionality for passed proposals  
✅ **Storage Slot Discovery**: Automatic ERC20 storage slot detection  

## Files

- **`dao-voting-interface.html`** - Full-featured standalone interface
- **`icrc149-voting-interface.js`** - Reusable JavaScript module
- **`simple-voting-interface.html`** - Example using the module

## Quick Start

### 1. Standalone Interface

Open `dao-voting-interface.html` directly in your browser:

```bash
# In the js/ directory
python3 -m http.server 8080
# Or
npx http-server -p 8080
```

Navigate to `http://localhost:8080/dao-voting-interface.html`

### 2. Module-based Interface

If you prefer to use the modular approach:

```bash
# Serve the files
python3 -m http.server 8080
```

Navigate to `http://localhost:8080/simple-voting-interface.html`

## Configuration

### Environment Detection

The interface automatically detects whether you're running locally:

- **Local Development**: Uses `http://127.0.0.1:8080` and fetches root key
- **Internet Computer**: Uses `https://ic0.app` with production settings

### Chain Configuration

Pre-configured chains include:
- Ethereum Mainnet (1)
- Sepolia Testnet (11155111)  
- Polygon Mainnet (137)
- Polygon Mumbai (80001)
- Arbitrum One (42161)
- Optimism (10)
- Local/Anvil (31337)
- Custom (manual input)

### Canister Setup

1. **Connect MetaMask** - Click "Connect Wallet"
2. **Set Environment** - Choose "Local Development" or "Internet Computer"
3. **Enter Canister ID** - Your ICRC149 DAO Bridge canister
4. **Configure Chain/Contract** - Select chain and enter contract address
5. **Initialize** - Click "Initialize System" to connect to canister

## Usage Workflow

### 1. Initial Setup

```javascript
// Configure the interface
chainId: 31337 (Local/Anvil)
contractAddress: 0x1234... (your governance token)
canisterId: rdmx6-jaaaa-aaaaa-aaadq-cai
```

### 2. Storage Slot Discovery

If the contract's storage slot isn't configured:

1. Ensure you have non-zero token balance
2. Click "Discover Storage Slot"
3. System will test slots 0-10 to find the correct one
4. Automatically updates canister configuration

### 3. Load Proposals

Click "Load Proposals" to:
- Query canister for proposals on the specified chain/contract
- Check your voting power via MetaMask RPC calls
- Display proposal details and voting options

### 4. Cast Votes

For active proposals where you have voting power:

1. Choose Yes/No/Abstain
2. System generates SIWE proof (MetaMask signature)
3. System generates witness proof (Ethereum state proof)
4. Submits vote to canister

### 5. Execute Proposals

For passed proposals after voting period:

1. Click "Execute Proposal" 
2. Calls `icrc149_execute_proposal`
3. Triggers on-chain transaction execution

## MetaMask Integration

### Required Permissions

- **Account access**: To get user address and token balance
- **Message signing**: For SIWE authentication
- **RPC calls**: For `eth_getProof` and `eth_getStorageAt`

### Chain Switching

The interface monitors MetaMask for:
- Account changes (automatic reconnection)
- Chain changes (updates display)

## Canister Interface

The interface uses these ICRC149 methods:

### Query Methods
- `icrc149_list_proposals(contract?)` - Get proposals
- `icrc149_get_proposal(id)` - Get specific proposal
- `icrc149_tally_votes(id)` - Get vote counts
- `icrc149_get_snapshot_contract_config(address)` - Get config

### Update Methods  
- `icrc149_vote_proposal(args)` - Cast vote
- `icrc149_execute_proposal(id)` - Execute proposal
- `icrc149_update_snapshot_contract_config(address, config)` - Update config

## Security Features

### SIWE (Sign-In With Ethereum)

Generates EIP-4361 compliant messages:
```
example.com wants you to sign in with your Ethereum account:
0x1234...

Vote Yes on proposal 1 for contract 0x5678...

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: 1234567890
Issued At: 2024-01-01T00:00:00.000Z
Expiration Time: 2024-01-01T00:10:00.000Z
```

### Witness Proofs

Generates cryptographic proofs of token balance:
- Uses `eth_getProof` for Merkle Patricia Tree proofs
- Proves balance at proposal snapshot block
- Includes account proof and storage proof

### Storage Slot Validation

Before discovery, validates current balance matches storage:
- Calls `balanceOf()` for actual balance
- Reads storage slot for stored balance  
- Only proceeds if they match

## Error Handling

### Common Issues

1. **"MetaMask not detected"**
   - Install MetaMask browser extension

2. **"Storage slot discovery failed"**
   - Ensure you have non-zero token balance
   - Contract may use non-standard storage layout

3. **"Failed to connect to canister"**
   - Check canister ID is correct
   - Verify environment setting (local vs IC)

4. **"Vote failed"**
   - Check proposal is still active
   - Verify you haven't already voted
   - Ensure sufficient token balance

### Debug Mode

Enable console logging:
```javascript
localStorage.setItem('debug', 'true');
```

## Development

### Dependencies

- ethers.js v6.13.2
- @dfinity/agent v2.4.0  
- @dfinity/candid v2.4.0
- @dfinity/identity v2.4.0
- @dfinity/principal v2.4.0

### Local Testing

```bash
# Start local IC replica
dfx start --clean

# Deploy your ICRC149 canister
dfx deploy

# Start Anvil for Ethereum testing
anvil --host 0.0.0.0 --port 8545

# Serve the interface
npm run serve
```

### Customization

The modular design allows easy customization:

```javascript
import ICRC149VotingInterface from './icrc149-voting-interface.js';

const votingUI = new ICRC149VotingInterface();

// Custom event handlers
votingUI.onAccountChange = (address) => {
    console.log('Account changed:', address);
};

votingUI.onStatusUpdate = (message, type) => {
    // Custom status display
    showToast(message, type);
};
```

## API Reference

See `icrc149-voting-interface.js` for full API documentation.

### Key Methods

```javascript
// Connection
await votingUI.connectWallet()
await votingUI.initializeCanister(canisterId, environment)

// Configuration  
await votingUI.getContractConfig(contractAddress)
await votingUI.discoverStorageSlot(contractAddress)
await votingUI.updateCanisterStorageSlot(chainId, contractAddress, slot)

// Proposals
await votingUI.loadProposals(contractAddress?)
await votingUI.getUserTokenBalance(contractAddress, userAddress?)

// Voting
await votingUI.castVote(proposalId, choice, contractAddress)
await votingUI.executeProposal(proposalId)
await votingUI.getVoteTally(proposalId)
```

## Browser Compatibility

- Chrome 88+
- Firefox 78+
- Safari 14+
- Edge 88+

Requires modern JavaScript features:
- ES2020 modules
- BigInt support
- Async/await
- Crypto.subtle (for MetaMask)

## License

This interface is part of the ICRC149 DAO Bridge project.
