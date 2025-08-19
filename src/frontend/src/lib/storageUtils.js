import { ethers } from 'ethers';
import { get } from 'svelte/store';
import { provider, userAddress as userAddressStore } from './stores/wallet.js';
import { storageSlot } from './stores/canister.js';

// Generate storage key for ERC20 balance mapping
export function getERC20BalanceStorageKey(userAddress, slotIndex) {
    // Standard ERC20 balance mapping: mapping(address => uint256) balances
    // Storage key = keccak256(abi.encode(userAddress, slotIndex))
    const paddedAddress = ethers.zeroPadValue(userAddress, 32);
    const paddedSlot = ethers.zeroPadValue(`0x${slotIndex.toString(16)}`, 32);
    return ethers.keccak256(ethers.concat([paddedAddress, paddedSlot]));
}

// Get user's token balance
export async function getUserTokenBalance(contractAddress, userAddress = null, blockTag = 'latest') {
    const metamaskProvider = get(provider);
    const address = userAddress || get(userAddressStore);
    
    if (!metamaskProvider || !address) {
        return BigInt(0);
    }
    
    try {
        // ERC20 balanceOf function call: balanceOf(address)
        const balanceData = `0x70a08231${address.slice(2).padStart(64, '0')}`;
        const result = await metamaskProvider.send('eth_call', [
            {
                to: contractAddress,
                data: balanceData
            },
            blockTag
        ]);
        
        return ethers.getBigInt(result || '0x0');
    } catch (error) {
        console.error('Failed to get token balance:', error);
        return BigInt(0);
    }
}

// Discover storage slot for ERC20 balance mapping
export async function discoverStorageSlot(contractAddress, userAddress = null) {
    const metamaskProvider = get(provider);
    const address = userAddress || get(userAddressStore);
    
    if (!address) {
        throw new Error('User address not available');
    }
    
    // Get current balance via balanceOf call
    const actualBalance = await getUserTokenBalance(contractAddress, address);
    
    if (actualBalance === BigInt(0)) {
        throw new Error('User has 0 tokens. Storage slot discovery requires a non-zero balance.');
    }
    
    // Try common storage slots (0-10)
    for (let slot = 0; slot <= 10; slot++) {
        try {
            const storageKey = getERC20BalanceStorageKey(address, slot);
            const storageValue = await metamaskProvider.send('eth_getStorageAt', [
                contractAddress,
                storageKey,
                'latest'
            ]);
            
            const storageBalance = ethers.getBigInt(storageValue || '0x0');
            
            if (storageBalance === actualBalance) {
                storageSlot.set(slot);
                return slot;
            }
        } catch (error) {
            console.log(`Slot ${slot} check failed:`, error.message);
        }
    }
    
    throw new Error('Could not find storage slot in range 0-10. The contract may use a non-standard storage layout.');
}