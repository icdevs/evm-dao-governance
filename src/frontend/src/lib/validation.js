/**
 * Unified validation utilities for the DAO governance application
 */

import { VALIDATION, PROPOSAL_TYPES, LIMITS } from './constants.js';
import { ethers } from 'ethers';

// Address validation
export function isValidEthereumAddress(address) {
    if (!address || typeof address !== 'string') return false;
    return VALIDATION.ETH_ADDRESS_REGEX.test(address) && ethers.isAddress(address);
}

// Canister ID validation  
export function isValidCanisterId(id) {
    if (!id || typeof id !== 'string') return false;
    return VALIDATION.CANISTER_ID_REGEX.test(id) && id.length >= VALIDATION.MIN_CANISTER_ID_LENGTH;
}

// Amount validation
export function isValidAmount(amount) {
    if (!amount) return false;
    
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return !isNaN(num) && num > 0 && isFinite(num);
}

// Token amount validation with decimals
export function isValidTokenAmount(amount, decimals = 18) {
    if (!isValidAmount(amount)) return false;
    
    try {
        const parsed = ethers.parseUnits(amount.toString(), decimals);
        return parsed > 0n;
    } catch {
        return false;
    }
}

// Hex string validation
export function isValidHex(hex) {
    if (!hex || typeof hex !== 'string') return false;
    return VALIDATION.HEX_REGEX.test(hex);
}

// Chain ID validation
export function isValidChainId(chainId) {
    const num = parseInt(chainId);
    return !isNaN(num) && num > 0;
}

// URL validation
export function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

// Text length validation
export function isValidTextLength(text, maxLength) {
    if (!text || typeof text !== 'string') return false;
    return text.trim().length > 0 && text.length <= maxLength;
}

// Proposal title validation
export function isValidProposalTitle(title) {
    return isValidTextLength(title, VALIDATION.MAX_PROPOSAL_TITLE_LENGTH);
}

// Proposal description validation
export function isValidProposalDescription(description) {
    return !description || isValidTextLength(description, VALIDATION.MAX_PROPOSAL_DESCRIPTION_LENGTH);
}

// Duration validation
export function isValidDuration(duration) {
    const durationMs = typeof duration === 'string' ? parseInt(duration) : duration;
    return !isNaN(durationMs) && 
           durationMs >= LIMITS.MIN_PROPOSAL_DURATION && 
           durationMs <= LIMITS.MAX_PROPOSAL_DURATION;
}

// Gas limit validation
export function isValidGasLimit(gasLimit) {
    const limit = typeof gasLimit === 'string' ? parseInt(gasLimit) : gasLimit;
    return !isNaN(limit) && limit >= 21000 && limit <= 10000000; // Reasonable range
}

// Gas price validation (in wei)
export function isValidGasPrice(gasPrice) {
    const price = typeof gasPrice === 'string' ? parseInt(gasPrice) : gasPrice;
    return !isNaN(price) && price > 0 && price <= 1000000000000; // Up to 1000 gwei
}

// Form validation errors
export class ValidationError extends Error {
    constructor(field, message, code = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.code = code;
    }
}

// Comprehensive proposal form validator
export function validateProposalForm(formData) {
    const errors = [];
    
    const { 
        proposalType, 
        motionText, 
        ethTo, 
        ethValue, 
        ethData, 
        ethGasLimit,
        ethMaxFeePerGas,
        ethMaxPriorityFeePerGas,
        erc20Mode, 
        erc20Recipient, 
        erc20Amount,
        erc20Decimals,
        icpCanister, 
        icpMethod, 
        icpArgs,
        icpCycles,
        metadata
    } = formData;
    
    // Validate proposal type
    if (!proposalType || !Object.values(PROPOSAL_TYPES).includes(proposalType)) {
        errors.push(new ValidationError('proposalType', 'Invalid proposal type'));
    }
    
    // Type-specific validation
    switch (proposalType) {
        case PROPOSAL_TYPES.MOTION:
            if (!motionText?.trim()) {
                errors.push(new ValidationError('motionText', 'Motion text is required'));
            } else if (!isValidProposalTitle(motionText)) {
                errors.push(new ValidationError('motionText', `Motion text must be between 1 and ${VALIDATION.MAX_PROPOSAL_TITLE_LENGTH} characters`));
            }
            break;
            
        case PROPOSAL_TYPES.ETH_TRANSACTION:
            // Recipient validation
            if (!isValidEthereumAddress(ethTo)) {
                errors.push(new ValidationError('ethTo', 'Invalid recipient address'));
            }
            
            // Value validation
            if (ethValue && !isValidAmount(ethValue)) {
                errors.push(new ValidationError('ethValue', 'Invalid ETH amount'));
            }
            
            // Data validation
            if (ethData && !isValidHex(ethData)) {
                errors.push(new ValidationError('ethData', 'Invalid hex data'));
            }
            
            // Gas validation
            if (ethGasLimit && !isValidGasLimit(ethGasLimit)) {
                errors.push(new ValidationError('ethGasLimit', 'Invalid gas limit (must be between 21,000 and 10,000,000)'));
            }
            
            if (ethMaxFeePerGas && !isValidGasPrice(ethMaxFeePerGas)) {
                errors.push(new ValidationError('ethMaxFeePerGas', 'Invalid max fee per gas'));
            }
            
            if (ethMaxPriorityFeePerGas && !isValidGasPrice(ethMaxPriorityFeePerGas)) {
                errors.push(new ValidationError('ethMaxPriorityFeePerGas', 'Invalid max priority fee per gas'));
            }
            
            // ERC20 specific validation
            if (erc20Mode) {
                if (!isValidEthereumAddress(erc20Recipient)) {
                    errors.push(new ValidationError('erc20Recipient', 'Invalid ERC20 recipient address'));
                }
                
                if (!erc20Amount || !isValidAmount(erc20Amount)) {
                    errors.push(new ValidationError('erc20Amount', 'Invalid ERC20 amount'));
                }
                
                const decimals = parseInt(erc20Decimals || '18');
                if (isNaN(decimals) || decimals < 0 || decimals > 18) {
                    errors.push(new ValidationError('erc20Decimals', 'Invalid token decimals (must be between 0 and 18)'));
                } else if (!isValidTokenAmount(erc20Amount, decimals)) {
                    errors.push(new ValidationError('erc20Amount', 'Invalid token amount for specified decimals'));
                }
            }
            break;
            
        case PROPOSAL_TYPES.ICP_CALL:
            if (!isValidCanisterId(icpCanister)) {
                errors.push(new ValidationError('icpCanister', 'Invalid canister ID'));
            }
            
            if (!icpMethod?.trim()) {
                errors.push(new ValidationError('icpMethod', 'Method name is required'));
            } else if (icpMethod.length > 100) {
                errors.push(new ValidationError('icpMethod', 'Method name too long (max 100 characters)'));
            }
            
            if (icpArgs && !isValidHex(icpArgs)) {
                errors.push(new ValidationError('icpArgs', 'Invalid hex arguments'));
            }
            
            const cycles = parseInt(icpCycles || '0');
            if (isNaN(cycles) || cycles < 0) {
                errors.push(new ValidationError('icpCycles', 'Invalid cycles amount'));
            }
            break;
    }
    
    // Metadata validation
    if (metadata && !isValidProposalDescription(metadata)) {
        errors.push(new ValidationError('metadata', `Description too long (max ${VALIDATION.MAX_PROPOSAL_DESCRIPTION_LENGTH} characters)`));
    }
    
    return errors;
}

// Configuration validation
export function validateConfiguration(config) {
    const errors = [];
    
    if (!config) {
        errors.push(new ValidationError('config', 'Configuration object is required'));
        return errors;
    }
    
    if (!isValidCanisterId(config.canisterId)) {
        errors.push(new ValidationError('canisterId', 'Invalid canister ID format'));
    }
    
    if (!isValidEthereumAddress(config.contractAddress)) {
        errors.push(new ValidationError('contractAddress', 'Invalid contract address format'));
    }
    
    if (!isValidChainId(config.chainId)) {
        errors.push(new ValidationError('chainId', 'Invalid chain ID'));
    }
    
    if (!config.environment || !['local', 'ic'].includes(config.environment)) {
        errors.push(new ValidationError('environment', 'Invalid environment (must be "local" or "ic")'));
    }
    
    return errors;
}

// Wallet validation
export function validateWalletConnection(walletData) {
    const errors = [];
    
    if (!walletData) {
        errors.push(new ValidationError('wallet', 'Wallet data is required'));
        return errors;
    }
    
    if (!isValidEthereumAddress(walletData.address)) {
        errors.push(new ValidationError('address', 'Invalid wallet address'));
    }
    
    if (!isValidChainId(walletData.chainId)) {
        errors.push(new ValidationError('chainId', 'Invalid chain ID'));
    }
    
    return errors;
}

// Vote validation
export function validateVote(voteData) {
    const errors = [];
    
    if (!voteData) {
        errors.push(new ValidationError('vote', 'Vote data is required'));
        return errors;
    }
    
    if (!voteData.proposalId || isNaN(parseInt(voteData.proposalId))) {
        errors.push(new ValidationError('proposalId', 'Invalid proposal ID'));
    }
    
    const validChoices = ['Yes', 'No', 'Abstain', 'yes', 'no', 'abstain'];
    if (!voteData.choice || !validChoices.includes(voteData.choice)) {
        errors.push(new ValidationError('choice', 'Invalid vote choice (must be Yes, No, or Abstain)'));
    }
    
    if (!isValidEthereumAddress(voteData.userAddress)) {
        errors.push(new ValidationError('userAddress', 'Invalid user address'));
    }
    
    return errors;
}

// Contract validation
export function validateContractConfig(contractConfig) {
    const errors = [];
    
    if (!contractConfig) {
        errors.push(new ValidationError('contract', 'Contract configuration is required'));
        return errors;
    }
    
    if (!isValidEthereumAddress(contractConfig.address)) {
        errors.push(new ValidationError('address', 'Invalid contract address'));
    }
    
    if (!isValidChainId(contractConfig.chainId)) {
        errors.push(new ValidationError('chainId', 'Invalid chain ID'));
    }
    
    const storageSlot = parseInt(contractConfig.storageSlot || '0');
    if (isNaN(storageSlot) || storageSlot < 0 || storageSlot > 255) {
        errors.push(new ValidationError('storageSlot', 'Invalid storage slot (must be between 0 and 255)'));
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

// Get validation summary
export function getValidationSummary(errors) {
    if (!errors || errors.length === 0) {
        return { valid: true, errorCount: 0, errors: [] };
    }
    
    return {
        valid: false,
        errorCount: errors.length,
        errors: errors.map(e => ({
            field: e.field,
            message: e.message,
            code: e.code
        }))
    };
}

// Sanitize input to prevent XSS
export function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

// Validate and sanitize form data
export function validateAndSanitizeForm(formData) {
    const errors = validateProposalForm(formData);
    
    if (errors.length > 0) {
        return { valid: false, errors, sanitizedData: null };
    }
    
    // Sanitize text fields
    const sanitizedData = { ...formData };
    if (sanitizedData.motionText) {
        sanitizedData.motionText = sanitizeInput(sanitizedData.motionText);
    }
    if (sanitizedData.metadata) {
        sanitizedData.metadata = sanitizeInput(sanitizedData.metadata);
    }
    if (sanitizedData.icpMethod) {
        sanitizedData.icpMethod = sanitizeInput(sanitizedData.icpMethod);
    }
    
    return { valid: true, errors: [], sanitizedData };
}