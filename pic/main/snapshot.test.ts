import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";
import { spawn, ChildProcess } from "child_process";

import {
  PocketIc,
  createIdentity
} from "@dfinity/pic";

import type {
  Actor,
  CanisterFixture
} from "@dfinity/pic";

// Runtime import: include the .js extension
import { idlFactory as mainIDLFactory, init as mainInit } from "../../src/declarations/main/main.did.js";

// Type-only import: import types from the candid interface without the extension
import type { _SERVICE as mainService } from "../../src/declarations/main/main.did.js";

export const WASM_PATH = ".dfx/local/canisters/main/main.wasm";

let replacer = (_key: any, value: any) => typeof value === "bigint" ? value.toString() + "n" : value;
export const sub_WASM_PATH = process.env['SUB_WASM_PATH'] || WASM_PATH; 

let pic: PocketIc;
let main_fixture: CanisterFixture<mainService>;

const admin = createIdentity("admin");
const alice = createIdentity("alice");
const bob = createIdentity("bob");

// Mock ERC20 contract for testing
const MOCK_ERC20_CONTRACT = "0x1234567890123456789012345678901234567890";
const MOCK_CHAIN_ID = 31337;

// Sample storage slot for ERC20 balances mapping (slot 0 is typical)
const BALANCE_STORAGE_SLOT = 0;

// Time helpers
const twoSecondsInMs = 2 * 1000;

describe("EVMDAOBridge Snapshot Integration Tests", () => {
  let childProcess: ReturnType<typeof spawn>;

  const killExistingProcesses = () => {
    try {
      // Kill any existing processes that might interfere
      require('child_process').execSync('pkill -f "anvil\\|ganache\\|hardhat" || true', { stdio: 'ignore' });
    } catch (error) {
      // Ignore errors when killing processes
    }
  };

  beforeEach(async () => {
    killExistingProcesses();
    
    // Start local Ethereum node for testing
    const targetDir = '../../../../../ICDevs/projects/icrc99-orchestrator/sample-nfts';
    childProcess = spawn('yarn', ['chain2'], {
      cwd: targetDir,
      stdio: 'inherit',
      shell: true,
    });

    // Attach event listeners for debugging
    childProcess.on('error', (error: Error) => {
      console.error('Child process error:', error);
    });

    childProcess.on('exit', (code: number) => {
      console.log('Child process exited with code:', code);
    });

    pic = await PocketIc.create(process.env.PIC_URL, {
      processingTimeoutMs: 1000 * 60 * 5,
    });

    console.log("Setting up canisters");

    // Setup main EVMDAOBridge canister
    main_fixture = await pic.setupCanister<mainService>({
      sender: admin.getPrincipal(),
      idlFactory: mainIDLFactory,
      wasm: sub_WASM_PATH,
      arg: IDL.encode(mainInit({IDL}), [[]]),
    });

    // Setup EVM RPC canister
    evm_fixture = await pic.setupCanister<EVMService>({
      sender: admin.getPrincipal(),
      idlFactory: evmIDLFactory,
      wasm: EVM_WASM_PATH,
      arg: IDL.encode(evmInit({IDL}), [{ 
        logFilter : [{ShowAll : null}],
        demo : [],
        manageApiKeys : [[admin.getPrincipal()]]
      }]),
    });

    await pic.tick(5);

    // Set identity for EVM canister
    await evm_fixture.actor.setIdentity(admin);

    console.log("Canisters set up successfully");
  });

  afterEach(async () => {
    if (childProcess) {
      childProcess.kill('SIGTERM');
      // Give process time to cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    await pic.tearDown();
  });

  // Helper function to process RPC calls
  async function processRPCCalls(timeout = 10000): Promise<void[]> {
    await pic.tick(5);
    const startTime = Date.now();
    
    const processCalls = async (): Promise<void[]> => {
      let pendingHttpsOutcalls = await pic.getPendingHttpsOutcalls();
      console.log(`Processing ${pendingHttpsOutcalls.length} pending HTTPS outcalls`);
      
      if (pendingHttpsOutcalls.length === 0) {
        return [];
      }

      const processedCalls = await Promise.all(
        pendingHttpsOutcalls.map(async (outcall) => {
          try {
            const decodedBody = new TextDecoder().decode(new Uint8Array(outcall.request.body));
            console.log("RPC Request body:", decodedBody);
            
            // Mock responses for testing
            let responseBody: any;
            const requestObject = JSON.parse(decodedBody);
            
            if (requestObject.method === "eth_getBlockByNumber") {
              // Mock latest block response
              responseBody = {
                jsonrpc: "2.0",
                id: requestObject.id,
                result: {
                  number: "0x" + (12345678).toString(16),
                  stateRoot: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                  hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                  timestamp: "0x" + Math.floor(Date.now() / 1000).toString(16)
                }
              };
            } else if (requestObject.method === "eth_call") {
              // Mock ERC20 totalSupply call response
              responseBody = {
                jsonrpc: "2.0",
                id: requestObject.id,
                result: "0x" + (1000000 * 10**18).toString(16) // 1M tokens with 18 decimals
              };
            } else {
              // Default response
              responseBody = {
                jsonrpc: "2.0",
                id: requestObject.id,
                result: "0x0"
              };
            }

            const responseBodyBytes = new TextEncoder().encode(JSON.stringify(responseBody));
            
            await pic.mockCanisterHttpResponse({
              canisterId: outcall.canisterId,
              httpResponse: {
                status: 200,
                headers: [],
                body: Array.from(responseBodyBytes),
              },
            });
          } catch (error) {
            console.error("Error processing RPC call:", error);
            await pic.mockCanisterHttpResponse({
              canisterId: outcall.canisterId,
              httpResponse: {
                status: 500,
                headers: [],
                body: Array.from(new TextEncoder().encode(JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  error: { code: -32000, message: "Test error" }
                }))),
              },
            });
          }
        })
      );

      await pic.tick(5);

      // Check for more pending calls
      const remainingCalls = await pic.getPendingHttpsOutcalls();
      if (remainingCalls.length > 0 && Date.now() - startTime < timeout) {
        return [...processedCalls, ...await processCalls()];
      }

      return processedCalls;
    };

    return processCalls();
  }

  it('can configure snapshot contract and take snapshot', async () => {
    console.log("=== Testing Snapshot Contract Configuration and Snapshot Taking ===");

    main_fixture.actor.setIdentity(admin);

    // First, configure a snapshot contract
    const snapshotContractConfig = {
      contract_address: MOCK_ERC20_CONTRACT,
      chain: {
        chain_id: MOCK_CHAIN_ID,
        network_name: "localhost"
      },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evm_fixture.canisterId,
        custom_config: [["url", "http://127.0.0.1:8545"]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: BALANCE_STORAGE_SLOT,
      enabled: true
    };

    // Add the snapshot contract configuration
    const configResult = await main_fixture.actor.icrc149_update_snapshot_contract_config(
      MOCK_ERC20_CONTRACT,
      [snapshotContractConfig]
    );

    console.log("Snapshot contract config result:", configResult);
    expect(configResult).toMatchObject({ Ok: null });

    // Verify the configuration was added
    const contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    console.log("Configured snapshot contracts:", contracts);
    
    expect(contracts).toHaveLength(1);
    expect(contracts[0][0]).toBe(MOCK_ERC20_CONTRACT);
    expect(contracts[0][1].contract_address).toBe(MOCK_ERC20_CONTRACT);
    expect(contracts[0][1].enabled).toBe(true);

    // Set default snapshot contract
    await main_fixture.actor.icrc149_update_snapshot_contract_config(
      MOCK_ERC20_CONTRACT,
      [{ ...snapshotContractConfig }]
    );

    // Create a proposal which should trigger snapshot taking
    const createProposalRequest = {
      action: { Motion: "Test proposal for snapshot" },
      metadata: ["Test proposal metadata"],
      members: [
        { id: alice.getPrincipal(), votingPower: 1000 },
        { id: bob.getPrincipal(), votingPower: 500 }
      ],
      snapshot_contract: [MOCK_ERC20_CONTRACT]
    };

    const proposalResult = await main_fixture.actor.icrc149_create_proposal(createProposalRequest);
    console.log("Create proposal result:", proposalResult);

    // Process any RPC calls for snapshot taking
    await processRPCCalls(10000);
    await pic.advanceTime(twoSecondsInMs);

    if ('Ok' in proposalResult) {
      const proposalId = proposalResult.Ok;
      console.log("Created proposal ID:", proposalId);

      // Get the snapshot for this proposal
      const snapshot = await main_fixture.actor.icrc149_proposal_snapshot(proposalId);
      console.log("Proposal snapshot:", snapshot);

      // Verify snapshot was created correctly
      expect(snapshot.contract_address).toBe(MOCK_ERC20_CONTRACT);
      expect(snapshot.chain.chain_id).toBe(MOCK_CHAIN_ID);
      expect(snapshot.block_number).toBeGreaterThan(0);
      expect(snapshot.state_root).toBeDefined();
      expect(snapshot.total_supply).toBeGreaterThan(0);
      expect(snapshot.snapshot_time).toBeGreaterThan(0);

      console.log("✅ Snapshot successfully created and verified");
    } else {
      throw new Error("Failed to create proposal: " + proposalResult.Err);
    }
  });

  it('can handle multiple snapshot contracts', async () => {
    console.log("=== Testing Multiple Snapshot Contracts ===");

    main_fixture.actor.setIdentity(admin);

    // Configure first snapshot contract
    const contract1 = "0x1111111111111111111111111111111111111111";
    const config1 = {
      contract_address: contract1,
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evm_fixture.canisterId,
        custom_config: [["url", "http://127.0.0.1:8545"]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0,
      enabled: true
    };

    // Configure second snapshot contract
    const contract2 = "0x2222222222222222222222222222222222222222";
    const config2 = {
      contract_address: contract2,
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evm_fixture.canisterId,
        custom_config: [["url", "http://127.0.0.1:8545"]]
      },
      contract_type: { ERC721: null },
      balance_storage_slot: 2,
      enabled: true
    };

    // Add both configurations
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contract1, [config1]);
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contract2, [config2]);

    // Verify both contracts are configured
    const contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    console.log("All configured contracts:", contracts);
    
    expect(contracts).toHaveLength(2);
    
    // Test creating proposals with different snapshot contracts
    const proposal1Request = {
      action: { Motion: "Proposal 1" },
      metadata: ["Proposal 1 metadata"],
      members: [{ id: alice.getPrincipal(), votingPower: 1000 }],
      snapshot_contract: [contract1]
    };

    const proposal2Request = {
      action: { Motion: "Proposal 2" },
      metadata: ["Proposal 2 metadata"],
      members: [{ id: bob.getPrincipal(), votingPower: 500 }],
      snapshot_contract: [contract2]
    };

    const result1 = await main_fixture.actor.icrc149_create_proposal(proposal1Request);
    const result2 = await main_fixture.actor.icrc149_create_proposal(proposal2Request);

    // Process RPC calls
    await processRPCCalls(10000);
    await pic.advanceTime(twoSecondsInMs);

    if ('Ok' in result1 && 'Ok' in result2) {
      const snapshot1 = await main_fixture.actor.icrc149_proposal_snapshot(result1.Ok);
      const snapshot2 = await main_fixture.actor.icrc149_proposal_snapshot(result2.Ok);

      expect(snapshot1.contract_address).toBe(contract1);
      expect(snapshot2.contract_address).toBe(contract2);

      console.log("✅ Multiple snapshot contracts working correctly");
    } else {
      throw new Error("Failed to create proposals");
    }
  });

  it('can reject unauthorized snapshot contract modifications', async () => {
    console.log("=== Testing Authorization for Snapshot Contract Config ===");

    // Try to add snapshot contract as non-admin
    main_fixture.actor.setIdentity(alice);

    const unauthorizedConfig = {
      contract_address: "0x9999999999999999999999999999999999999999",
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evm_fixture.canisterId,
        custom_config: []
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0,
      enabled: true
    };

    const unauthorizedResult = await main_fixture.actor.icrc149_update_snapshot_contract_config(
      "0x9999999999999999999999999999999999999999",
      [unauthorizedConfig]
    );

    console.log("Unauthorized config result:", unauthorizedResult);
    expect('Err' in unauthorizedResult && unauthorizedResult.Err.includes("Unauthorized")).toBe(true);

    // Verify no contracts were added
    main_fixture.actor.setIdentity(admin);
    const contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    expect(contracts).toHaveLength(0);

    console.log("✅ Authorization working correctly");
  });

  it('can disable and enable snapshot contracts', async () => {
    console.log("=== Testing Snapshot Contract Enable/Disable ===");

    main_fixture.actor.setIdentity(admin);

    const contractAddress = "0x3333333333333333333333333333333333333333";
    
    // Add enabled contract
    const enabledConfig = {
      contract_address: contractAddress,
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evm_fixture.canisterId,
        custom_config: []
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0,
      enabled: true
    };

    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, [enabledConfig]);

    // Verify it works for proposals
    const workingProposal = {
      action: { Motion: "Should work" },
      metadata: [],
      members: [{ id: alice.getPrincipal(), votingPower: 1000 }],
      snapshot_contract: [contractAddress]
    };

    const workingResult = await main_fixture.actor.icrc149_create_proposal(workingProposal);
    expect('Ok' in workingResult).toBe(true);

    // Now disable the contract
    const disabledConfig = { ...enabledConfig, enabled: false };
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, [disabledConfig]);

    // Try to create proposal with disabled contract
    const failingProposal = {
      action: { Motion: "Should fail" },
      metadata: [],
      members: [{ id: alice.getPrincipal(), votingPower: 1000 }],
      snapshot_contract: [contractAddress]
    };

    const failingResult = await main_fixture.actor.icrc149_create_proposal(failingProposal);
    console.log("Disabled contract result:", failingResult);
    
    expect('Err' in failingResult && failingResult.Err.includes("not enabled")).toBe(true);

    // Re-enable and verify it works again
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, [enabledConfig]);
    
    const reenableResult = await main_fixture.actor.icrc149_create_proposal(workingProposal);
    expect('Ok' in reenableResult).toBe(true);

    console.log("✅ Enable/disable functionality working correctly");
  });

  it('can handle snapshot contract removal', async () => {
    console.log("=== Testing Snapshot Contract Removal ===");

    main_fixture.actor.setIdentity(admin);

    const contractAddress = "0x4444444444444444444444444444444444444444";
    
    // Add a contract
    const config = {
      contract_address: contractAddress,
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evm_fixture.canisterId,
        custom_config: []
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0,
      enabled: true
    };

    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, [config]);

    // Verify it was added
    let contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    expect(contracts).toHaveLength(1);

    // Remove the contract by passing null config
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, []);

    // Verify it was removed
    contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    expect(contracts).toHaveLength(0);

    // Try to create proposal with removed contract
    const proposalRequest = {
      action: { Motion: "Should fail" },
      metadata: [],
      members: [{ id: alice.getPrincipal(), votingPower: 1000 }],
      snapshot_contract: [contractAddress]
    };

    const result = await main_fixture.actor.icrc149_create_proposal(proposalRequest);
    expect('Err' in result && result.Err.includes("not approved")).toBe(true);

    console.log("✅ Contract removal working correctly");
  });

  it('can verify snapshot data integrity', async () => {
    console.log("=== Testing Snapshot Data Integrity ===");

    main_fixture.actor.setIdentity(admin);

    // Configure snapshot contract
    const config = {
      contract_address: MOCK_ERC20_CONTRACT,
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      rpc_service: {
        rpc_type: "custom", 
        canister_id: evm_fixture.canisterId,
        custom_config: [["url", "http://127.0.0.1:8545"]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0,
      enabled: true
    };

    await main_fixture.actor.icrc149_update_snapshot_contract_config(MOCK_ERC20_CONTRACT, [config]);

    // Create multiple proposals to test snapshot consistency
    const proposal1 = {
      action: { Motion: "Proposal 1" },
      metadata: [],
      members: [{ id: alice.getPrincipal(), votingPower: 1000 }],
      snapshot_contract: [MOCK_ERC20_CONTRACT]
    };

    const proposal2 = {
      action: { Motion: "Proposal 2" },
      metadata: [],
      members: [{ id: bob.getPrincipal(), votingPower: 500 }],
      snapshot_contract: [MOCK_ERC20_CONTRACT]
    };

    const result1 = await main_fixture.actor.icrc149_create_proposal(proposal1);
    
    // Wait a bit to ensure different block numbers
    await pic.advanceTime(twoSecondsInMs);
    
    const result2 = await main_fixture.actor.icrc149_create_proposal(proposal2);

    await processRPCCalls(10000);

    if ('Ok' in result1 && 'Ok' in result2) {
      const snapshot1 = await main_fixture.actor.icrc149_proposal_snapshot(result1.Ok);
      const snapshot2 = await main_fixture.actor.icrc149_proposal_snapshot(result2.Ok);

      console.log("Snapshot 1:", snapshot1);
      console.log("Snapshot 2:", snapshot2);

      // Both snapshots should reference the same contract
      expect(snapshot1.contract_address).toBe(snapshot2.contract_address);
      expect(snapshot1.chain.chain_id).toBe(snapshot2.chain.chain_id);

      // Snapshots should have valid data
      expect(snapshot1.block_number).toBeGreaterThan(0);
      expect(snapshot2.block_number).toBeGreaterThan(0);
      expect(snapshot1.state_root.length).toBeGreaterThan(0);
      expect(snapshot2.state_root.length).toBeGreaterThan(0);

      // Timestamps should be different (created at different times)
      expect(snapshot1.snapshot_time).not.toBe(snapshot2.snapshot_time);

      console.log("✅ Snapshot data integrity verified");
    } else {
      throw new Error("Failed to create proposals for integrity test");
    }
  });
});
