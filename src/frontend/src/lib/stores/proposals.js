import { writable, derived } from 'svelte/store';
import { backend } from '../canisters.js';

// Proposals state store
function createProposalsStore() {
    const { subscribe, set, update } = writable({
        proposals: [],
        loading: false,
        error: null,
        lastUpdated: null
    });

    return {
        subscribe,
        
        // Load proposals from backend
        load: async (filters = [], forceReload = false) => {
            // Skip loading if data is already loaded and not forcing reload
            let currentState;
            const unsubscribe = subscribe(state => currentState = state);
            unsubscribe();
            
            if (!forceReload && currentState.proposals.length > 0 && !currentState.loading) {
                return currentState.proposals;
            }
            
            update(state => ({ ...state, loading: true, error: null }));
            
            try {
                const result = await backend.icrc149_get_proposals([], [], filters);
                
                const proposals = result.map((proposal) => ({
                    ...proposal,
                    createdAt: new Date(Number(proposal.created_at) / 1_000_000),
                    deadline: new Date(Number(proposal.deadline) / 1_000_000),
                    isActive: proposal.status.hasOwnProperty("open"),
                    isExecuted: proposal.status.hasOwnProperty("executed"),
                    isFailed: proposal.status.hasOwnProperty("failed"),
                    isExecuting: proposal.status.hasOwnProperty("executing"),
                    isPending: proposal.status.hasOwnProperty("pending"),
                    isExpired: proposal.status.hasOwnProperty("expired"),
                    isRejected: proposal.status.hasOwnProperty("rejected")
                }));
                
                update(state => ({
                    ...state,
                    proposals,
                    loading: false,
                    lastUpdated: new Date()
                }));
                
                return proposals;
            } catch (error) {
                console.error("Failed to load proposals:", error);
                update(state => ({
                    ...state,
                    error: error.message || "Failed to load proposals",
                    loading: false
                }));
                throw error;
            }
        },
        
        // Refresh proposals
        refresh: async () => {
            const store = createProposalsStore();
            return store.load();
        },
        
        // Clear proposals
        clear: () => {
            set({
                proposals: [],
                loading: false,
                error: null,
                lastUpdated: null
            });
        }
    };
}

export const proposalsStore = createProposalsStore();

// Derived stores for statistics
export const proposalStats = derived(proposalsStore, ($proposalsStore) => {
    const { proposals } = $proposalsStore;
    
    return {
        total: proposals.length,
        active: proposals.filter(p => p.isActive).length,
        executed: proposals.filter(p => p.isExecuted).length,
        failed: proposals.filter(p => p.isFailed).length,
        pending: proposals.filter(p => p.isPending).length,
        expired: proposals.filter(p => p.isExpired).length,
        rejected: proposals.filter(p => p.isRejected).length
    };
});

// Derived store for user voting participation (requires wallet address)
export const createUserStats = (walletAddress) => derived(
    proposalsStore, 
    ($proposalsStore) => {
        const { proposals } = $proposalsStore;
        
        if (!walletAddress) {
            return {
                votedOn: 0,
                participationRate: 0
            };
        }
        
        // Count proposals the user has voted on
        // This would need to be implemented based on your voting data structure
        // For now, this is a placeholder until we implement vote tracking
        const votedProposals = proposals.filter(proposal => {
            // TODO: Check if walletAddress has voted on this proposal
            // This would require calling icrc149_get_user_votes with the proposal IDs
            return false; // Placeholder
        });
        
        return {
            votedOn: votedProposals.length,
            participationRate: proposals.length > 0 ? 
                Math.round((votedProposals.length / proposals.length) * 100) : 0
        };
    }
);

// Function to get user voting data for a specific address
export async function getUserVotingData(walletAddress, proposals) {
    if (!walletAddress || !proposals || proposals.length === 0) {
        return {
            votedOn: 0,
            participationRate: 0,
            existingVotes: new Map()
        };
    }

    try {
        // Build requests array for bulk vote checking
        const voteRequests = proposals.map(proposal => ({
            proposal_id: BigInt(Number(proposal.id)),
            user_address: walletAddress
        }));

        // Use the bulk vote checking function
        const voteResults = await backend.icrc149_get_user_votes(voteRequests);
        
        // Process results into existing votes map
        const existingVotes = new Map();
        voteResults.forEach(result => {
            const proposalId = Number(result.proposal_id);
            if (result.vote && result.vote.length > 0) {
                // Extract the vote choice from the optional variant
                const voteChoice = Object.keys(result.vote[0])[0]; // 'Yes', 'No', or 'Abstain'
                existingVotes.set(proposalId, voteChoice);
            }
        });

        const votedOn = existingVotes.size;
        const participationRate = proposals.length > 0 ? 
            Math.round((votedOn / proposals.length) * 100) : 0;

        return {
            votedOn,
            participationRate,
            existingVotes
        };
    } catch (error) {
        console.error('Failed to get user voting data:', error);
        return {
            votedOn: 0,
            participationRate: 0,
            existingVotes: new Map()
        };
    }
}
