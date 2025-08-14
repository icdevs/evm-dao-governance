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
    
    // Set contract code (proper ERC20 with balanceOf function)
    const erc20Bytecode = "0x608060405234801561001057600080fd5b50336000526000602052604060002068056bc75e2d630eb20000905561025a806100396000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c806370a082311461003b5780636aa3f44a14610057575b600080fd5b61005560048036038101906100509190610145565b610073565b005b610071600480360381019061006c9190610145565b6100a3565b005b806000808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000208190555050565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b600061010a826100df565b9050919050565b61011a816100ff565b811461012557600080fd5b50565b60008135905061013781610111565b92915050565b6000819050919050565b61015081610143565b811461015b57600080fd5b50565b60008135905061016d81610147565b92915050565b6000806040838503121561018a576101896100da565b5b600061019885828601610128565b92505060206101a98582860161015e565b915050929150505056fea2646970667358221220c4a7e4e8c4a7e4e8c4a7e4e8c4a7e4e8c4a7e4e8c4a7e4e8c4a7e4e8c4a7e4e864736f6c63430008070033";
    await provider.send("anvil_setCode", [contractAddress, erc20Bytecode]);
    
    // Set balance directly in storage slot 0 (standard ERC20 _balances mapping)
    // Calculate storage key for the test user's balance using Solidity mapping encoding
    // For mapping(address => uint256): storage key = keccak256(abi.encode(address, slot))
    const addressPadded = ethers.zeroPadValue(testAddress, 32); // Pad address to 32 bytes
    const slotPadded = ethers.zeroPadValue("0x00", 32); // slot 0, padded to 32 bytes
    const storageKey = ethers.keccak256(
      ethers.concat([
        addressPadded,  // 32 bytes - properly padded address
        slotPadded      // 32 bytes - slot number
      ])
    );
    
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
