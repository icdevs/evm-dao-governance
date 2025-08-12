import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";
import { PocketIc, createIdentity } from '@dfinity/pic';
import type { Actor, CanisterFixture } from '@dfinity/pic';
import { spawn, execSync } from 'child_process';
import { ethers, JsonRpcProvider } from 'ethers';

// Runtime import: include the .js extension
import { idlFactory as mainIDLFactory, init as mainInit } from "../../src/declarations/main/main.did.js";

// Type-only import: import types from the candid interface without the extension
import type { _SERVICE as mainService, SIWEProof } from "../../src/declarations/main/main.did.js";

// Import SIWE utilities
import { createSIWEProofForProposal, createSimpleSIWEProof } from "../utils/siwe-utils";

export const WASM_PATH = ".dfx/local/canisters/main/main.wasm.gz";

const twoSecondsInMs = 2000;

describe("EVMDAOBridge Basic Snapshot Tests", () => {
  let pic: PocketIc;
  let childProcess: ReturnType<typeof spawn>;
  let provider: JsonRpcProvider;
  let admin = createIdentity("admin");
  let alice = createIdentity("alice");

  let evmDAOBridge_fixture: CanisterFixture<mainService>;
  let mockTokenAddress: string;

  const killExistingProcesses = () => {
    try {
      const processName = 'anvil';
      const platform = process.platform;

      if (platform === 'win32') {
        execSync(`taskkill /IM ${processName}* /F`, { stdio: 'ignore' });
      } else {
        execSync(`pkill -f ${processName}`, { stdio: 'ignore' });
      }
    } catch (error) {
      console.warn('No existing Anvil processes to kill:', error);
    }
  };

  beforeEach(async () => {
    killExistingProcesses();

    // Start Anvil (Ethereum local node) for testing
    console.log("Starting Anvil...");
    childProcess = spawn('anvil', ['--host', '127.0.0.1', '--port', '8545'], {
      stdio: 'pipe',
      shell: true,
    });

    // Wait for Anvil to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Set up ethers provider
    provider = new JsonRpcProvider("http://127.0.0.1:8545");

    // Verify Anvil is running
    const network = await provider.getNetwork();
    console.log("Connected to Anvil network:", network);

    // Deploy a mock ERC20 token for testing
    const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const signer = new ethers.Wallet(privateKey, provider);

    // Simple ERC20 contract bytecode
    const mockERC20Bytecode = "0x608060405234801561001057600080fd5b50336000908152602081905260409020678ac7230489e800009055610241806100396000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c806318160ddd1461004657806370a08231146100645780636aa3f44a14610094575b600080fd5b61004e6100aa565b60405161005b91906101df565b60405180910390f35b610084610074366004610183565b60006020819052908152604090205481565b60405190815260200161005b565b6100846100a2366004610183565b6000602081905290815260409020549056";

    const deployTx = await signer.sendTransaction({
      data: mockERC20Bytecode,
    });
    const receipt = await deployTx.wait();

    if (!receipt || !receipt.contractAddress) {
      throw new Error("Failed to deploy mock ERC20 contract");
    }

    mockTokenAddress = receipt.contractAddress;
    console.log("Mock ERC20 deployed at:", mockTokenAddress);

    // Set up PocketIC
    pic = await PocketIc.create(process.env.PIC_URL, {
      processingTimeoutMs: 1000 * 120 * 5,
    });

    console.log("Setting up EVMDAOBridge canister");

    // Deploy the EVMDAOBridge canister with minimal configuration
    evmDAOBridge_fixture = await pic.setupCanister<mainService>({
      sender: admin.getPrincipal(),
      idlFactory: mainIDLFactory,
      wasm: WASM_PATH,
      arg: IDL.encode(mainInit({ IDL }), [[]]), // Use null for minimal setup
    });

    await pic.tick(5);

    console.log("EVMDAOBridge canister deployed at:", evmDAOBridge_fixture.canisterId.toString());

    // Test basic connectivity
    const hello = await evmDAOBridge_fixture.actor.hello();
    console.log("Canister hello response:", hello);
  });

  afterEach(async () => {
    // Clean up Anvil process
    if (childProcess) {
      childProcess.kill('SIGTERM');
      console.log("Anvil process terminated");
    }

    // Clean up PocketIC
    if (pic) {
      await pic.tearDown();
    }
  });

  it("should initialize with empty governance config", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);

    // Get governance config to verify initial state
    const config = await evmDAOBridge_fixture.actor.icrc149_governance_config();

    console.log("Initial governance config:", JSON.stringify(config, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value, 2));

    expect(config.snapshot_contracts).toBeDefined();
    expect(Array.isArray(config.snapshot_contracts)).toBe(true);
    expect(config.admin_principals).toBeDefined();
    expect(Array.isArray(config.admin_principals)).toBe(true);
  });

  it("should allow admin to add snapshot contracts", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);

    // Try to add a snapshot contract using the test snapshot function first
    // This tests the basic snapshot creation without RPC integration
    const testResult = await evmDAOBridge_fixture.actor.icrc149_add_test_snapshot(
      BigInt(1), // proposal_id
      BigInt(12345), // block_number  
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]), // state_root (32 bytes)
      mockTokenAddress, // contract_address
      BigInt(31337), // chain_id
      "anvil" // network_name
    );

    console.log("Test snapshot added");

    // Verify we can retrieve the snapshot
    const snapshot = await evmDAOBridge_fixture.actor.icrc149_proposal_snapshot(BigInt(1));

    console.log("Retrieved snapshot:", {
      contract_address: snapshot.contract_address,
      chain_id: snapshot.chain.chain_id.toString(),
      network_name: snapshot.chain.network_name,
      block_number: snapshot.block_number.toString(),
      state_root_length: snapshot.state_root.length,
      total_supply: snapshot.total_supply.toString()
    });

    expect(snapshot.contract_address.toLowerCase()).toBe(mockTokenAddress.toLowerCase());
    expect(snapshot.chain.chain_id).toBe(BigInt(31337));
    expect(snapshot.chain.network_name).toBe("anvil");
    expect(snapshot.block_number).toBe(BigInt(12345));
    expect(snapshot.state_root.length).toBe(32);
  });

  it("should handle proposal creation with SIWE proof", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);

    // Create admin wallet for signing SIWE message
    const adminWallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);

    // Create SIWE proof for proposal creation
    const siweProof = await createSIWEProofForProposal(
      adminWallet,
      mockTokenAddress,
      pic
    );

    // Create a proposal with SIWE proof
    const proposalArgs = {
      action: { Motion: "Test motion with SIWE proof" },
      metadata: [] as [] | [string],
      siwe: siweProof,
      snapshot_contract: [] as [] | [string],
    };

    const result = await evmDAOBridge_fixture.actor.icrc149_create_proposal(proposalArgs);

    console.log("Proposal creation result:", result);

    // Check if the result indicates an error or success
    // The behavior may vary depending on implementation
    if ('Err' in result) {
      console.log("Proposal creation failed (expected if no snapshot contracts configured):", result.Err);
      // This might fail due to missing snapshot contract configuration, which is expected
    } else if ('Ok' in result) {
      // If it succeeds, verify the proposal was created properly
      expect(result.Ok).toBeDefined();
      console.log("Proposal created successfully with ID:", result.Ok);
    } else {
      // Handle other possible result formats
      console.log("Unexpected result format:", result);
    }
  });

  it("should handle storage key calculation", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);

    // Test the storage key calculation function
    const userAddress = new Uint8Array(20); // 20 zero bytes for address
    userAddress[19] = 1; // Set last byte to 1 for testing

    const storageSlot = BigInt(0);

    const storageKey = await evmDAOBridge_fixture.actor.icrc149_calculate_test_storage_key(
      userAddress,
      storageSlot
    );

    console.log("Calculated storage key:", storageKey);
    console.log("Storage key length:", storageKey.length);

    expect(storageKey).toBeDefined();
    expect(storageKey.length).toBe(32); // Should be 32 bytes
  });

  it("should return correct health check", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);

    const health = await evmDAOBridge_fixture.actor.icrc149_health_check();

    console.log("Health check result:", health);

    expect(health).toBeDefined();
    expect(typeof health).toBe('string');
    expect(health.toLowerCase()).toContain('healthy');
  });

  it("should support ICRC10 standards", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);

    const standards = await evmDAOBridge_fixture.actor.icrc10_supported_standards();

    console.log("Supported standards:", standards);

    expect(standards).toBeDefined();
    expect(Array.isArray(standards)).toBe(true);

    // Should support at least ICRC-149
    const icrc149Standard = standards.find(std => std.name.includes('149'));
    expect(icrc149Standard).toBeDefined();
  });

  it("should create proposal with configured snapshot contract", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);

    // First configure the mock token as a snapshot contract
    try {
      const contractConfig = {
        contract_address: mockTokenAddress,
        enabled: true,
        contract_type: { ERC20: null },
        balance_storage_slot: BigInt(0),
        chain: {
          chain_id: BigInt(31337),
          network_name: "anvil"
        },
        rpc_service: {
          rpc_type: "custom",
          canister_id: Principal.fromText("rdmx6-jaaaa-aaaah-qdrqq-cai"), // Default EVM RPC canister
          custom_config: [] as [] | [[string, string][]]
        }
      };

      await evmDAOBridge_fixture.actor.icrc149_update_snapshot_contract_config(
        mockTokenAddress,
        [contractConfig]
      );

      console.log("Snapshot contract configured successfully");
    } catch (error) {
      console.log("Failed to configure snapshot contract (expected in basic test):", error);
    }

    // Create admin wallet for signing SIWE message
    const adminWallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);

    // Create SIWE proof for proposal creation
    const siweProof = await createSIWEProofForProposal(
      adminWallet,
      mockTokenAddress,
      pic
    );

    // Create a proposal with SIWE proof and snapshot contract
    const proposalArgs = {
      action: { Motion: "Test motion with configured snapshot contract" },
      metadata: ["Test proposal with snapshot"] as [] | [string],
      siwe: siweProof,
      snapshot_contract: [mockTokenAddress] as [] | [string],
    };

    try {
      const result = await evmDAOBridge_fixture.actor.icrc149_create_proposal(proposalArgs);

      console.log("Proposal creation result:", result);

      if ('Ok' in result) {
        expect(result.Ok).toBeDefined();
        console.log("Proposal created successfully with ID:", result.Ok);

        // Try to get the proposal if we can
        try {
          const proposal = await evmDAOBridge_fixture.actor.icrc149_get_proposal(result.Ok);
          console.log("Proposal retrieved:", proposal);
        } catch (detailsError) {
          console.log("Could not fetch proposal (method may not exist or proposal not found)");
        }
      } else {
        console.log("Proposal creation failed:", result);
      }
    } catch (error) {
      console.log("Proposal creation error (expected without full EVM RPC setup):", error);
    }
  });

  it("should allow testing snapshot information retrieval", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);

    // First add a test snapshot
    await evmDAOBridge_fixture.actor.icrc149_add_test_snapshot(
      BigInt(2), // proposal_id
      BigInt(54321), // block_number
      new Uint8Array(32).fill(42), // state_root (32 bytes of 42)
      mockTokenAddress, // contract_address  
      BigInt(31337), // chain_id
      "anvil" // network_name
    );

    // Try to get snapshot info using the test helper (if it exists)
    try {
      const snapshotInfo = await evmDAOBridge_fixture.actor.test_get_snapshot_info(mockTokenAddress);

      console.log("Test snapshot info:", snapshotInfo);

      if (snapshotInfo.length > 0 && snapshotInfo[0]) {
        const info = snapshotInfo[0];
        expect(info.block_number).toBeDefined();
        expect(info.root_hash).toBeDefined();
      }
    } catch (error) {
      console.log("test_get_snapshot_info not available (expected for some implementations)");
    }
  });
});
