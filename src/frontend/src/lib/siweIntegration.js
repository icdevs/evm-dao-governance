/**
 * SIWE Integration utilities for the EVM DAO Governance app
 * This file provides helper functions to integrate SIWE authentication
 * with your existing actor and agent setup.
 */

import { createActor } from 'declarations/backend';
import { canisterId as siweCanisterId } from 'declarations/ic_siwe_provider';
import { siweActions, identity, isLoggedIn } from './siwe';
import { get } from 'svelte/store';
import { HttpAgent } from '@dfinity/agent';

/**
 * Create an authenticated actor using SIWE identity
 * This replaces your existing agent/actor with an authenticated one
 */
export async function createAuthenticatedActor(canisterId = null) {
    const currentIdentity = get(identity);

    if (!currentIdentity) {
        throw new Error('No SIWE identity available. Please log in first.');
    }

    // Use the backend canister ID if none provided
    const targetCanisterId = canisterId || process.env.CANISTER_ID_BACKEND;

    if (!targetCanisterId) {
        throw new Error('No canister ID provided and CANISTER_ID_BACKEND not set');
    }

    // Create HTTP agent with the SIWE identity
    const agent = new HttpAgent({
        identity: currentIdentity,
        host: process.env.NODE_ENV === 'development' ? 'http://localhost:4943' : 'https://ic0.app',
    });

    // Fetch root key for local development
    if (process.env.NODE_ENV === 'development') {
        await agent.fetchRootKey();
    }

    // Create and return the authenticated actor
    return createActor(targetCanisterId, {
        agent,
    });
}

/**
 * Get the current SIWE identity principal as a string
 */
export function getCurrentPrincipal() {
    const currentIdentity = get(identity);
    return currentIdentity ? currentIdentity.getPrincipal().toString() : null;
}

/**
 * Check if the user is authenticated with SIWE
 */
export function isAuthenticated() {
    return get(isLoggedIn);
}

/**
 * Get the Ethereum address associated with the current SIWE session
 */
export function getCurrentEthereumAddress() {
    return siweActions.getIdentityAddress();
}

/**
 * Initialize SIWE for the application
 * Call this in your app's initialization
 */
export function initializeSiwe(options = {}) {
    if (!siweCanisterId) {
        console.warn('SIWE canister ID not found. SIWE authentication will not be available.');
        return null;
    }

    console.log('Initializing SIWE with canister:', siweCanisterId);

    return siweActions.initSiwe?.(siweCanisterId, {
        // Default options for local development
        httpAgentOptions: {
            host: process.env.NODE_ENV === 'development' ? 'http://localhost:4943' : 'https://ic0.app',
        },
        ...options
    });
}

/**
 * Higher-order function to wrap API calls with SIWE authentication
 * Usage: const authCall = withSiweAuth(myApiFunction);
 */
export function withSiweAuth(apiFunction) {
    return async (...args) => {
        if (!isAuthenticated()) {
            throw new Error('Authentication required. Please log in with SIWE first.');
        }

        return apiFunction(...args);
    };
}

/**
 * Create a voting function that uses SIWE authentication
 * This integrates with your existing voting API
 */
export async function createSiweVote(proposalId, vote, votingPower) {
    const authenticatedActor = await createAuthenticatedActor();

    // Your existing voting logic here, but using the authenticated actor
    return authenticatedActor.vote({
        proposal_id: proposalId,
        vote: vote,
        voting_power: votingPower,
        ethereum_address: getCurrentEthereumAddress(),
        principal: getCurrentPrincipal(),
    });
}

/**
 * Example: Create a proposal using SIWE authentication
 */
export async function createSiweProposal(proposalData) {
    const authenticatedActor = await createAuthenticatedActor();

    return authenticatedActor.create_proposal({
        ...proposalData,
        creator_ethereum_address: getCurrentEthereumAddress(),
        creator_principal: getCurrentPrincipal(),
    });
}

// Export useful stores and actions for easy access
export {
    identity,
    isLoggedIn,
    siweActions as siwe,
    siweCanisterId
};
