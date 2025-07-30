#!/usr/bin/env node

import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
const contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

// Check balance of the target address
async function checkBalance(address, label) {
    try {
        const balanceData = `0x70a08231${address.slice(2).padStart(64, '0')}`;
        const result = await provider.send('eth_call', [
            {
                to: contractAddress,
                data: balanceData
            },
            'latest'
        ]);
        
        const balance = ethers.getBigInt(result || '0x0');
        console.log(`${label}: ${ethers.formatEther(balance)} tokens`);
        return balance;
    } catch (error) {
        console.error(`Error checking ${label}:`, error.message);
        return BigInt(0);
    }
}

// Check ETH balances too
async function checkEthBalance(address, label) {
    try {
        const balance = await provider.getBalance(address);
        console.log(`${label} ETH: ${ethers.formatEther(balance)} ETH`);
    } catch (error) {
        console.error(`Error checking ETH for ${label}:`, error.message);
    }
}

console.log('🔍 Checking token balances on contract:', contractAddress);
console.log('');

// Check the addresses
await checkBalance('0x4A7C969110f7358bF334b49A2FF1a2585ac372B8', 'Target Address (from script)');
await checkBalance('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 'First Anvil Account (signer)');
await checkBalance('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'Second Anvil Account');

console.log('');
console.log('🔍 ETH balances:');
await checkEthBalance('0x4A7C969110f7358bF334b49A2FF1a2585ac372B8', 'Target Address (from script)');
await checkEthBalance('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 'First Anvil Account (signer)');
await checkEthBalance('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'Second Anvil Account');
