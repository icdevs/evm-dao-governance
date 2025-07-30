#!/usr/bin/env node

import { ethers } from 'ethers';

// Test the storage value conversion that's causing the issue
const testStorageValue = "0x00000000000000000000000000000000000000000000003635c9adc5dea00000";
console.log(`🔍 Testing storage value conversion`);
console.log(`Input: ${testStorageValue}`);
console.log(`Input length: ${testStorageValue.length} characters`);

try {
  const bytes = ethers.getBytes(testStorageValue);
  console.log(`✅ ethers.getBytes() result: ${bytes.length} bytes`);
  console.log(`Bytes array: [${Array.from(bytes).join(', ')}]`);
  console.log(`Back to hex: 0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`);
  
  // Test conversion back to BigInt
  const bigintValue = ethers.getBigInt(testStorageValue);
  console.log(`✅ BigInt value: ${bigintValue.toString()}`);
  console.log(`Human readable: ${ethers.formatUnits(bigintValue, 18)} tokens`);
  
} catch (error) {
  console.error(`❌ Error in conversion:`, error);
}

// Test if the issue is with padding
console.log(`\n🔧 Testing padding logic:`);
const rawValue = testStorageValue;
const paddedValue = rawValue.length % 2 === 0 ? rawValue : rawValue.replace('0x', '0x0');
console.log(`Raw: ${rawValue} (length: ${rawValue.length})`);
console.log(`Padded: ${paddedValue} (length: ${paddedValue.length})`);

// Test direct conversion
try {
  const directBytes = ethers.getBytes(paddedValue);
  console.log(`Direct conversion: ${directBytes.length} bytes`);
} catch (error) {
  console.error(`Direct conversion error:`, error);
}
