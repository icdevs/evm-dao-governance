import { writable } from 'svelte/store';
import { Actor, HttpAgent, AnonymousIdentity } from '@dfinity/agent';
import { idlFactory } from '../../../../declarations/backend/backend.did.js';
import { configStore } from './config.js';

function createAgentStore() {
    const { subscribe, set, update } = writable({
        agent: null,
        actor: null,
        isLocal: false,
        state: 'disconnected',
        error: null
    });

    // Subscribe to configStore and initialize when canisterId and environment change
    configStore.subscribe(async (config) => {
        if (config && config.canisterId && config.environment) {
            console.log("Initializing agent...");
            update(state => ({ ...state, state: 'connecting', error: null }));
            try {
                const local = config.environment === 'local';
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
                    canisterId: config.canisterId
                });
                const canisterData = {
                    agent: agentInstance,
                    actor: actor,
                    isLocal: local,
                    state: 'connected',
                    error: null
                };
                set(canisterData);
            } catch (error) {
                update(state => ({
                    ...state,
                    state: 'error',
                    error: error.message || 'Failed to initialize canister'
                }));
            }
        } else {
            // Reset if config is missing
            set({
                agent: null,
                actor: null,
                isLocal: false,
                state: 'disconnected',
                error: null
            });
        }
    });

    const store = {
        subscribe,
        // Clear error
        clearError: () => {
            update(state => ({ ...state, error: null }));
        }
    };

    return store;
}

export const agentStore = createAgentStore();