import { PocketIc, createIdentity, SubnetStateType } from '@dfinity/pic';
import type { CanisterFixture } from '@dfinity/pic';
import { resolve } from 'path';
import { ethers } from 'ethers';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { IDL } from '@dfinity/candid';
import * as fs from 'fs';
import * as path from 'path';
import { Principal } from '@dfinity/principal';

// Runtime import: include the .js extension
import { idlFactory as mainIDLFactory, init as mainInit } from "../../src/declarations/main/main.did.js";
import { idlFactory as evmRpcIDLFactory, init as evmRpcInit } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

// Type-only import: import types from the candid interface without the extension
import type { _SERVICE as mainService } from "../../src/declarations/main/main.did.js";
import type { _SERVICE as evmRpcService } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

// Simple IDL factory for our canister (removed - using imported version)
// Test configuration
const WASM_PATH = resolve(__dirname, '../../.dfx/local/canisters/main/main.wasm');
const EVM_RPC_WASM_PATH = resolve(__dirname, '../../evm_rpc/evm_rpc.wasm.gz');

// Load the GovernanceToken contract (same as other tests)
const governanceTokenPath = path.join(process.cwd(), 'sample-tokens/packages/hardhat/artifacts/contracts/MockTokens.sol/GovernanceToken.json');
const governanceTokenArtifact = JSON.parse(fs.readFileSync(governanceTokenPath, 'utf8'));

// Constants for NNS state (following ICRC99 orchestrator pattern)
const NNS_STATE_PATH = "./.pocket-ic/nns_state/";
const NNS_SUBNET_ID = "tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe";

let pic: PocketIc;
let evmDAOBridge_fixture: CanisterFixture<mainService>;
let evmRpc_fixture: CanisterFixture<evmRpcService>;
let anvilProcess: ChildProcessWithoutNullStreams;
let provider: ethers.JsonRpcProvider;
let governanceToken: ethers.Contract;
let governanceTokenAddress: string;

const admin = createIdentity('admin');

// Process HTTP outcalls for RPC requests
async function processRPCCalls(timeout = 5000): Promise<void[]> {
  await pic.tick(5);
  const startTime = Date.now();
  const processCalls = async (): Promise<void[]> => {
    let pendingHttpsOutcalls = await pic.getPendingHttpsOutcalls();
    console.log(`📞 Found ${pendingHttpsOutcalls.length} pending HTTP outcalls`);
    
    if (pendingHttpsOutcalls.length === 0) {
      if (Date.now() - startTime >= timeout) {
        console.log(`⏰ Timeout reached after ${timeout}ms with no outcalls`);
        return [];
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      return processCalls();
    }
    
    const outcallPromises = pendingHttpsOutcalls.map(async (thisOutcall, index) => {
      console.log(`🔄 Processing outcall ${index + 1}/${pendingHttpsOutcalls.length}`);
      
      const decodedBody = new TextDecoder().decode(thisOutcall.body);
      let ownerRequest = JSON.parse(decodedBody);
      
      console.log(`📨 Original request method: ${ownerRequest.method}`, ownerRequest.params);
      
      try {
        console.log(`🌐 Making HTTP request to ${thisOutcall.url}`);
        const response = await fetch(thisOutcall.url, {
          method: thisOutcall.httpMethod,
          headers: Object.fromEntries(thisOutcall.headers),
          body: JSON.stringify(ownerRequest),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const responseBody = await response.json();
        console.log(`✅ RPC call success - Method: ${ownerRequest.method}`, responseBody);

        let result = await pic.mockPendingHttpsOutcall({
          requestId: thisOutcall.requestId,
          subnetId: thisOutcall.subnetId,
          response: {
            type: 'success',
            body: new TextEncoder().encode(JSON.stringify(responseBody)),
            statusCode: 200,
            headers: [],
          }
        });

        console.log(`📤 Mocked outcall ${index + 1} completed successfully`);
        return result;

      } catch (error) {
        console.error(`❌ RPC call failed for ${ownerRequest.method}:`, error);
        
        // Mock a failure response
        const errorResponse = {
          id: ownerRequest.id,
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        };

        let result = await pic.mockPendingHttpsOutcall({
          requestId: thisOutcall.requestId,
          subnetId: thisOutcall.subnetId,
          response: {
            type: 'success',
            body: new TextEncoder().encode(JSON.stringify(errorResponse)),
            statusCode: 500,
            headers: [],
          }
        });

        console.log(`📤 Mocked failed outcall ${index + 1} completed`);
        return result;
      }
    });

    const results = await Promise.all(outcallPromises);
    
    // Check for more outcalls after processing
    await pic.tick(2);
    const moreOutcalls = await pic.getPendingHttpsOutcalls();
    if (moreOutcalls.length > 0) {
      console.log(`🔄 Found ${moreOutcalls.length} more outcalls, processing...`);
      const moreResults = await processCalls();
      return [...results, ...moreResults];
    }
    
    return results;
  };

  return processCalls();
}

describe('Simple tECDSA and Transaction Test', () => {
  jest.setTimeout(60000); // 1 minute timeout

  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  test('should get tECDSA address and send transaction', async () => {
    try {
      console.log("=== Starting Simple tECDSA Test ===");

      // Step 1: Get the canister's Ethereum address
      console.log("Step 1: Getting canister's tECDSA address...");
      const canisterEthAddress = await evmDAOBridge_fixture.actor.icrc149_get_ethereum_address([]);
      console.log("Canister Ethereum address:", canisterEthAddress);
      expect(canisterEthAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

      // Step 2: Send some test tokens to the canister
      console.log("Step 2: Sending tokens to canister address...");
      const tokenAmount = ethers.parseEther("100"); // 100 test tokens
      const transferTx = await governanceToken['transfer'](canisterEthAddress, tokenAmount);
      await transferTx.wait();
      
      // Verify the canister received the tokens
      const canisterBalance = await governanceToken['balanceOf'](canisterEthAddress);
      console.log(`Canister token balance: ${ethers.formatEther(canisterBalance)} tokens`);
      expect(canisterBalance).toBe(tokenAmount);

      // Step 3: Set up recipient address
      const recipientAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Test address
      const recipientBalanceBefore = await governanceToken['balanceOf'](recipientAddress);
      console.log(`Recipient balance before: ${ethers.formatEther(recipientBalanceBefore)} tokens`);

      // Step 4: Create a transaction to send tokens from canister to recipient
      console.log("Step 3: Creating transaction to send tokens...");
      const transferAmount = ethers.parseEther("10"); // Send 10 tokens

      // Create the transaction data for ERC20 transfer
      const transferData = governanceToken.interface.encodeFunctionData('transfer', [
        recipientAddress,
        transferAmount
      ]);

      const ethTx = {
        chain: { chain_id: BigInt(31337), network_name: "anvil" },
        to: governanceTokenAddress,
        value: BigInt(0),
        data: Array.from(ethers.getBytes(transferData)),
        subaccount: [] as [] | [Uint8Array], // Default subaccount
        maxPriorityFeePerGas: BigInt(2000000000), // 2 gwei
        maxFeePerGas: BigInt(20000000000), // 20 gwei
        gasLimit: BigInt(100000),
        nonce: [] as [] | [bigint],
        signature: [] as [] | [Uint8Array]
      };

      console.log("Step 4: Sending transaction via canister...");
      console.log("Transaction details:", {
        to: ethTx.to,
        value: ethTx.value,
        dataLength: ethTx.data.length,
        gasLimit: ethTx.gasLimit
      });

      // Call the canister to send the transaction (this will trigger HTTP outcalls)
      const resultPromise = evmDAOBridge_fixture.actor.icrc149_send_eth_tx(ethTx);
      
      // Process HTTP outcalls in the background
      const outcallPromise = processRPCCalls();
      
      // Wait for both the transaction and HTTP processing
      const [result] = await Promise.all([resultPromise, outcallPromise]);
      console.log("Transaction result:", result);

      if ('Err' in result) {
        throw new Error(`Transaction failed: ${result.Err}`);
      }

      const txHash = result.Ok;
      console.log("Transaction hash:", txHash);

      // Step 5: Wait for transaction and verify
      console.log("Step 5: Waiting for transaction confirmation...");
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

      // Check recipient balance
      const recipientBalanceAfter = await governanceToken['balanceOf'](recipientAddress);
      const canisterBalanceAfter = await governanceToken['balanceOf'](canisterEthAddress);

      console.log(`Recipient balance after: ${ethers.formatEther(recipientBalanceAfter)} tokens`);
      console.log(`Canister balance after: ${ethers.formatEther(canisterBalanceAfter)} tokens`);

      // Verify the transfer occurred
      expect(recipientBalanceAfter - recipientBalanceBefore).toBe(transferAmount);
      expect(canisterBalance - canisterBalanceAfter).toBe(transferAmount);

      console.log("✅ Simple tECDSA and transaction test completed successfully!");

    } catch (error) {
      console.error("❌ Test failed:", error);
      throw error;
    }
  });

  // Setup function
  const setupTestEnvironment = async () => {
    console.log("=== Test Setup: Simple tECDSA Test ===");

    // Start Anvil
    console.log("🔥 Starting Anvil process...");
    anvilProcess = spawn('anvil', [
      '--host', '0.0.0.0',
      '--port', '8545',
      '--block-time', '1',
      '--chain-id', '31337'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Wait for Anvil to start
    await new Promise((resolve) => {
      anvilProcess.stdout?.on('data', (data: any) => {
        const output = data.toString();
        if (output.includes('Listening on')) {
          resolve(void 0);
        }
      });
    });

    console.log("✅ Anvil started successfully");

    // Connect to Anvil
    provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    await provider.getNetwork(); // Verify connection

    // Deploy governance token using ethers.ContractFactory (same as other tests)
    const deployer = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    
    console.log("Deploying governance token...");
    const tokenFactory = new ethers.ContractFactory(
      governanceTokenArtifact.abi,
      governanceTokenArtifact.bytecode,
      deployer
    );
    const deployedContract = await tokenFactory.deploy(deployer.address); // initialOwner parameter
    await deployedContract.waitForDeployment();
    governanceTokenAddress = await deployedContract.getAddress();
    governanceToken = new ethers.Contract(governanceTokenAddress, governanceTokenArtifact.abi, deployer);
    
    console.log("Governance token deployed at:", governanceTokenAddress);

    // Set up PocketIC with II subnet for tECDSA support
    console.log("Setting up PocketIC with tECDSA support...");
    pic = await PocketIc.create(process.env.PIC_URL, {
      ii: {
        state: {
          type: SubnetStateType.New
        }
      },
      processingTimeoutMs: 1000 * 120 * 5, // 10 minutes
    });

    console.log("PocketIC created with tECDSA support (keys: dfx_test_key1, test_key_1, key_1)");

    // Deploy the EVM RPC canister first
    evmRpc_fixture = await pic.setupCanister<evmRpcService>({
      idlFactory: evmRpcIDLFactory,
      wasm: EVM_RPC_WASM_PATH,
      sender: admin.getPrincipal(),
      arg: IDL.encode(evmRpcInit({IDL}), [{ 
        logFilter : [{ShowAll : null}],
        demo : [],
        manageApiKeys : [[admin.getPrincipal()]]
      }]),
    });

    console.log("EVM RPC canister deployed at:", evmRpc_fixture.canisterId.toString());
    await pic.tick(5);

    evmRpc_fixture.actor.setIdentity(admin);

    // Deploy DAO Bridge canister
    evmDAOBridge_fixture = await pic.setupCanister<mainService>({
      idlFactory: mainIDLFactory,
      wasm: WASM_PATH,
      sender: admin.getPrincipal(),
      arg: IDL.encode(mainInit({IDL}), [[]]),
    });

    console.log("DAO Bridge canister deployed:", evmDAOBridge_fixture.canisterId.toString());

    evmDAOBridge_fixture.actor.setIdentity(admin);

    // Add admin principal
    await evmDAOBridge_fixture.actor.icrc149_update_admin_principal(
      admin.getPrincipal(),
      true
    );

    // Configure the EVM RPC canister ID to use our deployed one
    console.log(`Setting EVM RPC canister ID to: ${evmRpc_fixture.canisterId.toString()}`);
    const updateRpcResult = await evmDAOBridge_fixture.actor.icrc149_update_evm_rpc_canister(
      evmRpc_fixture.canisterId
    );
    console.log("EVM RPC canister ID updated:", updateRpcResult);

    // Configure snapshot contract for token balance checking
    const snapshotConfig = {
      contract_address: governanceTokenAddress,
      chain: { chain_id: BigInt(31337), network_name: "anvil" },
      rpc_service: { 
        rpc_type: "custom", 
        canister_id: evmRpc_fixture.canisterId, 
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: BigInt(0), // Storage slot for balances
      enabled: true,
    };
    
    console.log("Configuring snapshot contract...");
    await evmDAOBridge_fixture.actor.icrc149_update_snapshot_contract_config(
      governanceTokenAddress,
      [snapshotConfig]
    );

    // Now we need to dynamically update the hardcoded RPC canister ID in the transaction logic
    // Since the current code hardcodes the RPC canister ID, let's temporarily patch it
    // by rebuilding the canister with the correct ID
    console.log("Note: This test demonstrates a limitation where the EVM RPC canister ID is hardcoded");
    console.log("In production, this should be configurable. For now, the canister will fail to reach the RPC service");

    console.log("=== Setup Complete ===");
  };

  // Cleanup function
  const cleanupTestEnvironment = async () => {
    if (anvilProcess) {
      anvilProcess.kill();
    }
    if (pic) {
      await pic.tearDown();
    }
  };
});
