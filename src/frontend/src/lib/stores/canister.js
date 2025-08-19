import { writable } from 'svelte/store';
import { Actor, HttpAgent, AnonymousIdentity } from '@dfinity/agent';
import { idlFactory } from '../../../../declarations/backend/backend.did.js';

// Core canister state stores
export const agent = writable(null);
export const canisterActor = writable(null);
export const canisterId = writable(null);
export const isLocal = writable(false);
export const storageSlot = writable(null);

// Helper functions for updating canister state
export function setAgent(agentInstance) {
    agent.set(agentInstance);
}

export function setCanisterActor(actor) {
    canisterActor.set(actor);
}

export function setCanisterId(id) {
    canisterId.set(id);
}

export function setIsLocal(local) {
    isLocal.set(local);
}

export function setStorageSlot(slot) {
    storageSlot.set(slot);
}

export function clearCanister() {
    agent.set(null);
    canisterActor.set(null);
    canisterId.set(null);
    storageSlot.set(null);
}

// Initialize IC canister connection and return the created actor
export async function initializeCanister(targetCanisterId, environment = 'local') {
    const local = environment === 'local';
    setIsLocal(local);
    
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
    
    setAgent(agentInstance);
    
    // Create canister actor with proper IDL
    const actor = Actor.createActor(idlFactory, {
        agent: agentInstance,
        canisterId: targetCanisterId
    });
    
    setCanisterActor(actor);
    setCanisterId(targetCanisterId);
    
    return {
        actor,
        agent: agentInstance,
        canisterId: targetCanisterId,
        isLocal: local
    };
}