import { writable } from 'svelte/store';

// Governance statistics store
function createGovernanceStatsStore() {
    const { subscribe, set, update } = writable({
        totalVotingPower: '-',
        memberCount: '-',
        loading: false,
        error: null,
        lastUpdated: null
    });

    return {
        subscribe,
        
        // Load governance statistics using provided functions
        load: async (getTotalSupplyFn, getMemberCountFn = null, forceReload = false) => {
            // Check if we should skip loading
            let currentState;
            const unsubscribe = subscribe(state => currentState = state);
            unsubscribe();
            
            // Skip loading if data exists and not forcing reload
            if (!forceReload && currentState.lastUpdated && 
                currentState.totalVotingPower !== '-' && 
                currentState.memberCount !== '-' && 
                !currentState.loading) {
                return {
                    totalVotingPower: currentState.totalVotingPower,
                    memberCount: currentState.memberCount
                };
            }
            
            update(state => ({ ...state, loading: true, error: null }));
            
            try {
                // Get total supply (voting power)
                const totalVotingPower = await getTotalSupplyFn();
                
                // Get member count if function provided, otherwise use placeholder
                const memberCount = getMemberCountFn ? await getMemberCountFn() : "-";
                
                const stats = { totalVotingPower, memberCount };
                
                update(state => ({
                    ...state,
                    ...stats,
                    loading: false,
                    lastUpdated: new Date(),
                    error: null
                }));

                return stats;
            } catch (error) {
                console.error("Failed to load governance stats:", error);
                update(state => ({
                    ...state,
                    error: error.message || "Failed to load governance stats",
                    loading: false
                }));
                throw error;
            }
        },

        // Update stats manually
        updateStats: (stats) => {
            update(state => ({
                ...state,
                ...stats,
                lastUpdated: new Date()
            }));
        },

        // Set loading state
        setLoading: (loading) => {
            update(state => ({ ...state, loading }));
        },

        // Set error state
        setError: (error) => {
            update(state => ({ 
                ...state, 
                error: error,
                loading: false 
            }));
        },

        // Clear error
        clearError: () => {
            update(state => ({ ...state, error: null }));
        },

        // Reset the store
        reset: () => {
            set({
                totalVotingPower: '-',
                memberCount: '-',
                loading: false,
                error: null,
                lastUpdated: null
            });
        }
    };
}

export const governanceStatsStore = createGovernanceStatsStore();