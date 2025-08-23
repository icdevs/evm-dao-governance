import { writable, derived } from 'svelte/store';
import { getUserVotingData } from './proposals.js';

// User voting statistics store
function createUserStatsStore() {
    const { subscribe, set, update } = writable({
        votedOn: 0,
        participationRate: 0,
        existingVotes: new Map(),
        loading: false,
        error: null
    });

    return {
        subscribe,
        
        // Load user voting statistics using provided parameters
        load: async (backendActor, walletAddress, proposals) => {
            if (!walletAddress) {
                set({
                    votedOn: 0,
                    participationRate: 0,
                    existingVotes: new Map(),
                    loading: false,
                    error: null
                });
                return;
            }

            update(state => ({ ...state, loading: true, error: null }));
            
            try {
                const userVotingData = await getUserVotingData(backendActor, walletAddress, proposals);
                
                update(state => ({
                    ...state,
                    ...userVotingData,
                    loading: false,
                    error: null
                }));
                
                return userVotingData;
            } catch (error) {
                console.error('Failed to load user voting data:', error);
                update(state => ({
                    ...state,
                    error: error.message,
                    loading: false
                }));
                throw error;
            }
        },

        // Update user stats manually
        updateStats: (stats) => {
            update(state => ({
                ...state,
                ...stats
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
        
        // Clear user statistics
        clear: () => {
            set({
                votedOn: 0,
                participationRate: 0,
                existingVotes: new Map(),
                loading: false,
                error: null
            });
        }
    };
}

export const userStatsStore = createUserStatsStore();