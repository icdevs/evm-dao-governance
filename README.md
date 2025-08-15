# EVM DAO Bridge - ICRC-149 Implementation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Motoko](https://img.shields.io/badge/language-Motoko-blue.svg)](https://github.com/dfinity/motoko)
[![Internet Computer](https://img.shields.io/badge/platform-Internet%20Computer-red.svg)](https://internetcomputer.org/)

A comprehensive Motoko implementation of the ICRC-149 Ethereum DAO Bridge standard for the Internet Computer, enabling cryptographic proofs of Ethereum token-holder balances for IC-side governance voting.

## 🌟 Overview

This project bridges Ethereum-based DAO governance with the Internet Computer ecosystem. It allows Ethereum token holders to participate in governance decisions on the IC by providing cryptographic proofs of their token balances at specific block heights, without needing to transfer tokens to the IC.

### Key Features

-   **🔗 Multi-Contract Governance**: Support for multiple Ethereum contracts (ERC-20, ERC-721) within a single DAO
-   **📊 Cryptographic Proof Voting**: Vote using Merkle proofs of Ethereum token balances
-   **🔐 SIWE Authentication**: Sign-In With Ethereum (EIP-4361) for secure identity binding
-   **🏛️ Proposal Management**: Create, vote on, and execute governance proposals
-   **⚡ ChainFusion Ready**: Built for IC's native Ethereum integration
-   **🛡️ Admin Controls**: Configurable contract approvals and method permissions
-   **📈 Vote Tallying**: Real-time vote counting with quorum tracking
-   **🔄 Migration Support**: Version-safe state upgrades with class-plus pattern

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend JS   │    │  IC Canister     │    │   Ethereum      │
│                 │    │  (Motoko)        │    │   Network       │
├─────────────────┤    ├──────────────────┤    ├─────────────────┤
│ • MetaMask      │◄──►│ • ICRC-149 API   │◄──►│ • ERC-20/721    │
│ • SIWE Signing  │    │ • Proof Verify   │    │ • State Proofs  │
│ • Merkle Proof  │    │ • Vote Tallying  │    │ • Block Headers │
│ • Balance Check │    │ • Proposal Mgmt  │    │ • RPC Services  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

-   [DFX](https://internetcomputer.org/docs/current/developer-docs/setup/install/) 0.15.0+
-   [Mops](https://mops.one/) package manager
-   [Node.js](https://nodejs.org/) 18+
-   [Vessel](https://github.com/dfinity/vessel) (alternative package manager)

### Installation

1. **Clone the repository**

    ```bash
    git clone https://github.com/icdevs/evm-dao-governance.git
    cd evm-dao-governance
    ```

2. **Install dependencies**

    ```bash
    # Install Motoko dependencies
    mops install

    # Install Node.js dependencies
    npm install
    (cd ./js && npm install)

    # Pull evm_rpc
    dfx deps pull
    ```

3. **Output declarations**

    ```bash
    # Output canister candid declarations
    # (Only initially or on backend API change)
    dfx generate
    ```

4. **Start local development**

    ```bash
    # Start local IC replica
    dfx start --background

    # Deploy the canister
    dfx deploy
    ```

### Basic Usage

```typescript
// Deploy with initial configuration
const initArgs = {
  evmdaobridgeArgs: {
    snapshot_contracts: [{
      contract_address: "0x1234567890123456789012345678901234567890",
      chain: { chain_id: 1, network_name: "mainnet" },
      rpc_service: { rpc_type: "mainnet", canister_id: Principal.fromText("...") },
      balance_storage_slot: 1,
      contract_type: { ERC20: null },
      enabled: true
    }],
    execution_contracts: [],
    approved_icp_methods: [],
    admin_principals: [Principal.fromText("...")]
  }
};

// Create a proposal
const proposal = await canister.icrc149_create_proposal({
  action: { Motion: "Increase protocol rewards by 10%" },
  metadata: "Community proposal for reward adjustment",
  snapshot_contract: "0x1234567890123456789012345678901234567890"
});

// Vote with proof
const voteResult = await canister.icrc149_vote_proposal({
  proposal_id: 1,
  voter: "0xabcdef...",
  choice: { Yes: null },
  siwe: { message: "...", signature: "..." },
  witness: { address: "0x...", proof: [...], leaf: "0x...", root: "0x..." }
});
```

## 🔧 Development

### Prerequisites

For development beyond the basic Quick Start setup, you'll need these additional tools:

-   **[Foundry](https://book.getfoundry.sh/getting-started/installation)** - Ethereum development toolkit
    ```bash
    curl -L https://foundry.paradigm.xyz | bash
    foundryup
    ```
-   **[Hardhat](https://hardhat.org/tutorial/setting-up-the-environment)** - Ethereum development environment
    ```bash
    npm install -g hardhat
    ```
-   **[TypeScript](https://www.typescriptlang.org/)** - For type-safe JavaScript development
-   **[ic-wasm](https://github.com/dfinity/ic-wasm)** - WebAssembly optimization tool (only needed if using `./build.sh` instead of `dfx build`)
-   **[Python 3](https://www.python.org/)** - For running local development servers (only needed if using `frontend_old` with `npm run serve/demo`)
-   **[Docker](https://docs.docker.com/get-docker/)** (Optional) - For containerized builds

### Building

```bash
# Build the canister
./build.sh

# Or use dfx
dfx build

# Build with compression
compress=yes ./build.sh
```

### Testing

```bash
# Run Motoko tests
dfx test

# Run integration tests with Ethereum simulation
npm run test:integration:anvil

# Run specific test suites
npm run test:witness
npm run test:snapshot
```

### Local Ethereum Development

```bash
# Start local Ethereum node (Anvil)
npm run anvil

# Deploy test contracts
npm run deploy:anvil

# Run tests against local network
npm run test:anvil
```

## 📖 API Reference

### Core ICRC-149 Functions

#### Governance Configuration

-   `icrc149_governance_config()` - Get complete governance setup
-   `icrc149_get_snapshot_contracts()` - List approved snapshot contracts
-   `icrc149_get_execution_contracts()` - List approved execution contracts
-   `icrc149_get_approved_icp_methods()` - List approved ICP methods

#### Admin Functions (Admin Only)

-   `icrc149_update_snapshot_contract_config(address, config)` - Manage snapshot contracts
-   `icrc149_update_execution_contract_config(address, config)` - Manage execution contracts
-   `icrc149_update_icp_method_config(canister, method, config)` - Manage ICP method permissions
-   `icrc149_update_admin_principal(principal, is_admin)` - Manage admin access

#### Proposal Management

-   `icrc149_create_proposal(proposal_args)` - Create new governance proposal
-   `icrc149_get_proposals(prev, take, filters)` - Query proposals with pagination
-   `icrc149_vote_proposal(vote_args)` - Submit vote with cryptographic proof
-   `icrc149_execute_proposal(proposal_id)` - Execute approved proposals

#### Authentication & Verification

-   `icrc149_verify_siwe(siwe_proof)` - Verify Sign-In With Ethereum message
-   `icrc149_verify_witness(witness, proposal_id)` - Verify Merkle proof against stored state
-   `icrc149_proposal_snapshot(proposal_id)` - Get snapshot data for specific proposal

### Frontend Integration

The project includes a comprehensive JavaScript interface:

```html
<!-- Include the voting interface -->
<script src="./icrc149-voting-interface.js"></script>

<script>
    // Initialize with canister details
    const voting = new ICRC149VotingInterface({
      canisterId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
      host: "http://localhost:4943"
    });

    // Create and submit vote
    const result = await voting.createAndSubmitVote(
      proposalId,
      voteChoice,
      contractAddress,
      userAddress
    );
</script>
```

## 🔐 Security Model

### Storage Slot Validation

The `balance_storage_slot` field in `SnapshotContractConfig` is critical for security:

```motoko
// Example: Most ERC-20 tokens store balances at slot 1
let config : SnapshotContractConfig = {
  contract_address = "0x...";
  balance_storage_slot = 1; // Keccak256(address || 1) for most ERC-20s
  // ... other fields
};
```

### Access Control

-   **Admin Principals**: Only configured admins can modify governance settings
-   **Proposal Creation**: Open to all users (can be restricted via governance)
-   **Voting**: Requires valid SIWE signature + Merkle proof of token balance
-   **Execution**: Automatic when proposals meet threshold and deadline

### Cryptographic Verification

-   **SIWE Messages**: EIP-4361 compliant signature verification
-   **Merkle Proofs**: Ethereum state trie proof validation
-   **Block Finality**: Uses finalized block headers for snapshot security

## 🛠️ Configuration

### Environment Variables

```bash
# Development
export DFX_NETWORK=local
export DFX_VERSION=0.15.0

# Production
export DFX_NETWORK=ic
export CANISTER_ID=your-canister-id
```

### Governance Settings

```motoko
// Configure in initialization args
let governance_config = {
  proposal_duration_nanoseconds = 345_600_000_000_000; // 4 days
  voting_threshold = #percent({ percent = 50; quorum = ?25 });
  default_snapshot_contract = ?"0x...";
  evm_rpc_canister_id = Principal.fromText("7hfb6-caaaa-aaaar-qadga-cai");
};
```

## 🧪 Testing Strategy

### Unit Tests

-   **Motoko Tests**: Core logic validation (`test/*.test.mo`)
-   **JavaScript Tests**: Frontend integration (`js/*.test.ts`)

### Integration Tests

-   **Ethereum Simulation**: Using Anvil local network
-   **End-to-End**: Full voting workflow with MetaMask
-   **Proof Verification**: Merkle proof generation and validation

### Security Testing

-   **Access Control**: Admin function restrictions
-   **Proof Validation**: Invalid proof rejection
-   **Replay Protection**: SIWE nonce validation

## 📁 Project Structure

```
├── src/                          # Motoko source code
│   ├── lib.mo                   # Main ICRC-149 implementation
│   ├── main.mo                  # Canister actor (example)
│   ├── service.mo               # Type definitions
│   ├── WitnessValidator.mo      # Merkle proof verification
│   ├── EVMRPCService.mo         # EVM RPC integration
│   └── migrations/              # Version migration support
├── js/                          # Frontend JavaScript
│   ├── icrc149-voting-interface.js  # Main voting interface
│   ├── metamask-balance-proof.ts    # Proof generation
│   └── dao-voting-interface.html    # Demo interface
├── test/                        # Test files
├── scripts/                     # Deployment scripts
├── did/                         # Candid interface files
└── docs/                        # Documentation
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes with tests
4. **Run** the test suite
5. **Submit** a pull request

### Code Standards

-   **Motoko**: Follow official style guidelines
-   **TypeScript**: Use strict mode with proper typing
-   **Testing**: Maintain >80% test coverage
-   **Documentation**: Update docs for API changes

## 📚 Resources

### Standards & Specifications

-   [ICRC-149 Specification](icrc149.md) - Complete standard definition
-   [ICRC-10](https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-10) - Base standard support
-   [EIP-4361 SIWE](https://eips.ethereum.org/EIPS/eip-4361) - Sign-In With Ethereum

### Documentation

-   [API Documentation](ICRC149_README.md) - Detailed API reference
-   [Integration Guide](js/METAMASK_INTEGRATION.md) - Frontend integration
-   [Security Analysis](js/storage-slot-security-analysis.js) - Security considerations

### Examples

-   [Simple Voting Interface](js/simple-voting-interface.html) - Basic voting demo
-   [DAO Voting Interface](js/dao-voting-interface.html) - Full-featured interface
-   [MetaMask Examples](js/metamask-examples.ts) - Integration examples

## 📋 Roadmap

### Current Status ✅

-   [x] Core ICRC-149 implementation
-   [x] Multi-contract governance support
-   [x] SIWE authentication framework
-   [x] Vote tallying and proposal management
-   [x] Frontend JavaScript integration
-   [x] Test suite with Ethereum simulation

### In Progress 🚧

-   [ ] Real Merkle proof verification
-   [ ] ChainFusion EVM RPC integration
-   [ ] Enhanced access controls
-   [ ] Production security hardening

### Future Plans 🔮

-   [ ] Mobile wallet support
-   [ ] Cross-chain governance (Polygon, BSC)
-   [ ] Advanced voting strategies
-   [ ] Governance analytics dashboard

## ⚠️ Disclaimer

**This is a reference implementation for development and testing purposes.**

For production deployment, ensure you implement:

-   Real cryptographic verification of SIWE signatures
-   Proper Merkle proof validation against Ethereum state
-   Storage slot validation for security
-   Comprehensive access controls
-   Integration with IC's ChainFusion for Ethereum interaction

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

-   [ICDevs](https://icdevs.org/) - Funding and development support
-   [DFINITY Foundation](https://dfinity.org/) - Internet Computer platform
-   [Motoko Community](https://github.com/dfinity/motoko) - Language and ecosystem
-   [Ethereum Community](https://ethereum.org/) - Standards and tooling

---

**Built with ❤️ for the Internet Computer ecosystem**

For questions, support, or collaboration opportunities, please reach out through [GitHub Issues](https://github.com/icdevs/evm-dao-governance/issues) or the [IC Developer Forum](https://forum.dfinity.org/).
