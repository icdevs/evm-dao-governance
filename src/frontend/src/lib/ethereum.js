import { browser } from '$app/environment';
import { createWalletClient, custom } from 'viem';
import { mainnet, hardhat } from 'viem/chains';
import { siweManager } from './siwe-provider.js';
import { setWalletConnected, setAuthError, setConnecting, clearAuth, setIcpIdentity } from './stores/auth.js';

let walletClient = null;
let currentAddress = null;

// Initialize wallet client
export async function initializeWalletClient() {
    if (!browser || !window.ethereum) {
        throw new Error('MetaMask or compatible wallet not found');
    }
    
    // Determine the chain based on environment
    const chain = window.location.hostname === 'localhost' ? hardhat : mainnet;
    
    walletClient = createWalletClient({
        chain,
        transport: custom(window.ethereum)
    });
    
    // Set the wallet client in the SIWE manager
    if (siweManager) {
        siweManager.setWalletClient(walletClient);
    }
    
    return walletClient;
}

// Connect wallet (just wallet connection, not SIWE login)
export async function connectWallet() {
    try {
        setConnecting(true);
        
        if (!walletClient) {
            await initializeWalletClient();
        }
        
        // Request account access
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Get the first account
        const [address] = await walletClient.getAddresses();
        if (!address) {
            throw new Error('No accounts available');
        }
        
        currentAddress = address;
        setWalletConnected(address);
        return address;
    } catch (error) {
        console.error('Failed to connect wallet:', error);
        setAuthError(error.message);
        throw error;
    }
}

// Full SIWE login process (wallet connection + ICP identity)
export async function loginWithSiwe() {
    try {
        // First ensure wallet is connected
        if (!currentAddress) {
            await connectWallet();
        }
        
        if (!siweManager) {
            throw new Error('SIWE manager not initialized');
        }
        
        // Perform SIWE login to get ICP identity
        const identity = await siweManager.login();
        
        if (identity) {
            // Get the delegation chain from the SIWE state
            const state = siweManager.siweStateStore?.getSnapshot?.()?.context;
            setIcpIdentity(identity, state?.delegationChain);
        }
        
        return identity;
    } catch (error) {
        console.error('SIWE login failed:', error);
        setAuthError(error.message);
        throw error;
    }
}

// Disconnect wallet and clear SIWE session
export function disconnectWallet() {
    walletClient = null;
    currentAddress = null;
    
    // Clear SIWE session
    if (siweManager) {
        siweManager.clear();
    }
    
    clearAuth();
}

// Get current wallet address
export async function getCurrentAddress() {
    if (!walletClient) {
        return null;
    }
    
    try {
        const [address] = await walletClient.getAddresses();
        return address;
    } catch (error) {
        console.error('Failed to get current address:', error);
        return null;
    }
}

// Get current chain ID
export async function getCurrentChainId() {
    if (!walletClient) {
        return null;
    }
    
    try {
        const chainId = await walletClient.getChainId();
        return Number(chainId);
    } catch (error) {
        console.error('Failed to get chain ID:', error);
        return null;
    }
}

// Switch to a specific network
export async function switchNetwork(chainId) {
    if (!window.ethereum) {
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

// Legacy function for backward compatibility - now just calls loginWithSiwe
export async function createSiweProofForProposal(contractAddress, chainId = 31337) {
    console.warn('createSiweProofForProposal is deprecated. Use loginWithSiwe() instead.');
    await loginWithSiwe();
    // Note: The actual SIWE proof generation is now handled by the ic-siwe-provider canister
    // This function is kept for backward compatibility but should be removed in future versions
    return { message: 'SIWE login completed', signature: new Uint8Array() };
}

// Legacy function for backward compatibility - now just calls loginWithSiwe
export async function createSiweProofForVoting(proposalId, choice, contractAddress, chainId = 31337) {
    console.warn('createSiweProofForVoting is deprecated. Use loginWithSiwe() instead.');
    await loginWithSiwe();
    // Note: The actual SIWE proof generation is now handled by the ic-siwe-provider canister
    // This function is kept for backward compatibility but should be removed in future versions
    return { message: 'SIWE login completed', signature: new Uint8Array() };
}
