
import { writable, get } from 'svelte/store';
import { providerStore } from './provider.js';

function createWalletStore() {
    const { subscribe, set, update } = writable({
        signer: null,
        userAddress: null,
        chainId: null,
        state: 'disconnected',
        error: null
    });


    // Subscribe to providerStore and initialize when provider changes
    providerStore.subscribe(async (provider) => {
        if (provider) {
            console.log("Initializing wallet...");
            update(state => ({ ...state, provider }));

            // Account changes
            if (window.ethereum) {
                window.ethereum.on('accountsChanged', async (accounts) => {
                    if (accounts.length === 0) {
                        walletStore.disconnect();
                    } else {
                        try {
                            const signerInstance = await provider.getSigner();
                            update(state => ({
                                ...state,
                                userAddress: accounts[0],
                                signer: signerInstance,
                                state: 'connected'
                            }));
                        } catch (error) {
                            update(state => ({
                                ...state,
                                signer: null,
                                state: 'error',
                                error: 'Failed to get signer'
                            }));
                        }
                    }
                });

                window.ethereum.on('chainChanged', (newChainId) => {
                    update(state => ({
                        ...state,
                        chainId: parseInt(newChainId, 16)
                    }));
                    window.location.reload();
                });
            }
        } else {
            update(state => ({
                ...state,
                signer: null,
                userAddress: null,
                chainId: null,
                state: 'disconnected',
                error: null
            }));
        }
    });

    const store = {
        subscribe,
        // Connect wallet
        connect: async (provider) => {
            update(s => ({ ...s, state: 'connecting', error: null }));
            try {
                await provider.send("eth_requestAccounts", []);
                const signerInstance = await provider.getSigner();
                const address = await signerInstance.getAddress();
                const network = await provider.getNetwork();

                const walletData = {
                    provider,
                    signer: signerInstance,
                    userAddress: address,
                    chainId: Number(network.chainId),
                    state: 'connected',
                    error: null
                };
                set(walletData);
                return walletData;
            } catch (error) {
                update(s => ({
                    ...s,
                    state: 'error',
                    error: error.message || 'Failed to connect wallet'
                }));
                throw error;
            }
        },

        // Clear all wallet data
        disconnect: () => {
            update(s => ({
                ...s,
                signer: null,
                userAddress: null,
                chainId: null,
                state: 'disconnected',
                error: null
            }));
        }
    };

    return store;
}

export const walletStore = createWalletStore();