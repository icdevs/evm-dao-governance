import { writable } from 'svelte/store';

// Authentication state store
export const authStore = writable({
    isAuthenticated: false,
    walletAddress: null,
    isConnecting: false,
    error: null
});

// Set authentication state
export function setAuth(address) {
    authStore.update(state => ({
        ...state,
        isAuthenticated: true,
        walletAddress: address,
        isConnecting: false,
        error: null
    }));
}

// Clear authentication state
export function clearAuth() {
    authStore.update(state => ({
        ...state,
        isAuthenticated: false,
        walletAddress: null,
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
