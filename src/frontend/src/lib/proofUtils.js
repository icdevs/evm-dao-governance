
import { ethers } from 'ethers';
import { get } from 'svelte/store';
import { provider, signer, userAddress, chainId } from './stores/wallet.js';
import { canisterActor, storageSlot } from './stores/canister.js';
import { getERC20BalanceStorageKey } from './storageUtils.js';

// Generate SIWE (Sign-In With Ethereum) proof
export async function generateSIWEProof(proposalId, choice, contractAddress) {
    const signerInstance = get(signer);
    const address = get(userAddress);
    const currentChainId = get(chainId);
    
    if (!signerInstance) {
        throw new Error('No signer available');
    }
    
    // Create SIWE message following EIP-4361
    const domain = 'dao-voting.example.com';
    const statement = `Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}`;
    const uri = `https://${domain}`;
    const version = '1';
    const nonce = Date.now().toString();
    const issuedAt = new Date().toISOString();
    const expirationTime = new Date(Date.now() + 600000).toISOString(); // 10 minutes
    
    const message = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${currentChainId}
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expirationTime}`;
    
    const signature = await signerInstance.signMessage(message);
    
    return {
        message: message,
        signature: ethers.getBytes(signature)
    };
}

// Generate witness proof for user's token balance
export async function generateWitnessProof(contractAddress, proposalId) {
    const actor = get(canisterActor);
    const metamaskProvider = get(provider);
    const address = get(userAddress);
    const slot = get(storageSlot) || 0;
    
    if (!actor) {
        throw new Error('Canister not initialized');
    }
    
    if (!metamaskProvider || !address) {
        throw new Error('Wallet not connected');
    }
    
    // Get proposal details to find snapshot block
    const proposal = await actor.icrc149_get_proposal(BigInt(proposalId));
    if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
    }
    
    const blockNumber = proposal.snapshot ? Number(proposal.snapshot.block_number) : 'latest';
    
    // Generate storage key for user's balance
    const storageKey = getERC20BalanceStorageKey(address, slot);
    
    // Get proof from Ethereum node
    const proof = await metamaskProvider.send('eth_getProof', [
        contractAddress,
        [storageKey],
        `0x${blockNumber.toString(16)}`
    ]);
    
    const block = await metamaskProvider.send('eth_getBlockByNumber', [
        `0x${blockNumber.toString(16)}`,
        false
    ]);
    
    return {
        blockHash: ethers.getBytes(block.hash),
        blockNumber: BigInt(blockNumber),
        userAddress: ethers.getBytes(address),
        contractAddress: ethers.getBytes(contractAddress),
        storageKey: ethers.getBytes(storageKey),
        storageValue: ethers.getBytes(proof.storageProof[0]?.value || '0x0'),
        accountProof: proof.accountProof.map(p => ethers.getBytes(p)),
        storageProof: proof.storageProof[0]?.proof.map(p => ethers.getBytes(p)) || []
    };
}