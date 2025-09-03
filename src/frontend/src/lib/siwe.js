import { writable, derived, get } from 'svelte/store';
import { SiweManager } from 'ic-siwe-js';

// SIWE Manager instance
let siweManager = null;

// Create stores for SIWE state
export const siweState = writable(null);
export const isInitializing = writable(true);

// Derived stores for common state checks
export const isLoggedIn = derived(siweState, ($state) => {
    return $state?.identity != null;
});

export const loginStatus = derived(siweState, ($state) => {
    return $state?.loginStatus ?? 'idle';
});

export const prepareLoginStatus = derived(siweState, ($state) => {
    return $state?.prepareLoginStatus ?? 'idle';
});

export const identity = derived(siweState, ($state) => {
    return $state?.identity;
});

export const identityAddress = derived(siweState, ($state) => {
    return $state?.identityAddress;
});

export const loginError = derived(siweState, ($state) => {
    return $state?.loginError;
});

// Initialize SIWE with canister ID
export function initSiwe(canisterId, options) {
    if (siweManager) {
        console.warn('SIWE already initialized');
        return siweManager;
    }

    siweManager = new SiweManager(canisterId, options);

    // Subscribe to state changes and update our store
    siweManager.subscribe((state) => {
        siweState.set(state);

        // Update initialization status
        if (get(isInitializing) && (state.identity || state.loginStatus === 'idle')) {
            isInitializing.set(false);
        }
    });

    return siweManager;
}

// SIWE actions
export const siweActions = {
    login: async () => {
        if (!siweManager) {
            throw new Error('SIWE not initialized. Call initSiwe first.');
        }
        return await siweManager.login();
    },

    prepareLogin: () => {
        if (!siweManager) {
            throw new Error('SIWE not initialized. Call initSiwe first.');
        }
        siweManager.prepareLogin();
    },

    clear: () => {
        if (!siweManager) {
            throw new Error('SIWE not initialized. Call initSiwe first.');
        }
        siweManager.clear();
    },

    getIdentity: () => {
        if (!siweManager) {
            return undefined;
        }
        const state = siweManager.getSnapshot();
        return state.identity;
    },

    getDelegationChain: () => {
        if (!siweManager) {
            return undefined;
        }
        const state = siweManager.getSnapshot();
        return state.delegationChain;
    }
};

// Helper to get current SIWE manager instance
export function getSiweManager() {
    return siweManager;
}

// Cleanup function
export function cleanupSiwe() {
    if (siweManager) {
        // siweManager doesn't have a cleanup method, but we can clear state
        siweManager.clear();
        siweManager = null;
    }
    siweState.set(null);
    isInitializing.set(true);
}
