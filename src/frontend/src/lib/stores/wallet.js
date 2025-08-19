import { writable, derived } from 'svelte/store';
import { ethers } from 'ethers';

// Core wallet state stores
export const provider = writable(null);
export const signer = writable(null);
export const userAddress = writable(null);
export const chainId = writable(null);

// Derived store for connection status
export const isConnected = derived(userAddress, $userAddress => !!$userAddress);

// Helper functions for updating wallet state
export function setProvider(providerInstance) {
    provider.set(providerInstance);
}

export function setSigner(signerInstance) {
    signer.set(signerInstance);
}

export function setUserAddress(address) {
    userAddress.set(address);
}

export function setChainId(id) {
    chainId.set(id);
}

export function clearWallet() {
    provider.set(null);
    signer.set(null);
    userAddress.set(null);
    chainId.set(null);
}

// Connection function that returns values instead of storing them
export async function connectWallet() {
    if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask not available');
    }
    
    const metamaskProvider = new ethers.BrowserProvider(window.ethereum);
    
    await metamaskProvider.send("eth_requestAccounts", []);
    const signerInstance = await metamaskProvider.getSigner();
    const address = await signerInstance.getAddress();
    const network = await metamaskProvider.getNetwork();
    
    // Update stores
    setProvider(metamaskProvider);
    setSigner(signerInstance);
    setUserAddress(address);
    setChainId(Number(network.chainId));
    
    return {
        address,
        chainId: Number(network.chainId),
        provider: metamaskProvider,
        signer: signerInstance
    };
}

// Initialize provider and set up event listeners
export function initializeProvider() {
    if (typeof window !== 'undefined' && window.ethereum) {
        const metamaskProvider = new ethers.BrowserProvider(window.ethereum);
        setProvider(metamaskProvider);
        
        // Listen for account changes
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                clearWallet();
            } else {
                setUserAddress(accounts[0]);
                updateSigner(metamaskProvider);
            }
        });
        
        // Listen for chain changes
        window.ethereum.on('chainChanged', (newChainId) => {
            setChainId(parseInt(newChainId, 16));
            // Reload the page as recommended by MetaMask
            window.location.reload();
        });
        
        return metamaskProvider;
    }
    return null;
}

// Helper function to update signer
async function updateSigner(metamaskProvider) {
    try {
        const signerInstance = await metamaskProvider.getSigner();
        setSigner(signerInstance);
    } catch (error) {
        console.error('Failed to get signer:', error);
        setSigner(null);
    }
}

// Utility function to sign a message (requires signer to be passed in)
export async function signMessage(signerInstance, message) {
    if (!signerInstance) {
        throw new Error('No signer available');
    }
    return await signerInstance.signMessage(message);
}