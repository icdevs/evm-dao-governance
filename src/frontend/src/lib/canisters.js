import { createActor, canisterId } from 'declarations/backend';
import { building, browser } from '$app/environment';

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
