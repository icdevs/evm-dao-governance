import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";

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

// Mock contract addresses for testing
const MOCK_ERC20_CONTRACT = "0x1234567890123456789012345678901234567890";
const MOCK_CHAIN_ID = 31337n; // Using bigint
const BALANCE_STORAGE_SLOT = 0n; // Using bigint

// Mock RPC canister ID for testing
const MOCK_RPC_CANISTER = Principal.fromText("rdmx6-jaaaa-aaaaa-aaadq-cai");

describe("EVMDAOBridge Snapshot Configuration Tests", () => {

  beforeEach(async () => {
    pic = await PocketIc.create(process.env.PIC_URL, {
      processingTimeoutMs: 1000 * 60 * 5,
    });

    console.log("Setting up EVMDAOBridge canister");

    // Setup main EVMDAOBridge canister
    main_fixture = await pic.setupCanister<mainService>({
      sender: admin.getPrincipal(),
      idlFactory: mainIDLFactory,
      wasm: sub_WASM_PATH,
      arg: IDL.encode(mainInit({IDL}), [[]]),
    });

    await pic.tick(5);
    console.log("EVMDAOBridge canister set up successfully");
  });

  afterEach(async () => {
    await pic.tearDown();
  });

  it('can configure snapshot contract', async () => {
    console.log("=== Testing Snapshot Contract Configuration ===");

    main_fixture.actor.setIdentity(admin);

    // Configure a snapshot contract
    const snapshotContractConfig = {
      contract_address: MOCK_ERC20_CONTRACT,
      chain: {
        chain_id: MOCK_CHAIN_ID,
        network_name: "localhost"
      },
      rpc_service: {
        rpc_type: "custom",
        canister_id: MOCK_RPC_CANISTER,
        custom_config: [] as [] | [[string, string][]] // Explicitly type the empty array
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
    expect(contracts[0][1].chain.chain_id).toBe(MOCK_CHAIN_ID);

    console.log("✅ Snapshot contract configuration successful");
  });

  it('can create proposal with snapshot contract', async () => {
    console.log("=== Testing Proposal Creation with Snapshot ===");

    main_fixture.actor.setIdentity(admin);

    // First configure a snapshot contract
    const snapshotContractConfig = {
      contract_address: MOCK_ERC20_CONTRACT,
      chain: {
        chain_id: MOCK_CHAIN_ID,
        network_name: "localhost"
      },
      rpc_service: {
        rpc_type: "custom",
        canister_id: MOCK_RPC_CANISTER,
        custom_config: [] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: BALANCE_STORAGE_SLOT,
      enabled: true
    };

    await main_fixture.actor.icrc149_update_snapshot_contract_config(
      MOCK_ERC20_CONTRACT,
      [snapshotContractConfig]
    );

    // Create a proposal which should trigger snapshot taking
    const createProposalRequest = {
      action: { Motion: "Test proposal for snapshot" },
      metadata: ["Test proposal metadata"] as [] | [string], // Fix metadata type
      members: [
        { id: alice.getPrincipal(), votingPower: 1000n }, // Using bigint
        { id: bob.getPrincipal(), votingPower: 500n }     // Using bigint
      ],
      snapshot_contract: [MOCK_ERC20_CONTRACT] as [] | [string] // Fix snapshot_contract type
    };

    const proposalResult = await main_fixture.actor.icrc149_create_proposal(createProposalRequest);
    console.log("Create proposal result:", proposalResult);

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

      console.log("✅ Proposal with snapshot created successfully");
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
        canister_id: MOCK_RPC_CANISTER,
        custom_config: [] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: true
    };

    // Configure second snapshot contract
    const contract2 = "0x2222222222222222222222222222222222222222";
    const config2 = {
      contract_address: contract2,
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: MOCK_RPC_CANISTER,
        custom_config: [] as [] | [[string, string][]]
      },
      contract_type: { ERC721: null },
      balance_storage_slot: 2n,
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
      metadata: ["Proposal 1 metadata"] as [] | [string],
      members: [{ id: alice.getPrincipal(), votingPower: 1000n }],
      snapshot_contract: [contract1] as [] | [string]
    };

    const proposal2Request = {
      action: { Motion: "Proposal 2" },
      metadata: ["Proposal 2 metadata"] as [] | [string],
      members: [{ id: bob.getPrincipal(), votingPower: 500n }],
      snapshot_contract: [contract2] as [] | [string]
    };

    const result1 = await main_fixture.actor.icrc149_create_proposal(proposal1Request);
    const result2 = await main_fixture.actor.icrc149_create_proposal(proposal2Request);

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
        canister_id: MOCK_RPC_CANISTER,
        custom_config: [] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
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
        canister_id: MOCK_RPC_CANISTER,
        custom_config: [] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: true
    };

    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, [enabledConfig]);

    // Verify it works for proposals
    const workingProposal = {
      action: { Motion: "Should work" },
      metadata: [] as [] | [string],
      members: [{ id: alice.getPrincipal(), votingPower: 1000n }],
      snapshot_contract: [contractAddress] as [] | [string]
    };

    const workingResult = await main_fixture.actor.icrc149_create_proposal(workingProposal);
    expect('Ok' in workingResult).toBe(true);

    // Now disable the contract
    const disabledConfig = { ...enabledConfig, enabled: false };
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, [disabledConfig]);

    // Try to create proposal with disabled contract
    const failingProposal = {
      action: { Motion: "Should fail" },
      metadata: [] as [] | [string],
      members: [{ id: alice.getPrincipal(), votingPower: 1000n }],
      snapshot_contract: [contractAddress] as [] | [string]
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
        canister_id: MOCK_RPC_CANISTER,
        custom_config: [] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: true
    };

    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, [config]);

    // Verify it was added
    let contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    expect(contracts).toHaveLength(1);

    // Remove the contract by passing empty array (null config)
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, []);

    // Verify it was removed
    contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    expect(contracts).toHaveLength(0);

    // Try to create proposal with removed contract
    const proposalRequest = {
      action: { Motion: "Should fail" },
      metadata: [] as [] | [string],
      members: [{ id: alice.getPrincipal(), votingPower: 1000n }],
      snapshot_contract: [contractAddress] as [] | [string]
    };

    const result = await main_fixture.actor.icrc149_create_proposal(proposalRequest);
    expect('Err' in result && result.Err.includes("not approved")).toBe(true);

    console.log("✅ Contract removal working correctly");
  });

  it('can get governance configuration', async () => {
    console.log("=== Testing Governance Configuration Retrieval ===");

    main_fixture.actor.setIdentity(admin);

    // Initially should be empty
    const initialConfig = await main_fixture.actor.icrc149_governance_config();
    console.log("Initial governance config:", initialConfig);
    
    expect(initialConfig.snapshot_contracts).toHaveLength(0);
    expect(initialConfig.execution_contracts).toHaveLength(0);
    expect(initialConfig.approved_icp_methods).toHaveLength(0);

    // Add a snapshot contract
    const config = {
      contract_address: MOCK_ERC20_CONTRACT,
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: MOCK_RPC_CANISTER,
        custom_config: [] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: true
    };

    await main_fixture.actor.icrc149_update_snapshot_contract_config(MOCK_ERC20_CONTRACT, [config]);

    // Check updated configuration
    const updatedConfig = await main_fixture.actor.icrc149_governance_config();
    console.log("Updated governance config:", updatedConfig);
    
    expect(updatedConfig.snapshot_contracts).toHaveLength(1);
    expect(updatedConfig.snapshot_contracts[0][0]).toBe(MOCK_ERC20_CONTRACT);

    console.log("✅ Governance configuration retrieval working correctly");
  });
});
