# ICRC149 DAO Voting Interface Setup

## Current Status
The interface (`dao-voting-interface.html`) is currently using **mock implementations** of the DFinity libraries for demonstration purposes. This allows you to test the UI functionality without running into library loading errors.

## Features Working with Mock Data
- ✅ Chain selection (dropdown + custom input)
- ✅ Contract address input
- ✅ Environment detection (localhost vs IC)
- ✅ MetaMask wallet connection
- ✅ Mock proposal loading and display
- ✅ Vote casting interface (generates SIWE messages)
- ✅ Storage slot discovery interface
- ✅ Proposal execution for ended proposals

## Mock Behavior
The mock implementation includes:
- Two sample proposals (one active, one ended)
- Simulated canister calls with console logging
- Working UI interactions and state management
- All the visual components and styling

## Setting Up for Production

### Option 1: Build Process (Recommended)
For production use, you'll need a proper build process to handle the DFinity libraries:

```bash
# Install dependencies
npm install @dfinity/agent @dfinity/candid @dfinity/identity @dfinity/principal ethers

# Use a bundler like Webpack, Vite, or Rollup to create a single bundle
# This handles the CommonJS modules properly
```

### Option 2: ES Modules (Modern Browsers)
```html
<script type="module">
import { HttpAgent, Actor } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
// ... rest of your imports

// Your application code here
</script>
```

### Option 3: Using the Actual CDN (If Available)
Replace the mock script section with:
```html
<script src="https://unpkg.com/@dfinity/agent@latest/lib/browser/index.js"></script>
<script src="https://unpkg.com/@dfinity/candid@latest/lib/browser/index.js"></script>
<!-- etc. -->
```
Note: Browser builds may not be available for all versions.

## Testing the Interface

1. **Open the HTML file** in a web browser
2. **Connect MetaMask** - make sure you have MetaMask installed
3. **Select a chain** - use the dropdown or enter a custom chain ID
4. **Enter a contract address** - any valid Ethereum address
5. **Enter your canister ID** - use any string for mock testing
6. **Load proposals** - this will show the mock proposals
7. **Test voting** - click vote buttons to see the SIWE flow

## Real Integration Steps

1. **Deploy your ICRC149 canister** to IC or local dfx
2. **Replace mock libraries** with real DFinity agent libraries
3. **Update the canister ID** in the interface
4. **Test with real MetaMask transactions**
5. **Verify storage slot discovery** works with your contract

## Files Structure
- `dao-voting-interface.html` - Complete standalone interface
- `icrc149-voting-interface.js` - Reusable module version
- `simple-voting-interface.html` - Minimal example
- `VOTING_INTERFACE_README.md` - Detailed documentation

## Troubleshooting
- If you see "Mock:" in console logs, you're using the demo version
- Check MetaMask connection if wallet features don't work
- Ensure your canister is running if using real IC integration
- Verify chain IDs match between MetaMask and your dApp

For questions or issues, refer to the main project documentation or check the browser console for detailed error messages.
