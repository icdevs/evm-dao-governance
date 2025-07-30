import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";
import { PocketIc, createIdentity } from '@dfinity/pic';
import type { Actor, CanisterFixture } from '@dfinity/pic';
import { spawn, execSync, ChildProcess } from 'child_process';
import { ethers, JsonRpcProvider, Contract, Wallet } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

// Runtime import: include the .js extension
import { idlFactory as mainIDLFactory, init as mainInit } from "../../src/declarations/main/main.did.js";
import { idlFactory as evmRpcIDLFactory, init as evmRpcInit } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

// Type-only import: import types from the candid interface without the extension
import type { _SERVICE as mainService, SIWEProof } from "../../src/declarations/main/main.did.js";
import type { _SERVICE as evmRpcService } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

const MAIN_WASM_PATH = ".dfx/local/canisters/main/main.wasm.gz";
const EVM_RPC_WASM_PATH = "./evm_rpc/evm_rpc.wasm.gz";

let pic: PocketIc;
let evmDAOBridge_fixture: CanisterFixture<mainService>;
let evmRpc_fixture: CanisterFixture<evmRpcService>;

const admin = createIdentity("admin");
const twoSecondsInMs = 2000;

// Load the GovernanceToken contract
const governanceTokenPath = path.join(process.cwd(), 'sample-tokens/packages/hardhat/artifacts/contracts/MockTokens.sol/GovernanceToken.json');
const governanceTokenArtifact = JSON.parse(fs.readFileSync(governanceTokenPath, 'utf8'));

describe("Minimal RPC Test - Isolate the Hanging Issue", () => {
  let anvilProcess: ChildProcess;
  let provider: JsonRpcProvider;
  let governanceToken: Contract;
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

  // Process HTTP outcalls for RPC requests - SIMPLE VERSION
  async function processRPCCalls(timeout = 5000): Promise<void[]> {
    console.log("🔄 Processing RPC calls...");
    await pic.tick(5);
    
    let pendingHttpsOutcalls = await pic.getPendingHttpsOutcalls();
    console.log(`📞 Found ${pendingHttpsOutcalls.length} pending HTTP outcalls`);
    
    if (pendingHttpsOutcalls.length === 0) {
      return [];
    }
    
    const outcallPromises = pendingHttpsOutcalls.map(async (thisOutcall, index) => {
      console.log(`🔄 Processing outcall ${index + 1}/${pendingHttpsOutcalls.length}`);
      
      const decodedBody = new TextDecoder().decode(thisOutcall.body);
      let ownerRequest = JSON.parse(decodedBody);
      
      console.log(`📨 RPC method: ${ownerRequest.method}`);
      
      try {
        const response = await fetch(thisOutcall.url, {
          method: thisOutcall.httpMethod,
          headers: Object.fromEntries(thisOutcall.headers),
          body: JSON.stringify(ownerRequest),
        });

        const responseBody = await response.json();
        console.log(`✅ RPC success - Method: ${ownerRequest.method}`);

        await pic.mockPendingHttpsOutcall({
          requestId: thisOutcall.requestId,
          subnetId: thisOutcall.subnetId,
          response: {
            type: 'success',
            body: new TextEncoder().encode(JSON.stringify(responseBody)),
            statusCode: 200,
            headers: [],
          }
        });

        console.log(`📤 Mocked outcall ${index + 1} completed`);
      } catch (error) {
        console.error(`❌ RPC call failed:`, error);
      }
    });

    return Promise.all(outcallPromises);
  }

  // Simple operation executor
  async function executeWithSimpleRPCProcessing<T>(
    operation: () => Promise<T>,
    timeoutMs = 30000
  ): Promise<T> {
    console.log(`🚀 Starting simple operation with ${timeoutMs}ms timeout...`);
    
    // Add timeout to the operation
    const operationWithTimeout = Promise.race([
      operation(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Simple operation timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
    
    // Process RPC calls
    const processRPCPromise = (async () => {
      await pic.advanceTime(1000);
      await pic.tick(5);
      
      for (let i = 0; i < 3; i++) {
        console.log(`RPC processing round ${i + 1}`);
        await processRPCCalls();
        await pic.advanceTime(500);
        await pic.tick(5);
        
        const pending = await pic.getPendingHttpsOutcalls();
        if (pending.length === 0) {
          console.log(`✅ No pending outcalls after round ${i + 1}`);
          break;
        }
      }
    })();
    
    const [result] = await Promise.all([
      operationWithTimeout,
      processRPCPromise
    ]);
    
    console.log(`✅ Simple operation completed`);
    return result;
  }

  beforeEach(async () => {
    console.log("=== Minimal Test Setup ===");
    
    // Kill any existing Anvil processes
    await killExistingProcesses();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start Anvil
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
    
    console.log("1. Deploying governance token...");
    const tokenFactory = new ethers.ContractFactory(
      governanceTokenArtifact.abi, 
      governanceTokenArtifact.bytecode, 
      deployer
    );
    const deployedContract = await tokenFactory.deploy(deployer.address);
    await deployedContract.waitForDeployment();
    governanceTokenAddress = await deployedContract.getAddress();
    governanceToken = new Contract(governanceTokenAddress, governanceTokenArtifact.abi, deployer);
    
    console.log("Governance token deployed at:", governanceTokenAddress);

    // Set up PocketIC
    pic = await PocketIc.create(process.env.PIC_URL, {
      processingTimeoutMs: 1000 * 60, // 1 minute timeout
    });

    // Deploy the EVM RPC canister
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

    console.log("EVM RPC canister deployed");
    await pic.tick(5);
    evmRpc_fixture.actor.setIdentity(admin);

    // Deploy the DAO Bridge canister with minimal initialization
    evmDAOBridge_fixture = await pic.setupCanister<mainService>({
      idlFactory: mainIDLFactory,
      wasm: MAIN_WASM_PATH,
      sender: admin.getPrincipal(),
      arg: IDL.encode(mainInit({IDL}), [[]]),
    });

    console.log("DAO Bridge canister deployed");
    await pic.tick(10);
    evmDAOBridge_fixture.actor.setIdentity(admin);

    console.log("=== Minimal Setup Complete ===");
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

  it("should test SIWE verification only - no proposal creation", async () => {
    console.log("=== Testing SIWE Verification Only ===");

    // Add admin principal
    const addAdminResult = await evmDAOBridge_fixture.actor.icrc149_update_admin_principal(admin.getPrincipal(), true);
    console.log("Admin added:", addAdminResult);

    // Create a simple SIWE proof
    const adminWallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    
    const canisterTimeMs = Math.floor(await pic.getTime());
    const canisterTimeNanos = BigInt(canisterTimeMs) * 1_000_000n;
    const expirationTimeNanos = canisterTimeNanos + 600_000_000_000n; // 10 minutes
    
    const currentTimeISO = new Date(Number(canisterTimeNanos / 1_000_000n)).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    const message = `example.com wants you to sign in with your Ethereum account:
${adminWallet.address}

Test SIWE verification for contract ${governanceTokenAddress}

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${canisterTimeNanos}
Issued At: ${currentTimeISO}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTimeISO}`;

    const signature = await adminWallet.signMessage(message);
    
    const siweProof: SIWEProof = {
      message,
      signature: ethers.getBytes(signature),
    };

    console.log("Testing SIWE verification...");
    const siweResult = await evmDAOBridge_fixture.actor.icrc149_verify_siwe(siweProof);
    
    if ('Ok' in siweResult) {
      console.log("✅ SIWE verification successful!");
    } else {
      console.error("❌ SIWE verification failed:", siweResult.Err);
      throw new Error(`SIWE verification failed: ${siweResult.Err}`);
    }
    
    console.log("=== SIWE Test Completed Successfully ===");
  });

  it("should test governance config operations - no RPC calls", async () => {
    console.log("=== Testing Governance Config Operations ===");

    // Add admin principal
    await evmDAOBridge_fixture.actor.icrc149_update_admin_principal(admin.getPrincipal(), true);

    // Test snapshot contract config
    const snapshotConfig = {
      contract_address: governanceTokenAddress,
      chain: { chain_id: BigInt(31337), network_name: "anvil" },
      rpc_service: { 
        rpc_type: "custom", 
        canister_id: evmRpc_fixture.canisterId, 
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: BigInt(1),
      enabled: true,
    };
    
    const addSnapshotResult = await evmDAOBridge_fixture.actor.icrc149_update_snapshot_contract_config(
      governanceTokenAddress, 
      [snapshotConfig]
    );
    
    if ('Ok' in addSnapshotResult) {
      console.log("✅ Snapshot contract config added successfully!");
    } else {
      throw new Error(`Failed to add snapshot config: ${addSnapshotResult.Err}`);
    }

    // Get governance config
    const config = await evmDAOBridge_fixture.actor.icrc149_governance_config();
    console.log("✅ Governance config retrieved successfully");

    console.log("=== Config Test Completed Successfully ===");
  });
});
