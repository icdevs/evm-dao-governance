import { writable, get } from 'svelte/store';
import { getTokenBalanceInfo } from '../utils';
import { agentStore } from './agent';
import { walletStore } from './wallet';
import { configStore } from './config';
import { getCanisterEthereumAddress } from "$lib/utils.js";

// Balance store that persists data across component mounts
function createBalanceStore(initializeFunc) {
    const { subscribe, update } = writable({
        contractAddress: null,
        walletAddress: null,
        ethBalance: 0,
        tokenBalanceInfo: {},
        isLoading: false,
        isInitialLoad: true,
        lastUpdated: null,
        error: null
    });

    initializeFunc((contractAddress, walletAddress) => {
        update(state => ({
            ...state,
            contractAddress,
            walletAddress
        }));
    });

    const store = {
        subscribe,

        // Load balances using provided loader function
        load: async (provider) => {

            let currentState;
            const unsubscribe = subscribe(state => currentState = state);
            unsubscribe();

            if (!currentState.contractAddress || !currentState.walletAddress) {
                throw new Error("Balance store not initialized: Missing contract or wallet address");
            }
            try {

                const [ethBalance, tokenBalanceInfo] = await Promise.all([
                    provider.getBalance(currentState.walletAddress),
                    getTokenBalanceInfo(
                        provider,
                        currentState.contractAddress,
                        currentState.walletAddress
                    )
                ]);

                update(state => ({
                    ...state,
                    ethBalance: ethBalance,
                    tokenBalanceInfo: tokenBalanceInfo,
                    isInitialLoad: false,
                    lastUpdated: new Date(),
                    isLoading: false,
                    error: null
                }));

            } catch (error) {
                update(state => ({
                    ...state,
                    isLoading: false,
                    error: error.message || 'Failed to load balances'
                }));
                throw error;
            }
        },
    };

    return store;
}

// Helper function to check if we should load (can be used by components)
export function shouldLoadBalances(currentState, maxAge = 60000) {
    if (!currentState.lastUpdated) return true;
    if (currentState.ethBalance === "0.0" && currentState.tokenBalance === "0.0") return true;

    const age = Date.now() - currentState.lastUpdated.getTime();
    return age > maxAge;
}

export const walletBalanceStore = createBalanceStore(initialize => {
    // Initialize wallet balance store
    walletStore.subscribe(async wallet => {
        if (wallet.userAddress) {
            console.log("Initializing wallet balance store...");
            let config = get(configStore); // Will be initialized if wallet store is
            initialize(config.contractAddress, wallet.userAddress);
        }
    });

});
export const treasuryBalanceStore = createBalanceStore(async initialize => {
    // Initialize treasury balance store
    agentStore.subscribe(async agent => {
        if (agent.actor) {
            console.log("Initializing treasury balance store...");
            const address = await getCanisterEthereumAddress(agent.actor);
            let config = get(configStore); // Will be initialized if agent store is
            initialize(config.contractAddress, address);
        }
    });
});