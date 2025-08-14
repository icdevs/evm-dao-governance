import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";
import { ethers, JsonRpcProvider, Contract } from "ethers";
import { spawn, execSync, ChildProcess } from 'child_process';

import {
  PocketIc,
  createIdentity
} from "@dfinity/pic";

import type {
  Actor,
  CanisterFixture
} from "@dfinity/pic";

// Runtime import: include the .js extension
import { idlFactory as mainIDLFactory, init as mainInit } from "../../src/declarations/backend/backend.did.js";
import { idlFactory as evmRpcIDLFactory, init as evmRpcInit } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

// Type-only import: import types from the candid interface without the extension
import type { _SERVICE as mainService } from "../../src/declarations/backend/backend.did.js";
import type { _SERVICE as evmRpcService } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

// Import the MockUSDC factory for proper contract deployment
import { MockUSDC__factory } from "../../sample-tokens/packages/hardhat/typechain-types/factories/contracts/MockTokens.sol/MockUSDC__factory";

export const WASM_PATH = ".dfx/local/canisters/main/main.wasm.gz";
const EVM_RPC_WASM_PATH = `${process.cwd()}/evm_rpc/evm_rpc.wasm.gz`;

// Mock ERC20 contract ABI for testing
const mockERC20ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)"
];

// Helper function to create SIWE message for proposal creation (using real wallet pattern)
async function createSIWEProofForProposal(contractAddress: string, pic: PocketIc) {
  // Use real wallet for generating valid signatures (admin wallet from hardhat accounts)
  const adminWallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

  const picTimeMs = await pic.getTime(); // PocketIC time in microseconds
  const canisterTimeNanos = BigInt(Math.floor(picTimeMs)) * 1_000_000n; // Convert to nanoseconds, ensure integer
  const expirationTimeNanos = canisterTimeNanos + 600_000_000_000n; // 10 minutes

  const currentTimeISO = new Date(Number(canisterTimeNanos / 1_000_000n)).toISOString();
  const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();

  const message = `example.com wants you to sign in with your Ethereum account:
${adminWallet.address}

Create proposal for contract ${contractAddress}

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${canisterTimeNanos}
Issued At: ${currentTimeISO}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTimeISO}`;

  const signature = await adminWallet.signMessage(message);

  return {
    message,
    signature: ethers.getBytes(signature)
  };
}

let replacer = (_key: any, value: any) => typeof value === "bigint" ? value.toString() + "n" : value;
export const sub_WASM_PATH = process.env['SUB_WASM_PATH'] || WASM_PATH;

let pic: PocketIc;
let main_fixture: CanisterFixture<mainService>;
let evmRpc_fixture: CanisterFixture<evmRpcService>;
let anvilProcess: ChildProcess;
let provider: JsonRpcProvider;
let mockToken: Contract;
let mockTokenAddress: string;
let mockToken2: Contract;
let mockTokenAddress2: string;

const admin = createIdentity("admin");
const alice = createIdentity("alice");
const bob = createIdentity("bob");

// Chain configuration for Anvil
const ANVIL_CHAIN_ID = 31337n;
const BALANCE_STORAGE_SLOT = 0n;

// Global flag to stop background processing - scoped to this module
let shouldStopProcessing = false;

// Fix request format for eth_call
function fixRequest(decodedBody: string) {
  console.log("decodedBody", decodedBody, typeof decodedBody);

  let requestObject = JSON.parse(decodedBody);

  let newRequest = {
    id: requestObject.id,
    jsonrpc: requestObject.jsonrpc,
    method: requestObject.method,
    params: [{
      to: requestObject.params[0].to,
      data: requestObject.params[0].input,
      chainId: requestObject.params[0].chainId,
      type: requestObject.params[0].type,
      value: requestObject.params[0].value,
    }, "latest"]
  };
  return newRequest;
}

// Process HTTP outcalls for RPC requests
async function processRPCCalls(timeout = 10000): Promise<void[]> {
  // Absolute minimum tick to reduce load 
  await pic.tick(1);
  const startTime = Date.now();
  const processCalls = async (): Promise<void[]> => {
    // Check if we should stop processing
    if (shouldStopProcessing) {
      return [];
    }

    let pendingHttpsOutcalls = await pic.getPendingHttpsOutcalls();
    console.log("pendingHttpsOutcalls", pendingHttpsOutcalls.length);
    if (pendingHttpsOutcalls.length === 0) {
      if (Date.now() - startTime >= timeout) {
        return [];
      }
      // Very long wait between checks to give PocketIC maximum recovery time
      await new Promise(resolve => setTimeout(resolve, 3000));
      return processCalls();
    }


    const outcallPromises = pendingHttpsOutcalls.map(async (thisOutcall) => {
      // Check again before processing each outcall
      if (shouldStopProcessing) {
        return;
      }

      const decodedBody = new TextDecoder().decode(thisOutcall.body);
      let ownerRequest = JSON.parse(decodedBody);
      if (ownerRequest.method === "eth_call") {
        ownerRequest = fixRequest(decodedBody);
      };

      const response = await fetch(thisOutcall.url, {
        method: thisOutcall.httpMethod,
        headers: Object.fromEntries(thisOutcall.headers),
        body: JSON.stringify(ownerRequest),
      });

      const responseBody = await response.json();

      console.log("awaited an rpc call responseBody", ownerRequest, responseBody);

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

      // Much longer delay after each outcall to give PocketIC maximum recovery time
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    const results = await Promise.all(outcallPromises);

    // No additional tick after processing to minimize PocketIC load

    return results;
  };

  return processCalls();
}

// Execute canister operations that involve RPC calls
async function executeWithRPCProcessing<T>(
  operation: () => Promise<T>,
  maxRounds = 5,
  roundTimeout = 10000
): Promise<T> {
  const operationStartTime = Date.now();
  console.log(`🚀 Starting operation with RPC processing (max ${maxRounds} rounds, ${roundTimeout}ms timeout per round)...`);

  // Reset the stop processing flag for this new operation
  shouldStopProcessing = false;
  console.log(`🔄 Reset shouldStopProcessing flag to false for new operation`);

  // Initial tick to trigger any immediate HTTP outcalls
  await pic.tick();
  console.log(`⏰ Initial tick completed, starting concurrent processing...`);

  // Start operation and RPC processing concurrently
  const operationPromise = operation().catch(error => {
    if (error.message?.includes('InvalidCanisterHttpRequestId')) {
      console.warn('⚠️ InvalidCanisterHttpRequestId detected - likely stale HTTP request');
      throw new Error('Operation failed due to stale HTTP request');
    }
    throw error;
  });

  const rpcProcessingPromise = (async () => {
    for (let round = 0; round < maxRounds; round++) {
      // Check if we should stop processing
      if (shouldStopProcessing) {
        console.log(`🛑 Stopping RPC processing at round ${round + 1} due to shouldStopProcessing flag`);
        break;
      }

      const roundStartTime = Date.now();
      console.log(`\n🔄 === RPC ROUND ${round + 1}/${maxRounds} === (${roundStartTime - operationStartTime}ms elapsed)`);

      try {
        // Maximum delays for proposal creation to give PocketIC maximum breathing room
        const processingTimeout = round === 0 ? 12000 : 10000; // Much extended timeout for complex operations
        await processRPCCalls(processingTimeout);

        // Very long pause between rounds to give PocketIC maximum recovery time
        const pauseDuration = round === 0 ? 2000 : 1500; // Much longer pauses between rounds
        await new Promise(resolve => setTimeout(resolve, pauseDuration));

        console.log(`⏱️  RPC Round ${round + 1} completed in ${Date.now() - roundStartTime}ms`);
      } catch (error) {
        console.error(`❌ Error in RPC round ${round + 1}:`, error);
        // If we get PocketIC deletion error, stop processing
        if (error instanceof Error && error.message?.includes('Instance was deleted')) {
          console.log(`🛑 Stopping RPC processing due to PocketIC instance deletion`);
          break;
        }
        // If we get ingress timeout, pause even much longer before continuing
        if (error instanceof Error && error.message?.includes('BadIngressMessage')) {
          console.log(`⚠️ PocketIC ingress timeout detected, pausing much longer before next round...`);
          await new Promise(resolve => setTimeout(resolve, 4000)); // Very long pause
        }
      }
    }
    console.log(`📊 RPC processing completed after ${maxRounds} rounds`);
  })();

  // Race the operation against timeout with proper cleanup
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      console.error(`⏰ OPERATION TIMEOUT: Core operation exceeded ${maxRounds * roundTimeout}ms timeout`);
      reject(new Error(`Operation timeout after ${maxRounds * roundTimeout}ms`));
    }, maxRounds * roundTimeout);
  });

  try {
    console.log(`🔄 Starting race between operation and timeout...`);
    const result = await Promise.race([operationPromise, timeoutPromise]);

    // CRITICAL: Clear the timeout immediately when operation completes successfully
    if (timeoutId) {
      clearTimeout(timeoutId);
      console.log(`🧹 Cleared main operation timeout timer`);
    }

    const totalTime = Date.now() - operationStartTime;
    console.log(`✅ Operation completed successfully in ${totalTime}ms`);
    console.log(`✅ Operation result:`, result);

    // Stop background processing and wait for it to finish
    console.log(`🛑 Stopping background RPC processing...`);
    shouldStopProcessing = true;

    // Wait for background processing to stop (with timeout and proper cleanup)
    let cleanupTimeoutId: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        rpcProcessingPromise,
        new Promise((_, reject) => {
          cleanupTimeoutId = setTimeout(() => reject(new Error('RPC cleanup timeout')), 2000);
        })
      ]);
      if (cleanupTimeoutId) {
        clearTimeout(cleanupTimeoutId);
        console.log(`🧹 Cleared RPC cleanup timeout timer`);
      }
      console.log(`✅ Background RPC processing stopped cleanly`);
    } catch (cleanupError) {
      if (cleanupTimeoutId) {
        clearTimeout(cleanupTimeoutId);
        console.log(`🧹 Cleared RPC cleanup timeout timer (on error)`);
      }
      console.warn(`⚠️ Background RPC processing cleanup error:`, cleanupError);
    }

    return result;

  } catch (error) {
    console.error(`❌ executeWithRPCProcessing failed:`, error);
    // CRITICAL: Clear the timeout even on error to prevent hanging timers
    if (timeoutId) {
      clearTimeout(timeoutId);
      console.log(`🧹 Cleared main operation timeout timer (on error)`);
    }
    // Ensure we stop background processing even on error
    shouldStopProcessing = true;
    throw error;
  }
}

describe("EVMDAOBridge Snapshot Configuration Tests", () => {

  // Ensure proper cleanup after all tests to prevent Jest hanging
  afterAll(async () => {
    console.log("🧹 Final cleanup: ensuring all background processes are stopped...");

    // Force stop any background processing
    shouldStopProcessing = true;

    // Clean up any test environment resources
    try {
      if (pic) {
        await pic.tearDown();
      }
      if (anvilProcess) {
        anvilProcess.kill('SIGKILL');
      }
    } catch (error) {
      console.warn("Warning: Error during final cleanup:", error);
    }

    console.log("✅ Final cleanup completed");
  });

  // Kill any existing Anvil processes
  const killExistingProcesses = () => {
    try {
      const processName = 'anvil';
      const platform = process.platform;

      if (platform === 'win32') {
        execSync(`taskkill /IM ${processName}* /F`, { stdio: 'ignore' });
      } else {
        execSync(`pkill -f ${processName}`, { stdio: 'ignore' });
      }
    } catch (error) {
      console.warn('No existing Anvil processes to kill or cleanup failed:', error);
    }
  };

  beforeEach(async () => {
    // Kill any existing Anvil processes
    killExistingProcesses();

    // Start Anvil process
    console.log("Starting Anvil...");
    anvilProcess = spawn('anvil', ['--host', '127.0.0.1', '--port', '8545'], {
      stdio: 'pipe',
      shell: true,
    });

    // Attach event listeners for debugging
    anvilProcess.on('error', (error: Error) => {
      console.error('Failed to start Anvil process:', error);
    });

    anvilProcess.on('exit', (code: number) => {
      if (code !== 0) {
        console.error(`Anvil process exited with code ${code}`);
      }
    });

    // Forward Anvil output for debugging
    anvilProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Listening on')) {
        console.log('Anvil is ready');
      }
    });

    anvilProcess.stderr?.on('data', (data) => {
      console.error('Anvil stderr:', data.toString());
    });

    // Set up ethers provider for Anvil
    provider = new JsonRpcProvider("http://127.0.0.1:8545");

    // Wait for Anvil to start with better retry logic
    let connected = false;
    let attempts = 0;
    const maxAttempts = 20; // 20 seconds max wait

    while (!connected && attempts < maxAttempts) {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between attempts
        const network = await provider.getNetwork();
        console.log("Anvil network:", network);
        connected = true;
      } catch (error) {
        attempts++;
        console.log(`Attempt ${attempts}/${maxAttempts}: Waiting for Anvil to start...`);
        if (attempts === maxAttempts) {
          throw new Error(`Failed to connect to Anvil after ${maxAttempts} attempts: ${error}`);
        }
      }
    }

    // Deploy a working ERC20 token using the compiled MockUSDC contract
    const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const signer = new ethers.Wallet(privateKey, provider);

    // Get current nonce to ensure proper sequencing
    let currentNonce = await signer.getNonce();
    console.log("Starting nonce:", currentNonce);

    // Use the compiled MockUSDC factory for proper deployment
    const mockUSDCFactory = new MockUSDC__factory(signer);
    const mockUSDCContract = await mockUSDCFactory.deploy(signer.address, { nonce: currentNonce++ });
    await mockUSDCContract.waitForDeployment();

    mockTokenAddress = await mockUSDCContract.getAddress();
    mockToken = mockUSDCContract as any; // Cast to Contract type for compatibility

    console.log("MockUSDC contract deployed at:", mockTokenAddress);

    // Deploy a second ERC20 token for multiple contract testing
    // Use explicit nonce management to avoid conflicts
    await new Promise(resolve => setTimeout(resolve, 500)); // Longer delay to ensure first deployment is processed

    const mockUSDCContract2 = await mockUSDCFactory.deploy(signer.address, { nonce: currentNonce++ });
    await mockUSDCContract2.waitForDeployment();

    mockTokenAddress2 = await mockUSDCContract2.getAddress();
    mockToken2 = mockUSDCContract2 as any;

    console.log("Second MockUSDC contract deployed at:", mockTokenAddress2);

    // Test that totalSupply works
    try {
      const totalSupply = await mockToken["totalSupply"]();
      console.log("Contract totalSupply:", totalSupply.toString());
    } catch (error) {
      console.error("Failed to call totalSupply on deployed contract:", error);
      throw new Error("Deployed contract doesn't have working totalSupply function");
    }

    console.log("Mock ERC20 deployed at:", mockTokenAddress);

    pic = await PocketIc.create(process.env.PIC_URL, {
      processingTimeoutMs: 1000 * 60 * 5,
    });

    console.log("Setting up EVM RPC canister");

    // Deploy the EVM RPC canister first
    evmRpc_fixture = await pic.setupCanister<evmRpcService>({
      sender: admin.getPrincipal(),
      idlFactory: evmRpcIDLFactory,
      targetCanisterId: Principal.fromText("7hfb6-caaaa-aaaar-qadga-cai"),
      wasm: EVM_RPC_WASM_PATH,
      arg: IDL.encode(evmRpcInit({ IDL }), [{
        demo: [],
        manageApiKeys: [[admin.getPrincipal()]],
        logFilter: [{ ShowAll: null }]
      }]),
    });

    await pic.tick(5);

    console.log("EVM RPC canister deployed at:", evmRpc_fixture.canisterId.toString());

    // Configure the EVM RPC canister with Anvil connection
    evmRpc_fixture.actor.setIdentity(admin);

    console.log("EVM RPC canister deployed and ready for Custom RPC calls to Anvil");

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

    // Configure the main canister to use the EVM RPC canister
    main_fixture.actor.setIdentity(admin);

    // Add admin principal first
    console.log("Adding admin principal...");
    const addAdminResult = await main_fixture.actor.icrc149_update_admin_principal(admin.getPrincipal(), true);
    console.log("Admin added:", addAdminResult);

    // Configure EVM RPC canister ID
    console.log("Configuring EVM RPC canister ID...");
    const evmRpcUpdateResult = await main_fixture.actor.icrc149_update_evm_rpc_canister(evmRpc_fixture.canisterId);
    console.log("EVM RPC canister configured:", evmRpcUpdateResult);
  });

  afterEach(async () => {
    console.log("🧹 Starting cleanup...");

    // Stop any background RPC processing immediately
    shouldStopProcessing = true;

    // Wait longer for processing to stop and clear any pending timeouts
    await new Promise(resolve => setTimeout(resolve, 2000)); // Increased from 1500ms

    // Clean up Anvil process first (to stop HTTP requests)
    if (anvilProcess) {
      try {
        console.log("🛑 Terminating Anvil process...");
        anvilProcess.kill('SIGTERM');
        // Give it a moment to terminate gracefully
        await new Promise(resolve => setTimeout(resolve, 1500)); // Increased wait time

        // Force kill if still running
        if (!anvilProcess.killed) {
          anvilProcess.kill('SIGKILL');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        console.log("✅ Anvil process terminated");
      } catch (error) {
        console.error("❌ Error terminating Anvil:", error);
      }
    }

    // Clean up PocketIC
    if (pic) {
      try {
        console.log("🛑 Tearing down PocketIC...");
        await pic.tearDown();
        console.log("✅ PocketIC torn down");
      } catch (error) {
        console.error("❌ Error tearing down PocketIC:", error);
      }
    }

    // Additional cleanup wait to ensure full isolation between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Reset the flag for next test
    shouldStopProcessing = false;
    console.log("✅ Cleanup completed");
  });

  it('can configure snapshot contract', async () => {
    console.log("=== Testing Snapshot Contract Configuration ===");

    main_fixture.actor.setIdentity(admin);

    // Configure a snapshot contract
    const snapshotContractConfig = {
      contract_address: mockTokenAddress.toLowerCase(),
      chain: {
        chain_id: ANVIL_CHAIN_ID,
        network_name: "anvil"
      },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: BALANCE_STORAGE_SLOT,
      enabled: true
    };

    // Add the snapshot contract configuration
    const configResult = await main_fixture.actor.icrc149_update_snapshot_contract_config(
      mockTokenAddress.toLowerCase(),
      [snapshotContractConfig]
    );

    console.log("Snapshot contract config result:", configResult);
    expect(configResult).toMatchObject({ Ok: null });

    // Verify the configuration was added
    const contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    console.log("Configured snapshot contracts:", contracts);

    expect(contracts).toHaveLength(2); // Includes default contract

    // Find our contract in the list (may not be first due to default contract)
    const ourContract = contracts.find(([addr, _]) => addr === mockTokenAddress.toLowerCase());
    expect(ourContract).toBeDefined();
    expect(ourContract![1].contract_address).toBe(mockTokenAddress.toLowerCase());
    expect(ourContract![1].enabled).toBe(true);
    expect(ourContract![1].chain.chain_id).toBe(ANVIL_CHAIN_ID);

    console.log("✅ Snapshot contract configuration successful");
  });

  it('can create proposal with snapshot contract', async () => {
    console.log("=== Testing Proposal Creation with Snapshot ===");

    main_fixture.actor.setIdentity(admin);

    // First configure a snapshot contract
    const snapshotContractConfig = {
      contract_address: mockTokenAddress.toLowerCase(),
      chain: {
        chain_id: ANVIL_CHAIN_ID,
        network_name: "anvil"
      },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: BALANCE_STORAGE_SLOT,
      enabled: true
    };

    await main_fixture.actor.icrc149_update_snapshot_contract_config(
      mockTokenAddress.toLowerCase(),
      [snapshotContractConfig]
    );

    console.log("Snapshot contract configured and enabled for:", mockTokenAddress.toLowerCase());

    // Create a proposal WITH the configured snapshot contract
    // This tests SIWE verification and proposal creation with snapshot processing
    const createProposalRequest = {
      action: { Motion: "Test proposal for SIWE verification with snapshot" },
      metadata: ["Test proposal metadata"] as [] | [string],
      members: [
        { id: alice.getPrincipal(), votingPower: 1000n },
        { id: bob.getPrincipal(), votingPower: 500n }
      ],
      snapshot_contract: [mockTokenAddress.toLowerCase()] as [] | [string], // Use our configured Anvil contract
      siwe: await createSIWEProofForProposal(mockTokenAddress.toLowerCase(), pic)
    };

    console.log("Creating proposal with config:", {
      action: "Motion",
      hasSnapshotContract: true,
      snapshotContract: mockTokenAddress.toLowerCase(),
      evmRpcCanisterId: evmRpc_fixture.canisterId.toString(),
      members: createProposalRequest.members.length
    });

    const proposalResult = await executeWithRPCProcessing(
      () => main_fixture.actor.icrc149_create_proposal(createProposalRequest),
      10, // max 10 rounds for proposal creation with snapshot
      30000 // 30 second timeout per round
    );
    console.log("Create proposal result:", proposalResult);

    if ('Ok' in proposalResult) {
      const proposalId = proposalResult.Ok;
      console.log("Created proposal ID:", proposalId);

      console.log("✅ Proposal created successfully with SIWE verification");
    } else {
      throw new Error("Failed to create proposal: " + proposalResult.Err);
    }
  });

  it('can handle multiple snapshot contracts', async () => {
    jest.setTimeout(600000); // 10 minutes timeout for this test
    console.log("=== Testing Multiple Snapshot Contracts ===");

    main_fixture.actor.setIdentity(admin);

    // Use the first deployed MockUSDC contract as contract1
    const contract1 = mockTokenAddress;
    const config1 = {
      contract_address: contract1,
      chain: { chain_id: ANVIL_CHAIN_ID, network_name: "anvil" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: true
    };

    // Use the second deployed MockUSDC contract as contract2
    const contract2 = mockTokenAddress2;
    const config2 = {
      contract_address: contract2,
      chain: { chain_id: ANVIL_CHAIN_ID, network_name: "anvil" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n, // Can use same storage slot since it's a different contract
      enabled: true
    };

    // Add both configurations
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contract1, [config1]);
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contract2, [config2]);

    // Verify both contracts are configured
    const contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    console.log("All configured contracts:", contracts);

    expect(contracts).toHaveLength(3); // Includes default contract plus our 2

    // Test creating proposals with different snapshot contracts
    const proposal1Request = {
      action: { Motion: "Proposal 1" },
      metadata: ["Proposal 1 metadata"] as [] | [string],
      members: [{ id: alice.getPrincipal(), votingPower: 1000n }],
      snapshot_contract: [contract1] as [] | [string],
      siwe: await createSIWEProofForProposal(contract1, pic)
    };

    const proposal2Request = {
      action: { Motion: "Proposal 2" },
      metadata: ["Proposal 2 metadata"] as [] | [string],
      members: [{ id: bob.getPrincipal(), votingPower: 500n }],
      snapshot_contract: [contract2] as [] | [string],
      siwe: await createSIWEProofForProposal(contract2, pic)
    };

    const result1 = await executeWithRPCProcessing(
      () => {
        console.log("🚀 About to call icrc149_create_proposal for first proposal...");
        const promise = main_fixture.actor.icrc149_create_proposal(proposal1Request);
        console.log("🚀 icrc149_create_proposal call initiated, waiting for result...");
        return promise;
      },
      10, // max 10 rounds 
      45000 // 45 second timeout per round (450 seconds total)
    );

    console.log("✅ First proposal created, waiting and cleaning up before second proposal...");

    // Add explicit PocketIC cleanup after first proposal
    console.log("🧹 Cleaning up PocketIC state...");
    await pic.tick(10);

    // Much longer delay between proposal creations to let PocketIC fully recover
    await new Promise(resolve => setTimeout(resolve, 8000));

    console.log("🚀 Starting second proposal creation...");

    const result2 = await executeWithRPCProcessing(
      () => {
        console.log("🚀 About to call icrc149_create_proposal for second proposal...");
        const promise = main_fixture.actor.icrc149_create_proposal(proposal2Request);
        console.log("🚀 icrc149_create_proposal call initiated, waiting for result...");
        return promise;
      },
      10, // max 10 rounds
      45000 // 45 second timeout per round (450 seconds total)
    ); if ('Ok' in result1 && 'Ok' in result2) {
      const snapshot1 = await main_fixture.actor.icrc149_proposal_snapshot(result1.Ok);
      const snapshot2 = await main_fixture.actor.icrc149_proposal_snapshot(result2.Ok);

      // Each should have the correct contract address (case-insensitive comparison)
      expect(snapshot1.contract_address.toLowerCase()).toBe(contract1.toLowerCase());
      expect(snapshot2.contract_address.toLowerCase()).toBe(contract2.toLowerCase());

      // Verify that both proposals were created successfully
      expect(result1.Ok).toBeDefined();
      expect(result2.Ok).toBeDefined();

      console.log("✅ Multiple snapshot contracts working correctly");
      console.log("Contract 1:", contract1, "-> Proposal", result1.Ok);
      console.log("Contract 2:", contract2, "-> Proposal", result2.Ok);
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
      chain: { chain_id: ANVIL_CHAIN_ID, network_name: "anvil" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
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
    expect(contracts).toHaveLength(1); // Only the default contract should remain

    console.log("✅ Authorization working correctly");
  });

  it('can disable and enable snapshot contracts', async () => {
    console.log("=== Testing Snapshot Contract Enable/Disable ===");

    main_fixture.actor.setIdentity(admin);

    const contractAddress = "0x3333333333333333333333333333333333333333";

    // Add enabled contract
    const enabledConfig = {
      contract_address: contractAddress,
      chain: { chain_id: ANVIL_CHAIN_ID, network_name: "anvil" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
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
      snapshot_contract: [contractAddress] as [] | [string],
      siwe: await createSIWEProofForProposal(contractAddress, pic)
    };

    const workingResult = await executeWithRPCProcessing(
      () => main_fixture.actor.icrc149_create_proposal(workingProposal),
      5, // max 5 rounds
      15000 // 15 second timeout per round
    );
    expect('Ok' in workingResult).toBe(true);

    // Now disable the contract
    const disabledConfig = { ...enabledConfig, enabled: false };
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, [disabledConfig]);

    // Try to create proposal with disabled contract
    const failingProposal = {
      action: { Motion: "Should fail" },
      metadata: [] as [] | [string],
      members: [{ id: alice.getPrincipal(), votingPower: 1000n }],
      snapshot_contract: [contractAddress] as [] | [string],
      siwe: await createSIWEProofForProposal(contractAddress, pic)
    };

    const failingResult = await main_fixture.actor.icrc149_create_proposal(failingProposal);
    console.log("Disabled contract result:", failingResult);

    expect('Err' in failingResult && failingResult.Err.includes("not enabled")).toBe(true);

    // Re-enable and verify it works again
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, [enabledConfig]);

    const reenableResult = await executeWithRPCProcessing(
      () => main_fixture.actor.icrc149_create_proposal(workingProposal),
      5, // max 5 rounds
      15000 // 15 second timeout per round
    );
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
      chain: { chain_id: ANVIL_CHAIN_ID, network_name: "anvil" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: true
    };

    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, [config]);

    // Verify it was added
    let contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    expect(contracts).toHaveLength(2); // Default contract + our contract

    // Remove the contract by passing empty array (null config)
    await main_fixture.actor.icrc149_update_snapshot_contract_config(contractAddress, []);

    // Verify it was removed
    contracts = await main_fixture.actor.icrc149_get_snapshot_contracts();
    expect(contracts).toHaveLength(1); // Only default contract remains

    // Try to create proposal with removed contract
    const proposalRequest = {
      action: { Motion: "Should fail" },
      metadata: [] as [] | [string],
      members: [{ id: alice.getPrincipal(), votingPower: 1000n }],
      snapshot_contract: [contractAddress] as [] | [string],
      siwe: await createSIWEProofForProposal(contractAddress, pic)
    };

    const result = await main_fixture.actor.icrc149_create_proposal(proposalRequest);
    expect('Err' in result && result.Err.includes("not approved")).toBe(true);

    console.log("✅ Contract removal working correctly");
  });

  it('can get governance configuration', async () => {
    console.log("=== Testing Governance Configuration Retrieval ===");

    main_fixture.actor.setIdentity(admin);

    // Initially should have only the default contract
    const initialConfig = await main_fixture.actor.icrc149_governance_config();
    console.log("Initial governance config:", initialConfig);

    expect(initialConfig.snapshot_contracts).toHaveLength(1); // Default contract
    expect(initialConfig.execution_contracts).toHaveLength(0);
    expect(initialConfig.approved_icp_methods).toHaveLength(0);

    // Add a snapshot contract
    const config = {
      contract_address: mockTokenAddress.toLowerCase(),
      chain: { chain_id: ANVIL_CHAIN_ID, network_name: "anvil" },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evmRpc_fixture.canisterId,
        custom_config: [[["url", "http://127.0.0.1:8545"]]] as [] | [[string, string][]]
      },
      contract_type: { ERC20: null },
      balance_storage_slot: 0n,
      enabled: true
    };

    await main_fixture.actor.icrc149_update_snapshot_contract_config(mockTokenAddress.toLowerCase(), [config]);

    // Check updated configuration
    const updatedConfig = await main_fixture.actor.icrc149_governance_config();
    console.log("Updated governance config:", updatedConfig);

    expect(updatedConfig.snapshot_contracts).toHaveLength(2); // Default + our contract

    // Find our contract in the list
    const ourContract = updatedConfig.snapshot_contracts.find(([addr, _]) => addr === mockTokenAddress.toLowerCase());
    expect(ourContract).toBeDefined();
    expect(ourContract![0]).toBe(mockTokenAddress.toLowerCase());

    console.log("✅ Governance configuration retrieval working correctly");
  });
});
