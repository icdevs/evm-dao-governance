// STORAGE SLOT VARIANCE ANALYSIS - Refactored to eliminate get() usage
// Real examples of ERC20 contracts with different balance storage slots

import { ethers } from 'ethers';

/*
=== STORAGE SLOT VARIANCE EXAMPLES ===

1. **Standard ERC20 (OpenZeppelin)**
   - Slot 0: balances mapping
   - Example: Many simple tokens

2. **USDC (Proxy Pattern)**
   - Slot 9: balances mapping (due to proxy variables taking slots 0-8)
   - Slots 0-8: Proxy implementation variables
   
3. **USDT (Tether)**
   - Slot 1: balances mapping
   - Slot 0: Other state variables
   
4. **Compound cTokens**
   - Slot 14: accountTokens mapping (balance)
   - Slots 0-13: Various protocol variables

5. **Aave aTokens**
   - Slot 51: _userState mapping (contains scaled balance)
   - Many slots before for protocol state

6. **Upgradeable Tokens (EIP-1967)**
   - Balance slot varies: 1, 2, 9, 10+ depending on implementation
   - Slots 0-X: Implementation-specific variables

=== ATTACK SCENARIOS ===

Scenario 1: "Vote Inflation Attack"
- User has 100 USDC (slot 9)
- Attacker finds slot 15 contains value 1000000 (some other variable)
- Claims slot 15 is the balance slot
- System gives user 1,000,000 votes instead of 100!

Scenario 2: "Wrong Token Attack"  
- User has 0 of Token A
- User has 1000 of Token B (same contract, different slot)
- Attacker claims Token B slot is Token A balance
- User gets 1000 votes for Token A despite having 0!

Scenario 3: "Historical Balance Attack"
- Current balance: 100 (slot 9)
- Old balance storage: 10000 (slot 8, from old implementation)
- Attacker uses old slot to claim inflated balance

=== MITIGATION STRATEGIES ===
*/

// SECURE: Hardcoded slot mappings for known contracts
const VERIFIED_STORAGE_SLOTS = {
  // Ethereum Mainnet
  '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a': { slot: 0, name: 'USDC', verified: true },
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': { slot: 1, name: 'USDT', verified: true },
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': { slot: 3, name: 'WETH', verified: true },

  // Arbitrum One  
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { slot: 9, name: 'USDC', verified: true },
  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': { slot: 1, name: 'USDT', verified: true },

  // Add more as verified...
};

// SECURE: Multi-point validation function
export async function validateBalanceSlotSecurity(provider, contractAddress, userAddress, claimedSlot) {
  if (!provider) {
    throw new Error('Provider not available. Please connect your wallet.');
  }

  const results = {
    securityLevel: 'UNKNOWN',
    warnings: [],
    validations: {}
  };

  // 1. Check if contract is in verified list
  const verified = VERIFIED_STORAGE_SLOTS[contractAddress.toLowerCase()];
  if (verified) {
    if (verified.slot === claimedSlot) {
      results.securityLevel = 'SECURE';
      results.validations.verifiedContract = `✅ Contract ${verified.name} verified with slot ${claimedSlot}`;
    } else {
      results.securityLevel = 'DANGEROUS';
      results.warnings.push(`❌ SECURITY ALERT: ${verified.name} verified slot is ${verified.slot}, not ${claimedSlot}!`);
    }
  }

  // 2. Cross-validate with balanceOf() 
  const actualBalance = await getBalanceOf(provider, contractAddress, userAddress);
  const storageBalance = await getStorageBalance(provider, contractAddress, userAddress, claimedSlot);

  if (actualBalance !== storageBalance) {
    results.securityLevel = 'DANGEROUS';
    results.warnings.push(`❌ BALANCE MISMATCH: balanceOf()=${actualBalance}, slot ${claimedSlot}=${storageBalance}`);
  } else {
    results.validations.balanceMatch = `✅ Balance validation passed: ${actualBalance}`;
  }

  // 3. Check for suspiciously high values compared to total supply
  try {
    const totalSupply = await getTotalSupply(provider, contractAddress);
    const balanceRatio = BigInt(storageBalance) * 100n / BigInt(totalSupply);

    if (balanceRatio > 50n) { // More than 50% of total supply
      results.warnings.push(`⚠️ SUSPICIOUS: Balance is ${balanceRatio}% of total supply. Possible wrong slot.`);
    }
  } catch (error) {
    results.warnings.push('⚠️ Could not validate against total supply');
  }

  // 4. Test multiple slots to detect potential manipulation
  const suspiciousSlots = [];
  for (let testSlot = 0; testSlot <= 20; testSlot++) {
    if (testSlot === claimedSlot) continue;

    try {
      const testBalance = await getStorageBalance(provider, contractAddress, userAddress, testSlot);
      if (testBalance !== '0' && BigInt(testBalance) > BigInt(storageBalance)) {
        suspiciousSlots.push({ slot: testSlot, balance: testBalance });
      }
    } catch (error) {
      // Ignore errors for non-existent slots
    }
  }

  if (suspiciousSlots.length > 0) {
    results.warnings.push(`⚠️ SUSPICIOUS SLOTS FOUND: Other slots have higher values: ${JSON.stringify(suspiciousSlots)}`);
  }

  return results;
}

// Helper function to get balance using balanceOf() call
async function getBalanceOf(provider, contractAddress, userAddress) {
  const balanceOfSelector = "0x70a08231";
  const paddedAddress = userAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const callData = balanceOfSelector + paddedAddress;

  const result = await provider.send("eth_call", [
    { to: contractAddress, data: callData },
    "latest"
  ]);

  return ethers.getBigInt(result || '0x0').toString();
}

// Helper function to get balance from storage slot
async function getStorageBalance(provider, contractAddress, userAddress, slot) {
  const storageKey = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [userAddress, slot]
    )
  );

  const proof = await provider.send("eth_getProof", [
    contractAddress,
    [storageKey],
    "latest"
  ]);

  return ethers.getBigInt(proof.storageProof[0]?.value || '0x0').toString();
}

// Helper function to get total supply
export async function getTotalSupply(provider, contractAddress) {
  const totalSupplySelector = "0x18160ddd"; // totalSupply()

  const result = await provider.send("eth_call", [
    { to: contractAddress, data: totalSupplySelector },
    "latest"
  ]);

  if (result == "0x") {
    return "0";
  }

  return ethers.getBigInt(result || '0x0').toString();
}

// Enhanced storage slot discovery with security validation
export async function discoverStorageSlotSecurely(provider, contractAddress, userAddress) {
  if (!provider) {
    throw new Error('Provider not available. Please connect your wallet.');
  }

  // Get current balance via balanceOf call
  const actualBalance = await getBalanceOf(provider, contractAddress, userAddress);

  if (actualBalance === '0') {
    throw new Error('User has 0 tokens. Storage slot discovery requires a non-zero balance.');
  }

  console.log(`🔍 Discovering storage slot for balance: ${actualBalance}`);

  // Check verified contracts first
  const verified = VERIFIED_STORAGE_SLOTS[contractAddress.toLowerCase()];
  if (verified) {
    console.log(`✅ Found verified contract: ${verified.name}, slot: ${verified.slot}`);

    // Validate the verified slot
    const validation = await validateBalanceSlotSecurity(provider, contractAddress, userAddress, verified.slot);
    if (validation.securityLevel === 'SECURE') {
      return {
        slot: verified.slot,
        found: true,
        source: 'verified_database',
        validation,
        actualBalance
      };
    } else {
      console.log(`⚠️ Verified slot validation failed:`, validation.warnings);
    }
  }

  // Try common storage slots (0-20) with security validation
  for (let slot = 0; slot <= 20; slot++) {
    try {
      const storageBalance = await getStorageBalance(provider, contractAddress, userAddress, slot);

      if (storageBalance === actualBalance) {
        console.log(`✅ Found matching slot: ${slot}`);

        // Validate the discovered slot
        const validation = await validateBalanceSlotSecurity(provider, contractAddress, userAddress, slot);

        return {
          slot,
          found: true,
          source: 'systematic_search',
          validation,
          actualBalance,
          storageBalance
        };
      }
    } catch (error) {
      console.log(`❌ Error checking slot ${slot}:`, error.message);
    }
  }

  throw new Error('Could not find storage slot in range 0-20. The contract may use a non-standard storage layout.');
}

// Validate a specific slot with comprehensive security checks
export async function validateSlotWithSecurityChecks(provider, contractAddress, userAddress, slot) {
  if (!provider) {
    throw new Error('Provider not available. Please connect your wallet.');
  }

  console.log(`🔒 Running security validation for slot ${slot}...`);

  const validation = await validateBalanceSlotSecurity(provider, contractAddress, userAddress, slot);

  console.log(`🔒 Security validation results:`, validation);

  if (validation.securityLevel === 'DANGEROUS') {
    const warningsText = validation.warnings.join('\n');
    throw new Error(`SECURITY VALIDATION FAILED:\n${warningsText}`);
  }

  return validation;
}