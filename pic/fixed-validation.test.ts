import { PocketIc, createIdentity } from "@dfinity/pic";
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";
import { idlFactory } from "../src/declarations/backend/backend.did.js";
import type { EvmDaoBridgeCanister, Witness__1, WitnessResult } from "../src/declarations/backend/backend.did.js";

const admin = createIdentity("admin");

describe('Fixed Witness Validation Tests', () => {
  let pic: PocketIc;
  let canister: any; // Use any type to allow setIdentity

  beforeAll(async () => {
    try {
      // Initialize PocketIC
      pic = await PocketIc.create(process.env.PIC_URL);
      console.log("PocketIC initialized");

      // Deploy the EVM DAO Bridge canister
      const fixture = await pic.setupCanister<EvmDaoBridgeCanister>({
        sender: admin.getPrincipal(),
        wasm: `${process.cwd()}/.dfx/local/canisters/main/main.wasm`,
        arg: IDL.encode([], []),
        idlFactory: idlFactory,
      });

      canister = fixture.actor;

      // Set the identity to admin for all subsequent calls
      canister.setIdentity(admin);

      // Add admin principal to the canister's admin list
      await canister.icrc149_update_admin_principal(admin.getPrincipal(), true);

      console.log("✅ Canister deployed for fixed validation tests");
    } catch (error) {
      console.error("Failed to set up test environment:", error);
      throw error;
    }
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  describe('State-Based Witness Validation', () => {
    const contractAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    const chainId = 31337n;
    const networkName = "local";

    beforeEach(async () => {
      // Set admin identity for each test
      canister.setIdentity(admin);

      // Setup: Add approved contract configuration
      const contractConfig = {
        contract_address: contractAddress,
        chain: {
          chain_id: chainId,
          network_name: networkName
        },
        rpc_service: {
          rpc_type: "custom",
          canister_id: Principal.fromText("rdmx6-jaaaa-aaaaa-aaadq-cai"),
          custom_config: [] as [] | [[string, string][]] // Explicit type annotation
        },
        contract_type: { ERC20: null },
        balance_storage_slot: 2n,
        enabled: true
      };

      try {
        const result = await canister.icrc149_update_snapshot_contract_config(
          contractAddress,
          [contractConfig]
        );

        if ('Err' in result) {
          console.log("⚠️  Could not add contract config:", result.Err);
        } else {
          console.log("✅ Contract configuration added successfully");
        }
      } catch (error) {
        console.log("⚠️  Contract config setup failed:", error);
      }
    });

    it('should validate witness against stored snapshot state (no circular validation)', async () => {
      console.log("🔧 Testing fixed witness validation with state-based validation...");

      // Test data
      const proposalId1 = 123n;
      const proposalId2 = 456n;
      const blockNumber1 = 1000n;
      const blockNumber2 = 2000n;
      const correctStateRoot = new Uint8Array(32).fill(0x42);
      const wrongStateRoot = new Uint8Array(32).fill(0x99);

      // Add test snapshots with chain_id (corrected to use bigint)
      await canister.icrc149_add_test_snapshot(
        proposalId1,
        blockNumber1,
        correctStateRoot,
        contractAddress,
        chainId, // Use bigint directly
        networkName
      );

      await canister.icrc149_add_test_snapshot(
        proposalId2,
        blockNumber2,
        correctStateRoot,
        contractAddress,
        chainId, // Use bigint directly
        networkName
      );

      console.log("✅ Test snapshots added successfully");

      // Helper function to create witness
      function createTestWitness(blockNumber: bigint, blockHash: Uint8Array, contractAddr: string, storageValue = 1000n): Witness__1 {
        const contractBytes = new Uint8Array(20);
        const cleanAddr = contractAddr.slice(2); // Remove 0x prefix
        for (let i = 0; i < 20; i++) {
          contractBytes[i] = parseInt(cleanAddr.substr(i * 2, 2), 16);
        }

        // Convert storageValue bigint to Uint8Array
        const storageValueBytes = new Uint8Array(32);
        const storageValueHex = storageValue.toString(16).padStart(64, '0');
        for (let i = 0; i < 32; i++) {
          storageValueBytes[i] = parseInt(storageValueHex.substr(i * 2, 2), 16);
        }

        return {
          blockHash: blockHash,
          blockNumber: blockNumber,
          userAddress: new Uint8Array(20).fill(1),
          contractAddress: contractBytes,
          storageKey: new Uint8Array(32).fill(2),
          storageValue: storageValueBytes, // Correct type: Uint8Array
          accountProof: [],
          storageProof: []
        };
      }

      // Test Case 1: Valid witness with matching state root and proposal ID
      console.log("🧪 Test 1: Valid witness with matching state root and proposal ID");
      const validWitness1 = createTestWitness(blockNumber1, correctStateRoot, contractAddress);
      const result1 = await canister.icrc149_verify_witness(validWitness1, [proposalId1]);

      expect('Ok' in result1).toBe(true);
      if ('Ok' in result1) {
        expect(result1.Ok.valid).toBe(true);
        expect(result1.Ok.state_root_verified).toBe(true);
        console.log(`✅ Valid witness accepted: ${result1.Ok.user_address}, balance: ${result1.Ok.balance}`);
      }

      // Test Case 2: Valid witness with block number lookup
      console.log("🧪 Test 2: Valid witness with block number lookup");
      const validWitness2 = createTestWitness(blockNumber1, correctStateRoot, contractAddress);
      const result2 = await canister.icrc149_verify_witness(validWitness2, []);

      expect('Ok' in result2).toBe(true);
      if ('Ok' in result2) {
        expect(result2.Ok.valid).toBe(true);
        console.log(`✅ Block lookup validation passed: ${result2.Ok.user_address}`);
      }

      // Test Case 3: Invalid witness with wrong state root (should fail)
      console.log("🧪 Test 3: Invalid witness with wrong state root");
      const invalidWitness1 = createTestWitness(blockNumber1, wrongStateRoot, contractAddress);
      const result3 = await canister.icrc149_verify_witness(invalidWitness1, [proposalId1]);

      expect('Err' in result3).toBe(true);
      if ('Err' in result3) {
        console.log(`✅ Correctly rejected wrong state root: ${result3.Err}`);
      }

      // Test Case 4: Invalid proposal ID (should fail)
      console.log("🧪 Test 4: Invalid proposal ID");
      const validWitness3 = createTestWitness(blockNumber1, correctStateRoot, contractAddress);
      const result4 = await canister.icrc149_verify_witness(validWitness3, [999n]);

      expect('Err' in result4).toBe(true);
      if ('Err' in result4) {
        expect(result4.Err).toContain("No snapshot found for proposal");
        console.log(`✅ Correctly rejected invalid proposal: ${result4.Err}`);
      }

      // Test Case 5: Invalid block number (should fail)
      console.log("🧪 Test 5: Invalid block number");
      const invalidWitness2 = createTestWitness(9999n, correctStateRoot, contractAddress);
      const result5 = await canister.icrc149_verify_witness(invalidWitness2, []);

      expect('Err' in result5).toBe(true);
      if ('Err' in result5) {
        expect(result5.Err).toContain("No stored snapshot found for block number");
        console.log(`✅ Correctly rejected invalid block: ${result5.Err}`);
      }

      // Test Case 6: Unapproved contract (should fail)
      console.log("🧪 Test 6: Unapproved contract");
      const unapprovedContract = "0x1111111111111111111111111111111111111111";
      const invalidWitness3 = createTestWitness(blockNumber1, correctStateRoot, unapprovedContract);
      const result6 = await canister.icrc149_verify_witness(invalidWitness3, [proposalId1]);

      expect('Err' in result6).toBe(true);
      if ('Err' in result6) {
        expect(result6.Err).toContain("is not approved for snapshots");
        console.log(`✅ Correctly rejected unapproved contract: ${result6.Err}`);
      }

      console.log("\n🎉 ALL VALIDATION TESTS PASSED!");
      console.log("✅ No more circular validation vulnerability");
      console.log("✅ Validates against stored canister state");
      console.log("✅ expectedStateRoot comes from stored ProposalSnapshot.state_root");
      console.log("✅ Contract validation uses stored SnapshotContractConfig");
      console.log("✅ Storage slot and chain ID from stored configuration");
    });

    it('should demonstrate security improvement over circular validation', async () => {
      console.log("🔐 Testing security improvement: stored state vs witness data");

      const proposalId = 777n;
      const blockNumber = 3000n;
      const trustedStateRoot = new Uint8Array(32).fill(0xAA); // What's actually stored
      const maliciousStateRoot = new Uint8Array(32).fill(0xBB); // What attacker provides

      // Add snapshot with trusted state root
      await canister.icrc149_add_test_snapshot(
        proposalId,
        blockNumber,
        trustedStateRoot,
        contractAddress,
        chainId, // Use bigint directly
        networkName
      );

      // Create witness with malicious state root (different from stored)
      const contractBytes = new Uint8Array(20);
      const cleanAddr = contractAddress.slice(2);
      for (let i = 0; i < 20; i++) {
        contractBytes[i] = parseInt(cleanAddr.substr(i * 2, 2), 16);
      }

      // Convert large balance to bytes
      const maliciousBalance = 1000000n;
      const maliciousBalanceBytes = new Uint8Array(32);
      const balanceHex = maliciousBalance.toString(16).padStart(64, '0');
      for (let i = 0; i < 32; i++) {
        maliciousBalanceBytes[i] = parseInt(balanceHex.substr(i * 2, 2), 16);
      }

      const maliciousWitness: Witness__1 = {
        blockHash: maliciousStateRoot, // Attacker tries to use different state root
        blockNumber: blockNumber,
        userAddress: new Uint8Array(20).fill(1),
        contractAddress: contractBytes,
        storageKey: new Uint8Array(32).fill(2),
        storageValue: maliciousBalanceBytes, // Attacker claims high balance
        accountProof: [],
        storageProof: []
      };

      // Validation should FAIL because witness.blockHash != stored.state_root
      const result = await canister.icrc149_verify_witness(maliciousWitness, [proposalId]);

      expect('Err' in result).toBe(true);
      if ('Err' in result) {
        console.log("✅ SECURITY TEST PASSED: Malicious witness rejected");
        console.log(`   Reason: ${result.Err}`);
        console.log("✅ Function validates against STORED state root, not witness data");
        console.log("✅ No circular validation vulnerability!");
      } else {
        fail("Security test failed: malicious witness was accepted");
      }
    });
  });
});
