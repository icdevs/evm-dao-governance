import { ethers } from "hardhat";
import { JsonRpcProvider } from "ethers";

async function main() {
  console.log("Testing eth_getProof functionality with Anvil...");
  
  const provider = new JsonRpcProvider("http://127.0.0.1:8545");
  
  // Deploy a simple ERC-20 contract
  const [deployer, user1, user2] = await ethers.getSigners();
  
  console.log("Deploying MockUSDC contract...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);
  
  // Mint some tokens to user1
  const mintAmount = ethers.parseUnits("1000", 6); // 1000 USDC
  await usdc.mintTo(user1.address, mintAmount);
  
  console.log(`Minted ${ethers.formatUnits(mintAmount, 6)} USDC to ${user1.address}`);
  
  // Get the current block number
  const blockNumber = await provider.getBlockNumber();
  console.log("Current block number:", blockNumber);
  
  // Calculate the storage slot for the balance mapping
  // For most ERC-20 contracts, balances are stored in slot 0
  // The storage key is keccak256(abi.encode(address, slot))
  const balanceSlot = 0; // This might need to be adjusted based on the contract
  const storageKey = ethers.solidityPackedKeccak256(
    ["uint256", "uint256"],
    [user1.address, balanceSlot]
  );
  
  console.log("Storage key for user1 balance:", storageKey);
  
  try {
    // Test eth_getProof - this is the key functionality we need
    const proof = await provider.send("eth_getProof", [
      usdcAddress,
      [storageKey],
      `0x${blockNumber.toString(16)}`
    ]);
    
    console.log("eth_getProof successful!");
    console.log("Account proof length:", proof.accountProof.length);
    console.log("Storage proof length:", proof.storageProof.length);
    console.log("Account nonce:", proof.nonce);
    console.log("Account balance:", proof.balance);
    console.log("Account codeHash:", proof.codeHash);
    console.log("Account storageHash:", proof.storageHash);
    
    if (proof.storageProof && proof.storageProof.length > 0) {
      console.log("Storage proof for balance:");
      console.log("  Key:", proof.storageProof[0].key);
      console.log("  Value:", proof.storageProof[0].value);
      console.log("  Proof nodes:", proof.storageProof[0].proof.length);
      
      // Verify the storage value matches the expected balance
      const expectedBalance = mintAmount.toString();
      const actualBalance = BigInt(proof.storageProof[0].value).toString();
      
      console.log("Expected balance:", expectedBalance);
      console.log("Actual balance from proof:", actualBalance);
      
      if (expectedBalance === actualBalance) {
        console.log("✅ Storage proof balance matches expected value!");
      } else {
        console.log("❌ Storage proof balance doesn't match expected value");
      }
    }
    
    // Return the proof structure for testing
    return {
      blockHash: await provider.getBlock(blockNumber).then(block => block?.hash || ""),
      blockNumber: blockNumber,
      userAddress: user1.address,
      contractAddress: usdcAddress,
      storageKey: storageKey,
      storageValue: proof.storageProof[0]?.value || "0x0",
      accountProof: proof.accountProof,
      storageProof: proof.storageProof[0]?.proof || []
    };
    
  } catch (error) {
    console.error("eth_getProof failed:", error);
    throw error;
  }
}

// Allow script to be run directly or imported
if (require.main === module) {
  main()
    .then((result) => {
      console.log("Test completed successfully!");
      console.log("Proof structure:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { main as testEthGetProof };
