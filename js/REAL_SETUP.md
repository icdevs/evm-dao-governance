# Real DFinity Integration Setup

## 🚀 Quick Start

1. **Install dependencies:**
```bash
cd /Users/afat/Dropbox/development/Rivvir/ai/prompts/__temp/projects/motoko_classes/EvmDaoBridge-mo/js
npm install
```

2. **Start development server:**
```bash
npm run dev
```

3. **Open the interface:**
- Go to `http://localhost:3005`
- Or open `real-canister-interface.html` directly

## 📁 Files Overview

- **`real-canister-interface.html`** - Interface using real DFinity libraries
- **`real-canister-interface.js`** - ES6 module with proper imports
- **`package.json`** - Dependencies and scripts
- **`vite.config.js`** - Build configuration

## ✅ What's Fixed

- ✅ Real `@dfinity/agent`, `@dfinity/candid`, `@dfinity/identity`, `@dfinity/principal` imports
- ✅ Proper ES6 module structure
- ✅ Vite build system for development and production
- ✅ All canister methods properly typed with IDL
- ✅ Byte array conversions for IC compatibility
- ✅ Principal parsing for canister IDs

## 🔧 Key Differences from Mock Version

### Real DFinity Integration
```javascript
import { HttpAgent, Actor } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
import { Principal } from '@dfinity/principal';

// Real canister connection
canisterActor = Actor.createActor(idlFactory, {
    agent: dfxAgent,
    canisterId: Principal.fromText(canisterId)
});
```

### Proper IDL Types
```javascript
const idlFactory = ({ IDL }) => {
    // Complete IDL definition matching your canister
    const VoteChoice = IDL.Variant({ 
        Yes: IDL.Null, 
        No: IDL.Null, 
        Abstain: IDL.Null 
    });
    // ... etc
};
```

### Byte Array Conversion
```javascript
// Convert to IC-compatible byte arrays
voter: Array.from(ethers.getBytes(userAddress)),
signature: Array.from(ethers.getBytes(signature))
```

## 🎯 Testing with Your Canister

1. **Update canister ID:**
   - Enter your deployed canister ID in the interface
   - Or update the default in `real-canister-interface.js`

2. **Set environment:**
   - Choose "Local Development" for dfx
   - Choose "Internet Computer" for IC mainnet

3. **Configure contract:**
   - Enter your ERC20 contract address
   - Select the appropriate chain
   - Use "Discover Storage Slot" to find the balance mapping

4. **Test functionality:**
   - Connect MetaMask
   - Load proposals
   - Cast votes
   - Execute proposals

## 🔍 Debugging

### Check browser console for:
- "✅ Real DFinity libraries loaded successfully"
- "✅ Root key fetched for localhost" (local only)
- "✅ Connected to canister: [your-canister-id]"

### Common Issues:
- **CORS errors**: Make sure dfx is running with proper CORS settings
- **Root key errors**: Ensure you're using localhost environment for local dfx
- **Principal errors**: Verify canister ID format

## 📡 Canister Methods Called

- `icrc149_list_proposals(contract_address)` - Get proposals
- `icrc149_vote_proposal(vote_args)` - Cast vote  
- `icrc149_execute_proposal(proposal_id)` - Execute proposal
- `icrc149_get_snapshot_contract_config(contract_address)` - Get config
- `icrc149_update_snapshot_contract_config(contract_address, config)` - Update config

All methods properly handle IC types and error responses.

## 🎉 Ready to Test!

Your interface now uses real DFinity libraries and can connect to actual canisters on IC or local dfx!
