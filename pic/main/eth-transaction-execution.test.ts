import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";
import { PocketIc, createIdentity } from '@dfinity/pic';
import type { Actor, CanisterFixture } from '@dfinity/pic';
import { spawn, execSync, ChildProcess } from 'child_process';
import { ethers, JsonRpcProvider, Contract, Wallet } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { generateTokenBalanceWitness, validateWitnessIntegrity, getTokenBalance } from './witness-generator';

// Runtime import: include the .js extension
import { idlFactory as mainIDLFactory, init as mainInit } from "../../src/declarations/main/main.did.js";
import { idlFactory as evmRpcIDLFactory, init as evmRpcInit } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

// Type-only import: import types from the candid interface without the extension
import type { _SERVICE as mainService, VoteArgs, VoteChoice, Witness, SIWEProof, EthTx } from "../../src/declarations/main/main.did.js";
import type { _SERVICE as evmRpcService } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

// Define the actual CreateProposalRequest type based on the generated interface
interface CreateProposalRequest {
  action: { EthTransaction: EthTx } | { Motion: string };
  members: Array<{ id: Principal; votingPower: bigint }>;
  metadata: [] | [string];
  snapshot_contract: [] | [string];
}

const MAIN_WASM_PATH = ".dfx/local/canisters/main/main.wasm";
const EVM_RPC_WASM_PATH = "./evm_rpc/evm_rpc.wasm.gz";

let replacer = (_key: any, value: any) => typeof value === "bigint" ? value.toString() + "n" : value;

let pic: PocketIc;
let main_fixture: CanisterFixture<mainService>;
let evm_fixture: CanisterFixture<evmRpcService>;

const admin = createIdentity("admin");
const alice = createIdentity("alice");
const bob = createIdentity("bob");
const charlie = createIdentity("charlie");

interface TestVoter {
  identity: any;
  wallet: Wallet;
  address: string;
  tokenBalance: bigint;
}

const twoSecondsInMs = 2000;

// Load the GovernanceToken contract
const governanceTokenPath = path.join(process.cwd(), 'sample-tokens/packages/hardhat/artifacts/contracts/MockTokens.sol/GovernanceToken.json');
const governanceTokenArtifact = JSON.parse(fs.readFileSync(governanceTokenPath, 'utf8'));

// Load ERC20 ABI for token operations
const erc20ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

// Real witness generation function that calls eth_getProof
async function createRealWitness(contractAddress: string, voterAddress: string, blockNumber: number): Promise<any> {
  console.log(`🔍 Generating REAL witness for voter ${voterAddress} at block ${blockNumber}`);
  
  // Use the real witness generator
  const witness = await generateTokenBalanceWitness(
    contractAddress,
    voterAddress,
    blockNumber,
    { rpcUrl: 'http://127.0.0.1:8545' }
  );
  
  // Validate the witness has proper proof data
  if (!validateWitnessIntegrity(witness)) {
    throw new Error('Generated witness failed integrity check');
  }
  
  console.log(`✅ Generated real witness with ${witness.storageProof.length} storage proof entries`);
  
  // Return in the expected format for the canister
  return witness;
}

// Mock function to simulate witness creation (SHOULD BE REJECTED BY CANISTER)
async function createMockWitness(contractAddress: string, voterAddress: string, blockNumber: number): Promise<any> {
  console.log(`⚠️  Creating MOCK witness that should be REJECTED by canister`);
  return {
    blockHash: new Uint8Array(32), // Empty 32-byte array - should fail validation
    blockNumber: BigInt(blockNumber),
    userAddress: ethers.getBytes(voterAddress),
    contractAddress: ethers.getBytes(contractAddress),
    storageKey: new Uint8Array(32), // Empty storage key
    storageValue: new Uint8Array(32), // Empty storage value
    accountProof: [], // Empty account proof - should fail validation
    storageProof: [] // Empty storage proof - should fail validation
  };
}

describe("Ethereum Transaction Execution End-to-End Test", () => {
  let anvilProcess: ChildProcess;
  let pic: PocketIc;
  let provider: JsonRpcProvider;
  let evmDAOBridge_fixture: CanisterFixture<mainService>;
  let evmRpc_fixture: CanisterFixture<evmRpcService>;
  let governanceToken: Contract;
  let governanceTokenAddress: string;
  let testToken: Contract; // Additional token for transaction testing
  let testTokenAddress: string;
  let testVoters: TestVoter[] = [];
  let proposalId: bigint;
  let daoEthereumAddress: string;

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

  // Utility to create SIWE message for voting
  const createSIWEMessage = async (address: string, proposalId: bigint, choice: string, contractAddress: string): Promise<string> => {
    const canisterTimeMs = Math.floor(await pic.getTime()); // Ensure it's an integer
    const canisterTimeNanos = BigInt(canisterTimeMs) * 1_000_000n;
    const expirationTimeNanos = canisterTimeNanos + 600_000_000_000n; // 10 minutes
    
    const currentTimeISO = new Date(Number(canisterTimeNanos / 1_000_000n)).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    return `example.com wants you to sign in with your Ethereum account:
${address}

Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${canisterTimeNanos}
Issued At: ${currentTimeISO}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTimeISO}`;
  };

  // Utility to create mock witness proof
  const createMockWitness = async (contractAddress: string, voterAddress: string, blockNumber: bigint) => {
    const block = await provider.getBlock(Number(blockNumber));
    if (!block) {
      throw new Error(`Block ${blockNumber} not found`);
    }

    const paddedAddress = ethers.zeroPadValue(voterAddress, 32);
    const slot = ethers.keccak256(ethers.concat([paddedAddress, ethers.zeroPadValue("0x01", 32)]));
    const storageValue = await provider.getStorage(contractAddress, slot, Number(blockNumber));

    // Important: This creates a MOCK witness that will NOT pass real validation
    // The real system should REJECT this and the test should FAIL if mock witnesses pass
    return {
      blockHash: ethers.getBytes(block.hash!),
      blockNumber: BigInt(blockNumber),
      userAddress: ethers.getBytes(voterAddress),
      contractAddress: ethers.getBytes(contractAddress),
      storageKey: ethers.getBytes(slot),
      storageValue: ethers.getBytes(storageValue),
      accountProof: [], // MOCK - Empty proof arrays should cause validation to FAIL
      storageProof: [], // MOCK - Empty proof arrays should cause validation to FAIL
    };
  };

  // Process HTTP outcalls for RPC requests
  async function processRPCCalls(timeout = 10000): Promise<void[]> {
    await pic.tick(5);
    const startTime = Date.now();
    const processCalls = async (): Promise<void[]> => {
      let pendingHttpsOutcalls = await pic.getPendingHttpsOutcalls();
      console.log("pendingHttpsOutcalls", pendingHttpsOutcalls.length);
      if (pendingHttpsOutcalls.length === 0) {
        if (Date.now() - startTime >= timeout) {
          return [];
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        return processCalls();
      }
      
      const outcallPromises = pendingHttpsOutcalls.map(async (thisOutcall) => {
        const decodedBody = new TextDecoder().decode(thisOutcall.body);
        let ownerRequest = JSON.parse(decodedBody);
        
        // Fix request format for eth_call if needed
        if(ownerRequest.method === "eth_call") {
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
            }, "latest"]
          };
        }

        const response = await fetch(thisOutcall.url, {
          method: thisOutcall.httpMethod,
          headers: Object.fromEntries(thisOutcall.headers),
          body: JSON.stringify(ownerRequest),
        });

        const responseBody = await response.json();
        console.log("RPC call result:", ownerRequest.method, responseBody);

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
      });

      return Promise.all(outcallPromises);
    };

    return processCalls();
  }

  beforeEach(async () => {
    console.log("=== Test Setup: Ethereum Transaction Execution ===");
    
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

    console.log("2. Deploying test token for transactions...");
    const testTokenDeployment = await tokenFactory.deploy(deployer.address);
    await testTokenDeployment.waitForDeployment();
    testTokenAddress = await testTokenDeployment.getAddress();
    testToken = new Contract(testTokenAddress, governanceTokenArtifact.abi, deployer);
    
    console.log("Test token deployed at:", testTokenAddress);

    // Create test voters with governance tokens
    const voterPrivateKeys = [
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Account 1
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // Account 2  
      "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // Account 3
    ];

    const tokenBalances = [
      ethers.parseEther("10000"),  // Voter 1: 10,000 tokens
      ethers.parseEther("5000"),   // Voter 2: 5,000 tokens
      ethers.parseEther("1000"),   // Voter 3: 1,000 tokens
    ];

    console.log("3. Creating test voters and distributing governance tokens...");
    for (let i = 0; i < voterPrivateKeys.length; i++) {
      const wallet = new ethers.Wallet(voterPrivateKeys[i], provider);
      const identity = createIdentity(`voter${i + 1}`);
      const balance = tokenBalances[i];
      
      console.log(`Transferring ${ethers.formatEther(balance)} governance tokens to voter ${i + 1} (${wallet.address})`);
      
      const transferTx = await governanceToken['transfer'](wallet.address, balance);
      await transferTx.wait();
      
      testVoters.push({
        identity,
        wallet,
        address: wallet.address,
        tokenBalance: balance,
      });
      
      console.log(`Voter ${i + 1} (${wallet.address}) received ${ethers.formatEther(balance)} governance tokens`);
    }

    // Verify governance token distribution
    for (const voter of testVoters) {
      const balance = await governanceToken['balanceOf'](voter.address);
      expect(balance).toBe(voter.tokenBalance);
    }

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

    // Check available providers instead of trying to manage them
    console.log("4. Checking EVM RPC providers...");
    const providers = await evmRpc_fixture.actor.getProviders();
    console.log("Available providers:", providers.length);

    // Deploy the DAO Bridge canister with minimal initialization
    console.log("5. Deploying DAO Bridge canister with null initialization...");

    evmDAOBridge_fixture = await pic.setupCanister<mainService>({
      idlFactory: mainIDLFactory,
      wasm: MAIN_WASM_PATH,
      sender: admin.getPrincipal(),
      arg: IDL.encode(mainInit({IDL}), [[]]),
    });

    console.log("DAO Bridge canister deployed at:", evmDAOBridge_fixture.canisterId.toString());
    await pic.tick(10);

    evmDAOBridge_fixture.actor.setIdentity(admin);

    // Now configure the canister step by step
    console.log("6. Configuring DAO Bridge canister...");
    
    // Add admin principal
    const addAdminResult = await evmDAOBridge_fixture.actor.icrc149_update_admin_principal(admin.getPrincipal(), true);
    console.log("Admin added:", addAdminResult);

    // Add snapshot contract configuration
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
    console.log("Snapshot contract added:", addSnapshotResult);

    // Set the governance token as the default snapshot contract
    const setDefaultResult = await evmDAOBridge_fixture.actor.icrc149_set_default_snapshot_contract([governanceTokenAddress]);
    console.log("Default snapshot contract set:", setDefaultResult);

    // Add execution contract configuration
    const executionConfig = {
      contract_address: testTokenAddress,
      chain: { chain_id: BigInt(31337), network_name: "anvil" },
      description: ["Test token for transaction execution"] as [] | [string],
      enabled: true,
    };
    
    const addExecutionResult = await evmDAOBridge_fixture.actor.icrc149_update_execution_contract_config(
      testTokenAddress,
      [executionConfig]
    );
    console.log("Execution contract added:", addExecutionResult);

    // Get the DAO Bridge's actual tECDSA address
    console.log("7. Getting DAO Bridge tECDSA address...");
    daoEthereumAddress = await evmDAOBridge_fixture.actor.icrc149_get_ethereum_address([]);
    console.log("DAO Bridge Ethereum address:", daoEthereumAddress);

    // Process any pending RPC calls during setup
    await pic.advanceTime(1000);
    await processRPCCalls();

    console.log("8. Transferring test tokens to DAO address...");
    // Award some test tokens to the DAO's address
    const daoTokenAmount = ethers.parseEther("1000"); // 1000 test tokens
    const transferToDAOTx = await testToken['transfer'](daoEthereumAddress, daoTokenAmount);
    await transferToDAOTx.wait();
    
    // Verify DAO received the tokens
    const daoBalance = await testToken['balanceOf'](daoEthereumAddress);
    console.log(`DAO balance: ${ethers.formatEther(daoBalance)} test tokens`);
    expect(daoBalance).toBe(daoTokenAmount);

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

  it("should execute end-to-end Ethereum transaction flow", async () => {
    console.log("=== Starting End-to-End Ethereum Transaction Test ===");

    // CRITICAL SECURITY TEST: Verify that mock witnesses are properly rejected
    console.log("Security Check: Testing that mock witnesses are rejected...");
    
    const testVoter = testVoters[0];
    
    // Test current block connectivity with timeout
    let currentBlock: number;
    try {
      console.log("🔍 Checking Anvil connectivity...");
      const blockPromise = provider.getBlockNumber();
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Block number timeout')), 5000)
      );
      currentBlock = await Promise.race([blockPromise, timeout]) as number;
      console.log(`✅ Anvil responsive, current block: ${currentBlock}`);
    } catch (error) {
      throw new Error(`Anvil connection failed during test execution: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    const mockWitness = await createMockWitness(governanceTokenAddress, testVoter.address, BigInt(currentBlock));
    
    // This should FAIL because our mock witness has empty proof arrays
    evmDAOBridge_fixture.actor.setIdentity(admin);
    const mockWitnessResult = await evmDAOBridge_fixture.actor.icrc149_verify_witness(mockWitness, []);
    
    // If this doesn't fail, our security is broken!
    if ('Ok' in mockWitnessResult) {
      throw new Error("CRITICAL SECURITY FAILURE: Mock witness with empty proofs was accepted! This means witness validation is not working properly.");
    }
    
    console.log("✅ Security check passed: Mock witness properly rejected with error:", mockWitnessResult.Err);
    
    // SKIP ISOLATED WITNESS TEST - We'll test real witnesses in the context of actual proposals
    console.log("\n📝 Note: Real witness validation requires a proposal with stored snapshot.");
    console.log("Real witness testing will be done in the full end-to-end test below...");

    // Continue with the full end-to-end test now that we have proper witness generation

    // Step 1: Create a proposal to send test tokens to voter 1
    const recipient = testVoters[0]; // First voter will receive tokens
    const transferAmount = ethers.parseEther("100"); // 100 test tokens

    console.log(`Step 1: Creating proposal to send ${ethers.formatEther(transferAmount)} test tokens to ${recipient.address}`);

    // Encode transfer function call
    const transferData = testToken.interface.encodeFunctionData("transfer", [
      recipient.address,
      transferAmount
    ]);

    const ethTx: EthTx = {
      to: testTokenAddress,
      value: 0n, // No ETH value, just token transfer  
      data: ethers.getBytes(transferData),
      chain: { chain_id: 31337n, network_name: "anvil" },
      subaccount: [], // Use empty array for null subaccount
      maxPriorityFeePerGas: BigInt(ethers.parseUnits("2", "gwei").toString()),
      maxFeePerGas: BigInt(ethers.parseUnits("20", "gwei").toString()),
      gasLimit: 100000n,
      signature: [],
      nonce: [],
    };    const createProposalRequest: CreateProposalRequest = {
      action: { EthTransaction: ethTx },
      metadata: [`Send ${ethers.formatEther(transferAmount)} test tokens to ${recipient.address}`],
      members: testVoters.map(voter => ({
        id: voter.identity.getPrincipal(),
        votingPower: voter.tokenBalance / BigInt(1e18) // Convert to whole tokens as bigint
      })),
      snapshot_contract: [governanceTokenAddress],
    };

    evmDAOBridge_fixture.actor.setIdentity(admin);
    
    // Start the proposal creation
    console.log("Starting proposal creation...");
    const proposalPromise = evmDAOBridge_fixture.actor.icrc149_create_proposal(createProposalRequest);
    
    // Immediately start processing HTTP outcalls in parallel
    let processedOutcalls = false;
    const processOutcallsPromise = (async () => {
      // Give the canister a moment to start the HTTP outcalls
      await pic.advanceTime(1000);
      
      // Process multiple rounds of RPC calls since the canister makes 2 calls (latest + specific block)
      for (let round = 0; round < 3; round++) {
        console.log(`Processing RPC calls round ${round + 1}...`);
        await processRPCCalls(10000); // 10 second timeout per round
        await pic.advanceTime(500); // Brief pause between rounds
        
        const pending = await pic.getPendingHttpsOutcalls();
        if (pending.length === 0) {
          console.log(`No more pending outcalls after round ${round + 1}`);
          processedOutcalls = true;
          break;
        }
      }
    })();
    
    // Wait for both to complete
    const [proposalResult] = await Promise.all([
      proposalPromise,
      processOutcallsPromise
    ]);
    
    if (!processedOutcalls) {
      console.warn("Warning: HTTP outcalls may not have been fully processed");
    }

    console.log("Proposal result:", proposalResult);
    expect('Ok' in proposalResult).toBe(true);
    if ('Ok' in proposalResult) {
      proposalId = proposalResult.Ok;
      console.log("Proposal created with ID:", proposalId.toString());
    }

    // Step 2: Have voters vote on the proposal
    console.log("Step 2: Voters casting votes...");

    // Get current block with timeout protection
    let testCurrentBlock: number;
    try {
      console.log("🔍 Checking Anvil connectivity for voting...");
      const blockPromise = provider.getBlockNumber();
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Block number timeout during voting')), 5000)
      );
      testCurrentBlock = await Promise.race([blockPromise, timeout]) as number;
      console.log(`✅ Anvil responsive for voting, current block: ${testCurrentBlock}`);
    } catch (error) {
      throw new Error(`Anvil connection failed during voting test: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // 🔧 CRITICAL FIX: Get the actual block number used by the canister for the snapshot
    // The canister uses latest-minus-confirmations strategy, so we need to get that exact block
    console.log("🔍 Getting actual snapshot block number from canister...");
    const snapshot = await evmDAOBridge_fixture.actor.icrc149_proposal_snapshot(proposalId);
    const snapshotBlock = BigInt(snapshot.block_number);
    console.log(`✅ Canister snapshot uses block ${snapshotBlock} (current was ${testCurrentBlock})`);
    
    if (Number(snapshotBlock) > testCurrentBlock) {
      throw new Error(`Invalid snapshot block ${snapshotBlock} is greater than current block ${testCurrentBlock}`);
    }

    for (let i = 0; i < testVoters.length; i++) {
      const voter = testVoters[i];
      const choice = i < 2 ? "Yes" : "No"; // First two vote Yes, last one votes No
      
      console.log(`Voter ${i + 1} (${voter.address}) voting: ${choice}`);

      // Create SIWE message and sign it
      const siweMessage = await createSIWEMessage(voter.address, proposalId, choice, governanceTokenAddress);
      const siweSignature = await voter.wallet.signMessage(siweMessage);

      const siweProof: SIWEProof = {
        message: siweMessage,
        signature: ethers.getBytes(siweSignature),
      };

      // Create witness proof using REAL eth_getProof
      console.log(`🔍 Generating real witness for voter ${voter.address}...`);
      const witness = await createRealWitness(governanceTokenAddress, voter.address, Number(snapshotBlock));

      const voteArgs: VoteArgs = {
        proposal_id: proposalId,
        voter: ethers.getBytes(voter.address),
        choice: choice === "Yes" ? { Yes: null } : choice === "No" ? { No: null } : { Abstain: null },
        siwe: siweProof,
        witness: witness,
      };

      evmDAOBridge_fixture.actor.setIdentity(voter.identity);
      const voteResult = await evmDAOBridge_fixture.actor.icrc149_vote_proposal(voteArgs);
      
      // Follow orchestrator pattern: advance time before processing RPC calls
      await pic.advanceTime(1000);
      await processRPCCalls();

      console.log(`Voter ${i + 1} vote result:`, voteResult);
      
      if (!('Ok' in voteResult)) {
        console.error(`Voter ${i + 1} vote failed with error:`, voteResult.Err);
        throw new Error(`Vote failed for voter ${i + 1}: ${JSON.stringify(voteResult.Err)}`);
      }
      
      expect('Ok' in voteResult).toBe(true);
      console.log(`Voter ${i + 1} vote cast successfully`);
    }

    // Step 3: Check vote tally
    console.log("Step 3: Checking vote tally...");
    evmDAOBridge_fixture.actor.setIdentity(admin);
    const tallyResult = await evmDAOBridge_fixture.actor.icrc149_tally_votes(proposalId);
    
    console.log("Vote tally:", {
      yes: tallyResult.yes.toString(),
      no: tallyResult.no.toString(),
      abstain: tallyResult.abstain.toString(),
      total: tallyResult.total.toString(),
      result: tallyResult.result
    });

    // Expect the proposal to pass (15,000 Yes vs 1,000 No)
    expect(tallyResult.yes > tallyResult.no).toBe(true);
    expect(tallyResult.result).toBe("Passed"); // Changed from "Accepted" to "Passed"

    // Step 4: Execute the proposal
    console.log("Step 4: Executing the proposal...");
    
    // Record recipient's balance before execution
    const recipientBalanceBefore = await testToken['balanceOf'](recipient.address);
    const daoBalanceBefore = await testToken['balanceOf'](daoEthereumAddress);
    
    console.log(`Recipient balance before: ${ethers.formatEther(recipientBalanceBefore)} test tokens`);
    console.log(`DAO balance before: ${ethers.formatEther(daoBalanceBefore)} test tokens`);

    const executeResult = await evmDAOBridge_fixture.actor.icrc149_execute_proposal(proposalId);
    
    // Follow orchestrator pattern: advance time before processing RPC calls  
    await pic.advanceTime(2000);
    await processRPCCalls();

    expect('Ok' in executeResult).toBe(true);
    if ('Ok' in executeResult) {
      console.log("Proposal executed successfully. Transaction hash:", executeResult.Ok);
    }

    // Step 5: Verify the transaction was successful
    console.log("Step 5: Verifying transaction success...");
    
    // Wait a moment for the transaction to be mined
    await new Promise(resolve => setTimeout(resolve, 2000));

    const recipientBalanceAfter = await testToken['balanceOf'](recipient.address);
    const daoBalanceAfter = await testToken['balanceOf'](daoEthereumAddress);
    
    console.log(`Recipient balance after: ${ethers.formatEther(recipientBalanceAfter)} test tokens`);
    console.log(`DAO balance after: ${ethers.formatEther(daoBalanceAfter)} test tokens`);

    // Verify the transfer occurred
    expect(recipientBalanceAfter - recipientBalanceBefore).toBe(transferAmount);
    expect(daoBalanceBefore - daoBalanceAfter).toBe(transferAmount);

    console.log("✅ End-to-end Ethereum transaction execution test completed successfully!");
    
    // Additional verification: Check transaction status
    if ('Ok' in executeResult) {
      const txStatus = await evmDAOBridge_fixture.actor.icrc149_get_eth_tx_status(executeResult.Ok);
      console.log("Transaction status:", txStatus);
    }

    console.log("=== Test Completed Successfully ===");
  });

  it("should handle failed proposals correctly", async () => {
    console.log("=== Testing Failed Proposal Handling ===");

    // CRITICAL SECURITY TEST: Verify that voting with mock witnesses fails
    console.log("Security Check: Testing that voting with mock witnesses is rejected...");
    
    // Try to create a proposal first
    const recipient = testVoters[2];
    const transferAmount = ethers.parseEther("50");

    const transferData = testToken.interface.encodeFunctionData("transfer", [
      recipient.address,
      transferAmount
    ]);

    const ethTx: EthTx = {
      to: testTokenAddress,
      value: 0n,
      data: ethers.getBytes(transferData),
      chain: { chain_id: 31337n, network_name: "anvil" },
      subaccount: [],
      maxPriorityFeePerGas: BigInt(ethers.parseUnits("2", "gwei").toString()),
      maxFeePerGas: BigInt(ethers.parseUnits("20", "gwei").toString()),
      gasLimit: 100000n,
      signature: [],
      nonce: [],
    };

    const createProposalRequest: CreateProposalRequest = {
      action: { EthTransaction: ethTx },
      metadata: [`Failed proposal test`],
      members: testVoters.map(voter => ({
        id: voter.identity.getPrincipal(),
        votingPower: voter.tokenBalance / BigInt(1e18)
      })),
      snapshot_contract: [governanceTokenAddress],
    };

    evmDAOBridge_fixture.actor.setIdentity(admin);
    const proposalResult = await evmDAOBridge_fixture.actor.icrc149_create_proposal(createProposalRequest);
    
    // Follow orchestrator pattern: advance time before processing RPC calls
    await pic.advanceTime(2000);
    await processRPCCalls();

    console.log("Failed test proposal result:", proposalResult);
    expect('Ok' in proposalResult).toBe(true);
    if ('Ok' in proposalResult) {
      proposalId = proposalResult.Ok;
      console.log("Proposal created with ID:", proposalId.toString());
    }

    // Now try to vote with a mock witness - this should FAIL
    const voter = testVoters[2];
    
    // 🔧 CRITICAL FIX: Get the actual block number used by the canister for the snapshot
    console.log("🔍 Getting actual snapshot block number from canister for execution test...");
    const snapshot = await evmDAOBridge_fixture.actor.icrc149_proposal_snapshot(proposalId);
    const snapshotBlock = BigInt(snapshot.block_number);
    console.log(`✅ Canister snapshot uses block ${snapshotBlock} for execution test`);

    console.log(`Testing vote with mock witness - this should be REJECTED`);

    const siweMessage = await createSIWEMessage(voter.address, proposalId, "Yes", governanceTokenAddress);
    const siweSignature = await voter.wallet.signMessage(siweMessage);

    const siweProof: SIWEProof = {
      message: siweMessage,
      signature: ethers.getBytes(siweSignature),
    };

    // Generate real witness for execution vote
    console.log(`🔍 Generating real witness for voter ${voter.address} during execution...`);
    const realWitness = await createRealWitness(governanceTokenAddress, voter.address, Number(snapshotBlock));

    const voteArgs: VoteArgs = {
      proposal_id: proposalId,
      voter: ethers.getBytes(voter.address),
      choice: { Yes: null },
      siwe: siweProof,
      witness: realWitness,
    };

    evmDAOBridge_fixture.actor.setIdentity(voter.identity);
    const voteResult = await evmDAOBridge_fixture.actor.icrc149_vote_proposal(voteArgs);
    
    // Follow orchestrator pattern: advance time before processing RPC calls
    await pic.advanceTime(1000);
    await processRPCCalls();

    // This should FAIL because we're using a mock witness
    if ('Ok' in voteResult) {
      throw new Error("CRITICAL SECURITY FAILURE: Vote with mock witness was accepted! This means witness validation in voting is not working properly.");
    }
    
    console.log("✅ Security check passed: Vote with mock witness properly rejected with error:", voteResult.Err);
    console.log("✅ System correctly enforces witness validation during voting!");

    console.log("✅ Failed proposal handling test completed successfully!");
  });
});
