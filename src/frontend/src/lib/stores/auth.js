import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Authentication state store
export const authStore = writable({
    isAuthenticated: false,
    walletAddress: null,
    walletType: null,
    isConnecting: false,
    error: null
});

// Set authentication state
export function setAuth(address, walletType = null) {
    authStore.update(state => ({
        ...state,
        isAuthenticated: true,
        walletAddress: address,
        walletType: walletType,
        isConnecting: false,
        error: null
    }));

    // Save wallet preference to localStorage
    if (browser && walletType) {
        localStorage.setItem('preferred-wallet', walletType);
    }
}

// Get preferred wallet type from localStorage
export function getPreferredWallet() {
    if (browser) {
        return localStorage.getItem('preferred-wallet');
    }
    return null;
}

// Clear authentication state
export function clearAuth() {
    authStore.update(state => ({
        ...state,
        isAuthenticated: false,
        walletAddress: null,
        walletType: null,
        isConnecting: false,
        error: null
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
