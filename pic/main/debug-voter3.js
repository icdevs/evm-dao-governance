#!/usr/bin/env node

import { ethers } from 'ethers';

// Test the private key to address mapping
const privateKey = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
const wallet = new ethers.Wallet(privateKey);

console.log(`🔍 Voter 3 Address Verification:`);
console.log(`Private key: ${privateKey}`);
console.log(`Computed address: ${wallet.address}`);
console.log(`Expected from Anvil: 0x90F79bf6EB2c4f870365E785982E1f101E93b906`);
console.log(`Addresses match: ${wallet.address.toLowerCase() === "0x90F79bf6EB2c4f870365E785982E1f101E93b906".toLowerCase()}`);

// Test storage key calculation for this address
const slot = 0;
const userAddress = wallet.address;

// Standard Solidity mapping: mapping(address => uint256) balances;
// Storage key = keccak256(abi.encode(address, slot))
console.log(`\n🔑 Storage Key Calculation:`);
console.log(`User address: ${userAddress}`);
console.log(`Storage slot: ${slot}`);

// Convert address to bytes and slot to 32 bytes
const addressBytes = ethers.getBytes(userAddress);
const slotBytes = ethers.zeroPadValue(ethers.toBeHex(slot), 32);

// Concatenate for keccak256
const combined = new Uint8Array(addressBytes.length + ethers.getBytes(slotBytes).length);
combined.set(addressBytes, 0);
combined.set(ethers.getBytes(slotBytes), addressBytes.length);

const storageKey = ethers.keccak256(combined);
console.log(`Storage key: ${storageKey}`);
