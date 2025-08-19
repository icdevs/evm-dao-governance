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

// Get current chain ID
export async function getCurrentChainId() {
    // First try to get from store (most reliable if already connected)
    let currentChainId;
    const unsubscribe = chainId.subscribe(value => currentChainId = value);
    unsubscribe();
    
    if (currentChainId) {
        return currentChainId;
    }
    
    // If not in store, try to get from provider
    let currentProvider;
    const unsubscribeProvider = provider.subscribe(value => currentProvider = value);
    unsubscribeProvider();
    
    if (currentProvider) {
        try {
            const network = await currentProvider.getNetwork();
            const networkChainId = Number(network.chainId);
            chainId.set(networkChainId); // Update store
            return networkChainId;
        } catch (error) {
            console.error('Failed to get chain ID from provider:', error);
        }
    }
    
    // Last resort: try MetaMask directly
    if (typeof window !== 'undefined' && window.ethereum) {
        try {
            const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
            const directChainId = parseInt(chainIdHex, 16);
            chainId.set(directChainId); // Update store
            return directChainId;
        } catch (error) {
            console.error('Failed to get chain ID from MetaMask:', error);
        }
    }
    
    throw new Error('Unable to get chain ID. Please connect your wallet.');
}

// Disconnect wallet
export function disconnectWallet() {
    userAddress.set(null);
    signer.set(null);
    chainId.set(null);
}

// Sign message utility
export async function signMessage(message) {
    let currentSigner;
    const unsubscribe = signer.subscribe(value => currentSigner = value);
    unsubscribe();
    
    if (!currentSigner) {
        throw new Error('No signer available');
    }
    return await currentSigner.signMessage(message);
}