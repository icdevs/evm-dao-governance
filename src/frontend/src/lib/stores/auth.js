import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { siweStateStore } from '../siwe-provider.js';

// Authentication state store
export const authStore = writable({
    isAuthenticated: false,
    walletAddress: null,
    isConnecting: false,
    error: null,
    icpIdentity: null, // ICP identity from SIWE
    delegationChain: null // Delegation chain for ICP calls
});

// Derived store that combines wallet connection and SIWE authentication
export const siweAuthStore = derived(
    [authStore, siweStateStore],
    ([auth, siwe]) => ({
        ...auth,
        // SIWE-specific state
        isInitializing: siwe?.context?.isInitializing || false,
        isLoggingIn: siwe?.context?.loginStatus === 'logging-in',
        isLoginSuccess: siwe?.context?.loginStatus === 'success',
        isLoginError: siwe?.context?.loginStatus === 'error',
        loginError: siwe?.context?.loginError,
        identity: siwe?.context?.identity,
        identityAddress: siwe?.context?.identityAddress,
        delegationChain: siwe?.context?.delegationChain,
        // Combined authentication state
        isFullyAuthenticated: auth.isAuthenticated && siwe?.context?.identity !== undefined
    })
);

// Set wallet connection state
export function setWalletConnected(address) {
    authStore.update(state => ({
        ...state,
        isAuthenticated: true,
        walletAddress: address,
        isConnecting: false,
        error: null
    }));
}

// Set ICP identity from SIWE login
export function setIcpIdentity(identity, delegationChain) {
    authStore.update(state => ({
        ...state,
        icpIdentity: identity,
        delegationChain: delegationChain
    }));
}

// Clear authentication state
export function clearAuth() {
    authStore.update(state => ({
        ...state,
        isAuthenticated: false,
        walletAddress: null,
        isConnecting: false,
        error: null,
        icpIdentity: null,
        delegationChain: null
    }));
}

// Set authentication error
export function setAuthError(error) {
    authStore.update(state => ({
        ...state,
        isConnecting: false,
        error: error
    }));
}

// Set connecting state
export function setConnecting(connecting) {
    authStore.update(state => ({
        ...state,
        isConnecting: connecting,
        error: null
    }));
}
