import { ethers } from 'ethers';
import { encode as rlpEncode } from 'rlp';

/**
 * Types for the MetaMask-based balance proof system
 */
export interface MetaMaskBalanceProofRequest {
  contractAddress: string;   // ERC20/ERC721 contract address
  tokenId?: string;         // Token ID for ERC721 (optional for ERC20)
  blockTag?: string | number; // Block tag ("latest", "finalized", or specific block number)
  slotIndex?: number;       // Storage slot index (default: 0 for ERC20, 2 for ERC721)
}

export interface MetaMaskBalanceProofResult {
  userAddress: string;      // Connected wallet address
  balance: string;          // Balance or ownership (1/0 for ERC721)
  blockHash: string;        // Block hash at the specified height
  blockNumber: number;      // Block number
  accountProof: string[];   // Merkle proof for account state
  storageProof: string[];   // Merkle proof for storage slot
  storageKey: string;       // The storage key that was queried
  storageValue: string;     // The raw storage value
  rlpEncodedProof: string;  // RLP encoded complete proof
  witness: MetaMaskEthereumWitness; // Structured witness data
  chainId: number;          // Chain ID from MetaMask
}

export interface MetaMaskEthereumWitness {
  blockHash: string;
  blockNumber: number;
  userAddress: string;
  contractAddress: string;
  storageKey: string;
  storageValue: string;
  accountProof: string[];
  storageProof: string[];
  chainId: number;
  tokenType: 'ERC20' | 'ERC721';
  tokenId?: string;
}

/**
 * MetaMask-based Ethereum Balance Proof Generator
 * Uses the connected wallet to generate proofs without requiring RPC URLs
 */
export class MetaMaskBalanceProofGenerator {
  private provider: ethers.BrowserProvider;

  constructor() {
    if (!window.ethereum) {
      throw new Error('MetaMask not found. Please install MetaMask to use this feature.');
    }
    this.provider = new ethers.BrowserProvider(window.ethereum);
  }

  /**
   * Connect to MetaMask and request account access
   */
  async connectWallet(): Promise<string> {
    try {
      await this.provider.send("eth_requestAccounts", []);
      const signer = await this.provider.getSigner();
      return await signer.getAddress();
    } catch (error) {
      throw new Error(`Failed to connect to MetaMask: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the current chain ID from MetaMask
   */
  async getChainId(): Promise<number> {
    const network = await this.provider.getNetwork();
    return Number(network.chainId);
  }

  /**
   * Generate a balance proof for ERC20 tokens using MetaMask
   */
  async generateERC20BalanceProof(request: MetaMaskBalanceProofRequest): Promise<MetaMaskBalanceProofResult> {
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
  async generateERC721OwnershipProof(request: MetaMaskBalanceProofRequest): Promise<MetaMaskBalanceProofResult> {
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
  private async generateProof(params: {
    userAddress: string;
    contractAddress: string;
    storageKey: string;
    blockTag: string | number;
    tokenType: 'ERC20' | 'ERC721';
    tokenId?: string;
  }): Promise<MetaMaskBalanceProofResult> {
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
      const witness: MetaMaskEthereumWitness = {
        blockHash: block.hash!,
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
        blockHash: block.hash!,
        blockNumber: block.number,
        accountProof: proof.accountProof,
        storageProof: proof.storageProof[0]?.proof || [],
        storageKey,
        storageValue,
        rlpEncodedProof,
        witness,
        chainId
      };

    } catch (error) {
      throw new Error(`Failed to generate proof: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate balance based on storage value and token type
   */
  private calculateBalance(storageValue: string, tokenType: 'ERC20' | 'ERC721', userAddress: string): string {
    if (tokenType === 'ERC721') {
      // For ERC721, check if the storage value matches the user's address
      const paddedUserAddress = ethers.getAddress(userAddress).toLowerCase();
      const storedAddress = storageValue !== '0x0' ? 
        ethers.getAddress('0x' + storageValue.slice(-40)).toLowerCase() : '';
      return paddedUserAddress === storedAddress ? '1' : '0';
    } else {
      // For ERC20, return the actual balance
      return ethers.getBigInt(storageValue).toString();
    }
  }

  /**
   * Calculate storage key for ERC20 balance mapping
   * Standard ERC20 uses mapping(address => uint256) at slot 0 or other slots
   */
  private getERC20BalanceStorageKey(userAddress: string, slot: number = 0): string {
    // Storage key = keccak256(address . slot)
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [userAddress, slot]
    );
    return ethers.keccak256(encoded);
  }

  /**
   * Calculate storage key for ERC721 ownership mapping
   * Standard ERC721 uses mapping(uint256 => address) for owners
   */
  private getERC721OwnershipStorageKey(tokenId: string, slot: number = 2): string {
    // Storage key = keccak256(tokenId . slot)
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256"],
      [tokenId, slot]
    );
    return ethers.keccak256(encoded);
  }

  /**
   * RLP encode the witness for compact transmission
   */
  private rlpEncodeWitness(witness: MetaMaskEthereumWitness): string {
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
  static isMetaMaskAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.ethereum;
  }

  /**
   * Get the current account without requesting permission
   */
  async getCurrentAccount(): Promise<string | null> {
    try {
      const accounts = await this.provider.send("eth_accounts", []);
      return accounts.length > 0 ? accounts[0] : null;
    } catch {
      return null;
    }
  }

  /**
   * Listen for account changes
   */
  onAccountsChanged(callback: (accounts: string[]) => void): void {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', callback);
    }
  }

  /**
   * Listen for chain changes
   */
  onChainChanged(callback: (chainId: string) => void): void {
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
export async function generateMetaMaskERC20Proof(
  contractAddress: string,
  blockTag: string | number = "latest",
  slotIndex: number = 0
): Promise<MetaMaskBalanceProofResult> {
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
export async function generateMetaMaskERC721Proof(
  contractAddress: string,
  tokenId: string,
  blockTag: string | number = "latest",
  slotIndex: number = 2
): Promise<MetaMaskBalanceProofResult> {
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
export function decodeMetaMaskRLPWitness(rlpData: string): MetaMaskEthereumWitness {
  const buffer = Buffer.from(rlpData.slice(2), 'hex');
  const decoded = rlpEncode(buffer) as any;
  
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
    tokenType: decoded[9] as 'ERC20' | 'ERC721',
    tokenId: decoded[10] || undefined
  };
}

// TypeScript declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
