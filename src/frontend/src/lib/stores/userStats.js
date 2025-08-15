import { writable, derived } from 'svelte/store';
import { proposalsStore, getUserVotingData } from './proposals.js';
import { authStore } from './auth.js';

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
        
        // Load user voting statistics
        load: async (walletAddress) => {
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
                // Get current proposals from the proposals store
                const proposalsState = proposalsStore.subscribe(state => state);
                let proposals = [];
                proposalsState(state => {
                    proposals = state.proposals;
                });
                proposalsState(); // Unsubscribe immediately
                
                const userVotingData = await getUserVotingData(walletAddress, proposals);
                
                update(state => ({
                    ...state,
                    ...userVotingData,
                    loading: false
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

// Derived store that automatically loads user stats when auth state changes
export const autoUserStats = derived(
    [authStore, proposalsStore],
    ([$authStore, $proposalsStore], set) => {
        // Add debouncing to prevent rapid successive calls
        const walletAddress = $authStore.walletAddress;
        const hasProposals = $proposalsStore.proposals.length > 0;
        const isAuthenticated = $authStore.isAuthenticated;
        
        if (isAuthenticated && walletAddress && hasProposals && !$proposalsStore.loading) {
            // Load user stats when wallet is connected and proposals are available
            getUserVotingData(walletAddress, $proposalsStore.proposals)
                .then(stats => set(stats))
                .catch(error => {
                    console.error('Failed to load auto user stats:', error);
                    set({
                        votedOn: 0,
                        participationRate: 0,
                        existingVotes: new Map()
                    });
                });
        } else {
            set({
                votedOn: 0,
                participationRate: 0,
                existingVotes: new Map()
            });
        }
    },
    {
        votedOn: 0,
        participationRate: 0,
        existingVotes: new Map()
    }
);
