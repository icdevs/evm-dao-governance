import { writable, derived } from 'svelte/store';
import { backend } from '$lib/canisters.js';

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
        
        async load(forceReload = false) {
            update(state => {
                // Skip if already loading
                if (state.loading && !forceReload) return state;
                
                // Skip if data is fresh (less than 5 minutes old) and not forcing reload
                if (!forceReload && state.lastUpdated && state.contracts.length > 0) {
                    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                    if (state.lastUpdated > fiveMinutesAgo) {
                        return state;
                    }
                }
                
                return { ...state, loading: true, error: null };
            });

            try {
                const contracts = await backend.icrc149_get_snapshot_contracts();
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
            } catch (error) {
                console.error('Failed to load contracts:', error);
                update(state => ({
                    ...state,
                    loading: false,
                    error: error.message || 'Failed to load contracts'
                }));
            }
        },

        setSelectedContract(address) {
            update(state => ({
                ...state,
                selectedContract: address
            }));
        },

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
