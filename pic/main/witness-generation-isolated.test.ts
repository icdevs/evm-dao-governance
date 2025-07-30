import { spawn, ChildProcess } from 'child_process';
import { execSync } from 'child_process';
import { ethers, JsonRpcProvider } from 'ethers';
import { generateTokenBalanceWitness } from './witness-generator';

describe("Witness Generation Test", () => {
  let anvilProcess: ChildProcess | null = null;
  let provider: JsonRpcProvider;
  let governanceToken: any;

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

  beforeAll(async () => {
    console.log("🚀 Starting Anvil for witness generation test...");
    
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

    // Give Anvil time to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Connect to Anvil
    provider = new JsonRpcProvider('http://127.0.0.1:8545');
    
    // Wait for blockchain to be ready
    let retries = 0;
    while (retries < 20) {
      try {
        const blockNumber = await provider.getBlockNumber();
        console.log(`✅ Anvil ready at block ${blockNumber}`);
        break;
      } catch (error) {
        retries++;
        console.log(`⏳ Waiting for Anvil... attempt ${retries}/20`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (retries >= 20) {
      throw new Error('Anvil failed to start after 20 attempts');
    }

    // Deploy a simple test contract and set up storage for testing
    console.log("📝 Setting up test environment...");
    const deployer = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    
    // Use a deterministic contract address for testing
    const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
    const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // User #1 from Anvil
    
    // Set contract code (minimal ERC20-like)
    await provider.send("anvil_setCode", [contractAddress, "0x6080604052348015600f57600080fd5b506004361060285760003560e01c806370a0823114602d575b600080fd5b60436004803603810190603f9190605c565b6049565b60405160509190607a565b60405180910390f35b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b600060aa8260008401111560b857600080fd5b50919050565b60c48160008401111560d257600080fd5b50919050565b600060da8260008401111560e857600080fd5b50919050565b600080fd5b6000819050919050565b60ff8160008401111561010d57600080fd5b50919050565b61011681610100565b811461012157600080fd5b50565b600081359050610133816110d7565b92915050565b60006020828403121561014b5761014a60eb565b5b600061015984828501610124565b9150509291505056fea2646970667358221220e5b6a5e5e5b6a5e5e5b6a5e5e5b6a5e5e5b6a5e5e5b6a5e5e5b6a5e5e5b6a5e564736f6c63430008070033"]);
    
    // Set balance directly in storage slot 0 (standard ERC20 _balances mapping)
    // Calculate storage key for the test user's balance using same method as witness generator
    const userAddressBytes = ethers.getBytes(testAddress);
    const slotBytes = ethers.zeroPadValue(ethers.toBeHex(0), 32); // slot 0 
    const combinedBytes = new Uint8Array(userAddressBytes.length + ethers.getBytes(slotBytes).length);
    combinedBytes.set(userAddressBytes, 0);
    combinedBytes.set(ethers.getBytes(slotBytes), userAddressBytes.length);
    const storageKey = ethers.keccak256(combinedBytes);
    
    // Set the user's balance to 5000 tokens (with 18 decimals)
    const balanceValue = ethers.toBeHex(ethers.parseUnits("5000", 18), 32);
    await provider.send("anvil_setStorageAt", [contractAddress, storageKey, balanceValue]);
    
    console.log(`Test token address: ${contractAddress}`);
    console.log(`Test user address: ${testAddress}`);
    console.log(`Storage key: ${storageKey}`);
    console.log(`Balance value: ${balanceValue}`);
    
    // Verify the storage was set correctly
    const storedValue = await provider.send("eth_getStorageAt", [contractAddress, storageKey, "latest"]);
    console.log(`Stored value: ${storedValue}`);
    console.log(`Expected balance: ${ethers.formatUnits(ethers.getBigInt(storedValue), 18)} tokens`);
    
    // Store the addresses for the test
    (global as any).testTokenAddress = contractAddress;
    (global as any).testUserAddress = testAddress;
  });

  afterAll(async () => {
    if (anvilProcess) {
      console.log("🛑 Stopping Anvil...");
      anvilProcess.kill();
    }
    await killExistingProcesses();
  });

  it("should generate a real witness using eth_getProof", async () => {
    console.log("🔍 Testing real witness generation...");
    
    const contractAddress = (global as any).testTokenAddress;
    const userAddress = (global as any).testUserAddress;
    
    // Get current block number
    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);
    
    try {
      // Test our witness generation
      const witness = await generateTokenBalanceWitness(
        contractAddress,
        userAddress,
        currentBlock
      );
      
      console.log("✅ Witness generated successfully!");
      console.log(`Block: ${witness.blockNumber}`);
      console.log(`Account proof entries: ${witness.accountProof.length}`);
      console.log(`Storage proof entries: ${witness.storageProof.length}`);
      console.log(`Storage value length: ${witness.storageValue.length} bytes`);
      
      // Basic validation
      expect(witness.blockNumber).toBeGreaterThan(0n);
      expect(witness.blockHash.length).toBe(32);
      expect(witness.userAddress.length).toBe(20);
      expect(witness.contractAddress.length).toBe(20);
      expect(witness.storageKey.length).toBe(32);
      
      // Check that we have actual proof data (not empty arrays)
      expect(witness.accountProof.length).toBeGreaterThan(0);
      expect(witness.storageProof.length).toBeGreaterThan(0);
      
      console.log("🎯 All witness validation checks passed!");
      
    } catch (error) {
      console.error("❌ Witness generation failed:", error);
      throw error;
    }
  }, 30000); // 30 second timeout
});
