// Backend integration utilities for ic-siwe
import { siweAuthStore } from './stores/auth.js';
import { get } from 'svelte/store';

/**
 * Get the authenticated ICP identity from SIWE
 * This replaces the need for manual SIWE proof generation
 */
export function getIcpIdentity() {
    const auth = get(siweAuthStore);
    return auth.identity;
}

/**
 * Check if user is fully authenticated (wallet + ICP identity)
 */
export function isFullyAuthenticated() {
    const auth = get(siweAuthStore);
    return auth.isFullyAuthenticated;
}

/**
 * Get the user's Ethereum address
 */
export function getEthereumAddress() {
    const auth = get(siweAuthStore);
    return auth.walletAddress;
}

/**
 * Get the delegation chain for authenticated calls
 */
export function getDelegationChain() {
    const auth = get(siweAuthStore);
    return auth.delegationChain;
}

/**
 * Legacy compatibility function for proposal creation
 * Now uses the ICP identity instead of manual SIWE proof
 */
export async function createProposalWithSiwe(proposalData, backendActor) {
    if (!isFullyAuthenticated()) {
        throw new Error('User must be authenticated with SIWE first');
    }
    
    const identity = getIcpIdentity();
    
    // Create an authenticated actor with the SIWE identity
    const authenticatedActor = backendActor.withIdentity?.(identity) || backendActor;
    
    // Call the backend with the proposal data
    // The ic-siwe-provider handles the SIWE verification automatically
    return await authenticatedActor.create_proposal(proposalData);
}

/**
 * Legacy compatibility function for voting
 * Now uses the ICP identity instead of manual SIWE proof
 */
export async function voteOnProposalWithSiwe(voteArgs, backendActor) {
    if (!isFullyAuthenticated()) {
        throw new Error('User must be authenticated with SIWE first');
    }
    
    const identity = getIcpIdentity();
    
    // Create an authenticated actor with the SIWE identity
    const authenticatedActor = backendActor.withIdentity?.(identity) || backendActor;
    
    // Call the backend with the vote args
    // The ic-siwe-provider handles the SIWE verification automatically
    return await authenticatedActor.vote_proposal(voteArgs);
}

/**
 * Create an authenticated actor for any canister call
 */
export function createAuthenticatedActor(actor) {
    if (!isFullyAuthenticated()) {
        throw new Error('User must be authenticated with SIWE first');
    }
    
    const identity = getIcpIdentity();
    return actor.withIdentity?.(identity) || actor;
}
