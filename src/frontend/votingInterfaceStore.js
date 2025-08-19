// src/frontend/votingInterfaceStore.js
import ICRC149VotingInterface from '../icrc149-voting-interface.js';
import { writable } from 'svelte/store';

export const votingInterface = new ICRC149VotingInterface();
export const isInitialized = writable(false);
export const canisterId = writable('');
export const environment = writable('local');

// Automatically initialize canister when canisterId or environment changes
import { get } from 'svelte/store';

let lastCanisterId = '';
let lastEnvironment = '';

async function autoInitialize() {
  const id = get(canisterId);
  const env = get(environment);
  if (id && env && (id !== lastCanisterId || env !== lastEnvironment)) {
    await votingInterface.initializeCanister(id, env);
    isInitialized.set(true);
    lastCanisterId = id;
    lastEnvironment = env;
  }
}

canisterId.subscribe(() => {
  autoInitialize();
});
environment.subscribe(() => {
  autoInitialize();
});

export function setCanisterConfig(id, env) {
  canisterId.set(id);
  environment.set(env);
}

// Optional: expose event handlers for Svelte components
votingInterface.onAccountChange = (address) => {
  // You can update a store or dispatch a custom event here
};
votingInterface.onChainChange = (chainId) => {
  // You can update a store or dispatch a custom event here
};
votingInterface.onStatusUpdate = (message, type) => {
  // You can update a store or dispatch a custom event here
};
