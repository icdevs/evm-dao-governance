import { writable } from 'svelte/store';
import { Actor, HttpAgent, AnonymousIdentity } from '@dfinity/agent';
import { idlFactory } from '../../../../declarations/backend/backend.did.js';

// Core canister state
export const agent = writable(null);
export const canisterActor = writable(null);
export const canisterId = writable(null);
export const isLocal = writable(false);
export const storageSlot = writable(null);

// Initialize IC canister connection
export async function initializeCanister(targetCanisterId, environment = 'local') {
    const local = environment === 'local';
    isLocal.set(local);
    
    let agentInstance;
    if (local) {
        // Local development configuration
        agentInstance = await HttpAgent.create({
            host: 'http://127.0.0.1:8080',
            identity: new AnonymousIdentity()
        });
        
        // Fetch root key for local development - ONLY in development!
        await agentInstance.fetchRootKey();
    } else {
        // Internet Computer production configuration
        agentInstance = await HttpAgent.create({
            host: 'https://ic0.app',
            identity: new AnonymousIdentity()
        });
    }
    
    agent.set(agentInstance);
    
    // Create canister actor with proper IDL
    const actor = Actor.createActor(idlFactory, {
        agent: agentInstance,
        canisterId: targetCanisterId
    });
    
    canisterActor.set(actor);
    canisterId.set(targetCanisterId);
    
    return actor;
}

// Disconnect from canister
export function disconnectCanister() {
    agent.set(null);
    canisterActor.set(null);
    canisterId.set(null);
    storageSlot.set(null);
}