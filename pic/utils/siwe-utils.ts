import { ethers } from 'ethers';
import type { PocketIc } from '@dfinity/pic';

export interface SIWEProof {
  message: string;
  signature: Uint8Array;
}

/**
 * Create a SIWE (Sign-In with Ethereum) proof for proposal creation
 * @param wallet - The ethers wallet to sign with
 * @param contractAddress - The contract address for the proposal
 * @param pic - PocketIC instance for time calculations
 * @returns SIWE proof object
 */
export async function createSIWEProofForProposal(
  wallet: ethers.Wallet,
  contractAddress: string,
  pic: PocketIc
): Promise<SIWEProof> {
  const canisterTimeMs = Math.floor(await pic.getTime());
  const canisterTimeNanos = BigInt(canisterTimeMs) * 1_000_000n;
  const expirationTimeNanos = canisterTimeNanos + 600_000_000_000n; // 10 minutes
  
  const currentTimeISO = new Date(Number(canisterTimeNanos / 1_000_000n)).toISOString();
  const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
  
  const message = `example.com wants you to sign in with your Ethereum account:
${wallet.address}

Create proposal for contract ${contractAddress}

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${canisterTimeNanos}
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
 * @param address - The voter's Ethereum address
 * @param proposalId - The proposal ID being voted on
 * @param choice - The vote choice
 * @param contractAddress - The contract address
 * @param pic - PocketIC instance for time calculations
 * @returns SIWE message string
 */
export async function createSIWEMessageForVoting(
  address: string,
  proposalId: bigint,
  choice: string,
  contractAddress: string,
  pic: PocketIc
): Promise<string> {
  const canisterTimeMs = Math.floor(await pic.getTime());
  const canisterTimeNanos = BigInt(canisterTimeMs) * 1_000_000n;
  const expirationTimeNanos = canisterTimeNanos + 600_000_000_000n; // 10 minutes
  
  const currentTimeISO = new Date(Number(canisterTimeNanos / 1_000_000n)).toISOString();
  const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
  
  return `example.com wants you to sign in with your Ethereum account:
${address}

Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${canisterTimeNanos}
Issued At: ${currentTimeISO}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTimeISO}`;
}

/**
 * Create a SIWE proof for simple test cases
 * @param wallet - The ethers wallet to sign with
 * @param action - The action description
 * @param contractAddress - The contract address
 * @returns SIWE proof object
 */
export async function createSimpleSIWEProof(
  wallet: ethers.Wallet,
  action: string,
  contractAddress: string
): Promise<SIWEProof> {
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
Chain ID: 31337
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
