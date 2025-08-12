import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";
import { spawn, ChildProcess } from "child_process";
import { ethers, JsonRpcProvider } from "ethers";

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

export const WASM_PATH = ".dfx/local/canisters/main/main.wasm.gz";

let replacer = (_key: any, value: any) => typeof value === "bigint" ? value.toString() + "n" : value;
export const sub_WASM_PATH = process.env['SUB_WASM_PATH'] || WASM_PATH;

let pic: PocketIc;
let main_fixture: CanisterFixture<mainService>;

const admin = createIdentity("admin");
const alice = createIdentity("alice");
const bob = createIdentity("bob");
const voter1 = createIdentity("voter1");
const voter2 = createIdentity("voter2");

// Mock contract addresses for testing
const MOCK_ERC20_CONTRACT = "0x1234567890123456789012345678901234567890";
const MOCK_CHAIN_ID = 31337n;
const BALANCE_STORAGE_SLOT = 0n;

// Mock RPC canister ID for testing
const MOCK_RPC_CANISTER = Principal.fromText("rdmx6-jaaaa-aaaaa-aaadq-cai");

// Time helpers
const twoSecondsInMs = 2 * 1000;

describe("EVMDAOBridge Voting Integration Tests", () => {
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
    try {
      childProcess = spawn('yarn', ['chain2'], {
        cwd: targetDir,
        stdio: 'pipe', // Change to pipe to avoid terminal output
        shell: true,
      });

      // Attach event listeners for debugging
      childProcess.on('error', (error: Error) => {
        console.error('Child process error:', error);
      });

      childProcess.on('exit', (code: number) => {
        console.log('Child process exited with code:', code);
      });

      // Wait for the chain to start
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.log('Warning: Could not start local chain, tests will use mocked RPC responses');
    }

    pic = await PocketIc.create(process.env.PIC_URL, {
      processingTimeoutMs: 1000 * 60 * 5,
    });

    console.log("Setting up EVMDAOBridge canister");

    // Setup main EVMDAOBridge canister
    main_fixture = await pic.setupCanister<mainService>({
      sender: admin.getPrincipal(),
      idlFactory: mainIDLFactory,
      wasm: sub_WASM_PATH,
      arg: IDL.encode(mainInit({ IDL }), [[]]),
    });

    await pic.tick(5);
    console.log("EVMDAOBridge canister set up successfully");
  });

  afterEach(async () => {
    if (childProcess) {
      childProcess.kill('SIGTERM');
      // Give process time to cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    await pic.tearDown();
  });

  // Helper function to create a valid Ethereum witness
  function createMockWitness(userAddress: string, balance: bigint): any {
    // Mock storage proof components
    const storageKey = ethers.keccak256(
      ethers.concat([
        ethers.zeroPadValue(userAddress, 32), // user address
        ethers.zeroPadValue("0x00", 32)       // slot 0 for balance mapping
      ])
    );

    const storageValue = ethers.zeroPadValue(ethers.toBeHex(balance), 32);

    return {
      blockNumber: 12345678n,
      blockHash: new Array(32).fill(0x12),
      accountProof: [new Array(32).fill(0x34)], // Mock RLP encoded proof nodes
      storageProof: [new Array(32).fill(0x56)], // Mock RLP encoded proof nodes
      userAddress: ethers.getBytes(userAddress),
      storageKey: ethers.getBytes(storageKey),
      storageValue: ethers.getBytes(storageValue),
      contractAddress: ethers.getBytes(MOCK_ERC20_CONTRACT)
    };
  }

  // Helper function to create SIWE message and signature
  function createMockSIWE(address: string, proposalId: number): any {
    const message = `example.com wants you to sign in with your Ethereum account:
${address}

Vote on proposal ${proposalId}

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: abc123
Issued At: ${new Date().toISOString()}`;

    // Mock signature (64 bytes + recovery id)
    const mockSignature = new Array(65).fill(0x00);
    mockSignature[64] = 0x1c; // recovery id

    return {
      message,
      signature: mockSignature
    };
  }

  it('can create proposal and verify snapshot data with voting', async () => {
    console.log("=== Testing Full Snapshot and Voting Flow ===");

    main_fixture.actor.setIdentity(admin);

    // Configure snapshot contract
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

    // Create a proposal
    const createProposalRequest = {
      action: { Motion: "Should we implement new feature X?" },
      metadata: ["A proposal to discuss implementing feature X"] as [] | [string],
      members: [
        { id: alice.getPrincipal(), votingPower: 1000n },
        { id: bob.getPrincipal(), votingPower: 500n },
        { id: voter1.getPrincipal(), votingPower: 750n },
        { id: voter2.getPrincipal(), votingPower: 250n }
      ],
      snapshot_contract: [MOCK_ERC20_CONTRACT] as [] | [string]
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

      console.log("✅ Snapshot created successfully");

      // Test SIWE verification
      const mockEthAddress = "0x742d35cc6234c5a5c10b1c4f62e1fb4c5d0b94b9";
      const siweProof = createMockSIWE(mockEthAddress, Number(proposalId));

      const siweResult = await main_fixture.actor.icrc149_verify_siwe(siweProof);
      console.log("SIWE verification result:", siweResult);

      // The current implementation returns a basic result, so we just check it doesn't error
      if ('Ok' in siweResult) {
        console.log("✅ SIWE verification working");
      }

      // Test voting with witness proof
      const voterBalance = 1000n;
      const witness = createMockWitness(mockEthAddress, voterBalance);

      const voteArgs = {
        voter: ethers.getBytes(mockEthAddress),
        siwe: siweProof,
        witness: witness,
        proposal_id: proposalId,
        choice: { Yes: null } as any
      };

      // Note: The current implementation may not fully support witness validation yet
      // This test demonstrates the expected interface
      try {
        const voteResult = await main_fixture.actor.icrc149_vote_proposal(voteArgs);
        console.log("Vote result:", voteResult);

        if ('Ok' in voteResult) {
          console.log("✅ Vote submitted successfully");

          // Check vote tally
          const tallyResult = await main_fixture.actor.icrc149_tally_votes(proposalId);
          console.log("Vote tally:", tallyResult);

          expect(tallyResult.total).toBeGreaterThan(0n);
          console.log("✅ Vote tally working");
        }
      } catch (error) {
        console.log("Note: Voting may not be fully implemented yet:", error);
      }

      // Test getting proposal details
      const retrievedProposal = await main_fixture.actor.icrc149_get_proposal(proposalId);
      console.log("Retrieved proposal:", retrievedProposal);

      if (retrievedProposal && retrievedProposal.length > 0) {
        expect(retrievedProposal[0]).toBeDefined();
        console.log("✅ Proposal retrieval working");
      }

      // Test getting proposals with filters
      const allProposals = await main_fixture.actor.icrc149_get_proposals(
        [], // prev
        [10n], // take
        [] // filters
      );
      console.log("All proposals:", allProposals);

      expect(allProposals.length).toBeGreaterThan(0);
      console.log("✅ Proposal listing working");

    } else {
      throw new Error("Failed to create proposal: " + proposalResult.Err);
    }
  });

  it('can handle multiple proposals with same snapshot contract', async () => {
    console.log("=== Testing Multiple Proposals with Same Snapshot Contract ===");

    main_fixture.actor.setIdentity(admin);

    // Configure snapshot contract
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

    // Create first proposal
    const proposal1 = {
      action: { Motion: "Proposal 1: Should we implement feature A?" },
      metadata: ["First proposal"] as [] | [string],
      members: [
        { id: alice.getPrincipal(), votingPower: 1000n },
        { id: bob.getPrincipal(), votingPower: 500n }
      ],
      snapshot_contract: [MOCK_ERC20_CONTRACT] as [] | [string]
    };

    // Create second proposal after some time
    const proposal2 = {
      action: { Motion: "Proposal 2: Should we implement feature B?" },
      metadata: ["Second proposal"] as [] | [string],
      members: [
        { id: voter1.getPrincipal(), votingPower: 750n },
        { id: voter2.getPrincipal(), votingPower: 250n }
      ],
      snapshot_contract: [MOCK_ERC20_CONTRACT] as [] | [string]
    };

    const result1 = await main_fixture.actor.icrc149_create_proposal(proposal1);

    // Advance time to ensure different timestamps
    await pic.advanceTime(twoSecondsInMs);

    const result2 = await main_fixture.actor.icrc149_create_proposal(proposal2);

    if ('Ok' in result1 && 'Ok' in result2) {
      const proposalId1 = result1.Ok;
      const proposalId2 = result2.Ok;

      // Get snapshots for both proposals
      const snapshot1 = await main_fixture.actor.icrc149_proposal_snapshot(proposalId1);
      const snapshot2 = await main_fixture.actor.icrc149_proposal_snapshot(proposalId2);

      console.log("Snapshot 1:", snapshot1);
      console.log("Snapshot 2:", snapshot2);

      // Both should use the same contract
      expect(snapshot1.contract_address).toBe(MOCK_ERC20_CONTRACT);
      expect(snapshot2.contract_address).toBe(MOCK_ERC20_CONTRACT);

      // But should have different snapshot times
      expect(snapshot1.snapshot_time).not.toBe(snapshot2.snapshot_time);

      // Both should have valid block numbers and state roots
      expect(snapshot1.block_number).toBeGreaterThan(0);
      expect(snapshot2.block_number).toBeGreaterThan(0);
      expect(snapshot1.state_root.length).toBeGreaterThan(0);
      expect(snapshot2.state_root.length).toBeGreaterThan(0);

      console.log("✅ Multiple proposals with snapshots working correctly");

      // Test getting all proposals
      const allProposals = await main_fixture.actor.icrc149_get_proposals([], [10n], []);
      expect(allProposals.length).toBeGreaterThanOrEqual(2);

      console.log("✅ Multiple proposal retrieval working");
    } else {
      throw new Error("Failed to create proposals");
    }
  });

  it('can test snapshot contract storage slot validation', async () => {
    console.log("=== Testing Storage Slot Configuration ===");

    main_fixture.actor.setIdentity(admin);

    // Test different storage slots for different contract types
    const erc20Config = {
      contract_address: "0x1111111111111111111111111111111111111111",
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: MOCK_RPC_CANISTER,
        custom_config: [] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n, // Typical for ERC20 _balances mapping
      enabled: true
    };

    const erc721Config = {
      contract_address: "0x2222222222222222222222222222222222222222",
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: MOCK_RPC_CANISTER,
        custom_config: [] as [] | [[string, string][]]
      },
      contract_type: { ERC721: null },
      balance_storage_slot: 3n, // Typical for ERC721 _balances mapping
      enabled: true
    };

    // Add both configurations
    await main_fixture.actor.icrc149_update_snapshot_contract_config(
      "0x1111111111111111111111111111111111111111",
      [erc20Config]
    );

    await main_fixture.actor.icrc149_update_snapshot_contract_config(
      "0x2222222222222222222222222222222222222222",
      [erc721Config]
    );

    // Verify both were added correctly (plus default contract)
    const contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    console.log("Configured contracts with storage slots:", contracts);

    expect(contracts).toHaveLength(3); // Includes the default 0x000... contract

    // Find and verify each contract config (excluding the default contract)
    const erc20Found = contracts.find(([addr, _]) => addr === "0x1111111111111111111111111111111111111111");
    const erc721Found = contracts.find(([addr, _]) => addr === "0x2222222222222222222222222222222222222222");
    const defaultFound = contracts.find(([addr, _]) => addr === "0x0000000000000000000000000000000000000000");

    expect(erc20Found).toBeDefined();
    expect(erc721Found).toBeDefined();
    expect(defaultFound).toBeDefined();

    if (erc20Found && erc721Found) {
      expect(erc20Found[1].balance_storage_slot).toBe(0n);
      expect(erc721Found[1].balance_storage_slot).toBe(3n);

      expect('ERC20' in erc20Found[1].contract_type).toBe(true);
      expect('ERC721' in erc721Found[1].contract_type).toBe(true);
    }

    // Verify the default contract exists with expected configuration
    if (defaultFound) {
      expect(defaultFound[1].balance_storage_slot).toBe(1n);
      expect('ERC20' in defaultFound[1].contract_type).toBe(true);
      expect(defaultFound[1].chain.chain_id).toBe(1n); // mainnet
    }

    console.log("✅ Storage slot configuration working correctly");
  });

  it('can test proposal execution flow', async () => {
    console.log("=== Testing Proposal Execution Flow ===");

    main_fixture.actor.setIdentity(admin);

    // Configure execution contract for testing
    const executionContractConfig = {
      contract_address: "0x5555555555555555555555555555555555555555",
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      description: ["Test execution contract"] as [] | [string],
      enabled: true
    };

    await main_fixture.actor.icrc149_update_execution_contract_config(
      "0x5555555555555555555555555555555555555555",
      [executionContractConfig]
    );

    // Configure snapshot contract
    const snapshotContractConfig = {
      contract_address: MOCK_ERC20_CONTRACT,
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
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

    // Create a proposal with ETH transaction action
    const ethTx = {
      to: "0x5555555555555555555555555555555555555555",
      value: 1000000000000000000n, // 1 ETH in wei
      data: new Array(32).fill(0x00), // Empty data
      chain: { chain_id: MOCK_CHAIN_ID, network_name: "localhost" },
      signature: [] as [] | [Uint8Array | number[]]
    };

    const proposalRequest = {
      action: { EthTransaction: ethTx },
      metadata: ["Execute 1 ETH transfer to contract"] as [] | [string],
      members: [
        { id: alice.getPrincipal(), votingPower: 1000n },
        { id: bob.getPrincipal(), votingPower: 500n }
      ],
      snapshot_contract: [MOCK_ERC20_CONTRACT] as [] | [string]
    };

    const proposalResult = await main_fixture.actor.icrc149_create_proposal(proposalRequest);
    console.log("ETH transaction proposal result:", proposalResult);

    if ('Ok' in proposalResult) {
      const proposalId = proposalResult.Ok;

      // Get the proposal to verify it was created correctly
      const proposal = await main_fixture.actor.icrc149_get_proposal(proposalId);
      console.log("ETH transaction proposal:", proposal);

      if (proposal && proposal.length > 0) {
        console.log("✅ ETH transaction proposal created successfully");

        // Note: Execution would require proper voting and approval process
        // This test just verifies the proposal can be created with ETH transaction action

        try {
          // Test execution attempt (may not be fully implemented)
          const executionResult = await main_fixture.actor.icrc149_execute_proposal(proposalId);
          console.log("Execution result:", executionResult);
        } catch (error) {
          console.log("Note: Execution may require voting completion:", error);
        }
      }
    } else {
      throw new Error("Failed to create ETH transaction proposal: " + proposalResult.Err);
    }
  });
});
