import { writable, derived } from 'svelte/store';
import { getTotalSupply, getTokenHolderCount } from '../blockchain.js';
import { configStore } from './config.js';
import { getCurrentChainId } from '../ethereum.js';

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
        
        // Load governance statistics
        load: async (forceReload = false) => {
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
                // Get current config state
                let config;
                const unsubscribe = configStore.subscribe(value => config = value);
                unsubscribe();
                
                if (!config.isConfigured || !config.contractAddress) {
                    throw new Error('Contract address not configured');
                }

                const chainId = await getCurrentChainId();
                if (!chainId) {
                    throw new Error('Chain ID not available');
                }

                // Get total supply (voting power) and member count in parallel
                const [totalVotingPower, memberCount] = await Promise.all([
                    getTotalSupply(config.contractAddress, chainId),
                    getTokenHolderCount(config.contractAddress, chainId)
                ]);
                
                update(state => ({
                    ...state,
                    totalVotingPower,
                    memberCount,
                    loading: false,
                    lastUpdated: new Date()
                }));
                
                return { totalVotingPower, memberCount };
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
