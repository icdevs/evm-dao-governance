import { browser } from '$app/environment';
import { SiweMessage } from 'siwe';
import { ethers } from 'ethers';
import { setAuth, setAuthError, setConnecting, clearAuth } from './stores/auth.js';

let provider = null;
let signer = null;
let currentWalletType = null;

// Wallet types
export const WALLET_TYPES = {
    METAMASK: 'metamask',
    COINBASE: 'coinbase',
    INJECTED: 'injected'
};

// Detect available wallets
export function getAvailableWallets() {
    const wallets = [];
    
    if (browser && window.ethereum) {
        // Handle multiple providers (when multiple wallets are installed)
        if (window.ethereum.providers && window.ethereum.providers.length > 1) {
            window.ethereum.providers.forEach((provider, index) => {
                if (provider.isMetaMask) {
                    wallets.push({
                        type: WALLET_TYPES.METAMASK,
                        name: 'MetaMask',
                        icon: '🦊',
                        provider: provider
                    });
                } else if (provider.isCoinbaseWallet) {
                    wallets.push({
                        type: WALLET_TYPES.COINBASE,
                        name: 'Coinbase Wallet',
                        icon: '🔵',
                        provider: provider
                    });
                } else {
                    wallets.push({
                        type: WALLET_TYPES.INJECTED,
                        name: `Wallet ${index + 1}`,
                        icon: '💼',
                        provider: provider
                    });
                }
            });
        } else {
            // Single provider case
            if (window.ethereum.isMetaMask) {
                wallets.push({
                    type: WALLET_TYPES.METAMASK,
                    name: 'MetaMask',
                    icon: '🦊',
                    provider: window.ethereum
                });
            } else if (window.ethereum.isCoinbaseWallet) {
                wallets.push({
                    type: WALLET_TYPES.COINBASE,
                    name: 'Coinbase Wallet',
                    icon: '🔵',
                    provider: window.ethereum
                });
            } else {
                wallets.push({
                    type: WALLET_TYPES.INJECTED,
                    name: 'Injected Wallet',
                    icon: '💼',
                    provider: window.ethereum
                });
            }
        }
    }
    
    return wallets;
}

// Connect wallet with specific provider
export async function connectWallet(walletType = null) {
    try {
        setConnecting(true);
        
        let targetProvider = window.ethereum;
        
        // If specific wallet type requested, find the right provider
        if (walletType && window.ethereum.providers) {
            const found = window.ethereum.providers.find(p => {
                switch (walletType) {
                    case WALLET_TYPES.METAMASK:
                        return p.isMetaMask;
                    case WALLET_TYPES.COINBASE:
                        return p.isCoinbaseWallet;
                    default:
                        return false;
                }
            });
            if (found) {
                targetProvider = found;
            }
        }
        
        // Create provider with the selected wallet
        provider = new ethers.BrowserProvider(targetProvider);
        currentWalletType = walletType;
        
        // Request account access
        await targetProvider.request({ method: "eth_requestAccounts" });
        signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        setAuth(address);
        return address;
    } catch (error) {
        console.error('Failed to connect wallet:', error);
        setAuthError(error.message);
        throw error;
    } finally {
        setConnecting(false);
    }
}

// Disconnect wallet
export function disconnectWallet() {
    provider = null;
    signer = null;
    currentWalletType = null;
    clearAuth();
}

// Get current wallet address
export async function getCurrentAddress() {
    if (!browser || !window.ethereum) {
        return null;
    }
    
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
        console.error('Failed to get current address:', error);
        return null;
    }
}

// Check if wallet is connected
export async function isWalletConnected() {
    if (!browser || !window.ethereum) {
        return false;
    }
    
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        return accounts.length > 0;
    } catch (error) {
        console.error('Failed to check wallet connection:', error);
        return false;
    }
}

// Get current chain ID
export async function getCurrentChainId() {
    if (!browser || !window.ethereum) {
        return null;
    }
    
    try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        return parseInt(chainId, 16);
    } catch (error) {
        console.error('Failed to get chain ID:', error);
        return null;
    }
}

// Switch to a specific network
export async function switchNetwork(chainId) {
    if (!browser || !window.ethereum) {
        throw new Error('Ethereum provider not available');
    }
    
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${chainId.toString(16)}` }]
        });
    } catch (error) {
        throw new Error(`Failed to switch to network ${chainId}: ${error.message}`);
    }
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

// Get the currently connected wallet type
export function getCurrentWalletType() {
    return currentWalletType;
}
