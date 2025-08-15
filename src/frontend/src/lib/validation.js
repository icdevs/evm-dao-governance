/**
 * Unified validation utilities for the DAO governance application
 */

// Address validation
export function isValidEthereumAddress(address) {
    if (!address || typeof address !== 'string') return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Canister ID validation  
export function isValidCanisterId(id) {
    if (!id || typeof id !== 'string') return false;
    const pattern = /^[a-z0-9-]+$/;
    return pattern.test(id) && id.length > 5;
}

// Amount validation
export function isValidAmount(amount) {
    if (!amount || typeof amount !== 'string') return false;
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0 && isFinite(num);
}

// Hex string validation
export function isValidHex(hex) {
    if (!hex || typeof hex !== 'string') return false;
    return /^0x[a-fA-F0-9]*$/.test(hex);
}

// Chain ID validation
export function isValidChainId(chainId) {
    const num = parseInt(chainId);
    return !isNaN(num) && num > 0;
}

// Form validation errors
export class ValidationError extends Error {
    constructor(field, message) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

// Comprehensive form validator
export function validateProposalForm(formData) {
    const errors = [];
    
    const { proposalType, motionText, ethTo, ethValue, ethData, erc20Mode, erc20Recipient, erc20Amount, icpCanister, icpMethod, icpArgs } = formData;
    
    switch (proposalType) {
        case 'motion':
            if (!motionText?.trim()) {
                errors.push(new ValidationError('motionText', 'Motion text is required'));
            }
            break;
            
        case 'eth_transaction':
            if (!isValidEthereumAddress(ethTo)) {
                errors.push(new ValidationError('ethTo', 'Invalid recipient address'));
            }
            
            if (ethValue && !isValidAmount(ethValue)) {
                errors.push(new ValidationError('ethValue', 'Invalid ETH amount'));
            }
            
            if (ethData && !isValidHex(ethData)) {
                errors.push(new ValidationError('ethData', 'Invalid hex data'));
            }
            
            if (erc20Mode) {
                if (!isValidEthereumAddress(erc20Recipient)) {
                    errors.push(new ValidationError('erc20Recipient', 'Invalid ERC20 recipient address'));
                }
                if (!isValidAmount(erc20Amount)) {
                    errors.push(new ValidationError('erc20Amount', 'Invalid ERC20 amount'));
                }
            }
            break;
            
        case 'icp_call':
            if (!isValidCanisterId(icpCanister)) {
                errors.push(new ValidationError('icpCanister', 'Invalid canister ID'));
            }
            if (!icpMethod?.trim()) {
                errors.push(new ValidationError('icpMethod', 'Method name is required'));
            }
            if (icpArgs && !isValidHex(icpArgs)) {
                errors.push(new ValidationError('icpArgs', 'Invalid hex arguments'));
            }
            break;
    }
    
    return errors;
}

// Configuration validation
export function validateConfiguration(config) {
    const errors = [];
    
    if (!isValidCanisterId(config.canisterId)) {
        errors.push(new ValidationError('canisterId', 'Invalid canister ID format'));
    }
    
    if (!isValidEthereumAddress(config.contractAddress)) {
        errors.push(new ValidationError('contractAddress', 'Invalid contract address format'));
    }
    
    if (!isValidChainId(config.chainId)) {
        errors.push(new ValidationError('chainId', 'Invalid chain ID'));
    }
    
    return errors;
}

// Format validation error messages for display
export function formatValidationErrors(errors) {
    if (!errors || errors.length === 0) return null;
    
    if (errors.length === 1) {
        return errors[0].message;
    }
    
    return `Multiple validation errors:\n${errors.map(e => `• ${e.message}`).join('\n')}`;
}
