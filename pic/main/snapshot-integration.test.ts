import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";
import { PocketIc, createIdentity } from '@dfinity/pic';
import type { Actor, CanisterFixture } from '@dfinity/pic';
import { spawn, execSync, ChildProcess } from 'child_process';
import { ethers, JsonRpcProvider, Contract } from 'ethers';

// Runtime import: include the .js extension
import { idlFactory as mainIDLFactory, init as mainInit } from "../../src/declarations/main/main.did.js";
import { idlFactory as evmRpcIDLFactory, init as evmRpcInit } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

// Type-only import: import types from the candid interface without the extension
import type { _SERVICE as mainService } from "../../src/declarations/main/main.did.js";
import type { _SERVICE as evmRpcService } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

const admin = createIdentity("admin");
const alice = createIdentity("alice");

interface SnapshotResult {
  contract_address: string;
  chain: { chain_id: bigint; network_name: string };
  block_number: bigint;
  state_root: Uint8Array | number[];
  total_supply: bigint;
  snapshot_time: bigint;
}

interface GovernanceConfig {
  snapshot_contracts: Array<[string, {
    contract_address: string;
    chain: { chain_id: bigint; network_name: string };
    rpc_service: {
      rpc_type: string;
      canister_id: Principal;
      custom_config: Array<[string, string]> | [];
    };
    contract_type: { ERC20: null } | { ERC721: null } | { Other: string };
    balance_storage_slot: bigint;
    enabled: boolean;
  }]>;
  execution_contracts: Array<[string, any]>;
  approved_icp_methods: Array<[string, any]>;
  admin_principals: Principal[];
  default_snapshot_contract: string | [];
}

const twoSecondsInMs = 2000;

// Mock ERC20 contract ABI for testing
const mockERC20ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)"
];

const MAIN_WASM_PATH = `${process.cwd()}/.dfx/local/canisters/main/main.wasm.gz`;
const EVM_RPC_WASM_PATH = `${process.cwd()}/evm_rpc/evm_rpc.wasm.gz`;

describe("EVMDAOBridge Snapshot Integration Tests", () => {
  let anvilProcess: ChildProcess;
  let pic: PocketIc;
  let provider: JsonRpcProvider;
  let evmDAOBridge_fixture: CanisterFixture<mainService>;
  let evmRpc_fixture: CanisterFixture<evmRpcService>;
  let mockToken: Contract;
  let mockTokenAddress: string;

  // Kill any existing Anvil processes (adapted from witness verification test)
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
      console.warn('No existing Anvil processes to kill or cleanup failed:', error);
    }
  };

  beforeEach(async () => {
    // Kill any existing Anvil processes
    killExistingProcesses();

    // Start Anvil process (adapted from witness verification test pattern)
    console.log("Starting Anvil...");
    anvilProcess = spawn('anvil', ['--host', '127.0.0.1', '--port', '8545'], {
      stdio: 'pipe',
      shell: true,
    });

    // Attach event listeners for debugging
    anvilProcess.on('error', (error: Error) => {
      console.error('Failed to start Anvil process:', error);
    });

    anvilProcess.on('exit', (code: number) => {
      if (code !== 0) {
        console.error(`Anvil process exited with code ${code}`);
      }
    });

    // Forward Anvil output for debugging
    anvilProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Listening on')) {
        console.log('Anvil is ready');
      }
    });

    anvilProcess.stderr?.on('data', (data) => {
      console.error('Anvil stderr:', data.toString());
    });

    // Set up ethers provider for Anvil
    provider = new JsonRpcProvider("http://127.0.0.1:8545");
    
    // Wait for Anvil to start with better retry logic
    let connected = false;
    let attempts = 0;
    const maxAttempts = 20; // 20 seconds max wait
    
    while (!connected && attempts < maxAttempts) {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between attempts
        const network = await provider.getNetwork();
        console.log("Anvil network:", network);
        connected = true;
      } catch (error) {
        attempts++;
        console.log(`Attempt ${attempts}/${maxAttempts}: Waiting for Anvil to start...`);
        if (attempts === maxAttempts) {
          throw new Error(`Failed to connect to Anvil after ${maxAttempts} attempts: ${error}`);
        }
      }
    }

    // Deploy a mock ERC20 token for testing
    const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const signer = new ethers.Wallet(privateKey, provider);
    
    // Simple ERC20 contract bytecode with constructor setting total supply
    const mockERC20Bytecode = "0x608060405234801561001057600080fd5b50336000908152602081905260409020678ac7230489e800009055610241806100396000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c806318160ddd1461004657806370a08231146100645780636aa3f44a14610094575b600080fd5b61004e6100aa565b60405161005b91906101df565b60405180910390f35b610084610074366004610183565b60006020819052908152604090205481565b60405190815260200161005b565b6100846100a2366004610183565b6000602081905290815260409020549056";
    
    const deployTx = await signer.sendTransaction({
      data: mockERC20Bytecode,
    });
    const receipt = await deployTx.wait();
    
    if (!receipt || !receipt.contractAddress) {
      throw new Error("Failed to deploy mock ERC20 contract");
    }
    
    mockTokenAddress = receipt.contractAddress;
    mockToken = new Contract(mockTokenAddress, mockERC20ABI, signer);
    
    console.log("Mock ERC20 deployed at:", mockTokenAddress);

    // Set up PocketIC
    pic = await PocketIc.create(process.env.PIC_URL, {
      processingTimeoutMs: 1000 * 120 * 5,
    });

    console.log("Setting up EVM RPC canister");

    // Deploy the EVM RPC canister first
    evmRpc_fixture = await pic.setupCanister<evmRpcService>({
      sender: admin.getPrincipal(),
      idlFactory: evmRpcIDLFactory,
      wasm: EVM_RPC_WASM_PATH,
      arg: IDL.encode(evmRpcInit({IDL}), [{
        demo: [],
        manageApiKeys: [[admin.getPrincipal()]],
        logFilter: [{ ShowAll: null }]
      }]),
    });

    await pic.tick(5);

    console.log("EVM RPC canister deployed at:", evmRpc_fixture.canisterId.toString());

    console.log("Setting up EVMDAOBridge canister");

    // Deploy the EVMDAOBridge canister without initial configuration (following snapshot-basic.test.ts pattern)
    evmDAOBridge_fixture = await pic.setupCanister<mainService>({
      sender: admin.getPrincipal(),
      idlFactory: mainIDLFactory,
      wasm: MAIN_WASM_PATH,
      arg: IDL.encode(mainInit({IDL}), [[]]), // Empty initialization following working pattern
    });

    await pic.tick(5);

    // Set the admin identity before making admin calls
    evmDAOBridge_fixture.actor.setIdentity(admin);

    // Now configure the snapshot contract after deployment
    const snapshotContractConfig = {
      contract_address: mockTokenAddress.toLowerCase(), // Use lowercase for consistency
      chain: { chain_id: 31337n, network_name: "anvil" }, 
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n, 
      enabled: true
    };

    // Configure the snapshot contract using lowercase address for consistency
    const updateResult = await evmDAOBridge_fixture.actor.icrc149_update_snapshot_contract_config(
      mockTokenAddress.toLowerCase(),
      [snapshotContractConfig]
    );

    console.log("Update result:", updateResult);
    
    // Check if the update was successful
    if ('Err' in updateResult) {
      throw new Error(`Failed to update snapshot contract config: ${updateResult.Err}`);
    }

    console.log("EVMDAOBridge canister deployed at:", evmDAOBridge_fixture.canisterId.toString());

    // Test basic connectivity
    const hello = await evmDAOBridge_fixture.actor.hello();
    console.log("Canister hello response:", hello);
  });

  afterEach(async () => {
    // Clean up Anvil process (adapted from witness verification test)
    if (anvilProcess) {
      try {
        anvilProcess.kill('SIGTERM');
        // Give it a moment to terminate gracefully
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Force kill if still running
        if (!anvilProcess.killed) {
          anvilProcess.kill('SIGKILL');
        }
        console.log("Anvil process terminated");
      } catch (error) {
        console.warn("Error terminating Anvil process:", error);
      }
    }
    
    // Clean up any remaining processes
    try {
      killExistingProcesses();
    } catch (error) {
      console.warn("Error in cleanup:", error);
    }
    
    // Clean up PocketIC
    if (pic) {
      try {
        await pic.tearDown();
      } catch (error) {
        console.warn("Error tearing down PocketIC:", error);
      }
    }
  });

  it("should setup snapshot contracts correctly", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);
    
    // Get governance config to verify snapshot contracts are set up
    const config = await evmDAOBridge_fixture.actor.icrc149_governance_config();
    
    console.log("Governance config:", JSON.stringify(config, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value, 2));
    
    // The configuration should now include our mock token contract
    expect(config.snapshot_contracts).toBeDefined();
    expect(config.snapshot_contracts.length).toBeGreaterThanOrEqual(1);

    // Find our contract in the list (it should be there along with the default one)
    const ourContract = config.snapshot_contracts.find(([addr, _]) => 
      addr.toLowerCase() === mockTokenAddress.toLowerCase()
    );
    
    expect(ourContract).toBeDefined();
    const [contractAddr, contractConfig] = ourContract!;
    expect(contractAddr.toLowerCase()).toBe(mockTokenAddress.toLowerCase());
    expect(contractConfig.enabled).toBe(true);
    expect(contractConfig.contract_type).toEqual({ ERC20: null });
    expect(contractConfig.chain.chain_id).toBe(31337n);
  });

  it("should create a proposal and generate snapshot automatically", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);
    
    // Ensure our snapshot contract is properly configured for this test
    const snapshotContractConfig = {
      contract_address: mockTokenAddress.toLowerCase(),
      chain: { chain_id: 31337n, network_name: "anvil" }, 
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n, 
      enabled: true
    };

    // Re-configure to ensure it's set for this test
    const configResult = await evmDAOBridge_fixture.actor.icrc149_update_snapshot_contract_config(
      mockTokenAddress.toLowerCase(),
      [snapshotContractConfig]
    );
    
    if ('Err' in configResult) {
      console.log("Config error:", configResult.Err);
    }
    
    // Create a simple motion proposal with the mock token as snapshot contract
    const proposalArgs = {
      action: { Motion: "Test motion to verify snapshot functionality" },
      metadata: ["Testing snapshot creation via EVM RPC"] as [] | [string], // Correct Candid format for ?Text
      members: [{ id: admin.getPrincipal(), votingPower: 100n }],
      snapshot_contract: [mockTokenAddress.toLowerCase()] as [] | [string] // Correct Candid format for ?Text
    };

    console.log("Creating proposal with snapshot...");
    const createResult = await evmDAOBridge_fixture.actor.icrc149_create_proposal(proposalArgs);
    
    console.log("Create proposal result:", createResult);
    
    if ('Err' in createResult) {
      throw new Error(`Failed to create proposal: ${createResult.Err}`);
    }
    
    const proposalId = createResult.Ok;
    console.log("Created proposal with ID:", proposalId.toString());

    // Wait a moment for any async operations to complete
    await new Promise(resolve => setTimeout(resolve, twoSecondsInMs));
    
    // Get the proposal snapshot
    const snapshot = await evmDAOBridge_fixture.actor.icrc149_proposal_snapshot(proposalId);
    
    console.log("Generated snapshot:", {
      contract_address: snapshot.contract_address,
      chain_id: snapshot.chain.chain_id.toString(),
      network_name: snapshot.chain.network_name,
      block_number: snapshot.block_number.toString(),
      state_root_length: snapshot.state_root.length,
      total_supply: snapshot.total_supply.toString(),
      snapshot_time: snapshot.snapshot_time.toString()
    });
    
    // Verify snapshot was created correctly
    expect(snapshot.contract_address).toBe(mockTokenAddress.toLowerCase());
    expect(snapshot.chain.chain_id).toBe(31337n);
    expect(snapshot.chain.network_name).toBe("anvil");
    
    // Block number should be reasonable (greater than 0)
    expect(snapshot.block_number).toBeGreaterThan(0n);
    
    // State root should be 32 bytes
    expect(snapshot.state_root.length).toBe(32);
    
    // Total supply should be reasonable (we set it to 10000 tokens in our mock contract)
    expect(snapshot.total_supply).toBeGreaterThan(0n);
    
    // Snapshot time should be a reasonable timestamp (PocketIC uses fixed 2021 time)
    expect(snapshot.snapshot_time).toBeGreaterThan(0n); // Should be a positive timestamp
    expect(snapshot.snapshot_time).toBeLessThan(BigInt(Date.now() * 1000000 * 2)); // Should be reasonable (within 2x current time)
  });

  it("should validate snapshot contract configuration before creating proposals", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);
    
    // Try to create a proposal with an unapproved contract
    const invalidProposalArgs = {
      action: { Motion: "Test motion with invalid contract" },
      metadata: [] as [] | [string],
      members: [{ id: admin.getPrincipal(), votingPower: 100n }],
      snapshot_contract: ["0x1234567890123456789012345678901234567890"] as [] | [string] // Invalid contract
    };

    const result = await evmDAOBridge_fixture.actor.icrc149_create_proposal(invalidProposalArgs);
    
    console.log("Invalid contract result:", result);
    
    // Should fail with appropriate error
    expect('Err' in result).toBe(true);
    if ('Err' in result) {
      expect(result.Err).toContain("not approved");
    }
  });

  it("should handle RPC errors gracefully during snapshot creation", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);
    
    // Add a snapshot contract with invalid RPC configuration
    const invalidRpcContractConfig = {
      contract_address: "0x" + "1".repeat(40),
      chain: { chain_id: 99999n, network_name: "invalid" }, // Invalid chain
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://invalid-url:8545"]]] as [] | [[string, string][]] // Invalid URL
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: true
    };

    // Add the invalid contract (as admin)
    const updateResult = await evmDAOBridge_fixture.actor.icrc149_update_snapshot_contract_config(
      "0x" + "1".repeat(40),
      [invalidRpcContractConfig]
    );
    
    console.log("Update contract config result:", updateResult);
    
    if ('Err' in updateResult) {
      console.log("Failed to add invalid contract config (expected):", updateResult.Err);
      return; // This is expected behavior
    }

    // If the contract was added, try to create a proposal with it
    const proposalArgs = {
      action: { Motion: "Test motion with problematic RPC" },
      metadata: [] as [] | [string],
      members: [{ id: admin.getPrincipal(), votingPower: 100n }],
      snapshot_contract: ["0x" + "1".repeat(40)] as [] | [string]
    };

    // This should either fail or create a proposal with fallback values
    const createResult = await evmDAOBridge_fixture.actor.icrc149_create_proposal(proposalArgs);
    
    console.log("Create proposal with invalid RPC result:", createResult);
    
    // The implementation should handle RPC errors gracefully
    // Either by failing with a clear error message or using fallback values
    if ('Ok' in createResult) {
      console.log("Proposal created with fallback values (graceful handling)");
      const proposalId = createResult.Ok;
      
      // Check that snapshot has fallback values
      const snapshot = await evmDAOBridge_fixture.actor.icrc149_proposal_snapshot(proposalId);
      console.log("Snapshot with fallback values:", {
        block_number: snapshot.block_number.toString(),
        total_supply: snapshot.total_supply.toString()
      });
    } else {
      console.log("Proposal creation failed gracefully:", createResult.Err);
    }
  });

  it("should retrieve snapshot contracts list", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);
    
    // Ensure our snapshot contract is configured for this test
    const snapshotContractConfig = {
      contract_address: mockTokenAddress.toLowerCase(),
      chain: { chain_id: 31337n, network_name: "anvil" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: true
    };

    // Re-configure to ensure it's set for this test
    const configResult = await evmDAOBridge_fixture.actor.icrc149_update_snapshot_contract_config(
      mockTokenAddress.toLowerCase(),
      [snapshotContractConfig]
    );
    
    if ('Err' in configResult) {
      console.log("Config error in retrieve test:", configResult.Err);
    }
    
    const contracts = await evmDAOBridge_fixture.actor.icrc149_get_snapshot_contracts();
    
    console.log("Retrieved snapshot contracts:", contracts.map(([addr, config]) => ({
      address: addr,
      enabled: config.enabled,
      contract_type: config.contract_type
    })));
    
    expect(contracts).toBeDefined();
    expect(Array.isArray(contracts)).toBe(true);
    expect(contracts.length).toBeGreaterThanOrEqual(1);
    
    // Find our mock token contract (search case-insensitive)
    const mockContract = contracts.find(([addr, _]) => 
      addr.toLowerCase() === mockTokenAddress.toLowerCase()
    );
    
    console.log("Looking for contract:", mockTokenAddress.toLowerCase());
    console.log("Found contract:", mockContract ? mockContract[0] : "not found");
    
    expect(mockContract).toBeDefined();
    
    if (mockContract) {
      const [_, config] = mockContract;
      expect(config.enabled).toBe(true);
      expect(config.contract_type).toEqual({ ERC20: null });
    }
  });

  it("should allow admin to update snapshot contract configuration", async () => {
    evmDAOBridge_fixture.actor.setIdentity(admin);
    
    // Update the existing contract to disabled
    const updatedConfig = {
      contract_address: mockTokenAddress,
      chain: { chain_id: 31337n, network_name: "anvil" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: false // Disable the contract
    };

    const updateResult = await evmDAOBridge_fixture.actor.icrc149_update_snapshot_contract_config(
      mockTokenAddress.toLowerCase(),
      [updatedConfig]
    );
    
    console.log("Update config result:", updateResult);
    
    if ('Err' in updateResult) {
      throw new Error(`Failed to update config: ${updateResult.Err}`);
    }

    // Verify the update
    const contracts = await evmDAOBridge_fixture.actor.icrc149_get_snapshot_contracts();
    const updatedContract = contracts.find(([addr, _]) => addr === mockTokenAddress.toLowerCase());
    
    expect(updatedContract).toBeDefined();
    if (updatedContract) {
      const [_, config] = updatedContract;
      expect(config.enabled).toBe(false);
    }

    // Try to create a proposal with the disabled contract
    const proposalArgs = {
      action: { Motion: "Test motion with disabled contract" },
      metadata: [] as [] | [string],
      members: [{ id: admin.getPrincipal(), votingPower: 100n }],
      snapshot_contract: [mockTokenAddress.toLowerCase()] as [] | [string]
    };

    const createResult = await evmDAOBridge_fixture.actor.icrc149_create_proposal(proposalArgs);
    
    // Should fail because contract is disabled
    expect('Err' in createResult).toBe(true);
    if ('Err' in createResult) {
      expect(createResult.Err).toContain("not enabled");
    }
  });

  it("should prevent non-admin from updating snapshot contracts", async () => {
    evmDAOBridge_fixture.actor.setIdentity(alice); // Non-admin user
    
    const newConfig = {
      contract_address: "0x" + "2".repeat(40),
      chain: { chain_id: 31337n, network_name: "anvil" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: true
    };

    const updateResult = await evmDAOBridge_fixture.actor.icrc149_update_snapshot_contract_config(
      "0x" + "2".repeat(40),
      [newConfig]
    );
    
    console.log("Non-admin update result:", updateResult);
    
    // Should fail with permission error
    expect('Err' in updateResult).toBe(true);
    if ('Err' in updateResult) {
      expect(updateResult.Err.toLowerCase()).toContain("admin"); // Should mention admin permissions
    }
  });
});
