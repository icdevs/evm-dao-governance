import { ethers } from 'ethers';
import { encode as rlpEncode } from 'rlp';
/**
 * MetaMask-based Ethereum Balance Proof Generator
 * Uses the connected wallet to generate proofs without requiring RPC URLs
 */
export class MetaMaskBalanceProofGenerator {
    constructor() {
        if (!window.ethereum) {
            throw new Error('MetaMask not found. Please install MetaMask to use this feature.');
        }
        this.provider = new ethers.BrowserProvider(window.ethereum);
    }
    /**
     * Connect to MetaMask and request account access
     */
    async connectWallet() {
        try {
            await this.provider.send("eth_requestAccounts", []);
            const signer = await this.provider.getSigner();
            return await signer.getAddress();
        }
        catch (error) {
            throw new Error(`Failed to connect to MetaMask: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Get the current chain ID from MetaMask
     */
    async getChainId() {
        const network = await this.provider.getNetwork();
        return Number(network.chainId);
    }
    /**
     * Generate a balance proof for ERC20 tokens using MetaMask
     */
    async generateERC20BalanceProof(request) {
        const userAddress = await this.connectWallet();
        const { contractAddress, blockTag = "latest", slotIndex = 0 } = request;
        // Compute the storage key for ERC20 balance mapping
        const storageKey = this.getERC20BalanceStorageKey(userAddress, slotIndex);
        return this.generateProof({
            userAddress,
            contractAddress,
            storageKey,
            blockTag,
            tokenType: 'ERC20'
        });
    }
    /**
     * Generate an ownership proof for ERC721 tokens using MetaMask
     */
    async generateERC721OwnershipProof(request) {
        if (!request.tokenId) {
            throw new Error("Token ID is required for ERC721 ownership proof");
        }
        const userAddress = await this.connectWallet();
        const { contractAddress, tokenId, blockTag = "latest", slotIndex = 2 } = request;
        // Compute the storage key for ERC721 ownership mapping
        const storageKey = this.getERC721OwnershipStorageKey(tokenId, slotIndex);
        return this.generateProof({
            userAddress,
            contractAddress,
            storageKey,
            blockTag,
            tokenType: 'ERC721',
            tokenId
        });
    }
    /**
     * Core proof generation logic using MetaMask's eth_getProof
     */
    async generateProof(params) {
        const { userAddress, contractAddress, storageKey, blockTag, tokenType, tokenId } = params;
        try {
            // Convert block tag to proper format
            const blockTagHex = typeof blockTag === 'number'
                ? ethers.toQuantity(blockTag)
                : blockTag;
            // Get the proof via MetaMask's RPC proxy
            const proof = await this.provider.send("eth_getProof", [
                contractAddress,
                [storageKey],
                blockTagHex
            ]);
            // Get block information
            const block = await this.provider.getBlock(blockTagHex);
            if (!block) {
                throw new Error(`Block ${blockTagHex} not found`);
            }
            // Get chain ID
            const chainId = await this.getChainId();
            // Extract storage value and calculate balance
            const storageValue = proof.storageProof[0]?.value || '0x0';
            const balance = this.calculateBalance(storageValue, tokenType, userAddress);
            // Create witness structure
            const witness = {
                blockHash: block.hash,
                blockNumber: block.number,
                userAddress,
                contractAddress,
                storageKey,
                storageValue,
                accountProof: proof.accountProof,
                storageProof: proof.storageProof[0]?.proof || [],
                chainId,
                tokenType,
                tokenId
            };
            // RLP encode the complete proof
            const rlpEncodedProof = this.rlpEncodeWitness(witness);
            return {
                userAddress,
                balance,
                blockHash: block.hash,
                blockNumber: block.number,
                accountProof: proof.accountProof,
                storageProof: proof.storageProof[0]?.proof || [],
                storageKey,
                storageValue,
                rlpEncodedProof,
                witness,
                chainId
            };
        }
        catch (error) {
            throw new Error(`Failed to generate proof: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Calculate balance based on storage value and token type
     */
    calculateBalance(storageValue, tokenType, userAddress) {
        if (tokenType === 'ERC721') {
            // For ERC721, check if the storage value matches the user's address
            const paddedUserAddress = ethers.getAddress(userAddress).toLowerCase();
            const storedAddress = storageValue !== '0x0' ?
                ethers.getAddress('0x' + storageValue.slice(-40)).toLowerCase() : '';
            return paddedUserAddress === storedAddress ? '1' : '0';
        }
        else {
            // For ERC20, return the actual balance
            return ethers.getBigInt(storageValue).toString();
        }
    }
    /**
     * Calculate storage key for ERC20 balance mapping
     * Standard ERC20 uses mapping(address => uint256) at slot 0 or other slots
     */
    getERC20BalanceStorageKey(userAddress, slot = 0) {
        // Storage key = keccak256(address . slot)
        const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [userAddress, slot]);
        return ethers.keccak256(encoded);
    }
    /**
     * Calculate storage key for ERC721 ownership mapping
     * Standard ERC721 uses mapping(uint256 => address) for owners
     */
    getERC721OwnershipStorageKey(tokenId, slot = 2) {
        // Storage key = keccak256(tokenId . slot)
        const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [tokenId, slot]);
        return ethers.keccak256(encoded);
    }
    /**
     * RLP encode the witness for compact transmission
     */
    rlpEncodeWitness(witness) {
        const witnessArray = [
            witness.blockHash,
            ethers.toBeHex(witness.blockNumber),
            witness.userAddress,
            witness.contractAddress,
            witness.storageKey,
            witness.storageValue,
            witness.accountProof,
            witness.storageProof,
            ethers.toBeHex(witness.chainId),
            witness.tokenType,
            witness.tokenId || ''
        ];
        const encoded = rlpEncode(witnessArray);
        return '0x' + Buffer.from(encoded).toString('hex');
    }
    /**
     * Check if MetaMask is available
     */
    static isMetaMaskAvailable() {
        return typeof window !== 'undefined' && !!window.ethereum;
    }
    /**
     * Get the current account without requesting permission
     */
    async getCurrentAccount() {
        try {
            const accounts = await this.provider.send("eth_accounts", []);
            return accounts.length > 0 ? accounts[0] : null;
        }
        catch {
            return null;
        }
    }
    /**
     * Listen for account changes
     */
    onAccountsChanged(callback) {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', callback);
        }
    }
    /**
     * Listen for chain changes
     */
    onChainChanged(callback) {
        if (window.ethereum) {
            window.ethereum.on('chainChanged', callback);
        }
    }
}
/**
 * Utility functions for common use cases
 */
/**
 * Quick function to generate ERC20 balance proof using MetaMask
 */
export async function generateMetaMaskERC20Proof(contractAddress, blockTag = "latest", slotIndex = 0) {
    const generator = new MetaMaskBalanceProofGenerator();
    return generator.generateERC20BalanceProof({
        contractAddress,
        blockTag,
        slotIndex
    });
}
/**
 * Quick function to generate ERC721 ownership proof using MetaMask
 */
export async function generateMetaMaskERC721Proof(contractAddress, tokenId, blockTag = "latest", slotIndex = 2) {
    const generator = new MetaMaskBalanceProofGenerator();
    return generator.generateERC721OwnershipProof({
        contractAddress,
        tokenId,
        blockTag,
        slotIndex
    });
}
/**
 * Decode RLP encoded witness back to structured data
 */
export function decodeMetaMaskRLPWitness(rlpData) {
    const buffer = Buffer.from(rlpData.slice(2), 'hex');
    const decoded = rlpEncode(buffer);
    return {
        blockHash: decoded[0],
        blockNumber: parseInt(decoded[1], 16),
        userAddress: decoded[2],
        contractAddress: decoded[3],
        storageKey: decoded[4],
        storageValue: decoded[5],
        accountProof: decoded[6],
        storageProof: decoded[7],
        chainId: parseInt(decoded[8], 16),
        tokenType: decoded[9],
        tokenId: decoded[10] || undefined
    };
}
