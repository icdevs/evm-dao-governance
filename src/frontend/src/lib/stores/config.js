import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Configuration state store
const defaultConfig = {
    canisterId: '',
    environment: 'local', // 'local' or 'ic'
    contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Default for local anvil
    isConfigured: false
};

function createConfigStore() {
    const { subscribe, set, update } = writable(defaultConfig);

    return {
        subscribe,
        set,
        update,
        
        // Load config from localStorage
        load: () => {
            if (browser) {
                try {
                    const saved = localStorage.getItem('evm-dao-config');
                    if (saved) {
                        const config = JSON.parse(saved);
                        set({ ...defaultConfig, ...config });
                    }
                } catch (error) {
                    console.error('Failed to load config from localStorage:', error);
                }
            }
        },
        
        // Save config to localStorage
        save: (config) => {
            if (browser) {
                try {
                    localStorage.setItem('evm-dao-config', JSON.stringify(config));
                } catch (error) {
                    console.error('Failed to save config to localStorage:', error);
                }
            }
            set(config);
        },
        
        // Update a specific field
        updateField: (field, value) => {
            update(config => {
                const newConfig = { ...config, [field]: value };
                if (browser) {
                    try {
                        localStorage.setItem('evm-dao-config', JSON.stringify(newConfig));
                    } catch (error) {
                        console.error('Failed to save config to localStorage:', error);
                    }
                }
                return newConfig;
            });
        },
        
        // Check if configuration is complete
        checkConfiguration: () => {
            update(config => {
                const isConfigured = config.canisterId.trim() !== '' && config.contractAddress.trim() !== '';
                const newConfig = { ...config, isConfigured };
                if (browser) {
                    try {
                        localStorage.setItem('evm-dao-config', JSON.stringify(newConfig));
                    } catch (error) {
                        console.error('Failed to save config to localStorage:', error);
                    }
                }
                return newConfig;
            });
        }
    };
}

export const configStore = createConfigStore();
