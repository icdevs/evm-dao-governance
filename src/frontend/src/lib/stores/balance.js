import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Balance store that persists data across component mounts
function createBalanceStore() {
    const { subscribe, set, update } = writable({
        ethBalance: "0.0",
        tokenBalance: "0.0",
        canisterAddress: "",
        isLoading: false,
        isInitialLoad: true,
        lastUpdated: null,
        chainId: null
    });

    const store = {
        subscribe,
        
        // Load balances (with optional silent mode)
        load: async (getBalancesFn, silent = false) => {
            if (!silent) {
                update(state => ({ ...state, isLoading: true }));
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
                    isLoading: false
                }));

                return balances;
            } catch (error) {
                update(state => ({ 
                    ...state, 
                    isLoading: false 
                }));
                throw error;
            }
        },

        // Check if we should load (based on age of data)
        shouldLoad: (currentState, maxAge = 60000) => { // 1 minute default
            if (!currentState.lastUpdated) return true;
            if (currentState.ethBalance === "0.0" && currentState.tokenBalance === "0.0") return true;
            
            const age = Date.now() - currentState.lastUpdated.getTime();
            return age > maxAge;
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
                chainId: null
            });
        }
    };

    // Force refresh method
    store.refresh = async (getBalancesFn) => {
        return await store.load(getBalancesFn, false);
    };

    return store;
}

export const balanceStore = createBalanceStore();
