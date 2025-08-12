import { browser } from '$app/environment';
import { SiweMessage } from 'siwe';
import { ethers } from 'ethers';
import { setAuth, setAuthError, setConnecting, clearAuth } from './stores/auth.js';

let provider = null;
let signer = null;

// Initialize Ethereum provider
export async function initializeEthereumProvider() {
    if (!browser || !window.ethereum) {
        throw new Error('MetaMask or compatible wallet not found');
    }
    
    provider = new ethers.BrowserProvider(window.ethereum);
    return provider;
}

// Connect wallet
export async function connectWallet() {
    try {
        setConnecting(true);
        
        if (!provider) {
            await initializeEthereumProvider();
        }
        
        // Request account access
        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        setAuth(address);
        return address;
    } catch (error) {
        console.error('Failed to connect wallet:', error);
        setAuthError(error.message);
        throw error;
    }
}

// Disconnect wallet
export function disconnectWallet() {
    provider = null;
    signer = null;
    clearAuth();
}

// Create SIWE message and signature for proposal creation
export async function createSiweProofForProposal(contractAddress, chainId = 31337) {
    if (!signer) {
        throw new Error('Wallet not connected');
    }
    
    const address = await signer.getAddress();
    const currentTime = Date.now();
    const currentTimeNanos = BigInt(currentTime) * 1_000_000n;
    const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes
    
    const currentTimeISO = new Date(currentTime).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    const domain = window.location.host;
    const origin = window.location.origin;
    
    const siweMessage = new SiweMessage({
        domain: domain,
        address: address,
        statement: `Create proposal for contract ${contractAddress}`,
        uri: origin,
        version: '1',
        chainId: chainId,
        nonce: expirationTimeNanos.toString(),
        issuedAt: currentTimeISO,
        expirationTime: expirationTimeISO,
        resources: [`contract:${contractAddress}`]
    });
    
    const message = siweMessage.prepareMessage();
    const signature = await signer.signMessage(message);
    
    return {
        message: message,
        signature: ethers.getBytes(signature)
    };
}

// Create SIWE message for voting
export async function createSiweProofForVoting(proposalId, choice, contractAddress, chainId = 31337) {
    if (!signer) {
        throw new Error('Wallet not connected');
    }
    
    const address = await signer.getAddress();
    const currentTime = Date.now();
    const currentTimeNanos = BigInt(currentTime) * 1_000_000n;
    const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes
    
    const currentTimeISO = new Date(currentTime).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    const domain = window.location.host;
    const origin = window.location.origin;
    
    const siweMessage = new SiweMessage({
        domain: domain,
        address: address,
        statement: `Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}`,
        uri: origin,
        version: '1',
        chainId: chainId,
        nonce: expirationTimeNanos.toString(),
        issuedAt: currentTimeISO,
        expirationTime: expirationTimeISO,
        resources: [`proposal:${proposalId}`, `contract:${contractAddress}`]
    });
    
    const message = siweMessage.prepareMessage();
    const signature = await signer.signMessage(message);
    
    return {
        message: message,
        signature: ethers.getBytes(signature)
    };
}

// Get current wallet address
export async function getCurrentAddress() {
    if (!signer) {
        return null;
    }
    return await signer.getAddress();
}

// Get current chain ID
export async function getCurrentChainId() {
    if (!signer) {
        return null;
    }
    const network = await signer.provider.getNetwork();
    return Number(network.chainId);
}

// Switch to a specific network
export async function switchNetwork(chainId) {
    if (!provider) {
        throw new Error('Provider not initialized');
    }
    
    try {
        await provider.send('wallet_switchEthereumChain', [
            { chainId: `0x${chainId.toString(16)}` }
        ]);
    } catch (error) {
        // If the network doesn't exist, you might want to add it
        throw new Error(`Failed to switch to network ${chainId}: ${error.message}`);
    }
}
