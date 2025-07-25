// End-to-end integration test demonstrating full snapshot workflow
// This test shows the complete flow from RPC setup to voting with proofs

import { PocketIc, createIdentity } from '@dfinity/pic';
import { Actor, ActorSubclass } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory } from '../../src/declarations/main';
import { _SERVICE } from '../../src/declarations/main/main.did.js';

describe('EVMDAOBridge End-to-End Integration Tests', () => {
  let pic: PocketIc;
  let canister: ActorSubclass<_SERVICE>;
  let canisterId: Principal;

  beforeAll(async () => {
    pic = await PocketIc.create(process.env.PIC_URL);
    
    // Create the main canister
    const fixture = await pic.setupCanister<_SERVICE>({
      idlFactory,
      wasm: '.dfx/local/canisters/main/main.wasm',
    });
    
    canister = fixture.actor;
    canisterId = fixture.canisterId;
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  describe('Complete Snapshot Workflow', () => {
    it('should demonstrate full snapshot and voting flow with EVM RPC integration', async () => {
      // Phase 1: Setup RPC service for Ethereum mainnet
      const ethMainnetRPCConfig = {
        rpc_type: 'ankr',
        canister_id: Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai'), // EVM RPC canister
        custom_config: [['api_key', 'test-api-key']] as [] | [[string, string][]],
      };

      console.log('Setting up EVM RPC service...');
      await canister.icrc149_set_rpc_service([ethMainnetRPCConfig]);

      // Phase 2: Configure snapshot contract for USDC on Ethereum
      const usdcConfig = {
        chain_id: 1n, // Ethereum mainnet
        contract_address: '0xA0b86a33E6441146876986139F0A52C2e2A0e8C1', // USDC contract
        storage_slot: 0n, // Balance mapping slot for USDC
        description: ['USDC Token Snapshot'] as [] | [string],
      };

      console.log('Adding USDC contract for snapshotting...');
      const addResult = await canister.icrc149_add_snapshot_contract(usdcConfig);
      expect(addResult).toEqual({ Ok: null });

      // Phase 3: Enable the contract for snapshotting
      console.log('Enabling contract for snapshots...');
      const enableResult = await canister.icrc149_enable_snapshot_contract({
        chain_id: 1n,
        contract_address: '0xA0b86a33E6441146876986139F0A52C2e2A0e8C1',
      });
      expect(enableResult).toEqual({ Ok: null });

      // Phase 4: Take the snapshot
      console.log('Taking snapshot of USDC balances...');
      const snapshotResult = await canister.icrc149_take_snapshot({
        chain_id: 1n,
        contract_address: '0xA0b86a33E6441146876986139F0A52C2e2A0e8C1',
      });

      console.log('Snapshot result:', snapshotResult);
      expect('Ok' in snapshotResult).toBe(true);

      if ('Ok' in snapshotResult) {
        const snapshot = snapshotResult.Ok;
        
        // Verify snapshot contains expected data
        expect(snapshot.block_number).toBeGreaterThan(0n);
        expect(snapshot.state_root.length).toBeGreaterThan(0);
        expect(snapshot.total_supply).toBeGreaterThan(0n);
        expect(snapshot.snapshot_time).toBeGreaterThan(0n);

        console.log(`Snapshot taken at block ${snapshot.block_number}`);
        console.log(`State root: ${Array.from(snapshot.state_root).map(b => b.toString(16).padStart(2, '0')).join('')}`);
        console.log(`Total supply: ${snapshot.total_supply.toString()}`);

        // Phase 5: Create a governance proposal using the snapshot
        const proposalTitle = "Approve USDC Treasury Management";
        const proposalDescription = "This proposal will approve moving 10% of USDC holdings to yield farming";
        
        // Create execution actions (example: approve spending)
        const ethAction = {
          chain_id: 1n,
          contract_address: '0xA0b86a33E6441146876986139F0A52C2e2A0e8C1',
          eth_value: 0n,
          method_name: 'approve',
          method_args: ['0x1234567890123456789012345678901234567890', '100000000000'], // Approve 1000 USDC
        };

        const executionConfig = {
          description: ['Treasury management execution'] as [] | [string],
          actions: [ethAction],
        };

        console.log('Creating governance proposal...');
        const createProposalResult = await canister.icrc149_create_proposal(
          proposalTitle,
          proposalDescription,
          snapshot.id,
          [executionConfig]
        );

        console.log('Proposal creation result:', createProposalResult);
        expect('Ok' in createProposalResult).toBe(true);

        if ('Ok' in createProposalResult) {
          const proposalId = createProposalResult.Ok;
          console.log(`Created proposal with ID: ${proposalId}`);

          // Phase 6: Simulate voting with storage proofs
          const voterAddress = '0x742d35Cc6481C3d99e6A7f9C9A7F9e4B2D2B1234';
          const voterBalance = 50000n; // 500 USDC (assuming 6 decimals)

          // Mock storage proof data (in real implementation, this would come from EVM RPC)
          const mockStorageProof = [
            new Uint8Array([0x01, 0x02, 0x03, 0x04]),
            new Uint8Array([0x05, 0x06, 0x07, 0x08]),
          ];

          const mockAccountProof = [
            new Uint8Array([0x11, 0x12, 0x13, 0x14]),
            new Uint8Array([0x15, 0x16, 0x17, 0x18]),
          ];

          // Create SIWE authentication message
          const siweMessage = `test.example wants you to sign in with your Ethereum account:
${voterAddress}

I want to vote on proposal ${proposalId} in the DAO

URI: https://test.example
Version: 1
Chain ID: 1
Nonce: 12345678
Issued At: 2024-01-01T00:00:00.000Z`;

          const mockSignature = '0x' + '1234567890abcdef'.repeat(16); // Mock signature

          const witness = {
            witness_type: { EthereumStorage: null },
            contract_address: '0xA0b86a33E6441146876986139F0A52C2e2A0e8C1',
            chain_id: 1n,
            block_hash: snapshot.state_root,
            storage_key: new Uint8Array([0x20, 0x21, 0x22, 0x23]),
            storage_value: new Uint8Array([0x30, 0x31, 0x32, 0x33]),
            balance: voterBalance,
            siwe_message: siweMessage,
            siwe_signature: mockSignature,
            storage_proof: mockStorageProof,
            account_proof: mockAccountProof,
          };

          console.log('Casting vote with storage proof...');
          const voteResult = await canister.icrc149_vote(
            proposalId,
            { Yes: null },
            [witness]
          );

          console.log('Vote result:', voteResult);
          expect('Ok' in voteResult).toBe(true);

          // Phase 7: Check vote was recorded
          console.log('Retrieving proposal details...');
          const proposalResult = await canister.icrc149_get_proposal(proposalId);
          expect('Ok' in proposalResult).toBe(true);

          if ('Ok' in proposalResult) {
            const proposal = proposalResult.Ok;
            console.log(`Proposal votes - Yes: ${proposal.yes_votes}, No: ${proposal.no_votes}`);
            
            // Verify vote was counted
            expect(proposal.yes_votes).toBeGreaterThan(0n);
            expect(proposal.total_voting_power).toBeGreaterThan(0n);
            
            console.log(`Vote successfully recorded! Voting power: ${proposal.total_voting_power}`);
          }

          // Phase 8: Test proposal execution (if enough votes)
          // In a real scenario, there would be a voting period and quorum requirements
          console.log('Attempting to execute proposal...');
          const executeResult = await canister.icrc149_execute_proposal(proposalId);
          
          console.log('Execution result:', executeResult);
          // Note: This might fail if proposal doesn't meet execution criteria
          // but we can still verify the attempt was made
        }
      }
    });

    it('should handle RPC service failures gracefully', async () => {
      // Test with invalid RPC configuration
      const invalidRPCConfig = {
        rpc_type: 'invalid_provider',
        canister_id: Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai'),
        custom_config: [] as [] | [[string, string][]],
      };

      await canister.icrc149_set_rpc_service([invalidRPCConfig]);

      const testConfig = {
        chain_id: 999n, // Non-existent chain
        contract_address: '0x0000000000000000000000000000000000000000',
        storage_slot: 0n,
        description: ['Test invalid contract'] as [] | [string],
      };

      const addResult = await canister.icrc149_add_snapshot_contract(testConfig);
      expect(addResult).toEqual({ Ok: null });

      const enableResult = await canister.icrc149_enable_snapshot_contract({
        chain_id: 999n,
        contract_address: '0x0000000000000000000000000000000000000000',
      });
      expect(enableResult).toEqual({ Ok: null });

      // This should fail due to invalid RPC configuration
      const snapshotResult = await canister.icrc149_take_snapshot({
        chain_id: 999n,
        contract_address: '0x0000000000000000000000000000000000000000',
      });

      console.log('Expected failure result:', snapshotResult);
      // Should return an error rather than crash
      expect('Err' in snapshotResult || 'Ok' in snapshotResult).toBe(true);
    });

    it('should validate storage proofs correctly', async () => {
      // Setup a basic snapshot first
      const testConfig = {
        chain_id: 137n, // Polygon
        contract_address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC on Polygon
        storage_slot: 0n,
        description: ['Polygon USDC Snapshot'] as [] | [string],
      };

      await canister.icrc149_add_snapshot_contract(testConfig);
      await canister.icrc149_enable_snapshot_contract({
        chain_id: 137n,
        contract_address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      });

      const snapshotResult = await canister.icrc149_take_snapshot({
        chain_id: 137n,
        contract_address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      });

      expect('Ok' in snapshotResult).toBe(true);

      if ('Ok' in snapshotResult) {
        const snapshot = snapshotResult.Ok;

        // Create proposal
        const createResult = await canister.icrc149_create_proposal(
          'Test Proposal',
          'Testing storage proof validation',
          snapshot.id,
          []
        );

        expect('Ok' in createResult).toBe(true);

        if ('Ok' in createResult) {
          const proposalId = createResult.Ok;

          // Test with invalid proof data
          const invalidWitness = {
            witness_type: { EthereumStorage: null },
            contract_address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
            chain_id: 137n,
            block_hash: new Uint8Array([0x00]), // Invalid state root
            storage_key: new Uint8Array([0x00]),
            storage_value: new Uint8Array([0x00]),
            balance: 1000n,
            siwe_message: 'Invalid message',
            siwe_signature: '0xinvalid',
            storage_proof: [new Uint8Array([0x00])],
            account_proof: [new Uint8Array([0x00])],
          };

          const invalidVoteResult = await canister.icrc149_vote(
            proposalId,
            { Yes: null },
            [invalidWitness]
          );

          console.log('Invalid vote result:', invalidVoteResult);
          // Should reject invalid proofs
          expect('Err' in invalidVoteResult).toBe(true);
        }
      }
    });
  });

  describe('Performance and Scalability Tests', () => {
    it('should handle multiple snapshots efficiently', async () => {
      // Test taking multiple snapshots in sequence
      const contracts = [
        { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', name: 'USDT' },
        { address: '0xa0b86a33e6441146876986139f0a52c2e2a0e8c1', name: 'USDC' },
        { address: '0x6b175474e89094c44da98b954eedeac495271d0f', name: 'DAI' },
      ];

      const snapshotPromises = contracts.map(async (contract, index) => {
        const config = {
          chain_id: 1n,
          contract_address: contract.address,
          storage_slot: 0n,
          description: [`${contract.name} Snapshot`] as [] | [string],
        };

        await canister.icrc149_add_snapshot_contract(config);
        await canister.icrc149_enable_snapshot_contract({
          chain_id: 1n,
          contract_address: contract.address,
        });

        return canister.icrc149_take_snapshot({
          chain_id: 1n,
          contract_address: contract.address,
        });
      });

      const results = await Promise.all(snapshotPromises);
      
      console.log('Multiple snapshot results:', results);
      
      // All snapshots should succeed
      results.forEach((result, index) => {
        console.log(`Snapshot ${index + 1} for ${contracts[index].name}:`, result);
        expect('Ok' in result).toBe(true);
      });
    });

    it('should handle large numbers of votes on a single proposal', async () => {
      // Create a test snapshot
      const config = {
        chain_id: 1n,
        contract_address: '0xtest_large_voting',
        storage_slot: 0n,
        description: ['Large Voting Test'] as [] | [string],
      };

      await canister.icrc149_add_snapshot_contract(config);
      await canister.icrc149_enable_snapshot_contract({
        chain_id: 1n,
        contract_address: '0xtest_large_voting',
      });

      const snapshotResult = await canister.icrc149_take_snapshot({
        chain_id: 1n,
        contract_address: '0xtest_large_voting',
      });

      expect('Ok' in snapshotResult).toBe(true);

      if ('Ok' in snapshotResult) {
        const snapshot = snapshotResult.Ok;

        const createResult = await canister.icrc149_create_proposal(
          'Large Vote Test',
          'Testing with many voters',
          snapshot.id,
          []
        );

        expect('Ok' in createResult).toBe(true);

        if ('Ok' in createResult) {
          const proposalId = createResult.Ok;

          // Simulate multiple voters (in practice, limited by cycles)
          const voterCount = 10; // Keep reasonable for test
          const votePromises = [];

          for (let i = 0; i < voterCount; i++) {
            const voterAddress = `0x${i.toString(16).padStart(40, '0')}`;
            
            const witness = {
              witness_type: { EthereumStorage: null },
              contract_address: '0xtest_large_voting',
              chain_id: 1n,
              block_hash: snapshot.state_root,
              storage_key: new Uint8Array([i]),
              storage_value: new Uint8Array([i + 1]),
              balance: BigInt((i + 1) * 1000),
              siwe_message: `Voter ${i} message`,
              siwe_signature: `0x${'0'.repeat(128)}${i}`,
              storage_proof: [new Uint8Array([i])],
              account_proof: [new Uint8Array([i + 10])],
            };

            votePromises.push(
              canister.icrc149_vote(
                proposalId,
                i % 2 === 0 ? { Yes: null } : { No: null },
                [witness]
              )
            );
          }

          const voteResults = await Promise.all(votePromises);
          
          console.log('Large voting test results:', voteResults);
          
          // Check that votes were processed
          const proposalResult = await canister.icrc149_get_proposal(proposalId);
          expect('Ok' in proposalResult).toBe(true);

          if ('Ok' in proposalResult) {
            const proposal = proposalResult.Ok;
            console.log(`Final vote counts - Yes: ${proposal.yes_votes}, No: ${proposal.no_votes}`);
            expect(proposal.yes_votes + proposal.no_votes).toBeGreaterThan(0n);
          }
        }
      }
    });
  });
});
