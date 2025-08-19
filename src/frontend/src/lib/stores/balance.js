import { writable } from 'svelte/store';

// Balance store that persists data across component mounts
function createBalanceStore() {
    const { subscribe, set, update } = writable({
        ethBalance: "0.0",
        tokenBalance: "0.0",
        canisterAddress: "",
        isLoading: false,
        isInitialLoad: true,
        lastUpdated: null,
        chainId: null,
        error: null
    });

    const store = {
        subscribe,
        
        // Load balances using provided loader function
        load: async (getBalancesFn, silent = false) => {
            if (!silent) {
                update(state => ({ ...state, isLoading: true, error: null }));
            }

            try {
                const balances = await getBalancesFn();
                
                update(state => ({
                    ...state,
                    ethBalance: balances.ethBalance || "0.0",
                    tokenBalance: balances.tokenBalance || "0.0",
                    canisterAddress: balances.canisterAddress || "",
                    chainId: balances.chainId || null,
                    isInitialLoad: false,
                    lastUpdated: new Date(),
                    isLoading: false,
                    error: null
                }));

                return balances;
            } catch (error) {
                update(state => ({ 
                    ...state, 
                    isLoading: false,
                    error: error.message || 'Failed to load balances'
                }));
                throw error;
            }
        },

        // Update specific balance fields
        updateBalances: (balanceUpdates) => {
            update(state => ({
                ...state,
                ...balanceUpdates,
                lastUpdated: new Date()
            }));
        },

        // Set loading state
        setLoading: (loading) => {
            update(state => ({ ...state, isLoading: loading }));
        },

        // Set error state
        setError: (error) => {
            update(state => ({ 
                ...state, 
                error: error,
                isLoading: false 
            }));
        },

        // Clear error
        clearError: () => {
            update(state => ({ ...state, error: null }));
        },

        // Clear all data
        clear: () => {
            set({
                ethBalance: "0.0",
                tokenBalance: "0.0",
                canisterAddress: "",
                isLoading: false,
                isInitialLoad: true,
                lastUpdated: null,
                chainId: null,
                error: null
            });
        }
    };

    return store;
}

// Helper function to check if we should load (can be used by components)
export function shouldLoadBalances(currentState, maxAge = 60000) {
    if (!currentState.lastUpdated) return true;
    if (currentState.ethBalance === "0.0" && currentState.tokenBalance === "0.0") return true;
    
    const age = Date.now() - currentState.lastUpdated.getTime();
    return age > maxAge;
}

export const balanceStore = createBalanceStore();