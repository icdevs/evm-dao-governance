import { ethers } from 'ethers';
import { getERC20BalanceStorageKey } from './storageUtils.js';

// Generate SIWE (Sign-In With Ethereum) proof for proposal creation
export async function generateSIWEProof(proposalId, choice, contractAddress, chainId, signer) {
    if (!signer) {
        throw new Error('Signer not available');
    }
    
    const address = await signer.getAddress();
    const currentTime = Date.now();
    const currentTimeNanos = BigInt(currentTime) * 1_000_000n;
    const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes
    
    const currentTimeISO = new Date(currentTime).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    const domain = window.location.host;
    const statement = `Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}`;
    const uri = `https://${domain}`;
    const version = '1';
    const nonce = expirationTimeNanos.toString();
    
    const message = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${currentTimeISO}
Expiration Time: ${expirationTimeISO}
Resources:
- contract:${contractAddress}`;
    
    const signature = await signer.signMessage(message);
    
    return {
        message: message,
        signature: ethers.getBytes(signature)
    };
}

// Generate witness proof for user's token balance
export async function generateWitnessProof(contractAddress, proposalId, userAddress, provider, backendActor, storageSlot = 0) {
    if (!provider || !userAddress) {
        throw new Error('Provider and user address are required');
    }
    
    if (!backendActor) {
        throw new Error('Backend actor not available');
    }
    
    // Get proposal details to find snapshot block
    const proposal = await backendActor.icrc149_get_proposal(BigInt(proposalId));
    if (!proposal || proposal.length === 0) {
        throw new Error(`Proposal ${proposalId} not found`);
    }
    
    const blockNumber = proposal[0].snapshot 
        ? Number(proposal[0].snapshot.block_number) 
        : await provider.getBlockNumber();
    
    // Generate storage key for user's balance
    const storageKey = getERC20BalanceStorageKey(userAddress, storageSlot);
    
    // Get proof from Ethereum node
    const proof = await provider.send('eth_getProof', [
        contractAddress,
        [storageKey],
        `0x${blockNumber.toString(16)}`
    ]);
    
    const block = await provider.send('eth_getBlockByNumber', [
        `0x${blockNumber.toString(16)}`,
        false
    ]);
    
    return {
        blockHash: ethers.getBytes(block.hash),
        blockNumber: BigInt(blockNumber),
        userAddress: ethers.getBytes(userAddress),
        contractAddress: ethers.getBytes(contractAddress),
        storageKey: ethers.getBytes(storageKey),
        storageValue: ethers.getBytes(proof.storageProof[0]?.value || '0x0'),
        accountProof: proof.accountProof.map(p => ethers.getBytes(p)),
        storageProof: proof.storageProof[0]?.proof.map(p => ethers.getBytes(p)) || []
    };
}

// Create SIWE message for proposal creation
export async function createSiweProofForProposal(contractAddress, chainId, signer) {
    if (!signer) {
        throw new Error('Signer not available');
    }
    
    const address = await signer.getAddress();
    const currentTime = Date.now();
    const currentTimeNanos = BigInt(currentTime) * 1_000_000n;
    const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes
    
    const currentTimeISO = new Date(currentTime).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    const domain = window.location.host;
    const origin = window.location.origin;
    
    const statement = `Create proposal for contract ${contractAddress}`;
    
    const message = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${origin}
Version: 1
Chain ID: ${chainId}
Nonce: ${expirationTimeNanos.toString()}
Issued At: ${currentTimeISO}
Expiration Time: ${expirationTimeISO}
Resources:
- contract:${contractAddress}`;
    
    const signature = await signer.signMessage(message);
    
    return {
        message: message,
        signature: ethers.getBytes(signature)
    };
}

// Create SIWE message for voting
export async function createSiweProofForVoting(proposalId, choice, contractAddress, chainId, signer) {
    if (!signer) {
        throw new Error('Signer not available');
    }
    
    const address = await signer.getAddress();
    const currentTime = Date.now();
    const currentTimeNanos = BigInt(currentTime) * 1_000_000n;
    const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes
    
    const currentTimeISO = new Date(currentTime).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    const domain = window.location.host;
    const origin = window.location.origin;
    
    const statement = `Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}`;
    
    const message = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${origin}
Version: 1
Chain ID: ${chainId}
Nonce: ${expirationTimeNanos.toString()}
Issued At: ${currentTimeISO}
Expiration Time: ${expirationTimeISO}
Resources:
- proposal:${proposalId}
- contract:${contractAddress}`;
    
    const signature = await signer.signMessage(message);
    
    return {
        message: message,
        signature: ethers.getBytes(signature)
    };
}