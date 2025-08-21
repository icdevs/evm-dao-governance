import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Configuration state store
const defaultConfig = {
    canisterId: '',
    environment: 'local', // 'local' or 'ic'
    contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Default for local anvil
    isConfigured: false,
    loaded: false
};

function createConfigStore() {
    const { subscribe, set, update } = writable(defaultConfig);

    return {
        subscribe,

        // Load config from localStorage
        load: () => {
            try {
                const saved = localStorage.getItem('evm-dao-config');
                if (saved) {
                    const config = JSON.parse(saved);
                    const mergedConfig = { ...defaultConfig, ...config };
                    set({ ...mergedConfig, loaded: true });
                    return mergedConfig;
                }
            } catch (error) {
                console.error('Failed to load config from localStorage:', error);
            }
        },

        // Save complete config
        save: (config) => {
            const configToSave = { ...config, isConfigured: isConfigurationComplete(config) };

            if (browser) {
                try {
                    localStorage.setItem('evm-dao-config', JSON.stringify(configToSave));
                } catch (error) {
                    console.error('Failed to save config to localStorage:', error);
                }
            }
            set(configToSave);
            return configToSave;
        },

        // Update a specific field
        updateField: (field, value) => {
            let newConfig;
            update(config => {
                newConfig = { ...config, [field]: value };
                newConfig.isConfigured = isConfigurationComplete(newConfig);

                if (browser) {
                    try {
                        localStorage.setItem('evm-dao-config', JSON.stringify(newConfig));
                    } catch (error) {
                        console.error('Failed to save config to localStorage:', error);
                    }
                }
                return newConfig;
            });
            return newConfig;
        },

        // Update multiple fields at once
        updateFields: (fieldsToUpdate) => {
            let newConfig;
            update(config => {
                newConfig = { ...config, ...fieldsToUpdate };
                newConfig.isConfigured = isConfigurationComplete(newConfig);

                if (browser) {
                    try {
                        localStorage.setItem('evm-dao-config', JSON.stringify(newConfig));
                    } catch (error) {
                        console.error('Failed to save config to localStorage:', error);
                    }
                }
                return newConfig;
            });
            return newConfig;
        },

        // Reset to defaults
        reset: () => {
            if (browser) {
                try {
                    localStorage.removeItem('evm-dao-config');
                } catch (error) {
                    console.error('Failed to remove config from localStorage:', error);
                }
            }
            set(defaultConfig);
            return defaultConfig;
        }
    };
}

// Helper function to check if configuration is complete
function isConfigurationComplete(config) {
    return config.canisterId.trim() !== '' && config.contractAddress.trim() !== '';
}

export const configStore = createConfigStore();