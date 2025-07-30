#!/usr/bin/env node

import { ethers } from 'ethers';

// Quick test to find the correct storage slot for OpenZeppelin ERC20
async function findStorageSlot() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  
  // Start Anvil first
  console.log('🔥 Make sure Anvil is running...');
  
  try {
    const currentBlock = await provider.getBlockNumber();
    console.log(`✅ Connected to Anvil, block: ${currentBlock}`);
  } catch (error) {
    console.log('❌ Anvil not running. Please start Anvil first.');
    process.exit(1);
  }
  
  // Deploy a simple OpenZeppelin ERC20 contract for testing
  const deployer = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
  
  // Simple ERC20 bytecode (minimal OpenZeppelin-style contract)
  const contractBytecode = '0x608060405234801561001057600080fd5b506040516103e83803806103e883398101604081905261002f91610054565b600080546001600160a01b0319166001600160a01b0392909216919091179055610084565b60006020828403121561006657600080fd5b81516001600160a01b038116811461007d57600080fd5b9392505050565b610355806100936000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c8063095ea7b31461004657806370a0823114610073578063a9059cbb146100a9575b600080fd5b6100596100543660046102e1565b6100bc565b604051901515815260200160405180910390f35b61009b61008136600461030b565b6001600160a01b031660009081526001602052604090205490565b60405190815260200160405180910390f35b6100596100b73660046102e1565b6100d6565b6000336100ca8185856101a3565b60019150505b92915050565b60006100e38484846101c7565b61019984336101948560405180606001604052806028815260200161032d602891396001600160a01b038a1660009081526002602090815260408083203384529091529020549190610267565b6101a3565b5060019392505050565b6001600160a01b038316600090815260026020908152604080832093851683529290522081905550505050565b6001600160a01b03831660009081526001602052604090205481111561022c5760405162461bcd60e51b815260206004820152601a60248201527f5472616e7366657220616d6f756e7420657863656564732062616c000000000060448201526064015b60405180910390fd5b6001600160a01b038316600090815260016020526040812080548392906102549084906102aa565b90915550506001600160a01b03821660009081526001602052604081208054839290610281908490610292565b909155505060405181815260009060009051908152602001a1505050565b808201808211156100d0576100d06102c1565b818103818111156100d0576100d06102c1565b634e487b7160e01b600052601160045260246000fd5b80356001600160a01b03811681146102dc57600080fd5b919050565b600080604083850312156102f457600080fd5b6102fd836102d7565b946020939093013593505050565b60006020828403121561031d57600080fd5b610326826102d7565b9392505050565b6000825160005b8181101561034e5760208186018101518583015201610334565b50600092019182525091905056fea2646970667358221220'; // This would be a real OpenZeppelin ERC20 bytecode
  
  console.log('Deploying test ERC20 contract...');
  
  // Use the governance token from the test instead
  const contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3'; // From test logs
  const userAddress = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'; // Voter 2 from test logs
  const blockNumber = 73; // From test logs
  
  const blockTag = `0x${blockNumber.toString(16)}`;
  
  console.log(`🔍 Testing storage slots for:`);
  console.log(`  Contract: ${contractAddress}`);
  console.log(`  User: ${userAddress}`);
  console.log(`  Block: ${blockTag} (${blockNumber})`);
  
  // Get expected balance via eth_call
  const balanceOfData = "0x70a08231" + userAddress.substring(2).padStart(64, '0');
  const directBalance = await provider.send("eth_call", [
    { to: contractAddress, data: balanceOfData },
    blockTag
  ]);
  const expectedBalance = ethers.getBigInt(directBalance || '0x0');
  console.log(`  Expected balance: ${expectedBalance.toString()} wei (${ethers.formatEther(expectedBalance)} tokens)`);
  
  // Test storage slots 0-10
  for (let slot = 0; slot <= 10; slot++) {
    const addressBytes = ethers.getBytes(userAddress);
    const slotBytes = ethers.zeroPadValue(ethers.toBeHex(slot), 32);
    const combined = new Uint8Array(addressBytes.length + ethers.getBytes(slotBytes).length);
    combined.set(addressBytes, 0);
    combined.set(ethers.getBytes(slotBytes), addressBytes.length);
    const storageKey = ethers.keccak256(combined);
    
    try {
      const proof = await provider.send("eth_getProof", [
        contractAddress,
        [storageKey],
        blockTag
      ]);
      
      const storageValue = proof.storageProof[0]?.value || '0x0';
      const storageBalance = ethers.getBigInt(storageValue);
      
      console.log(`  Slot ${slot}: ${storageValue} = ${storageBalance.toString()} wei`);
      
      if (storageBalance === expectedBalance && storageBalance > 0n) {
        console.log(`🎯 FOUND CORRECT SLOT: ${slot}`);
        console.log(`   Storage key: ${storageKey}`);
        console.log(`   Storage value: ${storageValue}`);
        console.log(`   Balance: ${ethers.formatEther(storageBalance)} tokens`);
        break;
      }
    } catch (error) {
      console.log(`  Slot ${slot}: Error - ${error.message}`);
    }
  }
}

findStorageSlot().catch(console.error);
