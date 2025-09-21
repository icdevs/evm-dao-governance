import { writable, derived, readable } from 'svelte/store';
import { SiweManager, siweStateStore } from 'ic-siwe-js';

// SIWE Manager instance
let siweManager = null;

// Create stores for SIWE state - using the built-in siweStateStore
export const siweState = writable(null);
export const isInitializing = writable(true);

// Derived stores for common state checks
export const isLoggedIn = derived(siweState, ($state) => {
    return $state?.context?.identity != null;
});

export const loginStatus = derived(siweState, ($state) => {
    return $state?.context?.loginStatus ?? 'idle';
});

export const prepareLoginStatus = derived(siweState, ($state) => {
    return $state?.context?.prepareLoginStatus ?? 'idle';
});

export const signMessageStatus = derived(siweState, ($state) => {
    return $state?.context?.signMessageStatus ?? 'idle';
});

export const identity = derived(siweState, ($state) => {
    return $state?.context?.identity;
});

export const identityAddress = derived(siweState, ($state) => {
    return $state?.context?.identityAddress;
});

export const delegationChain = derived(siweState, ($state) => {
    return $state?.context?.delegationChain;
});

export const loginError = derived(siweState, ($state) => {
    return $state?.context?.loginError;
});

export const prepareLoginError = derived(siweState, ($state) => {
    return $state?.context?.prepareLoginError;
});

export const signMessageError = derived(siweState, ($state) => {
    return $state?.context?.signMessageError;
});

// Convenience boolean stores
export const isLoggingIn = derived(loginStatus, ($status) => $status === 'logging-in');
export const isLoginError = derived(loginStatus, ($status) => $status === 'error');
export const isLoginSuccess = derived(loginStatus, ($status) => $status === 'success');
export const isLoginIdle = derived(loginStatus, ($status) => $status === 'idle');

export const isPreparingLogin = derived(prepareLoginStatus, ($status) => $status === 'preparing');
export const isPrepareLoginError = derived(prepareLoginStatus, ($status) => $status === 'error');
export const isPrepareLoginSuccess = derived(prepareLoginStatus, ($status) => $status === 'success');
export const isPrepareLoginIdle = derived(prepareLoginStatus, ($status) => $status === 'idle');

// Initialize SIWE with canister ID
export function initSiwe(options = {}) {
    // If SIWE manager already exists and is functional, just ensure subscription
    if (siweManager) {
        console.log('SIWE already initialized, reusing existing instance');

        // Ensure we have a subscription if it was cleaned up
        if (!siweManager._svelte_unsubscribe) {
            console.log('Re-establishing SIWE state subscription');

            // Get current state immediately to set initial values
            const currentState = siweStateStore.getSnapshot();
            if (currentState) {
                console.log('Setting initial SIWE state from snapshot:', currentState);
                siweState.set(currentState);

                const isInitialized = currentState.context.identity != null ||
                    currentState.context.loginStatus === 'idle' ||
                    currentState.context.loginStatus === 'success';

                if (isInitialized) {
                    isInitializing.set(false);
                }
            }

            const unsubscribe = siweStateStore.subscribe((state) => {
                console.log('SIWE state update (re-established):', state?.context?.loginStatus, state?.context?.identity ? 'has identity' : 'no identity');
                siweState.set(state);

                // Update initialization status
                const isInitialized = state.context.identity != null ||
                    state.context.loginStatus === 'idle' ||
                    state.context.loginStatus === 'success';

                if (isInitialized) {
                    isInitializing.set(false);
                }
            });

            // Store the unsubscribe function for cleanup
            siweManager._svelte_unsubscribe = unsubscribe;
        }

        return siweManager;
    }

    // Create new manager only if one doesn't exist
    console.log('Creating new SIWE manager with canisterId:', process.env.CANISTER_ID_IC_SIWE_PROVIDER);
    console.log(process.env)

    siweManager = new SiweManager(process.env.CANISTER_ID_IC_SIWE_PROVIDER, options);

    // Get current state immediately to set initial values
    const initialState = siweStateStore.getSnapshot();
    if (initialState) {
        console.log('Setting initial SIWE state from new manager:', initialState);
        siweState.set(initialState);

        const isInitialized = initialState.context.identity != null ||
            initialState.context.loginStatus === 'idle' ||
            initialState.context.loginStatus === 'success';

        if (isInitialized) {
            isInitializing.set(false);
        }
    }

    // Subscribe to the built-in siweStateStore and update our custom store
    const unsubscribe = siweStateStore.subscribe((state) => {
        console.log('SIWE state update (new manager):', state?.context?.loginStatus, state?.context?.identity ? 'has identity' : 'no identity');
        siweState.set(state);

        // Update initialization status
        const isInitialized = state.context.identity != null ||
            state.context.loginStatus === 'idle' ||
            state.context.loginStatus === 'success';

        if (isInitialized) {
            isInitializing.set(false);
        }
    });

    // Store the unsubscribe function for cleanup
    siweManager._svelte_unsubscribe = unsubscribe;

    return siweManager;
}

// SIWE actions - following the useSiwe interface from the documentation
export const siweActions = {
    login: async () => {
        if (!siweManager) {
            throw new Error('SIWE not initialized. Call initSiwe first.');
        }
        console.log('Starting SIWE login...');
        return await siweManager.login();
    },

    prepareLogin: () => {
        if (!siweManager) {
            throw new Error('SIWE not initialized. Call initSiwe first.');
        }
        console.log('Preparing SIWE login...');
        siweManager.prepareLogin();
    },

    clear: () => {
        if (!siweManager) {
            throw new Error('SIWE not initialized. Call initSiwe first.');
        }
        console.log('Clearing SIWE session...');
        siweManager.clear();
    },

    getIdentity: () => {
        if (!siweManager) {
            return undefined;
        }
        const snapshot = siweStateStore.getSnapshot();
        return snapshot?.context?.identity;
    },

    getDelegationChain: () => {
        if (!siweManager) {
            return undefined;
        }
        const snapshot = siweStateStore.getSnapshot();
        return snapshot?.context?.delegationChain;
    },

    getIdentityAddress: () => {
        if (!siweManager) {
            return undefined;
        }
        const snapshot = siweStateStore.getSnapshot();
        return snapshot?.context?.identityAddress;
    },

    // Check for existing session (synchronous, like in the example)
    checkExistingSession: () => {
        if (!siweManager) {
            throw new Error('SIWE not initialized. Call initSiwe first.');
        }

        console.log('Checking for existing SIWE session...');

        // The SIWE manager automatically restores sessions on initialization
        const snapshot = siweStateStore.getSnapshot();
        console.log('Current SIWE state snapshot:', snapshot);

        return {
            isLoggedIn: snapshot?.context?.identity != null,
            identity: snapshot?.context?.identity,
            identityAddress: snapshot?.context?.identityAddress,
            loginStatus: snapshot?.context?.loginStatus
        };
    }
};

// Helper to get current SIWE manager instance
export function getSiweManager() {
    return siweManager;
}

// Component cleanup function - only clean up subscriptions, don't clear session
export function cleanupSiweComponent() {
    if (siweManager) {
        try {
            // DON'T clear the session - it should persist across component lifecycles
            // Only unsubscribe from state updates if we stored the unsubscribe function
            if (typeof siweManager._svelte_unsubscribe === 'function') {
                console.log('Unsubscribing from SIWE state updates');
                siweManager._svelte_unsubscribe();
                siweManager._svelte_unsubscribe = null; // Mark as cleaned up so initSiwe can re-establish
            }
        } catch (error) {
            console.warn('Error during SIWE component cleanup:', error);
        }
        // Don't set siweManager to null - keep it alive for session persistence
    }

    // Don't reset the state stores - let them maintain their values
    // The SIWE session should persist across component mount/unmount cycles
}

// Full cleanup function - clears session and resets everything (only for explicit logout)
export function cleanupSiwe() {
    if (siweManager) {
        try {
            // Clear the session
            siweManager.clear();

            // Unsubscribe from state updates if we stored the unsubscribe function
            if (typeof siweManager._svelte_unsubscribe === 'function') {
                siweManager._svelte_unsubscribe();
            }
        } catch (error) {
            console.warn('Error during SIWE cleanup:', error);
        } finally {
            siweManager = null;
        }
    }

    try {
        if (siweState && typeof siweState.set === 'function') {
            siweState.set(null);
        }
        if (isInitializing && typeof isInitializing.set === 'function') {
            isInitializing.set(true);
        }
    } catch (error) {
        console.warn('Error resetting SIWE state:', error);
    }
}

// Create a custom hook-like function similar to useSiwe for easier usage
export function createSiweContext(canisterId, options = {}) {
    initSiwe(canisterId, options);

    return {
        // State
        isInitializing,
        isLoggedIn,
        identity,
        identityAddress,
        delegationChain,

        // Login process state
        prepareLoginStatus,
        isPreparingLogin,
        isPrepareLoginError,
        isPrepareLoginSuccess,
        isPrepareLoginIdle,
        prepareLoginError,

        loginStatus,
        isLoggingIn,
        isLoginError,
        isLoginSuccess,
        isLoginIdle,
        loginError,

        // Sign message state
        signMessageStatus,
        signMessageError,

        // Actions
        ...siweActions
    };
}
