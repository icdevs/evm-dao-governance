import { ethers } from 'ethers';

// Test address from the test output
const address1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // checksummed
const address2 = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"; // lowercase

console.log("Testing storage key calculation...");

function calculateERC20StorageKey(userAddress, slot = 0) {
  console.log(`\nInput address: ${userAddress}`);
  
  // Convert address to 20 bytes (standard Ethereum address size)
  const addressBytes = ethers.getBytes(userAddress);
  
  // Convert slot to 32 bytes
  const slotBytes = ethers.zeroPadValue(ethers.toBeHex(slot), 32);
  const slotBytesArray = ethers.getBytes(slotBytes);
  
  // Concatenate address bytes (20 bytes) + slot bytes (32 bytes) for abi.encodePacked
  const combinedBytes = new Uint8Array(addressBytes.length + slotBytesArray.length);
  combinedBytes.set(addressBytes, 0);
  combinedBytes.set(slotBytesArray, addressBytes.length);
  
  const storageKey = ethers.keccak256(combinedBytes);
  
  console.log(`Address bytes: ${ethers.hexlify(addressBytes)}`);
  console.log(`Slot bytes: ${ethers.hexlify(slotBytesArray)}`);
  console.log(`Combined: ${ethers.hexlify(combinedBytes)}`);
  console.log(`Storage Key: ${storageKey}`);
  
  return storageKey;
}

// Test both formats
console.log("=== Checksummed Address ===");
const key1 = calculateERC20StorageKey(address1);

console.log("\n=== Lowercase Address ===");
const key2 = calculateERC20StorageKey(address2);

console.log(`\nKeys match: ${key1 === key2}`);

// Also test with ethers.getAddress to normalize
console.log("\n=== Using ethers.getAddress normalization ===");
const normalizedAddress = ethers.getAddress(address1);
console.log(`Normalized address: ${normalizedAddress}`);
const key3 = calculateERC20StorageKey(normalizedAddress);

console.log(`Normalized key matches key1: ${key3 === key1}`);
console.log(`Normalized key matches key2: ${key3 === key2}`);
