import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { Principal } from "@dfinity/principal";
import { PocketIc, createIdentity } from '@dfinity/pic';
import type { CanisterFixture } from '@dfinity/pic';
import { spawn, ChildProcess, execSync } from 'child_process';
import { ethers, JsonRpcProvider, Contract, Wallet } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

// Runtime import: include the .js extension
import { idlFactory as mainIDLFactory, init as mainInit } from "../../src/declarations/main/main.did.js";
import { idlFactory as evmRpcIDLFactory, init as evmRpcInit } from "../../src/declarations/evm_rpc/evm_rpc.did.js";
import { IDL } from "@dfinity/candid";

// Type-only import: import types from the candid interface without the extension
import type { _SERVICE as mainService } from "../../src/declarations/main/main.did.js";
import type { _SERVICE as evmRpcService } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

const MAIN_WASM_PATH = ".dfx/local/canisters/main/main.wasm.gz";
const EVM_RPC_WASM_PATH = "./evm_rpc/evm_rpc.wasm.gz";

let pic: PocketIc;
let evmDAOBridge_fixture: CanisterFixture<mainService>;
let evmRpc_fixture: CanisterFixture<evmRpcService>;

const admin = createIdentity("admin");
const twoSecondsInMs = 2000;

// Load the GovernanceToken contract for test setup
const governanceTokenPath = path.join(process.cwd(), 'sample-tokens/packages/hardhat/artifacts/contracts/MockTokens.sol/GovernanceToken.json');
const governanceTokenArtifact = JSON.parse(fs.readFileSync(governanceTokenPath, 'utf8'));

describe("Simple Parallel RPC Block Test", () => {
  let anvilProcess: ChildProcess;
  let provider: JsonRpcProvider;
  let governanceToken: ethers.Contract;
  let governanceTokenAddress: string;

  // Kill any existing Anvil processes
  const killExistingProcesses = async () => {
    try {
      const processName = 'anvil';
      const platform = process.platform;

      if (platform === 'win32') {
        execSync(`taskkill /IM ${processName}* /F`, { stdio: 'ignore' });
      } else {
        execSync(`pkill -f ${processName}`, { stdio: 'ignore' });
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      // Ignore errors if no processes found
    }
  };

  // Process HTTP outcalls for RPC requests - copied from eth-transaction-execution.test.ts
  async function processRPCCalls(timeout = 10000): Promise<void[]> {
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
        
        // Handle different RPC method types properly
        switch (ownerRequest.method) {
          case "eth_call":
            // Fix request format for eth_call if needed
            ownerRequest = {
              id: ownerRequest.id,
              jsonrpc: ownerRequest.jsonrpc,
              method: ownerRequest.method,
              params: [{
                to: ownerRequest.params[0].to,
                data: ownerRequest.params[0].input || ownerRequest.params[0].data,
                chainId: ownerRequest.params[0].chainId,
                type: ownerRequest.params[0].type,
                value: ownerRequest.params[0].value,
              }, ownerRequest.params[1] || "latest"]
            };
            console.log(`🔧 Fixed eth_call request:`, ownerRequest.params);
            break;
            
          case "eth_getBlockByNumber":
            // Ensure proper format for block requests
            if (!ownerRequest.params || ownerRequest.params.length < 2) {
              ownerRequest.params = [ownerRequest.params?.[0] || "latest", false];
            }
            console.log(`📦 Block request:`, ownerRequest.params);
            break;
            
          case "eth_blockNumber":
            // No params needed for block number
            ownerRequest.params = [];
            console.log(`🔢 Block number request (no params)`);
            break;
            
          default:
            console.log(`🔍 Unhandled method: ${ownerRequest.method}, keeping original params`);
            break;
        }

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
          console.log(`✅ RPC call success - Method: ${ownerRequest.method}, Response:`, {
            id: responseBody.id,
            result: responseBody.result ? "✓ has result" : "✗ no result",
            error: responseBody.error ? responseBody.error : "none"
          });

          if (responseBody.error) {
            console.error(`❌ RPC error for ${ownerRequest.method}:`, responseBody.error);
          }

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

          console.log(`📤 Mocked error outcall ${index + 1} completed`);
          return result;
        }
      });

      return Promise.all(outcallPromises);
    };

    console.log("🚀 Starting RPC call processing...");
    return processCalls();
  }

  // Generalized function to execute canister operations that involve multiple RPC calls
  async function executeWithRPCProcessing<T>(
    operation: () => Promise<T>,
    maxRounds = 5,
    roundTimeout = 10000
  ): Promise<T> {
    const operationStartTime = Date.now();
    console.log(`🚀 Starting operation with RPC processing (max ${maxRounds} rounds, ${roundTimeout}ms timeout per round)...`);
    
    // Start the operation
    console.log(`📞 Initiating canister operation...`);
    const operationPromise = operation();
    
    // Add a timeout to the operation itself
    const operationWithTimeout = Promise.race([
      operationPromise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timeout after ${maxRounds * roundTimeout}ms`)), maxRounds * roundTimeout)
      )
    ]);
    
    // Process RPC calls in parallel
    let processedOutcalls = false;
    let totalOutcallsProcessed = 0;
    
    const processOutcallsPromise = (async () => {
      console.log(`🔄 Starting parallel RPC processing...`);
      
      // Give the canister a moment to start the HTTP outcalls
      await pic.advanceTime(1000);
      await pic.tick(5);
      console.log(`⏰ Initial canister tick completed, checking for outcalls...`);
      
      // Process multiple rounds of RPC calls
      for (let round = 0; round < maxRounds; round++) {
        const roundStartTime = Date.now();
        console.log(`\n🔄 === ROUND ${round + 1}/${maxRounds} === (${roundStartTime - operationStartTime}ms elapsed)`);
        
        try {
          await processRPCCalls(roundTimeout);
          const roundCallsProcessed = (await pic.getPendingHttpsOutcalls()).length;
          totalOutcallsProcessed += roundCallsProcessed;
          
          console.log(`⏱️  Round ${round + 1} completed in ${Date.now() - roundStartTime}ms`);
          
          await pic.advanceTime(500); // Brief pause between rounds
          await pic.tick(5);
          
          const pending = await pic.getPendingHttpsOutcalls();
          console.log(`📊 After round ${round + 1}: ${pending.length} pending outcalls remaining`);
          
          if (pending.length === 0) {
            console.log(`✅ No more pending outcalls after round ${round + 1}`);
            processedOutcalls = true;
            break;
          }
          
        } catch (error) {
          console.error(`❌ Error in round ${round + 1}:`, error);
          // Continue to next round rather than failing completely
        }
      }
      
      console.log(`\n📊 RPC Processing Summary:`);
      console.log(`  - Total rounds: ${maxRounds}`);
      console.log(`  - Total outcalls processed: ${totalOutcallsProcessed}`);
      console.log(`  - Processed all outcalls: ${processedOutcalls}`);
      console.log(`  - Total time: ${Date.now() - operationStartTime}ms`);
      
      if (!processedOutcalls) {
        console.warn(`⚠️  Warning: HTTP outcalls may not have been fully processed after ${maxRounds} rounds`);
      }
    })();
    
    console.log(`⏳ Waiting for both operation and RPC processing to complete...`);
    
    try {
      // Wait for both to complete
      const [result] = await Promise.all([
        operationWithTimeout,
        processOutcallsPromise
      ]);
      
      const totalTime = Date.now() - operationStartTime;
      console.log(`✅ Operation completed successfully in ${totalTime}ms`);
      return result;
      
    } catch (error) {
      const totalTime = Date.now() - operationStartTime;
      console.error(`❌ Operation failed after ${totalTime}ms:`, error);
      throw error;
    }
  }

  beforeEach(async () => {
    console.log("=== Test Setup: Simple Parallel RPC Block Test ===");
    
    // Kill any existing Anvil processes
    await killExistingProcesses();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start Anvil with deterministic accounts
    anvilProcess = spawn('anvil', [
      '--port', '8545',
      '--host', '0.0.0.0',
      '--accounts', '10',
      '--balance', '10000',
      '--block-time', '1'
    ]);

    await new Promise(resolve => setTimeout(resolve, twoSecondsInMs));

    // Connect to Anvil
    provider = new JsonRpcProvider('http://127.0.0.1:8545');
    
    // Wait for blockchain to be ready
    let retries = 0;
    while (retries < 10) {
      try {
        await provider.getBlockNumber();
        break;
      } catch (error) {
        retries++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const deployer = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    
    console.log("1. Deploying governance token for test setup...");
    const tokenFactory = new ethers.ContractFactory(
      governanceTokenArtifact.abi, 
      governanceTokenArtifact.bytecode, 
      deployer
    );
    const deployedContract = await tokenFactory.deploy(deployer.address);
    await deployedContract.waitForDeployment();
    governanceTokenAddress = await deployedContract.getAddress();
    governanceToken = new ethers.Contract(governanceTokenAddress, governanceTokenArtifact.abi, deployer);
    
    console.log("Governance token deployed at:", governanceTokenAddress);

    // Set up PocketIC
    pic = await PocketIc.create(process.env.PIC_URL, {
      processingTimeoutMs: 1000 * 120 * 5,
    });

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

    // Check available providers
    console.log("2. Checking EVM RPC providers...");
    const providers = await evmRpc_fixture.actor.getProviders();
    console.log("Available providers:", providers.length);

    // Deploy the DAO Bridge canister with minimal initialization
    console.log("3. Deploying DAO Bridge canister...");

    evmDAOBridge_fixture = await pic.setupCanister<mainService>({
      idlFactory: mainIDLFactory,
      wasm: MAIN_WASM_PATH,
      sender: admin.getPrincipal(),
      arg: IDL.encode(mainInit({IDL}), [[]]),
    });

    console.log("DAO Bridge canister deployed at:", evmDAOBridge_fixture.canisterId.toString());
    await pic.tick(10);

    evmDAOBridge_fixture.actor.setIdentity(admin);

    console.log("=== Setup Complete ===");
  });

  afterEach(async () => {
    if (anvilProcess) {
      anvilProcess.kill();
    }
    await killExistingProcesses();
    if (pic) {
      await pic.tearDown();
    }
  });

  it("should execute 3 parallel block RPC calls without hanging", async () => {
    console.log("=== Testing 3 Parallel Block RPC Calls ===");

    // Test that we can reach Anvil
    const currentBlock = await provider.getBlockNumber();
    console.log(`✅ Anvil responsive, current block: ${currentBlock}`);

    // Call the test function with proper RPC processing
    console.log("🧪 Starting parallel RPC calls test...");
    const startTime = Date.now();
    
    const result = await executeWithRPCProcessing(
      () => evmDAOBridge_fixture.actor.test_parallel_rpc_calls(evmRpc_fixture.canisterId),
      3, // max 3 rounds 
      15000 // 15 second timeout per round
    );
    
    const endTime = Date.now();
    console.log(`✅ Parallel block requests completed in ${endTime - startTime}ms`);
    
    console.log("Result:", result);
    
    // The function should succeed and return block numbers
    expect('Ok' in result).toBe(true);
    if ('Ok' in result) {
      const [latestBlock, block0, block1] = result.Ok;
      console.log(`📊 Block Results: Latest=${latestBlock}, Block0=${block0}, Block1=${block1}`);
      
      // Verify we got reasonable block numbers
      expect(Number(latestBlock)).toBeGreaterThanOrEqual(0);
      expect(Number(block0)).toBe(0); // Genesis block should be 0
      expect(Number(block1)).toBe(1); // Block 1 should be 1
      expect(Number(latestBlock)).toBeGreaterThanOrEqual(1); // Latest should be at least 1
    }

    console.log("✅ Parallel RPC calls test completed successfully!");
  });
});
