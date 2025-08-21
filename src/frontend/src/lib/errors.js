/**
 * Unified error handling utilities
 */

// Standard error types
export const ErrorTypes = {
    VALIDATION: 'VALIDATION_ERROR',
    NETWORK: 'NETWORK_ERROR',
    AUTH: 'AUTHENTICATION_ERROR',
    BLOCKCHAIN: 'BLOCKCHAIN_ERROR',
    CANISTER: 'CANISTER_ERROR',
    UNKNOWN: 'UNKNOWN_ERROR'
};

// Custom error class with type support
export class AppError extends Error {
    constructor(type, message, details = null) {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }

    // Convert to user-friendly message
    toUserMessage() {
        switch (this.type) {
            case ErrorTypes.VALIDATION:
                return this.message;
            case ErrorTypes.NETWORK:
                return 'Network connection failed. Please check your internet connection.';
            case ErrorTypes.AUTH:
                return 'Authentication failed. Please sign in again.';
            case ErrorTypes.BLOCKCHAIN:
                return `Blockchain operation failed: ${this.message}`;
            case ErrorTypes.CANISTER:
                return `Canister operation failed: ${this.message}`;
            default:
                return 'An unexpected error occurred. Please try again.';
        }
    }
}

// Error parsing for common scenarios
export function parseError(error) {
    if (error instanceof AppError) {
        return error;
    }

    const message = error?.message || String(error);
    
    // Network errors
    if (message.includes('fetch') || message.includes('NetworkError') || message.includes('Failed to fetch')) {
        return new AppError(ErrorTypes.NETWORK, message);
    }
    
    // Authentication errors
    if (message.includes('Unauthorized') || message.includes('Authentication')) {
        return new AppError(ErrorTypes.AUTH, message);
    }
    
    // Blockchain/Web3 errors
    if (message.includes('revert') || message.includes('gas') || message.includes('nonce')) {
        return new AppError(ErrorTypes.BLOCKCHAIN, message);
    }
    
    // Canister errors (IC-specific)
    if (message.includes('Canister') || message.includes('rejected') || message.includes('IC0')) {
        return new AppError(ErrorTypes.CANISTER, message);
    }
    
    // Default to unknown
    return new AppError(ErrorTypes.UNKNOWN, message);
}

// Error handling wrapper for async functions
export async function withErrorHandling(asyncFn, errorType = ErrorTypes.UNKNOWN) {
    try {
        return await asyncFn();
    } catch (error) {
        const appError = parseError(error);
        if (appError.type === ErrorTypes.UNKNOWN && errorType !== ErrorTypes.UNKNOWN) {
            appError.type = errorType;
        }
        throw appError;
    }
}

// Log error with context
export function logError(error, context = {}) {
    const appError = parseError(error);
    
    console.error('Application Error:', {
        type: appError.type,
        message: appError.message,
        details: appError.details,
        timestamp: appError.timestamp,
        context,
        stack: appError.stack
    });
    
    return appError;
}

// Retry mechanism with exponential backoff
export async function withRetry(
    asyncFn,
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2
) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await asyncFn();
        } catch (error) {
            lastError = parseError(error);
            
            // Don't retry validation or auth errors
            if (lastError.type === ErrorTypes.VALIDATION || lastError.type === ErrorTypes.AUTH) {
                throw lastError;
            }
            
            // If this was the last attempt, throw the error
            if (attempt === maxAttempts) {
                throw lastError;
            }
            
            // Wait before retrying
            const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            console.warn(`Retry attempt ${attempt}/${maxAttempts} after error:`, lastError.message);
        }
    }
    
    throw lastError;
}

// Format errors for display in UI components
export function formatErrorForDisplay(error) {
    const appError = parseError(error);
    
    return {
        title: getErrorTitle(appError.type),
        message: appError.toUserMessage(),
        type: appError.type,
        variant: getErrorVariant(appError.type),
        canRetry: canErrorRetry(appError.type)
    };
}

function getErrorTitle(errorType) {
    switch (errorType) {
        case ErrorTypes.VALIDATION:
            return 'Validation Error';
        case ErrorTypes.NETWORK:
            return 'Network Error';
        case ErrorTypes.AUTH:
            return 'Authentication Error';
        case ErrorTypes.BLOCKCHAIN:
            return 'Blockchain Error';
        case ErrorTypes.CANISTER:
            return 'Canister Error';
        default:
            return 'Error';
    }
}

function getErrorVariant(errorType) {
    switch (errorType) {
        case ErrorTypes.VALIDATION:
            return 'warning';
        case ErrorTypes.AUTH:
            return 'warning';
        default:
            return 'error';
    }
}

function canErrorRetry(errorType) {
    return ![ErrorTypes.VALIDATION, ErrorTypes.AUTH].includes(errorType);
}
