#!/usr/bin/env node

import { ethers } from 'ethers';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the GovernanceToken contract
const governanceTokenPath = path.join(__dirname, '../../sample-tokens/packages/hardhat/artifacts/contracts/MockTokens.sol/GovernanceToken.json');
const governanceTokenArtifact = JSON.parse(fs.readFileSync(governanceTokenPath, 'utf8'));

let anvilProcess;
let provider;

// Helper function to calculate ERC20 storage key
function calculateERC20StorageKey(userAddress, slot) {
  // For Solidity mappings: keccak256(abi.encode(key, slot))
  const paddedAddr = ethers.zeroPadValue(ethers.getAddress(userAddress), 32);
  const paddedSlot = ethers.zeroPadValue(ethers.toBeHex(slot), 32);
  
  // Calculate storage key using ethers.keccak256
  const storageKey = ethers.keccak256(ethers.concat([paddedAddr, paddedSlot]));
  
  return storageKey;
}

// Helper function to get token balance via eth_call
async function getTokenBalanceViaCall(contractAddress, userAddress, blockNumber) {
  try {
    // ERC20 balanceOf function signature: balanceOf(address) returns (uint256)
    const balanceOfSelector = "0x70a08231"; // keccak256("balanceOf(address)").slice(0, 4)
    const paddedAddress = userAddress.toLowerCase().replace('0x', '').padStart(64, '0');
    const callData = balanceOfSelector + paddedAddress;
    
    const result = await provider.send("eth_call", [
      {
        to: contractAddress,
        data: callData
      },
      ethers.toQuantity(blockNumber)
    ]);
    
    return ethers.getBigInt(result || '0x0').toString();
  } catch (error) {
    console.error('Error calling balanceOf:', error);
    return '0';
  }
}

// Function to discover the correct storage slot
async function findCorrectStorageSlot(contractAddress, userAddress, blockNumber) {
  console.log(`\n🔍 STORAGE SLOT DISCOVERY`);
  console.log(`Contract: ${contractAddress}`);
  console.log(`User: ${userAddress}`);
  console.log(`Block: ${blockNumber}`);
  
  // First, get the actual balance using balanceOf method for comparison
  const actualBalance = await getTokenBalanceViaCall(contractAddress, userAddress, blockNumber);
  console.log(`🎯 Target balance (via eth_call): ${actualBalance} wei`);
  console.log(`🎯 Target balance (formatted): ${ethers.formatEther(actualBalance)} tokens`);
  
  if (actualBalance === '0') {
    console.log('⚠️ Actual balance is 0 - user has no tokens!');
    return null;
  }
  
  // Try common storage slots
  const slotsToTry = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  
  console.log(`\n📊 TESTING STORAGE SLOTS:`);
  for (const slot of slotsToTry) {
    try {
      console.log(`\n🔍 Testing slot ${slot}:`);
      
      const storageKey = calculateERC20StorageKey(userAddress, slot);
      console.log(`   Storage key: ${storageKey}`);
      
      const storageValue = await provider.getStorage(contractAddress, storageKey, blockNumber);
      const storageBalance = ethers.getBigInt(storageValue || '0x0').toString();
      
      console.log(`   Raw storage value: ${storageValue}`);
      console.log(`   Parsed balance: ${storageBalance} wei`);
      console.log(`   Formatted balance: ${ethers.formatEther(storageBalance)} tokens`);
      
      const matches = storageBalance === actualBalance;
      console.log(`   ✅ Match: ${matches ? 'YES' : 'NO'}`);
      
      if (matches) {
        console.log(`\n🎉 FOUND CORRECT SLOT: ${slot}`);
        return slot;
      }
    } catch (error) {
      console.log(`   ❌ Error testing slot ${slot}:`, error.message);
    }
  }
  
  console.log(`\n❌ Could not find correct storage slot after testing slots 0-10`);
  return null;
}

async function startAnvil() {
  console.log('🔥 Starting Anvil...');
  
  // Kill any existing Anvil processes
  try {
    execSync('pkill -f anvil', { stdio: 'ignore' });
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    // Ignore errors if no processes found
  }
  
  anvilProcess = spawn('anvil', [
    '--port', '8545',
    '--host', '0.0.0.0',
    '--accounts', '10',
    '--balance', '10000',
    '--block-time', '1'
  ]);

  anvilProcess.stdout?.on('data', (data) => {
    const output = data.toString().trim();
    if (output.includes('Listening on')) {
      console.log('✅ Anvil started successfully');
    }
  });

  anvilProcess.stderr?.on('data', (data) => {
    console.error(`⚠️ Anvil stderr: ${data.toString().trim()}`);
  });

  // Wait for Anvil to start
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Connect to Anvil
  provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  
  // Verify connection
  let retries = 0;
  while (retries < 10) {
    try {
      const blockNumber = await provider.getBlockNumber();
      console.log(`✅ Connected to Anvil, current block: ${blockNumber}`);
      break;
    } catch (error) {
      retries++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function deployTokenAndTest() {
  console.log('\n📦 DEPLOYING TOKEN CONTRACT');
  
  // Use the deployer account (account 0)
  const deployer = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
  console.log(`Deployer address: ${deployer.address}`);
  
  // Deploy the governance token
  const tokenFactory = new ethers.ContractFactory(
    governanceTokenArtifact.abi, 
    governanceTokenArtifact.bytecode, 
    deployer
  );
  
  console.log('Deploying token contract...');
  const deployedContract = await tokenFactory.deploy(deployer.address);
  await deployedContract.waitForDeployment();
  
  const contractAddress = await deployedContract.getAddress();
  console.log(`✅ Token deployed at: ${contractAddress}`);
  
  // Create test recipient (account 1)
  const recipient = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);
  console.log(`Recipient address: ${recipient.address}`);
  
  // Transfer tokens to recipient
  const transferAmount = ethers.parseEther("1000"); // 1000 tokens
  console.log(`\n💸 TRANSFERRING TOKENS`);
  console.log(`Amount: ${ethers.formatEther(transferAmount)} tokens`);
  console.log(`From: ${deployer.address}`);
  console.log(`To: ${recipient.address}`);
  
  const tokenContract = new ethers.Contract(contractAddress, governanceTokenArtifact.abi, deployer);
  const transferTx = await tokenContract['transfer'](recipient.address, transferAmount);
  await transferTx.wait();
  
  console.log(`✅ Transfer completed, tx hash: ${transferTx.hash}`);
  
  // Verify the transfer
  const recipientBalance = await tokenContract['balanceOf'](recipient.address);
  console.log(`✅ Recipient balance: ${ethers.formatEther(recipientBalance)} tokens`);
  
  // Get current block number for storage testing
  const currentBlock = await provider.getBlockNumber();
  console.log(`📦 Current block: ${currentBlock}`);
  
  // Now test storage slots
  const correctSlot = await findCorrectStorageSlot(contractAddress, recipient.address, currentBlock);
  
  if (correctSlot !== null) {
    console.log(`\n🎉 SUCCESS! The correct storage slot is: ${correctSlot}`);
    console.log(`\n📋 SUMMARY:`);
    console.log(`- Contract Address: ${contractAddress}`);
    console.log(`- User Address: ${recipient.address}`);
    console.log(`- Token Balance: ${ethers.formatEther(recipientBalance)} tokens`);
    console.log(`- Correct Storage Slot: ${correctSlot}`);
    
    // Test the storage key calculation
    const storageKey = calculateERC20StorageKey(recipient.address, correctSlot);
    const storageValue = await provider.getStorage(contractAddress, storageKey, currentBlock);
    console.log(`- Storage Key: ${storageKey}`);
    console.log(`- Storage Value: ${storageValue}`);
    console.log(`- Parsed Value: ${ethers.getBigInt(storageValue).toString()} wei`);
    
  } else {
    console.log(`\n❌ FAILED! Could not determine the correct storage slot.`);
    
    // Additional debugging - check contract bytecode and storage layout
    console.log(`\n🔍 ADDITIONAL DEBUGGING:`);
    const code = await provider.getCode(contractAddress);
    console.log(`Contract bytecode length: ${code.length} characters`);
    
    // Try to get some storage values directly
    for (let i = 0; i < 5; i++) {
      const rawSlotValue = await provider.getStorage(contractAddress, ethers.toBeHex(i, 32), currentBlock);
      console.log(`Raw slot ${i}: ${rawSlotValue}`);
    }
  }
}

async function cleanup() {
  if (anvilProcess) {
    console.log('\n🧹 Cleaning up...');
    anvilProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function main() {
  try {
    console.log('🚀 STORAGE SLOT VALIDATION SCRIPT');
    console.log('================================');
    
    await startAnvil();
    await deployTokenAndTest();
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanup().then(() => process.exit(1));
});

main().catch(console.error);
