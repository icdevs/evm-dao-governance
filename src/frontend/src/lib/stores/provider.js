import { writable } from 'svelte/store';
import { ethers } from 'ethers';

// Usage: call setProvider(window.ethereum) when ready
const { subscribe, set } = writable(null);

export const providerStore = {
    subscribe,
    initialize: (ethereum) => {
        if (!ethereum) {
            throw new Error('Ethereum provider is required');
        }
        const provider = new ethers.BrowserProvider(ethereum);
        set(provider);
    }
};
