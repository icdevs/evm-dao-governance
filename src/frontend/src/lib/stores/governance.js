import { writable } from 'svelte/store';
import { getTotalSupply } from "$lib/storage-slot-security-analysis.js";
import { formatTokenAmount, getTokenInfo } from '../utils';

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
        load: async (provider, contractAddress, forceReload = false) => {
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
                const [totalVotingPower, tokenInfo] = await Promise.all([
                    getTotalSupply(provider, contractAddress),
                    getTokenInfo(provider, contractAddress)
                ]);

                const totalVotingPowerFormatted = formatTokenAmount(totalVotingPower, tokenInfo.decimals);

                update(state => ({
                    ...state,
                    totalVotingPower,
                    totalVotingPowerFormatted,
                    loading: false,
                    lastUpdated: new Date(),
                    error: null
                }));

            } catch (error) {
                console.error("Failed to load governance stats:", error);
                update(state => ({
                    ...state,
                    error: error.message || "Failed to load governance stats",
                    loading: false
                }));
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