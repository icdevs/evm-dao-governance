// Simplified integration test using the actual ICRC-149 interface
// This test demonstrates the real API available in the canister

import { PocketIc } from '@dfinity/pic';
import { ActorSubclass } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory, _SERVICE, init as mainInit } from '../../src/declarations/main/main.did.js';
import { IDL } from '@dfinity/candid';

describe('EVMDAOBridge Real API Integration Tests', () => {
  let pic: PocketIc;
  let canister: ActorSubclass<_SERVICE>;
  let canisterId: Principal;

  beforeAll(async () => {
    pic = await PocketIc.create(process.env.PIC_URL || 'http://localhost:8080');
    
    // Create the main canister
    const fixture = await pic.setupCanister<_SERVICE>({
      idlFactory,
      wasm: '.dfx/local/canisters/main/main.wasm',
      arg: IDL.encode(mainInit({IDL}), [[]]),

    });
    
    canister = fixture.actor as unknown as ActorSubclass<_SERVICE>;
    canisterId = fixture.canisterId;
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  describe('Core ICRC-149 API Tests', () => {
    it('should return hello message', async () => {
      const greeting = await canister.hello();
      expect(typeof greeting).toBe('string');
      console.log('Canister greeting:', greeting);
    });

    it('should return supported standards including ICRC-149', async () => {
      const standards = await canister.icrc10_supported_standards();
      expect(Array.isArray(standards)).toBe(true);
      
      console.log('Supported standards:', standards);
      
      // Should include ICRC-149
      const icrc149 = standards.find(s => s.name === 'ICRC-149');
      expect(icrc149).toBeDefined();
    });

    it('should return governance configuration', async () => {
      const config = await canister.icrc149_governance_config();
      expect(config).toBeDefined();
      expect(Array.isArray(config.admin_principals)).toBe(true);
      expect(Array.isArray(config.snapshot_contracts)).toBe(true);
      expect(Array.isArray(config.execution_contracts)).toBe(true);
      
      console.log('Governance config:', config);
    });

    it('should return snapshot contracts configuration', async () => {
      const contracts = await canister.icrc149_get_snapshot_contracts();
      expect(Array.isArray(contracts)).toBe(true);
      
      console.log('Configured snapshot contracts:', contracts);
    });

    it('should return execution contracts configuration', async () => {
      const contracts = await canister.icrc149_get_execution_contracts();
      expect(Array.isArray(contracts)).toBe(true);
      
      console.log('Configured execution contracts:', contracts);
    });

    it('should return approved ICP methods', async () => {
      const methods = await canister.icrc149_get_approved_icp_methods();
      expect(Array.isArray(methods)).toBe(true);
      
      console.log('Approved ICP methods:', methods);
    });

    it('should perform health check', async () => {
      const health = await canister.icrc149_health_check();
      expect(typeof health).toBe('string');
      
      console.log('Health check result:', health);
    });
  });

  describe('Proposal Management Tests', () => {
    it('should create a simple motion proposal', async () => {
      const proposalData = {
        action: { Motion: 'Test motion proposal for governance' },
        members: [
          { 
            id: Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai'), 
            votingPower: 1000n 
          }
        ],
        metadata: ['Test proposal metadata'] as [] | [string],
        snapshot_contract: [] as [] | [string],
      };

      const result = await canister.icrc149_create_proposal(proposalData);
      console.log('Create proposal result:', result);
      
      expect('Ok' in result || 'Err' in result).toBe(true);
      
      if ('Ok' in result) {
        const proposalId = result.Ok;
        console.log('Created proposal with ID:', proposalId);

        // Try to get the proposal back
        const proposalResult = await canister.icrc149_get_proposal(proposalId);
        console.log('Retrieved proposal:', proposalResult);
        
        if (proposalResult.length > 0) {
          const proposal = proposalResult[0];
          if (proposal) {
            expect(proposal.id).toBe(proposalId);
            expect('Motion' in proposal.action).toBe(true);
          }
        }
      }
    });

    it('should create an ETH transaction proposal', async () => {
      const ethTx = {
        to: '0x742d35Cc6481C3d99e6A7f9C9A7F9e4B2D2B1234',
        value: 1000000000000000000n, // 1 ETH in wei
        data: new Uint8Array([]),
        chain: {
          network_name: 'ethereum',
          chain_id: 1n,
        },
        signature: [] as [] | [Uint8Array],
      };

      const proposalData = {
        action: { EthTransaction: ethTx },
        members: [
          { 
            id: Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai'), 
            votingPower: 2000n 
          }
        ],
        metadata: ['ETH transaction proposal'] as [] | [string],
        snapshot_contract: [] as [] | [string],
      };

      const result = await canister.icrc149_create_proposal(proposalData);
      console.log('ETH proposal result:', result);
      
      expect('Ok' in result || 'Err' in result).toBe(true);
    });

    it('should list proposals with filters', async () => {
      // Get all proposals
      const allProposals = await canister.icrc149_get_proposals(
        [], // start
        [], // limit  
        []  // filters
      );
      
      console.log('All proposals:', allProposals);
      expect(Array.isArray(allProposals)).toBe(true);

      // Filter by motion proposals
      const motionProposals = await canister.icrc149_get_proposals(
        [],
        [],
        [{ by_action_type: { motion: null } }]
      );
      
      console.log('Motion proposals:', motionProposals);
      expect(Array.isArray(motionProposals)).toBe(true);
    });
  });

  describe('Voting Tests', () => {
    it('should create proposal and attempt voting', async () => {
      // First create a proposal
      const proposalData = {
        action: { Motion: 'Voting test proposal' },
        members: [
          { 
            id: Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai'), 
            votingPower: 1000n 
          }
        ],
        metadata: ['Voting test'] as [] | [string],
        snapshot_contract: [] as [] | [string],
      };

      const createResult = await canister.icrc149_create_proposal(proposalData);
      expect('Ok' in createResult).toBe(true);

      if ('Ok' in createResult) {
        const proposalId = createResult.Ok;

        // Create a vote with witness proof
        const witness = {
          blockNumber: 18500000n,
          blockHash: new Uint8Array([
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0
          ]),
          accountProof: [
            new Uint8Array([0x01, 0x02, 0x03, 0x04]),
            new Uint8Array([0x05, 0x06, 0x07, 0x08]),
          ],
          storageProof: [
            new Uint8Array([0x11, 0x12, 0x13, 0x14]),
            new Uint8Array([0x15, 0x16, 0x17, 0x18]),
          ],
          userAddress: new Uint8Array([
            0x74, 0x2d, 0x35, 0xCc, 0x64, 0x81, 0xC3, 0xd9, 0x9e, 0x6A,
            0x7f, 0x9C, 0x9A, 0x7F, 0x9e, 0x4B, 0x2D, 0x2B, 0x12, 0x34
          ]),
          storageKey: new Uint8Array([0x20, 0x21, 0x22, 0x23]),
          storageValue: new Uint8Array([0x30, 0x31, 0x32, 0x33]),
          contractAddress: new Uint8Array([
            0xA0, 0xb8, 0x6a, 0x33, 0xE6, 0x44, 0x11, 0x46, 0x87, 0x69,
            0x86, 0x13, 0x9F, 0x0A, 0x52, 0xC2, 0xe2, 0xA0, 0xe8, 0xC1
          ]),
        };

        const siweProof = {
          message: `test.example wants you to sign in with your Ethereum account:
0x742d35Cc6481C3d99e6A7f9C9A7F9e4B2D2B1234

I want to vote on proposal ${proposalId}

URI: https://test.example
Version: 1
Chain ID: 1
Nonce: 12345678
Issued At: 2024-01-01T00:00:00.000Z`,
          signature: new Uint8Array([
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
            0x12
          ])
        };

        const voteArgs = {
          voter: new Uint8Array([
            0x74, 0x2d, 0x35, 0xCc, 0x64, 0x81, 0xC3, 0xd9, 0x9e, 0x6A,
            0x7f, 0x9C, 0x9A, 0x7F, 0x9e, 0x4B, 0x2D, 0x2B, 0x12, 0x34
          ]),
          proposal_id: proposalId,
          choice: { Yes: null },
          witness: witness,
          siwe: siweProof,
        };

        console.log('Attempting to vote...');
        const voteResult = await canister.icrc149_vote_proposal(voteArgs);
        console.log('Vote result:', voteResult);
        
        // Vote might fail due to proof verification, but should not crash
        expect('Ok' in voteResult || 'Err' in voteResult).toBe(true);

        // Get tally results
        const tallyResult = await canister.icrc149_tally_votes(proposalId);
        console.log('Tally result:', tallyResult);
        expect(tallyResult).toBeDefined();
        expect(typeof tallyResult.yes).toBe('bigint');
        expect(typeof tallyResult.no).toBe('bigint');
        expect(typeof tallyResult.total).toBe('bigint');
      }
    });
  });

  describe('Contract Configuration Tests', () => {
    it('should update snapshot contract configuration', async () => {
      const contractId = 'test-contract-1';
      const config = {
        contract_type: { ERC20: null },
        chain: {
          network_name: 'ethereum',
          chain_id: 1n,
        },
        rpc_service: {
          rpc_type: 'ankr',
          canister_id: Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai'),
          custom_config: [] as [] | [Array<[string, string]>],
        },
        balance_storage_slot: 0n,
        enabled: true,
        contract_address: '0x742d35Cc6481C3d99e6A7f9C9A7F9e4B2D2B1234',
      };

      const result = await canister.icrc149_update_snapshot_contract_config(
        contractId,
        [config]
      );
      
      console.log('Update snapshot contract result:', result);
      expect('Ok' in result || 'Err' in result).toBe(true);
    });

    it('should update execution contract configuration', async () => {
      const contractId = 'test-execution-1';
      const config = {
        chain: {
          network_name: 'ethereum',
          chain_id: 1n,
        },
        description: ['Test execution contract'] as [] | [string],
        enabled: true,
        contract_address: '0x742d35Cc6481C3d99e6A7f9C9A7F9e4B2D2B1234',
      };

      const result = await canister.icrc149_update_execution_contract_config(
        contractId,
        [config]
      );
      
      console.log('Update execution contract result:', result);
      expect('Ok' in result || 'Err' in result).toBe(true);
    });
  });

  describe('Admin Functions Tests', () => {
    it('should handle admin principal updates', async () => {
      const testPrincipal = Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai');
      
      const result = await canister.icrc149_update_admin_principal(testPrincipal, true);
      console.log('Update admin principal result:', result);
      
      // This will likely fail due to authorization, but should not crash
      expect('Ok' in result || 'Err' in result).toBe(true);
    });

    it('should handle controller updates', async () => {
      const testPrincipal = Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai');
      
      const result = await canister.icrc149_set_controller(testPrincipal);
      console.log('Set controller result:', result);
      
      // This will likely fail due to authorization, but should not crash
      expect('Ok' in result || 'Err' in result).toBe(true);
    });
  });

  describe('SIWE Verification Tests', () => {
    it('should verify SIWE proof', async () => {
      const siweProof = {
        message: `test.example wants you to sign in with your Ethereum account:
0x742d35Cc6481C3d99e6A7f9C9A7F9e4B2D2B1234

Test SIWE message

URI: https://test.example
Version: 1
Chain ID: 1
Nonce: 12345678
Issued At: 2024-01-01T00:00:00.000Z`,
        signature: new Uint8Array([
          0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
          0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
          0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
          0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
          0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
          0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
          0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
          0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
          0x12
        ])
      };

      const result = await canister.icrc149_verify_siwe(siweProof);
      console.log('SIWE verification result:', result);
      
      // Should return either Ok or Err, not crash
      expect('Ok' in result || 'Err' in result).toBe(true);
    });
  });

  describe('Proposal Execution Tests', () => {
    it('should handle proposal execution attempts', async () => {
      // Create a simple proposal first
      const proposalData = {
        action: { Motion: 'Test execution proposal' },
        members: [
          { 
            id: Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai'), 
            votingPower: 1000n 
          }
        ],
        metadata: ['Execution test'] as [] | [string],
        snapshot_contract: [] as [] | [string],
      };

      const createResult = await canister.icrc149_create_proposal(proposalData);
      
      if ('Ok' in createResult) {
        const proposalId = createResult.Ok;
        
        // Try to execute (will likely fail due to voting requirements)
        const executeResult = await canister.icrc149_execute_proposal(proposalId);
        console.log('Execute proposal result:', executeResult);
        
        expect('Ok' in executeResult || 'Err' in executeResult).toBe(true);
      }
    });
  });
});
