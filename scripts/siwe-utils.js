#!/usr/bin/env node

import { ethers } from 'ethers';

/**
 * Create a SIWE (Sign-In with Ethereum) proof for proposal creation
 * @param {ethers.Wallet} wallet - The ethers wallet to sign with
 * @param {string} contractAddress - The contract address for the proposal
 * @param {number} chainId - The chain ID (default: 31337 for Anvil)
 * @returns {Promise<{message: string, signature: Uint8Array}>} SIWE proof object
 */
export async function createSIWEProofForProposal(wallet, contractAddress, chainId = 31337) {
    const currentTime = Date.now();
    const currentTimeNanos = BigInt(currentTime) * 1_000_000n;
    const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes
    
    const currentTimeISO = new Date(currentTime).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    const message = `example.com wants you to sign in with your Ethereum account:
${wallet.address}

Create proposal for contract ${contractAddress}

URI: https://example.com
Version: 1
Chain ID: ${chainId}
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${currentTimeNanos}
Issued At: ${currentTimeISO}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTimeISO}`;

    const signature = await wallet.signMessage(message);
    
    return {
        message,
        signature: ethers.getBytes(signature),
    };
}

/**
 * Create a SIWE message for voting (without signing)
 * @param {string} address - The voter's Ethereum address
 * @param {bigint} proposalId - The proposal ID being voted on
 * @param {string} choice - The vote choice
 * @param {string} contractAddress - The contract address
 * @param {number} chainId - The chain ID (default: 31337 for Anvil)
 * @returns {Promise<string>} SIWE message string
 */
export async function createSIWEMessageForVoting(address, proposalId, choice, contractAddress, chainId = 31337) {
    const currentTime = Date.now();
    const currentTimeNanos = BigInt(currentTime) * 1_000_000n;
    const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes
    
    const currentTimeISO = new Date(currentTime).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    return `example.com wants you to sign in with your Ethereum account:
${address}

Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}

URI: https://example.com
Version: 1
Chain ID: ${chainId}
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${currentTimeNanos}
Issued At: ${currentTimeISO}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTimeISO}`;
}

/**
 * Create a SIWE proof for simple test cases
 * @param {ethers.Wallet} wallet - The ethers wallet to sign with
 * @param {string} action - The action description
 * @param {string} contractAddress - The contract address
 * @param {number} chainId - The chain ID (default: 31337 for Anvil)
 * @returns {Promise<{message: string, signature: Uint8Array}>} SIWE proof object
 */
export async function createSimpleSIWEProof(wallet, action, contractAddress, chainId = 31337) {
    // Use current time for simple test cases
    const currentTime = Date.now();
    const currentTimeNanos = BigInt(currentTime) * 1_000_000n;
    const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes
    
    const currentTimeISO = new Date(currentTime).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    const message = `example.com wants you to sign in with your Ethereum account:
${wallet.address}

${action} for contract ${contractAddress}

URI: https://example.com
Version: 1
Chain ID: ${chainId}
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${currentTimeNanos}
Issued At: ${currentTimeISO}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTimeISO}`;

    const signature = await wallet.signMessage(message);
    
    return {
        message,
        signature: ethers.getBytes(signature),
    };
}

/**
 * Convert a SIWE proof to the format expected by Candid
 * @param {{message: string, signature: Uint8Array}} siweProof - The SIWE proof object
 * @returns {{message: string, signature: number[]}} Candid-compatible SIWE proof
 */
export function siweProofToCandid(siweProof) {
    return {
        message: siweProof.message,
        signature: Array.from(siweProof.signature)
    };
}

/**
 * Create ERC20 transfer data for a transaction
 * @param {string} recipient - The recipient address
 * @param {string} amount - The amount to transfer (as string)
 * @returns {string} The encoded transfer data
 */
export function createTransferData(recipient, amount) {
    // ERC20 transfer function signature: transfer(address,uint256)
    const transferSig = "0xa9059cbb";
    
    // Remove 0x prefix and pad recipient address to 32 bytes
    const paddedRecipient = recipient.slice(2).toLowerCase().padStart(64, '0');
    
    // Convert amount to hex and pad to 32 bytes
    const amountHex = BigInt(amount).toString(16).padStart(64, '0');
    
    return transferSig + paddedRecipient + amountHex;
}
