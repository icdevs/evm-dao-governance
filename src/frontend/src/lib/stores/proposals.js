import { writable, derived } from 'svelte/store';

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
        
        // Load proposals using provided backend actor
        load: async (backendActor, filters = [], forceReload = false) => {
            // Skip loading if data is already loaded and not forcing reload
            let currentState;
            const unsubscribe = subscribe(state => currentState = state);
            unsubscribe();
            
            if (!forceReload && currentState.proposals.length > 0 && !currentState.loading) {
                return currentState.proposals;
            }
            
            update(state => ({ ...state, loading: true, error: null }));
            
            try {
                const result = await backendActor.icrc149_get_proposals([], [], filters);
                
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
                    lastUpdated: new Date(),
                    error: null
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

        // Set proposals manually
        setProposals: (proposals) => {
            update(state => ({
                ...state,
                proposals,
                lastUpdated: new Date()
            }));
        },

        // Add a new proposal
        addProposal: (proposal) => {
            update(state => ({
                ...state,
                proposals: [proposal, ...state.proposals],
                lastUpdated: new Date()
            }));
        },

        // Update a specific proposal
        updateProposal: (proposalId, updates) => {
            update(state => ({
                ...state,
                proposals: state.proposals.map(p => 
                    p.id === proposalId ? { ...p, ...updates } : p
                ),
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

// Derived stores for statistics (no get() usage here)
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

// Function to get user voting data (accepts parameters instead of using get())
export async function getUserVotingData(backendActor, walletAddress, proposals) {
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
        const voteResults = await backendActor.icrc149_get_user_votes(voteRequests);
        
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