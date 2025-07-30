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

const MAIN_WASM_PATH = ".dfx/local/canisters/main/main.wasm.gz";
const EVM_RPC_WASM_PATH = "./evm_rpc/evm_rpc.wasm.gz";

let pic: PocketIc;
let main_fixture: CanisterFixture<mainService>;
let evm_fixture: CanisterFixture<evmRpcService>;

const admin = createIdentity("admin");
const alice = createIdentity("alice");

interface TestVoter {
  identity: any;
  wallet: Wallet;
  address: string;
  tokenBalance: bigint;
}

let anvil: ChildProcess | null = null;
let provider: JsonRpcProvider;
let governanceToken: Contract;
let testVoters: TestVoter[] = [];

const setupMinimal = async () => {
  console.log("=== Parallel RPC Test Setup ===");
  
  // 1. Start Anvil
  console.log("1. Starting Anvil...");
  anvil = spawn('anvil', ['--host', '127.0.0.1', '--port', '8545', '--chain-id', '31337'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  if (!anvil.stdout || !anvil.stderr) {
    throw new Error("Failed to get anvil stdout/stderr");
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Anvil failed to start within 10 seconds"));
    }, 10000);

    anvil!.stdout!.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Listening on')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    anvil!.stderr!.on('data', (data) => {
      console.error('Anvil stderr:', data.toString());
    });

    anvil!.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  // 2. Setup provider and deploy governance token
  provider = new JsonRpcProvider("http://127.0.0.1:8545");
  
  console.log("2. Deploying governance token...");
  const deployer = new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
  
  const abi = [
    "constructor(string memory name, string memory symbol, uint256 totalSupply)",
    "function balanceOf(address owner) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function mint(address to, uint256 amount)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
  ];
  
  const factory = new ethers.ContractFactory(abi, bytecode, deployer);
  governanceToken = await factory.deploy("GovernanceToken", "GOV", ethers.parseEther("1000000"));
  
  console.log(`Governance token deployed at: ${await governanceToken.getAddress()}`);

  // 3. Setup EVM RPC canister
  console.log("3. Setting up EVM RPC canister...");
  evm_fixture = await pic.setupCanister<evmRpcService>({
    idlFactory: evmRpcIDLFactory,
    wasm: EVM_RPC_WASM_PATH,
    init: evmRpcInit({}),
  });
  console.log("EVM RPC canister deployed");

  // 4. Setup DAO Bridge canister
  console.log("4. Setting up DAO Bridge canister...");
  main_fixture = await pic.setupCanister<mainService>({
    idlFactory: mainIDLFactory,
    wasm: MAIN_WASM_PATH,
    init: mainInit({
      admin_principal: admin.getPrincipal(),
      eth_network: {
        chain_id: 31337n,
        network_name: "local"
      },
      rpc_service: {
        rpc_type: "custom",
        canister_id: evm_fixture.canisterId,
        custom_config: [["url", "http://127.0.0.1:8545"]]
      },
      proposal_duration_days: 7n
    })
  });
  console.log("DAO Bridge canister deployed");

  // 5. Setup test voters
  console.log("5. Setting up test voters...");
  const aliceWallet = new Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);
  const aliceBalance = ethers.parseEther("100000");
  await governanceToken.mint(aliceWallet.address, aliceBalance);
  
  testVoters = [
    {
      identity: alice,
      wallet: aliceWallet,
      address: aliceWallet.address,
      tokenBalance: aliceBalance
    }
  ];
  
  console.log("=== Parallel RPC Setup Complete ===");
};

/**
 * This helper processes RPC calls in rounds and logs detailed information
 * about each RPC call to help debug parallel RPC issues
 */
async function processRPCCalls(intervalMs: number = 100, maxRounds: number = 300) {
  console.log(`🔄 Starting RPC processing (${maxRounds} rounds, ${intervalMs}ms intervals)`);
  
  for (let round = 1; round <= maxRounds; round++) {
    console.log(`📞 Round ${round}/${maxRounds}: Processing RPC calls...`);
    
    try {
      // Advance PIC time to process any pending calls
      await pic.advanceTime(intervalMs);
      await pic.tick();
      
      // Check if we can make test RPC calls to see the system status
      if (round % 10 === 0) { // Every 10 rounds, test RPC connectivity
        console.log(`🧪 Round ${round}: Testing RPC connectivity...`);
        try {
          const blockNumber = await provider.getBlockNumber();
          const totalSupply = await governanceToken.totalSupply();
          console.log(`✅ Round ${round}: RPC OK - Block: ${blockNumber}, Supply: ${totalSupply}`);
        } catch (rpcError) {
          console.log(`⚠️ Round ${round}: RPC Error - ${rpcError.message}`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error) {
      console.log(`❌ Round ${round}: Processing error - ${error.message}`);
    }
  }
  
  console.log("🏁 RPC processing completed");
}

/**
 * Test that specifically triggers multiple parallel RPC calls
 * This should reproduce the hanging issue we've been seeing
 */
async function executeParallelRPCTest<T>(
  operation: () => Promise<T>,
  operationName: string,
  timeoutMs: number = 120000
): Promise<T> {
  console.log(`🚀 Starting parallel RPC test: ${operationName}`);
  
  // Start RPC processing in the background
  const rpcProcessing = processRPCCalls(50, 600); // 30 seconds of processing
  
  const operationPromise = (async () => {
    try {
      console.log(`⏳ Executing ${operationName}...`);
      const result = await operation();
      console.log(`✅ ${operationName} completed successfully`);
      return result;
    } catch (error) {
      console.log(`❌ ${operationName} failed: ${error.message}`);
      throw error;
    }
  })();
  
  // Race between the operation and timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([operationPromise, timeoutPromise]);
    console.log(`🎉 ${operationName} completed before timeout`);
    return result;
  } finally {
    // Ensure RPC processing stops
    console.log("🛑 Stopping RPC processing...");
  }
}

describe("Parallel RPC Test - Reproduce Hanging Issue", () => {
  beforeEach(async () => {
    pic = await PocketIc.create(process.env.PIC_URL);
    await setupMinimal();
  });

  afterEach(async () => {
    if (anvil) {
      console.log("Stopping Anvil...");
      anvil.kill();
      anvil = null;
    }
    await pic?.tearDown();
  });

  it("should trigger parallel RPC calls that cause hanging", async () => {
    console.log("=== Testing Parallel RPC Calls ===");
    
    // First, add admin and configure snapshot contract
    await executeParallelRPCTest(async () => {
      const adminResult = await main_fixture.actor.icrc149_update_admin_principal(
        admin.getPrincipal(),
        admin.getPrincipal(),
        true
      );
      expect(adminResult).toEqual({ Ok: null });
      
      const contractConfig = {
        chain: { chain_id: 31337n, network_name: "local" },
        rpc_service: {
          rpc_type: "custom",
          canister_id: evm_fixture.canisterId,
          custom_config: [["url", "http://127.0.0.1:8545"]]
        },
        witness_generators: [{
          canister_id: main_fixture.canisterId,
          method_name: "generateTokenBalanceWitness"
        }]
      };
      
      const configResult = await main_fixture.actor.icrc149_update_snapshot_contract_config(
        admin.getPrincipal(),
        await governanceToken.getAddress(),
        [contractConfig]
      );
      expect(configResult).toEqual({ Ok: null });
      return "Admin and config setup completed";
    }, "Setup admin and snapshot config", 60000);

    // Now create a proposal that will trigger multiple RPC calls
    await executeParallelRPCTest(async () => {
      console.log("🎯 Creating proposal that triggers parallel RPC calls...");
      
      const voterAddress = testVoters[0].address;
      const contractAddress = await governanceToken.getAddress();
      const currentTime = Math.floor(Date.now() / 1000);
      const expirationTime = currentTime + 600; // 10 minutes from now
      
      // Create SIWE message for proposal creation
      const siweMessage = `local wants you to sign in with your Ethereum account:
${voterAddress}

Create proposal for contract ${contractAddress}

URI: https://local
Version: 1
Chain ID: 31337
Nonce: ${Date.now()}
Issued At: ${new Date(currentTime * 1000).toISOString()}
Issued At Nanos: ${currentTime * 1_000_000_000}
Expiration Time: ${new Date(expirationTime * 1000).toISOString()}
Expiration Nanos: ${expirationTime * 1_000_000_000}`;

      // Sign the SIWE message
      const messageBytes = ethers.toUtf8Bytes(siweMessage);
      const messageHash = ethers.keccak256(messageBytes);
      const signature = await testVoters[0].wallet.signMessage(ethers.getBytes(messageHash));
      const sigBytes = ethers.getBytes(signature);
      
      const siweProof = {
        message: siweMessage,
        signature: Array.from(sigBytes)
      };

      // Create proposal with EthTransaction that will require multiple RPC calls
      const transferAmount = ethers.parseEther("1000");
      const transferData = governanceToken.interface.encodeFunctionData("transfer", [
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // bob's address
        transferAmount
      ]);

      const proposalRequest = {
        action: {
          EthTransaction: {
            chain: { chain_id: 31337n, network_name: "local" },
            to: contractAddress,
            value: 0n,
            data: Array.from(ethers.getBytes(transferData)),
            gasLimit: 100000n,
            maxFeePerGas: ethers.parseUnits("20", "gwei"),
            maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
            subaccount: []
          }
        },
        siwe: siweProof,
        metadata: [],
        snapshot_contract: [contractAddress]
      };

      // This should trigger multiple parallel RPC calls:
      // 1. SIWE verification (bypassed but still processes)
      // 2. Snapshot generation (getLatestFinalizedBlock + getTotalSupply)
      // 3. Proposal validation and creation
      console.log("📡 Making proposal creation call that triggers parallel RPCs...");
      const result = await main_fixture.actor.icrc149_create_proposal(
        testVoters[0].identity.getPrincipal(),
        proposalRequest
      );
      
      console.log("🎯 Proposal creation result:", result);
      
      if ('Err' in result) {
        throw new Error(`Proposal creation failed: ${result.Err}`);
      }
      
      return result.Ok;
    }, "Create proposal with parallel RPC calls", 180000); // 3 minutes timeout

    console.log("✅ Parallel RPC test completed successfully!");
  }, 600000); // 10 minute timeout for entire test
});
