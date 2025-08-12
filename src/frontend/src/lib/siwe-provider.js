import { SiweManager } from 'ic-siwe-js';
import { browser } from '$app/environment';

// Create and export the SIWE manager instance
export const siweManager = browser ? new SiweManager(
    process.env.CANISTER_ID_IC_SIWE_PROVIDER,
    {
        // HTTP agent options for local development
        host: 'http://localhost:4943',
    }
) : null;

// Export the state store for reactive updates
export { siweStateStore } from 'ic-siwe-js';
