import { createActor, canisterId } from 'declarations/backend';
import { building, browser } from '$app/environment';
import { getIcpIdentity, isFullyAuthenticated } from './ic-integration.js';

function dummyActor() {
    return new Proxy({}, { 
        get() { 
            if (building) {
                throw new Error("Canister invoked while building"); 
            } else {
                throw new Error("Canister not available in this environment");
            }
        } 
    });
}

const buildingOrTesting = building || process.env.NODE_ENV === "test";
const hasValidCanisterId = canisterId && canisterId !== "undefined";

export const backend = buildingOrTesting || !hasValidCanisterId || !browser
    ? dummyActor()
    : createActor(canisterId);

/**
 * Create an authenticated actor for backend calls
 * This uses the SIWE identity from ic-siwe integration
 */
export function createAuthenticatedBackend() {
    if (buildingOrTesting || !hasValidCanisterId || !browser) {
        return dummyActor();
    }
    
    if (!isFullyAuthenticated()) {
        throw new Error('User must be authenticated with SIWE to make authenticated calls');
    }
    
    const identity = getIcpIdentity();
    
    // Create actor with SIWE identity for authenticated calls
    return createActor(canisterId, {
        agentOptions: {
            identity,
            host: 'http://localhost:4943', // Adjust for production
        }
    });
}
