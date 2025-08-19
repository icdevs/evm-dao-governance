import { writable } from 'svelte/store';

// Status message types
export const MESSAGE_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

function createStatusStore() {
    const { subscribe, set, update } = writable([]);

    let nextId = 1;

    return {
        subscribe,
        
        // Add a new status message
        add: (message, type = MESSAGE_TYPES.INFO, duration = 5000) => {
            const id = nextId++;
            const statusMessage = {
                id,
                message,
                type,
                timestamp: Date.now()
            };
            
            update(messages => [...messages, statusMessage]);
            
            // Auto-remove after duration
            if (duration > 0) {
                setTimeout(() => {
                    update(messages => messages.filter(m => m.id !== id));
                }, duration);
            }
            
            return id;
        },
        
        // Remove a specific message
        remove: (id) => {
            update(messages => messages.filter(m => m.id !== id));
        },
        
        // Clear all messages
        clear: () => {
            set([]);
        },
        
        // Convenience methods for different message types
        success: (message, duration = 5000) => {
            return createStatusStore().add(message, MESSAGE_TYPES.SUCCESS, duration);
        },
        
        error: (message, duration = 8000) => {
            return createStatusStore().add(message, MESSAGE_TYPES.ERROR, duration);
        },
        
        warning: (message, duration = 6000) => {
            return createStatusStore().add(message, MESSAGE_TYPES.WARNING, duration);
        },
        
        info: (message, duration = 5000) => {
            return createStatusStore().add(message, MESSAGE_TYPES.INFO, duration);
        }
    };
}

export const statusStore = createStatusStore();