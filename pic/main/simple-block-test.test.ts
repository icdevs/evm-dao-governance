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
import { idlFactory as evmRpcIDLFactory } from "../../src/declarations/evm_rpc/evm_rpc.did.js";
import { IDL } from "@dfinity/candid";

// Type-only import: import types from the candid interface without the extension
import type { _SERVICE as mainService } from "../../src/declarations/main/main.did.js";
import type { _SERVICE as evmRpcService } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

const MAIN_WASM_PATH = ".dfx/local/canisters/main/main.wasm.gz";
const EVM_RPC_WASM_PATH = "./evm_rpc/evm_rpc.wasm.gz";

let pic: PocketIc;
let main_fixture: CanisterFixture<mainService>;
let evm_fixture: CanisterFixture<evmRpcService>;

const admin = createIdentity("admin");

let anvil: ChildProcess | null = null;
let provider: JsonRpcProvider;
let governanceToken: Contract;
let governanceTokenAddress: string;

// Load the GovernanceToken contract
const governanceTokenPath = path.join(process.cwd(), 'sample-tokens/packages/hardhat/artifacts/contracts/MockTokens.sol/GovernanceToken.json');
const governanceTokenArtifact = JSON.parse(fs.readFileSync(governanceTokenPath, 'utf8'));

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

const setupSimpleTest = async () => {
  console.log("=== Simple Block Test Setup ===");
  
  // Kill any existing Anvil processes
  await killExistingProcesses();
  
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
  
  // Deploy governance token using the artifact
  const factory = new ethers.ContractFactory(
    governanceTokenArtifact.abi,
    governanceTokenArtifact.bytecode,
    deployer
  );
  
  const deployedContract = await factory.deploy(deployer.address); // Only initialOwner parameter
  await deployedContract.waitForDeployment();
  governanceTokenAddress = await deployedContract.getAddress();
  
  // Create contract instance for interaction
  governanceToken = new ethers.Contract(
    governanceTokenAddress, 
    governanceTokenArtifact.abi, 
    deployer
  ) as Contract;
  
  console.log(`Governance token deployed at: ${governanceTokenAddress}`);

  console.log("3. Setting up canisters...");
  
  // Setup main canister with proper initialization (skip EVM RPC for now)
  main_fixture = await pic.setupCanister<mainService>({
    sender: admin.getPrincipal(),
    idlFactory: mainIDLFactory,
    wasm: MAIN_WASM_PATH,
    arg: IDL.encode(mainInit({IDL}), [[]])
  });
  console.log("Main canister deployed");
  
  console.log("=== Simple Block Test Setup Complete ===");
};

describe("Simple Block Test", () => {
  beforeEach(async () => {
    pic = await PocketIc.create(process.env.PIC_URL);
    await setupSimpleTest();
  });

  afterEach(async () => {
    if (anvil) {
      console.log("Stopping Anvil...");
      anvil.kill();
      anvil = null;
    }
    await pic?.tearDown();
  });

  it("should make 3 parallel block requests without hanging", async () => {
    console.log("=== Testing 3 Parallel Block Requests ===");
    
    // Use the actual governance token address
    console.log(`Calling test_parallel_rpc_calls with token address: ${governanceTokenAddress}`);
    
    const startTime = Date.now();
    
    try {
      const result = await (main_fixture.actor as any).test_parallel_rpc_calls(governanceTokenAddress);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`✅ Parallel block requests completed in ${duration}ms`);
      console.log("Result:", result);
      
      if ('Ok' in result) {
        const [latestBlock, block0, block1] = result.Ok;
        console.log(`📊 Results: LatestBlock=${latestBlock}, Block0=${block0}, Block1=${block1}`);
        
        // Basic validations - at least latest block should exist
        expect(latestBlock).toBeGreaterThanOrEqual(0);
        expect(block0).toBe(0); // Genesis block is always 0
        expect(block1).toBeGreaterThanOrEqual(0);
      } else {
        console.error("❌ Test failed:", result.Err);
        throw new Error(`Parallel block test failed: ${result.Err}`);
      }
      
      // Test should complete within reasonable time (2 minutes)
      expect(duration).toBeLessThan(120000);
      
    } catch (error) {
      console.error("❌ Parallel block test threw exception:", error);
      throw error;
    }
    
    console.log("✅ Simple parallel block test completed successfully!");
  }, 300000); // 5 minute timeout
});
