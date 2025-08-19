import { writable, derived } from 'svelte/store';
import { ethers } from 'ethers';

// Core wallet state
export const provider = writable(null);
export const signer = writable(null);
export const userAddress = writable(null);
export const chainId = writable(null);
export const isConnected = derived(userAddress, $userAddress => !!$userAddress);

// Initialize MetaMask provider
export function initializeProvider() {
    if (typeof window !== 'undefined' && window.ethereum) {
        const metamaskProvider = new ethers.BrowserProvider(window.ethereum);
        provider.set(metamaskProvider);
        
        // Listen for account changes
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                userAddress.set(null);
                signer.set(null);
            } else {
                userAddress.set(accounts[0]);
                updateSigner(metamaskProvider);
            }
        });
        
        // Listen for chain changes
        window.ethereum.on('chainChanged', (newChainId) => {
            chainId.set(parseInt(newChainId, 16));
            // Reload the page as recommended by MetaMask
            window.location.reload();
        });
        
        return metamaskProvider;
    }
    return null;
}

async function updateSigner(metamaskProvider) {
    try {
        const signerInstance = await metamaskProvider.getSigner();
        signer.set(signerInstance);
    } catch (error) {
        console.error('Failed to get signer:', error);
        signer.set(null);
    }
}

// Connect wallet
export async function connectWallet() {
    const metamaskProvider = initializeProvider();
    if (!metamaskProvider) {
        throw new Error('MetaMask not available');
    }
    
    await metamaskProvider.send("eth_requestAccounts", []);
    const signerInstance = await metamaskProvider.getSigner();
    const address = await signerInstance.getAddress();
    const network = await metamaskProvider.getNetwork();
    
    provider.set(metamaskProvider);
    signer.set(signerInstance);
    userAddress.set(address);
    chainId.set(Number(network.chainId));
    
    return {
        address,
        chainId: Number(network.chainId)
    };
}

// Disconnect wallet
export function disconnectWallet() {
    userAddress.set(null);
    signer.set(null);
    chainId.set(null);
}

// Sign message utility
export async function signMessage(message) {
    const signerInstance = await signer;
    if (!signerInstance) {
        throw new Error('No signer available');
    }
    return await signerInstance.signMessage(message);
}