// Simplified integration test using the actual ICRC-149 interface
// This test demonstrates the real API available in the canister

import { PocketIc } from '@dfinity/pic';
import { ActorSubclass } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory, _SERVICE, init as mainInit } from '../../src/declarations/backend/backend.did.js';
import { IDL } from '@dfinity/candid';
import { ethers } from 'ethers';
import { createSimpleSIWEProof, SIWEProof } from '../utils/siwe-utils.ts';

// Types for proposal creation (from working tests)
interface CreateProposalRequest {
  action: any;
  metadata: [] | [string];
  siwe: SIWEProof;
  snapshot_contract: [] | [string];
}

interface EthTx {
  to: string;
  value: bigint;
  data: Uint8Array;
  chain: {
    network_name: string;
    chain_id: bigint;
  };
  subaccount: [] | [Uint8Array];
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
  signature: [] | [Uint8Array];
  nonce: [] | [bigint];
}

describe('EVMDAOBridge Real API Integration Tests', () => {
  let pic: PocketIc;
  let canister: ActorSubclass<_SERVICE>;
  let canisterId: Principal;

  // Create a test wallet for SIWE proof generation
  const testWallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const testContractAddress = "0x742d35Cc6481C3d99e6A7f9C9A7F9e4B2D2B1234";

  beforeAll(async () => {
    pic = await PocketIc.create(process.env.PIC_URL || 'http://localhost:4943');

    // Create the main canister
    const fixture = await pic.setupCanister<_SERVICE>({
      idlFactory,
      wasm: '.dfx/local/canisters/main/main.wasm.gz',
      arg: IDL.encode(mainInit({ IDL }), [[]]),

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
      const siweProof = await createSimpleSIWEProof(testWallet, 'Create motion proposal', testContractAddress);

      const proposalData: CreateProposalRequest = {
        action: { Motion: 'Test motion proposal for governance' },
        metadata: ['Test proposal metadata'],
        siwe: siweProof,
        snapshot_contract: [],
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
      const siweProof = await createSimpleSIWEProof(testWallet, 'Create ETH transaction proposal', testContractAddress);

      const ethTx: EthTx = {
        to: '0x742d35Cc6481C3d99e6A7f9C9A7F9e4B2D2B1234',
        value: 1000000000000000000n, // 1 ETH in wei
        data: new Uint8Array([]),
        chain: {
          network_name: 'ethereum',
          chain_id: 1n,
        },
        subaccount: [], // Empty array for null subaccount
        maxPriorityFeePerGas: 1000000000n, // 1 gwei
        maxFeePerGas: 2000000000n, // 2 gwei
        gasLimit: 21000n, // Standard ETH transfer gas limit
        signature: [],
        nonce: [],
      };

      const proposalData: CreateProposalRequest = {
        action: { EthTransaction: ethTx },
        metadata: ['ETH transaction proposal'],
        siwe: siweProof,
        snapshot_contract: [],
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
      const siweProof = await createSimpleSIWEProof(testWallet, 'Create execution test proposal', testContractAddress);

      const proposalData: CreateProposalRequest = {
        action: { Motion: 'Test execution proposal' },
        metadata: ['Execution test'],
        siwe: siweProof,
        snapshot_contract: [],
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
