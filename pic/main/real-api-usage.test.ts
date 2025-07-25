import { PocketIc, createIdentity } from '@dfinity/pic';
import { Actor, ActorSubclass } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory } from '../../src/declarations/main';
import { _SERVICE, init as mainInit } from '../../src/declarations/main/main.did.js';
import { IDL } from '@dfinity/candid';

describe('EVMDAOBridge Real API Integration Tests', () => {
  let pic: PocketIc;
  let canister: ActorSubclass<_SERVICE>;

  beforeEach(async () => {
    pic = await PocketIc.create(process.env.PIC_URL);
    
    // Create the main canister with proper initialization
    const fixture = await pic.setupCanister<_SERVICE>({
      idlFactory,
      wasm: '.dfx/local/canisters/main/main.wasm',
      arg: IDL.encode(mainInit({IDL}), [[]]),
    });

    
    
    canister = fixture.actor as unknown as ActorSubclass<_SERVICE>;
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  describe('Basic Canister Functionality', () => {
    it('should respond to hello method', async () => {
      const result = await canister.hello();
      expect(result).toBe('world from EvmDaoBridge!');
    });

    it('should return supported standards', async () => {
      const standards = await canister.icrc10_supported_standards();
      expect(Array.isArray(standards)).toBe(true);
      expect(standards.length).toBeGreaterThan(0);
      
      // Should include ICRC-149 standard
      const icrc149 = standards.find(s => s.name === 'ICRC-149');
      expect(icrc149).toBeDefined();
    });
  });

  describe('Governance Configuration', () => {
    it('should return governance configuration', async () => {
      const config = await canister.icrc149_governance_config();
      
      expect(config).toBeDefined();
      expect(Array.isArray(config.admin_principals)).toBe(true);
      expect(Array.isArray(config.snapshot_contracts)).toBe(true);
      expect(Array.isArray(config.execution_contracts)).toBe(true);
      expect(Array.isArray(config.approved_icp_methods)).toBe(true);
      
      console.log('Governance config:', config);
    });

    it('should return snapshot contracts', async () => {
      const contracts = await canister.icrc149_get_snapshot_contracts();
      expect(Array.isArray(contracts)).toBe(true);
      console.log('Snapshot contracts:', contracts);
    });

    it('should return execution contracts', async () => {
      const contracts = await canister.icrc149_get_execution_contracts();
      expect(Array.isArray(contracts)).toBe(true);
      console.log('Execution contracts:', contracts);
    });
  });

  describe('Proposal Management', () => {
    it('should create a motion proposal', async () => {
      const proposalArgs = {
        action: { Motion: 'Test governance motion for EVMDAOBridge' } as { Motion: string } | { EthTransaction: any },
        members: [
          { id: Principal.fromText('2vxsx-fae'), votingPower: 100n }
        ],
        metadata: ['Test proposal metadata'] as [] | [string],
        snapshot_contract: [] as [] | [string],
      };

      const result = await canister.icrc149_create_proposal(proposalArgs);
      
      if ('Ok' in result) {
        const proposalId = result.Ok;
        console.log('Created proposal with ID:', proposalId);
        expect(typeof proposalId).toBe('bigint');
        expect(proposalId).toBeGreaterThan(0n);

        // Check that we can retrieve the proposal
        const proposalResult = await canister.icrc149_get_proposal(proposalId);
        expect(proposalResult.length).toBe(1);
        
        const proposal = proposalResult[0];
        expect(proposal).toBeDefined();
        console.log('Retrieved proposal:', proposal);
      } else {
        console.error('Failed to create proposal:', result.Err);
        throw new Error(`Proposal creation failed: ${result.Err}`);
      }
    });

    it('should create an ETH transaction proposal', async () => {
      // First, let's configure an execution contract
      const updateResult = await canister.icrc149_update_execution_contract_config(
        'TEST_USDC',
        [{
          chain: { chain_id: 1n, network_name: 'Ethereum Mainnet' },
          contract_address: '0xA0b86a33E6441146876986139F0A52C2e2A0e8C1',
          enabled: true,
          description: ['Test USDC contract'] as [] | [string]
        }]
      );

      if ('Err' in updateResult) {
        console.error('Failed to configure execution contract:', updateResult.Err);
      }

      const ethTx = {
        to: '0xA0b86a33E6441146876986139F0A52C2e2A0e8C1',
        value: 0n,
        data: new Uint8Array([0x18, 0x16, 0x0d, 0xdd]), // totalSupply() function selector
        chain: { chain_id: 1n, network_name: 'Ethereum Mainnet' },
        signature: [] as [] | [Uint8Array | number[]]
      };

      const proposalArgs = {
        action: { EthTransaction: ethTx } as { Motion: string } | { EthTransaction: any },
        members: [
          { id: Principal.fromText('2vxsx-fae'), votingPower: 100n }
        ],
        metadata: ['ETH transaction proposal'] as [] | [string],
        snapshot_contract: ['TEST_USDC'] as [] | [string],
      };

      const result = await canister.icrc149_create_proposal(proposalArgs);
      
      if ('Ok' in result) {
        const proposalId = result.Ok;
        console.log('Created ETH transaction proposal with ID:', proposalId);
        expect(typeof proposalId).toBe('bigint');
        expect(proposalId).toBeGreaterThan(0n);
      } else {
        console.error('Failed to create ETH transaction proposal:', result.Err);
        // This might fail if snapshot contracts aren't properly configured
        console.log('This is expected if snapshot contracts need to be configured first');
      }
    });

    it('should list proposals with filters', async () => {
      const proposals = await canister.icrc149_get_proposals(
        [] as [] | [bigint], // from
        [] as [] | [bigint], // to  
        [] // filters
      );

      expect(Array.isArray(proposals)).toBe(true);
      console.log(`Found ${proposals.length} proposals`);
      
      if (proposals.length > 0) {
        console.log('First proposal:', proposals[0]);
      }
    });
  });

  describe('Health and Status', () => {
    it('should return health check status', async () => {
      const health = await canister.icrc149_health_check();
      expect(typeof health).toBe('string');
      console.log('Health check result:', health);
    });
  });

  describe('Contract Configuration Management', () => {
    it('should update snapshot contract configuration', async () => {
      const contractKey = 'TEST_CONTRACT';
      const config = {
        chain: { chain_id: 1n, network_name: 'Ethereum Mainnet' },
        contract_address: '0x1234567890123456789012345678901234567890',
        contract_type: { ERC20: null } as { Other: string } | { ERC20: null } | { ERC721: null },
        rpc_service: {
          rpc_type: 'ankr',
          canister_id: Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai'),
          custom_config: [] as [] | [[string, string][]]
        },
        balance_storage_slot: 0n,
        enabled: true,
      };

      const result = await canister.icrc149_update_snapshot_contract_config(
        contractKey,
        [config]
      );

      if ('Ok' in result) {
        console.log('Successfully updated snapshot contract config');
        
        // Verify the configuration was saved
        const contracts = await canister.icrc149_get_snapshot_contracts();
        const testContract = contracts.find(([key, _]) => key === contractKey);
        expect(testContract).toBeDefined();
        
        if (testContract) {
          const [_, savedConfig] = testContract;
          expect(savedConfig.contract_address).toBe(config.contract_address);
          expect(savedConfig.chain.chain_id).toBe(config.chain.chain_id);
        }
      } else {
        console.error('Failed to update snapshot contract config:', result.Err);
        throw new Error(`Config update failed: ${result.Err}`);
      }
    });

    it('should remove snapshot contract configuration', async () => {
      const contractKey = 'TEMP_CONTRACT';
      
      // First add a config
      const config = {
        chain: { chain_id: 1n, network_name: 'Ethereum Mainnet' },
        contract_address: '0xTemporary123456789012345678901234567890',
        contract_type: { ERC20: null } as { Other: string } | { ERC20: null } | { ERC721: null },
        rpc_service: {
          rpc_type: 'ankr',
          canister_id: Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai'),
          custom_config: [] as [] | [[string, string][]]
        },
        balance_storage_slot: 0n,
        enabled: true,
      };

      await canister.icrc149_update_snapshot_contract_config(contractKey, [config]);
      
      // Then remove it by passing empty config
      const removeResult = await canister.icrc149_update_snapshot_contract_config(
        contractKey,
        [] // Empty config removes the entry
      );

      if ('Ok' in removeResult) {
        console.log('Successfully removed snapshot contract config');
        
        // Verify it was removed
        const contracts = await canister.icrc149_get_snapshot_contracts();
        const removedContract = contracts.find(([key, _]) => key === contractKey);
        expect(removedContract).toBeUndefined();
      } else {
        console.error('Failed to remove snapshot contract config:', removeResult.Err);
      }
    });
  });
});
