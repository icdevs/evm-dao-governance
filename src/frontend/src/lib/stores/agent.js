import { writable } from 'svelte/store';
import { Actor, HttpAgent, AnonymousIdentity } from '@dfinity/agent';
import { idlFactory } from '../../../../declarations/backend/backend.did.js';

function createAgentStore() {
    const { subscribe, set, update } = writable({
        agent: null,
        actor: null,
        canisterId: null,
        isLocal: false,
        state: 'disconnected', // 'disconnected', 'connecting', 'connected', 'error'
        error: null
    });

    const store = {
        subscribe,

        // Initialize canister connection
        initialize: async (targetCanisterId, environment = 'local') => {
            update(state => ({ ...state, state: 'connecting', error: null }));

            try {
                const local = environment === 'local';

                let agentInstance;
                if (local) {
                    agentInstance = await HttpAgent.create({
                        host: 'http://127.0.0.1:4943',
                        identity: new AnonymousIdentity()
                    });
                    await agentInstance.fetchRootKey();
                } else {
                    agentInstance = await HttpAgent.create({
                        host: 'https://ic0.app',
                        identity: new AnonymousIdentity()
                    });
                }

                const actor = Actor.createActor(idlFactory, {
                    agent: agentInstance,
                    canisterId: targetCanisterId
                });

                const canisterData = {
                    agent: agentInstance,
                    actor: actor,
                    canisterId: targetCanisterId,
                    isLocal: local,
                    state: 'connected',
                    error: null
                };

                set(canisterData);
                return canisterData;
            } catch (error) {
                update(state => ({
                    ...state,
                    state: 'error',
                    error: error.message || 'Failed to initialize canister'
                }));
                throw error;
            }
        },

        // Clear error
        clearError: () => {
            update(state => ({ ...state, error: null }));
        },

    };

    return store;
}

export const agentStore = createAgentStore();