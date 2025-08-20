import { ethers } from 'ethers';

// Generate storage key for ERC20 balance mapping
export function getERC20BalanceStorageKey(userAddress, slotIndex) {
    // Standard ERC20 balance mapping: mapping(address => uint256) balances
    // Storage key = keccak256(abi.encode(userAddress, slotIndex))
    const paddedAddress = ethers.zeroPadValue(userAddress, 32);
    const paddedSlot = ethers.zeroPadValue(`0x${slotIndex.toString(16).padStart(64, '0')}`, 32);
    return ethers.keccak256(ethers.concat([paddedAddress, paddedSlot]));
}

// Get user's token balance using provided dependencies
export async function getUserTokenBalance(provider, contractAddress, userAddress, blockTag = 'latest') {


    try {
        // ERC20 balanceOf function call: balanceOf(address)
        const balanceData = `0x70a08231${userAddress.slice(2).padStart(64, '0')}`;
        const result = await provider.send('eth_call', [
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
export async function discoverStorageSlot(provider, contractAddress, userAddress) {

    // Get current balance via balanceOf call
    const actualBalance = await getUserTokenBalance(provider, contractAddress, userAddress);

    if (actualBalance === BigInt(0)) {
        throw new Error('User has 0 tokens. Storage slot discovery requires a non-zero balance.');
    }

    // Try common storage slots (0-10)
    for (let slot = 0; slot <= 10; slot++) {
        try {
            const storageKey = getERC20BalanceStorageKey(userAddress, slot);
            const storageValue = await provider.send('eth_getStorageAt', [
                contractAddress,
                storageKey,
                'latest'
            ]);

            const storageBalance = ethers.getBigInt(storageValue || '0x0');

            if (storageBalance === actualBalance) {
                return slot;
            }
        } catch (error) {
            console.log(`Slot ${slot} check failed:`, error.message);
        }
    }

    throw new Error('Could not find storage slot in range 0-10. The contract may use a non-standard storage layout.');
}

// Validate that a storage slot contains the expected balance
export async function validateStorageSlot(provider, contractAddress, userAddress, slotIndex, expectedBalance, blockTag = "latest") {
    try {
        const storageKey = getERC20BalanceStorageKey(userAddress, slotIndex);
        const proof = await provider.send("eth_getProof", [
            contractAddress,
            [storageKey],
            blockTag
        ]);

        const storageValue = proof.storageProof[0]?.value || '0x0';
        const storageBalance = ethers.getBigInt(storageValue).toString();

        if (storageBalance === expectedBalance) {
            return {
                valid: true,
                storageBalance,
                expectedBalance,
                reason: `✅ SECURITY CHECK PASSED: Storage slot ${slotIndex} correctly contains balance ${expectedBalance}`
            };
        } else {
            return {
                valid: false,
                storageBalance,
                expectedBalance,
                reason: `❌ SECURITY CHECK FAILED: Storage slot ${slotIndex} contains ${storageBalance} but balanceOf() returns ${expectedBalance}. This indicates wrong slot or potential security issue.`
            };
        }
    } catch (error) {
        return {
            valid: false,
            storageBalance: 'ERROR',
            expectedBalance,
            reason: `❌ SECURITY CHECK ERROR: Failed to validate storage slot: ${error.message}`
        };
    }
}
