import { ethers } from 'ethers';

/**
 * Real witness generator that calls eth_getProof against local Anvil node
 * This replaces the mock witness functions and provides proper Merkle proofs
 */

export interface MotokoWitness {
  blockHash: Uint8Array;       // Blob - 32 bytes
  blockNumber: bigint;         // Nat
  userAddress: Uint8Array;     // Blob - 20 bytes
  contractAddress: Uint8Array; // Blob - 20 bytes
  storageKey: Uint8Array;      // Blob - 32 bytes
  storageValue: Uint8Array;    // Blob - variable length
  accountProof: Uint8Array[];  // [Blob] - Array of RLP-encoded proof nodes
  storageProof: Uint8Array[];  // [Blob] - Array of RLP-encoded proof nodes
}

export interface WitnessGenerationOptions {
  rpcUrl?: string;
  slotIndex?: number; // Storage slot for ERC20 balances mapping (usually 0)
}

/**
 * Generate a real witness using eth_getProof RPC call
 * This creates proper Merkle proofs that can be validated by the canister
 */
export async function generateRealWitness(
  contractAddress: string,
  userAddress: string,
  blockNumber: number | string,
  options: WitnessGenerationOptions = {}
): Promise<MotokoWitness> {
  const {
    rpcUrl = 'http://127.0.0.1:8545',  // Default to local Anvil
    slotIndex = 0                      // Default storage slot for ERC20 balances
  } = options;

  console.log(`🔍 Generating real witness for:
    Contract: ${contractAddress}
    User: ${userAddress}
    Block: ${blockNumber}
    RPC: ${rpcUrl}
    Slot: ${slotIndex}`);

  try {
    // First test if RPC is accessible
    console.log(`🔍 Testing RPC connectivity to ${rpcUrl}...`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Test connection with timeout
    const connectionTimeout = 5000; // 5 seconds
    const blockNumberPromise = provider.getBlockNumber();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`RPC connection timeout after ${connectionTimeout}ms`)), connectionTimeout)
    );
    
    try {
      const currentBlock = await Promise.race([blockNumberPromise, timeoutPromise]);
      console.log(`✅ RPC connected successfully, current block: ${currentBlock}`);
    } catch (error) {
      throw new Error(`RPC connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Calculate storage key for ERC20 balance mapping
    // Standard pattern: keccak256(address . slot)
    const storageKey = calculateERC20StorageKey(userAddress, slotIndex);
    console.log(`📝 Storage key: ${storageKey}`);

    // Convert block number to hex
    const blockTag = typeof blockNumber === 'number' ? 
      `0x${blockNumber.toString(16)}` : 
      blockNumber;

    // 🔍 DEBUG: Verify balance before getting proof
    console.log(`🔍 Pre-proof verification:`);
    console.log(`  Contract: ${contractAddress}`);
    console.log(`  User: ${userAddress}`);
    console.log(`  Block: ${blockTag} (${blockNumber})`);
    console.log(`  Storage key: ${storageKey}`);
    
    // Verify balance with direct eth_call
    const balanceOfData = "0x70a08231" + userAddress.substring(2).padStart(64, '0');
    const directBalance = await provider.send("eth_call", [
      { to: contractAddress, data: balanceOfData },
      blockTag
    ]);
    
    // Handle empty or invalid balance responses safely
    const safeDirectBalance = directBalance && directBalance !== '0x' ? directBalance : '0x0';
    const expectedBalance = ethers.getBigInt(safeDirectBalance);
    console.log(`  Direct balance via eth_call: ${safeDirectBalance} (${expectedBalance.toString()} wei)`);

    // 🔍 CRITICAL: Try multiple storage slots to find the correct one for OpenZeppelin ERC20
    console.log(`🔍 Searching for correct storage slot (OpenZeppelin ERC20 may not use slot 0)...`);
    console.log(`🔍 Expected balance from eth_call: ${expectedBalance.toString()} tokens`);
    let correctSlot = slotIndex;
    let correctStorageValue = '0x0';
    
    // Try slots 0-5 to find the one that matches the balance
    for (let testSlot = 0; testSlot <= 50; testSlot++) {
      const testStorageKey = calculateERC20StorageKey(userAddress, testSlot);
      
      console.log(`🔍 Testing slot ${testSlot} with storage key: ${testStorageKey}`);
      
      // Get proof for this slot
      const testProof = await provider.send("eth_getProof", [
        contractAddress,
        [testStorageKey],
        blockTag
      ]);
      
      const testValue = testProof.storageProof[0]?.value || '0x0';
      const testBalance = ethers.getBigInt(testValue);
      
      console.log(`  Slot ${testSlot}: Storage value = ${testValue}, Balance = ${testBalance.toString()}`);
      console.log(`  Slot ${testSlot}: Expected = ${expectedBalance.toString()}, Got = ${testBalance.toString()}`);
      
      if (testBalance === expectedBalance && testBalance > 0n) {
        console.log(`✅ Found correct storage slot: ${testSlot}`);
        correctSlot = testSlot;
        correctStorageValue = testValue;
        break;
      }
    }
    
    if (correctStorageValue === '0x0' && expectedBalance > 0n) {
      console.log(`⚠️  WARNING: Could not find storage slot with matching balance!`);
      console.log(`⚠️  Expected balance: ${expectedBalance.toString()}, but all slots returned 0`);
      console.log(`⚠️  This indicates the storage layout may be different than expected`);
    }
    
    // Use the correct storage key for the final proof
    const finalStorageKey = calculateERC20StorageKey(userAddress, correctSlot);

    // Get the proof from the Ethereum node with timeout
    console.log(`🔗 Calling eth_getProof with final storage key...`);
    const proofTimeout = 10000; // 10 seconds
    const proofPromise = provider.send("eth_getProof", [
      contractAddress,
      [finalStorageKey],
      blockTag
    ]);
    const proofTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`eth_getProof timeout after ${proofTimeout}ms`)), proofTimeout)
    );
    
    const proof = await Promise.race([proofPromise, proofTimeoutPromise]);

    console.log(`✅ Received proof:
      Account proof entries: ${proof.accountProof.length}
      Storage proof entries: ${proof.storageProof[0]?.proof?.length || 0}
      Storage value: ${proof.storageProof[0]?.value || '0x0'}
      Expected storage key: ${finalStorageKey}
      Actual storage key: ${proof.storageProof[0]?.key || 'missing'}
      Used storage slot: ${correctSlot}`);
    
    // 🔍 DEBUG: Compare storage keys
    if (proof.storageProof[0]?.key && proof.storageProof[0].key !== finalStorageKey) {
      console.log(`⚠️  Storage key mismatch!`);
      console.log(`  Expected: ${finalStorageKey}`);
      console.log(`  Received: ${proof.storageProof[0].key}`);
    }

    // Get block information with timeout
    console.log(`🔗 Fetching block information for ${blockTag}...`);
    const blockTimeout = 5000; // 5 seconds
    const blockPromise = provider.getBlock(blockTag);
    const blockTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Block fetch timeout after ${blockTimeout}ms`)), blockTimeout)
    );
    
    const blockResult = await Promise.race([blockPromise, blockTimeoutPromise]);
    if (!blockResult) {
      throw new Error(`Block ${blockTag} not found`);
    }
    
    // Type assertion for block data
    const block = blockResult as { hash: string; number: number };

    // Create witness structure compatible with Motoko canister
    // Fix storage value padding - ensure even number of hex characters
    const rawStorageValue = proof.storageProof[0]?.value || '0x0';
    const paddedStorageValue = rawStorageValue.length % 2 === 0 ? rawStorageValue : rawStorageValue.replace('0x', '0x0');
    
    console.log(`🔧 Storage value padding fix:
      Original: ${rawStorageValue} (length: ${rawStorageValue.length})
      Padded: ${paddedStorageValue} (length: ${paddedStorageValue.length})`);
    
    // Helper function to ensure hex strings have even length
    const ensureEvenHex = (hexStr: string): string => {
      if (hexStr.length % 2 === 0) return hexStr;
      return hexStr.replace('0x', '0x0');
    };
    
    // Debug storage value conversion
    console.log(`🔍 Storage value conversion debug:
      Raw storage value: ${rawStorageValue}
      Padded storage value: ${paddedStorageValue}
      Is valid hex: ${ethers.isHexString(paddedStorageValue)}
      Expected length: 66 characters (0x + 64 hex digits for 32 bytes)`);
    
    // Convert to bytes with detailed logging
    const storageValueBytes = ethers.getBytes(paddedStorageValue);
    console.log(`🔍 Storage value bytes: ${storageValueBytes.length} bytes`);
    console.log(`🔍 Storage value hex: 0x${Array.from(storageValueBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`);
    console.log(`🔍 Storage value as BigInt: ${ethers.getBigInt(paddedStorageValue).toString()}`);

    const witness: MotokoWitness = {
      blockHash: ethers.getBytes(block.hash),
      blockNumber: BigInt(block.number),
      userAddress: ethers.getBytes(userAddress),
      contractAddress: ethers.getBytes(contractAddress),
      storageKey: ethers.getBytes(finalStorageKey),
      storageValue: storageValueBytes,
      accountProof: proof.accountProof.map((p: string) => ethers.getBytes(ensureEvenHex(p))),
      storageProof: proof.storageProof[0]?.proof?.map((p: string) => ethers.getBytes(ensureEvenHex(p))) || []
    };

    console.log(`🎯 Generated witness with:
      Block: ${witness.blockNumber}
      Account proof entries: ${witness.accountProof.length}
      Storage proof entries: ${witness.storageProof.length}
      Storage value length: ${witness.storageValue.length} bytes
      Storage value first 4 bytes: [${Array.from(witness.storageValue.slice(0, 4)).join(', ')}]
      Storage value last 4 bytes: [${Array.from(witness.storageValue.slice(-4)).join(', ')}]`);
    
    return witness;

  } catch (error) {
    console.error(`❌ Error generating witness:`, error);
    throw new Error(`Failed to generate witness: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate storage key for ERC20 balance mapping
 * Standard Solidity mapping: mapping(address => uint256) balances;
 * Storage key = keccak256(abi.encode(address, slot))
 * 
 * CRITICAL: Must use abi.encode semantics, not abi.encodePacked!
 * - Address must be LEFT-PADDED to 32 bytes (not 20 bytes)
 * - Slot must be padded to 32 bytes
 * - Then concatenate and hash: keccak256(pad32(address) || pad32(slot))
 */
function calculateERC20StorageKey(userAddress: string, slot: number = 0): string {
  // Convert address to bytes and LEFT-PAD to 32 bytes (abi.encode semantics)
  // Address is uint160, so left-pad with zeros to make it 32 bytes
  const addressPadded = ethers.zeroPadValue(userAddress, 32);
  const addressBytes = ethers.getBytes(addressPadded);
  
  // Convert slot to 32 bytes
  const slotBytes = ethers.zeroPadValue(ethers.toBeHex(slot), 32);
  const slotBytesArray = ethers.getBytes(slotBytes);
  
  // Concatenate padded address (32 bytes) + padded slot (32 bytes) for abi.encode
  const combinedBytes = new Uint8Array(32 + 32); // 64 bytes total
  combinedBytes.set(addressBytes, 0);      // First 32 bytes: padded address
  combinedBytes.set(slotBytesArray, 32);   // Next 32 bytes: padded slot
  
  const storageKey = ethers.keccak256(combinedBytes);
  
  console.log(`🔑 Storage key calculation (abi.encode):
    Original Address: ${userAddress}
    Address (LEFT-PADDED to 32 bytes): ${ethers.hexlify(addressBytes)}
    Slot (32 bytes): ${ethers.hexlify(slotBytesArray)}
    Combined bytes (64 total): ${ethers.hexlify(combinedBytes)}
    Storage Key: ${storageKey}`);
  
  return storageKey;
}

/**
 * Encode proof data into a format compatible with the Motoko canister
 * This creates a compact representation of all proof data
 */
function encodeProofData(data: {
  blockHash: string;
  blockNumber: number;
  userAddress: string;
  contractAddress: string;
  storageKey: string;
  storageValue: string;
  accountProof: string[];
  storageProof: string[];
}): Uint8Array {
  try {
    // Create a structured proof object
    const proofData = {
      blockHash: data.blockHash,
      blockNumber: data.blockNumber,
      userAddress: data.userAddress,
      contractAddress: data.contractAddress,
      storageKey: data.storageKey,
      storageValue: data.storageValue,
      accountProof: data.accountProof,
      storageProof: data.storageProof
    };

    // Convert to JSON and then to bytes
    const jsonString = JSON.stringify(proofData);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(jsonString);
    
    console.log(`📦 Encoded proof data: ${encoded.length} bytes`);
    return encoded;

  } catch (error) {
    console.error('Error encoding proof data:', error);
    // Fallback to simple encoding
    const fallback = new TextEncoder().encode(JSON.stringify({
      blockHash: data.blockHash,
      storageValue: data.storageValue
    }));
    return fallback;
  }
}

/**
 * Validate that a witness has proper proof data (not empty/mock)
 */
export function validateWitnessIntegrity(witness: MotokoWitness): boolean {
  const hasAccountProof = witness.accountProof.length > 0;
  const hasStorageProof = witness.storageProof.length > 0;
  const hasValidBlockHash = witness.blockHash.length === 32; // 32 bytes for block hash
  const hasValidAddresses = witness.userAddress.length === 20 && witness.contractAddress.length === 20;
  const hasValidStorageKey = witness.storageKey.length === 32;
  
  console.log(`🔍 Witness validation:
    Has account proof: ${hasAccountProof} (${witness.accountProof.length} entries)
    Has storage proof: ${hasStorageProof} (${witness.storageProof.length} entries)
    Valid block hash: ${hasValidBlockHash} (${witness.blockHash.length} bytes)
    Valid addresses: ${hasValidAddresses} (user: ${witness.userAddress.length}, contract: ${witness.contractAddress.length})
    Valid storage key: ${hasValidStorageKey} (${witness.storageKey.length} bytes)`);
  
  return hasAccountProof && hasStorageProof && hasValidBlockHash && hasValidAddresses && hasValidStorageKey;
}

/**
 * Get the actual token balance for verification
 */
export async function getTokenBalance(
  contractAddress: string,
  userAddress: string,
  blockNumber?: number | string,
  rpcUrl: string = 'http://127.0.0.1:8545'
): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  // ERC20 balanceOf function selector
  const balanceOfSelector = "0x70a08231";
  const paddedAddress = userAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const callData = balanceOfSelector + paddedAddress;
  
  const blockTag = blockNumber ? (
    typeof blockNumber === 'number' ? `0x${blockNumber.toString(16)}` : blockNumber
  ) : 'latest';
  
  const result = await provider.send("eth_call", [
    {
      to: contractAddress,
      data: callData
    },
    blockTag
  ]);
  
  // Handle empty or invalid responses
  if (!result || result === '0x' || result.length <= 2) {
    console.log(`⚠️  No balance data returned from contract ${contractAddress} for address ${userAddress} - returning 0`);
    return 0n; // Return 0 balance for non-existent contracts or empty responses
  }
  
  return ethers.getBigInt(result);
}

/**
 * Generate witness for a specific token balance at a block
 * This is the main function that tests should use
 */
export async function generateTokenBalanceWitness(
  contractAddress: string,
  userAddress: string,
  blockNumber: number,
  options: WitnessGenerationOptions = {}
): Promise<MotokoWitness> {
  console.log(`🚀 Generating token balance witness...`);
  
  // First check if the user actually has a balance at this block
  const balance = await getTokenBalance(contractAddress, userAddress, blockNumber, options.rpcUrl);
  console.log(`💰 User balance at block ${blockNumber}: ${balance.toString()}`);
  
  // Generate the witness
  const witness = await generateRealWitness(contractAddress, userAddress, blockNumber, options);
  
  // Validate the witness has proper proof data
  if (!validateWitnessIntegrity(witness)) {
    throw new Error('Generated witness failed integrity check - missing proof data');
  }
  
  console.log(`✅ Successfully generated valid witness for balance ${balance.toString()}`);
  return witness;
}
