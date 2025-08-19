import { writable, get } from 'svelte/store';
import { ethers } from 'ethers';

function createWalletStore() {
    const { subscribe, set, update } = writable({
        provider: null,
        signer: null,
        userAddress: null,
        chainId: null,
        state: 'disconnected', // 'disconnected', 'connecting', 'connected', 'error'
        error: null
    });

    // Removed getBrowserProvider; provider is now passed in

    const store = {
        subscribe,
        // Initialize provider and event listeners
        initialize: (ethereum) => {
            if (!ethereum) throw new Error('Ethereum provider must be passed to initialize');
            const provider = new ethers.BrowserProvider(ethereum);
            update(state => ({ ...state, provider }));

            // Account changes
            window.ethereum.on('accountsChanged', async (accounts) => {
                if (accounts.length === 0) {
                    store.clear();
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
        },
        // Connect wallet
        connect: async () => {
            const state = get({ subscribe });
            const provider = state.provider;
            if (!provider) throw new Error('Provider not initialized. Call initialize(provider) first.');

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

        // Sign message
        signMessage: async (message) => {
            const state = get({ subscribe });
            if (!state.signer) throw new Error('No signer available');
            return await state.signer.signMessage(message);
        },

        // Update specific fields
        changeChain: async (targetChainId) => {
            const state = get({ subscribe });
            const provider = state.provider;
            if (!provider) throw new Error('Provider not initialized. Call initialize(provider) first.');
            try {
                await provider.send("wallet_switchEthereumChain", [
                    { chainId: "0x" + targetChainId.toString(16) }
                ]);
                update(s => ({
                    ...s,
                    chainId: targetChainId
                }));
            } catch (error) {
                console.error("Failed to switch network:", error);
            }
        },

        // Clear all wallet data
        disconnect: () => {
            set({
                provider: null,
                signer: null,
                userAddress: null,
                chainId: null,
                state: 'disconnected',
                error: null
            });
        }
    };

    return store;
}

export const walletStore = createWalletStore();