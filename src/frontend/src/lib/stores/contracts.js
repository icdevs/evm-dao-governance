import { writable } from 'svelte/store';

// Contracts store
function createContractsStore() {
    const { subscribe, set, update } = writable({
        contracts: [],
        selectedContract: '',
        loading: false,
        lastUpdated: null,
        error: null
    });

    return {
        subscribe,
        
        // Load contracts using provided backend actor
        async load(backendActor, forceReload = false) {
            // Skip if already loading
            let currentState;
            const unsubscribe = subscribe(state => currentState = state);
            unsubscribe();
            
            if (currentState.loading && !forceReload) {
                return currentState.contracts;
            }
            
            // Skip if data is fresh (less than 5 minutes old) and not forcing reload
            if (!forceReload && currentState.lastUpdated && currentState.contracts.length > 0) {
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                if (currentState.lastUpdated > fiveMinutesAgo) {
                    return currentState.contracts;
                }
            }
            
            update(state => ({ ...state, loading: true, error: null }));

            try {
                const contracts = await backendActor.icrc149_get_snapshot_contracts();
                const mappedContracts = contracts.map(([address, config]) => ({
                    address,
                    config,
                    label: `${address.slice(0, 6)}...${address.slice(-4)} - ${config.contract_type === "ERC20" ? "ERC20" : "ERC721"}`,
                }));

                update(state => {
                    const newSelectedContract = state.selectedContract || 
                        (mappedContracts.length > 0 ? mappedContracts[0].address : '');
                    
                    return {
                        contracts: mappedContracts,
                        selectedContract: newSelectedContract,
                        loading: false,
                        lastUpdated: Date.now(),
                        error: null
                    };
                });

                return mappedContracts;
            } catch (error) {
                console.error('Failed to load contracts:', error);
                update(state => ({
                    ...state,
                    loading: false,
                    error: error.message || 'Failed to load contracts'
                }));
                throw error;
            }
        },

        // Set selected contract
        setSelectedContract(address) {
            update(state => ({
                ...state,
                selectedContract: address
            }));
        },

        // Update contracts list
        setContracts(contracts) {
            update(state => ({
                ...state,
                contracts,
                lastUpdated: Date.now()
            }));
        },

        // Set loading state
        setLoading(loading) {
            update(state => ({ ...state, loading }));
        },

        // Set error state
        setError(error) {
            update(state => ({ 
                ...state, 
                error: error,
                loading: false 
            }));
        },

        // Clear error
        clearError() {
            update(state => ({ ...state, error: null }));
        },

        // Reset store
        reset() {
            set({
                contracts: [],
                selectedContract: '',
                loading: false,
                lastUpdated: null,
                error: null
            });
        }
    };
}

export const contractsStore = createContractsStore();