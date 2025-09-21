import { writable } from 'svelte/store';
import { createWalletClient, custom } from 'viem';
import { mainnet, sepolia } from 'viem/chains';

// Wallet connection state
export const isWalletConnected = writable(false);
export const walletAddress = writable(null);
export const walletClient = writable(null);
export const chainId = writable(null);

// Check if MetaMask is available
export function isMetaMaskAvailable() {
    return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
}

// Connect to MetaMask wallet
export async function connectWallet() {
    if (!isMetaMaskAvailable()) {
        throw new Error('MetaMask not found. Please install MetaMask.');
    }

    try {
        // Request account access
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts',
        });

        if (accounts.length === 0) {
            throw new Error('No accounts found');
        }

        const address = accounts[0];

        // Get chain ID
        const chainIdHex = await window.ethereum.request({
            method: 'eth_chainId',
        });
        const currentChainId = parseInt(chainIdHex, 16);

        // Create wallet client
        const client = createWalletClient({
            account: address,
            chain: currentChainId === 1 ? mainnet : sepolia,
            transport: custom(window.ethereum)
        });

        // Update stores
        walletAddress.set(address);
        isWalletConnected.set(true);
        walletClient.set(client);
        chainId.set(currentChainId);

        // Listen for account changes
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                walletAddress.set(accounts[0]);
            }
        });

        // Listen for chain changes
        window.ethereum.on('chainChanged', (newChainId) => {
            const newChainIdNumber = parseInt(newChainId, 16);
            chainId.set(newChainIdNumber);

            // Update client with new chain
            const newClient = createWalletClient({
                account: address,
                chain: newChainIdNumber === 1 ? mainnet : sepolia,
                transport: custom(window.ethereum)
            });
            walletClient.set(newClient);
        });

        return address;
    } catch (error) {
        console.error('Error connecting wallet:', error);
        throw error;
    }
}

// Disconnect wallet
export function disconnectWallet() {
    walletAddress.set(null);
    isWalletConnected.set(false);
    walletClient.set(null);
    chainId.set(null);
}

// Check if wallet is already connected
export async function checkWalletConnection() {
    if (!isMetaMaskAvailable()) {
        return null;
    }

    try {
        const accounts = await window.ethereum.request({
            method: 'eth_accounts',
        });

        if (accounts.length > 0) {
            const address = accounts[0];

            // Get chain ID
            const chainIdHex = await window.ethereum.request({
                method: 'eth_chainId',
            });
            const currentChainId = parseInt(chainIdHex, 16);

            // Create wallet client
            const client = createWalletClient({
                account: address,
                chain: currentChainId === 1 ? mainnet : sepolia,
                transport: custom(window.ethereum)
            });

            // Update stores
            walletAddress.set(address);
            isWalletConnected.set(true);
            walletClient.set(client);
            chainId.set(currentChainId);

            return address;
        }
    } catch (error) {
        console.error('Error checking wallet connection:', error);
    }

    return null;
}

// Sign message with wallet
export async function signMessage(message) {
    const client = await new Promise((resolve) => {
        const unsubscribe = walletClient.subscribe((value) => {
            if (value) {
                unsubscribe();
                resolve(value);
            }
        });
    });

    if (!client) {
        throw new Error('Wallet not connected');
    }

    const address = await new Promise((resolve) => {
        const unsubscribe = walletAddress.subscribe((value) => {
            unsubscribe();
            resolve(value);
        });
    });

    if (!address) {
        throw new Error('Wallet address not available');
    }

    const signature = await client.signMessage({
        account: address,
        message
    });

    return signature;
}
