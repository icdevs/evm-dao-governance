import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";
import { PocketIc, createIdentity } from '@dfinity/pic';
import type { Actor, CanisterFixture } from '@dfinity/pic';
import { spawn, ChildProcess } from 'child_process';
import { ethers, JsonRpcProvider, Wallet } from 'ethers';

// Runtime import: include the .js extension
import { idlFactory as mainIDLFactory, init as mainInit } from "../../src/declarations/main/main.did.js";
import { idlFactory as evmRpcIDLFactory, init as evmRpcInit } from "../../src/declarations/evm_rpc/evm_rpc.did.js";

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
let governanceTokenAddress: string;

const setupParallelRPCTest = async () => {
  console.log("=== Simple Parallel RPC Test Setup ===");
  
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
  
  const bytecode = "0x608060405234801561001057600080fd5b506040516107b53803806107b583398101604081905261002f9161007c565b60016000556002610040848261016a565b5060036100458382610164565b50600481905561005533826100565b505050610228565b6001600160a01b0382166100805760405162461bcd60e51b815260206004820152601860248201527f45524332303a206d696e7420746f207a65726f206164647265737300000000006044820152606401610075565b80600560008282546100929190610149565b90915550506001600160a01b038216600081815260066020908152604080832080548601905551848152600080516020610775833981519152910160405180910390a35050565b634e487b7160e01b600052604160045260246000fd5b600080600060608486031215610101576000806101b565b83518060208601518060408701518092508160408801518092508760408901511415806101015790506101015761012a565b919050565b6000821982111561014c5761014c610212565b500190565b60008261016057610160610199565b500490565b60008160001904831182151516156101af576101af610212565b500290565b8281526040602082015260006101cd6040830184610142565b949350505050565b6000816101e4576101e4610212565b506000190190565b6000826101fb576101fb610199565b500690565b6000828210156102125761021261020c565b500390565b634e487b7160e01b600052601160045260246000fd5b61053e806102376000396000f3fe608060405234801561001057600080fd5b50600436106100885760003560e01c80635a3b6c9b1161005b5780635a3b6c9b1461010a57806370a0823114610112578063a0712d6814610137578063dd62ed3e1461014c57600080fd5b8063095ea7b31461008d57806318160ddd146100b057806323b872dd146100c2578063313ce567146100d5565b600080fd5b6100a061009b366004610463565b610184565b60405190151581526020015b60405180910390f35b6005545b6040519081526020016100a7565b6100a06100d036600461042d565b61019a565b60126040516100a791906104dc565b6100b4610208565b6100b4610120366004610410565b6001600160a01b031660009081526006602052604090205490565b61014a61014536600461048f565b61021a565b005b6100b461015a366004610410565b6001600160a01b03918216600090815260076020908152604080832093909416825291909152205490565b6000610191338484610228565b50600192915050565b60006101a78484846102ec565b61015a84336101f385604051806060016040528060288152602001610507602891396001600160a01b038a16600090815260076020908152604080832033845290915290205491906104a7565b610228565b606060028054610217906104f0565b80601f0160208091040260200160405190810160405280929190818152602001828054610243906104f0565b80156102905780601f1061026557610100808354040283529160200191610290565b820191906000526020600020905b81548152906001019060200180831161027357829003601f168201915b5050505050905090565b6102258282604051806020016040528060008152506104e1565b50565b6001600160a01b03831661028a5760405162461bcd60e51b8152602060048201526024808201527f45524332303a20617070726f76652066726f6d20746865207a65726f206164646044820152637265737360e01b60648201526084015b60405180910390fd5b6001600160a01b0382166102eb5760405162461bcd60e51b815260206004820152602260248201527f45524332303a20617070726f766520746f20746865207a65726f206164647265604482015261737360f01b6064820152608401610281565b6001600160a01b0383811660008181526007602090815260408083209487168084529482529182902085905590518481527f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92591015b60405180910390a3505050565b6001600160a01b0383166103505760405162461bcd60e51b815260206004820152602560248201527f45524332303a207472616e736665722066726f6d20746865207a65726f206164604482015264647265737360d81b6064820152608401610281565b6001600160a01b0382166103b25760405162461bcd60e51b815260206004820152602360248201527f45524332303a207472616e7366657220746f20746865207a65726f206164647260448201526265737360e81b6064820152608401610281565b6103ef81604051806060016040528060268152602001610500602691396001600160a01b03861660009081526006602052604090205491906104a7565b6001600160a01b03808516600090815260066020526040808220939093559084168152205461041e90826104e1565b6001600160a01b038381166000818152600660205260409081902093909355915185811691861691600080516020610527833981519152906103df9086815260200190565b600060208284031215610422576000806000fd5b81356001600160a01b038116811461043957600080fd5b9392505050565b60008060006060848603121561044257600080fd5b83356001600160a01b038116811461045957600080fd5b925060208401356001600160a01b038116811461047557600080fd5b929592945050506040919091013590565b6000602082840312156104a157600080fd5b5035919050565b600081848411156104cb5760405162461bcd60e51b815260040161028191906104dc565b50600061042a84866104d4565b6000826104e6576104e661051b565b500490565b60208082526000906104ff9084018461048b565b949350505050565b600181811c9082168061051b57607f821691505b60208210811415610189575b50919050565b6000821982111561054e5761054e610531565b500190565b634e487b7160e01b600052601160045260246000fd5b634e487b7160e01b600052604160045260246000fd5b634e487b7160e01b600052601260045260246000fd5b634e487b7160e01b600052601160045260246000fd5b634e487b7160e01b600052602260045260246000fdfea264697066735822122068747470733a2f2f697066732e696f2f697066732f516d5a634a71375565575a5065654b51584e6a71594a6e7968425a62316136755032485234385a38524e59545564";
  
  const factory = new ethers.ContractFactory(abi, bytecode, deployer);
  const deployTx = await factory.deploy("GovernanceToken", "GOV", ethers.parseEther("1000000"));
  const deployedContract = await deployTx.waitForDeployment();
  governanceTokenAddress = await deployedContract.getAddress();
  
  console.log(`Governance token deployed at: ${governanceTokenAddress}`);

  // 3. Setup EVM RPC canister
  console.log("3. Setting up EVM RPC canister...");
  evm_fixture = await pic.setupCanister<evmRpcService>({
    idlFactory: evmRpcIDLFactory,
    wasm: EVM_RPC_WASM_PATH
  });
  console.log("EVM RPC canister deployed");

  // 4. Setup DAO Bridge canister  
  console.log("4. Setting up DAO Bridge canister...");
  main_fixture = await pic.setupCanister<mainService>({
    idlFactory: mainIDLFactory,
    wasm: MAIN_WASM_PATH
  });
  console.log("DAO Bridge canister deployed");
  
  console.log("=== Simple Parallel RPC Setup Complete ===");
};

describe("Simple Parallel RPC Test", () => {
  beforeEach(async () => {
    pic = await PocketIc.create(process.env.PIC_URL);
    await setupParallelRPCTest();
  });

  afterEach(async () => {
    if (anvil) {
      console.log("Stopping Anvil...");
      anvil.kill();
      anvil = null;
    }
    await pic?.tearDown();
  });

  it("should make 3 parallel RPC calls without hanging", async () => {
    console.log("=== Testing Simple Parallel RPC Calls ===");
    
    const contractAddress = governanceTokenAddress;
    console.log(`Calling test_parallel_rpc_calls with contract: ${contractAddress}`);
    
    // Call our test function that makes 3 parallel RPC calls
    const startTime = Date.now();
    
    try {
      const result = await (main_fixture.actor as any).test_parallel_rpc_calls(contractAddress);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`✅ Parallel RPC calls completed in ${duration}ms`);
      console.log("Result:", result);
      
      if ('Ok' in result) {
        const [blockNum1, totalSupply, blockNum3] = result.Ok;
        console.log(`📊 Results: Block1=${blockNum1}, TotalSupply=${totalSupply}, Block3=${blockNum3}`);
        
        // Basic validations
        expect(blockNum1).toBeGreaterThan(0);
        expect(blockNum3).toBeGreaterThanOrEqual(0);
        expect(totalSupply).toBeGreaterThan(0);
      } else {
        console.error("❌ Test failed:", result.Err);
        throw new Error(`Parallel RPC test failed: ${result.Err}`);
      }
      
      // Test should complete within reasonable time (2 minutes)
      expect(duration).toBeLessThan(120000);
      
    } catch (error) {
      console.error("❌ Parallel RPC test threw exception:", error);
      throw error;
    }
    
    console.log("✅ Simple parallel RPC test completed successfully!");
  }, 300000); // 5 minute timeout
});
