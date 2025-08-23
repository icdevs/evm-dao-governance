import { ethers } from 'ethers';
import { encode as rlpEncode } from 'rlp';
import keccak from 'keccak';

/**
 * Types for the balance proof system
 */
export interface BalanceProofRequest {
  address: string;           // User's Ethereum address
  contractAddress: string;   // ERC20/ERC721 contract address
  chainId: number;          // Ethereum chain ID
  blockHeight: number;      // Block height for historical proof
  tokenId?: string;         // Token ID for ERC721 (optional for ERC20)
  rpcUrl: string;           // RPC endpoint URL
}

export interface BalanceProofResult {
  balance: string;          // Balance or ownership (1/0 for ERC721)
  blockHash: string;        // Block hash at the specified height
  accountProof: string[];   // Merkle proof for account state
  storageProof: string[];   // Merkle proof for storage slot
  rlpEncodedProof: string;  // RLP encoded complete proof
  witness: EthereumWitness; // Structured witness data
}

export interface EthereumWitness {
  blockHash: string;
  blockHeight: number;
  accountAddress: string;
  contractAddress: string;
  storageKey: string;
  storageValue: string;
  accountProof: string[];
  storageProof: string[];
  chainId: number;
}

/**
 * ERC20 ABI for balance checking
 */
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)"
];

/**
 * ERC721 ABI for ownership checking
 */
const ERC721_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)"
];

/**
 * Generate a Merkle proof for an Ethereum account balance or token ownership
 * at a specific block height. This can be used for ERC20 balances or ERC721 ownership.
 */
export class EthereumBalanceProofGenerator {
  private provider: ethers.JsonRpcProvider;

  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Generate a balance proof for ERC20 tokens
   */
  async generateERC20BalanceProof(request: BalanceProofRequest): Promise<BalanceProofResult> {
    const { address, contractAddress, blockHeight } = request;
    
    // Get the storage slot for ERC20 balance mapping
    const storageKey = this.getERC20BalanceStorageKey(address, contractAddress);
    
    return this.generateProof({
      ...request,
      storageKey,
      isERC721: false
    });
  }

  /**
   * Generate an ownership proof for ERC721 tokens
   */
  async generateERC721OwnershipProof(request: BalanceProofRequest): Promise<BalanceProofResult> {
    if (!request.tokenId) {
      throw new Error("Token ID is required for ERC721 ownership proof");
    }

    const { tokenId, contractAddress, blockHeight } = request;
    
    // Get the storage slot for ERC721 ownership mapping
    const storageKey = this.getERC721OwnershipStorageKey(tokenId, contractAddress);
    
    return this.generateProof({
      ...request,
      storageKey,
      isERC721: true
    });
  }

  /**
   * Core proof generation logic
   */
  private async generateProof(params: BalanceProofRequest & { storageKey: string; isERC721: boolean }): Promise<BalanceProofResult> {
    const { address, contractAddress, chainId, blockHeight, storageKey, isERC721 } = params;

    try {
      // Get block information
      const block = await this.provider.getBlock(blockHeight);
      if (!block) {
        throw new Error(`Block ${blockHeight} not found`);
      }

      // Get account proof (for the contract)
      const accountProof = await this.getAccountProof(contractAddress, blockHeight);
      
      // Get storage proof (for the specific balance/ownership slot)
      const storageProof = await this.getStorageProof(contractAddress, storageKey, blockHeight);

      // Extract balance/ownership value
      const storageValue = storageProof.storageProof[0]?.value || '0x0';
      const balance = isERC721 ? 
        (storageValue !== '0x0' ? '1' : '0') :  // ERC721: 1 if owned, 0 if not
        ethers.getBigInt(storageValue).toString(); // ERC20: actual balance

      // Create witness structure
      const witness: EthereumWitness = {
        blockHash: block.hash!,
        blockHeight,
        accountAddress: address,
        contractAddress,
        storageKey,
        storageValue,
        accountProof: accountProof.accountProof,
        storageProof: storageProof.storageProof.map((proof: any) => proof.proof).flat(),
        chainId
      };

      // RLP encode the complete proof
      const rlpEncodedProof = this.rlpEncodeWitness(witness);

      return {
        balance,
        blockHash: block.hash!,
        accountProof: accountProof.accountProof,
        storageProof: witness.storageProof,
        rlpEncodedProof,
        witness
      };

    } catch (error) {
      throw new Error(`Failed to generate proof: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get account proof using eth_getProof
   */
  private async getAccountProof(address: string, blockHeight: number): Promise<any> {
    const proof = await this.provider.send("eth_getProof", [
      address,
      [],
      `0x${blockHeight.toString(16)}`
    ]);
    return proof;
  }

  /**
   * Get storage proof using eth_getProof
   */
  private async getStorageProof(address: string, storageKey: string, blockHeight: number): Promise<any> {
    const proof = await this.provider.send("eth_getProof", [
      address,
      [storageKey],
      `0x${blockHeight.toString(16)}`
    ]);
    return proof;
  }

  /**
   * Calculate storage key for ERC20 balance mapping
   * Standard ERC20 uses mapping(address => uint256) at slot 0 or other slots
   */
  private getERC20BalanceStorageKey(userAddress: string, contractAddress: string, slot: number = 0): string {
    // For most ERC20 contracts, balances are stored in slot 0
    // Storage key = keccak256(address . slot)
    const paddedAddress = ethers.zeroPadValue(userAddress, 32);
    const paddedSlot = ethers.zeroPadValue(ethers.toBeHex(slot), 32);
    const concatenated = paddedAddress + paddedSlot.slice(2); // Remove 0x from second part
    return ethers.keccak256('0x' + concatenated.slice(2));
  }

  /**
   * Calculate storage key for ERC721 ownership mapping
   * Standard ERC721 uses mapping(uint256 => address) for owners
   */
  private getERC721OwnershipStorageKey(tokenId: string, contractAddress: string, slot: number = 2): string {
    // For most ERC721 contracts, owners mapping is at slot 2
    // Storage key = keccak256(tokenId . slot)
    const paddedTokenId = ethers.zeroPadValue(ethers.toBeHex(tokenId), 32);
    const paddedSlot = ethers.zeroPadValue(ethers.toBeHex(slot), 32);
    const concatenated = paddedTokenId + paddedSlot.slice(2);
    return ethers.keccak256('0x' + concatenated.slice(2));
  }

  /**
   * RLP encode the witness for compact transmission
   */
  private rlpEncodeWitness(witness: EthereumWitness): string {
    const witnessArray = [
      witness.blockHash,
      ethers.toBeHex(witness.blockHeight),
      witness.accountAddress,
      witness.contractAddress,
      witness.storageKey,
      witness.storageValue,
      witness.accountProof,
      witness.storageProof,
      ethers.toBeHex(witness.chainId)
    ];

    const encoded = rlpEncode(witnessArray);
    return '0x' + Buffer.from(encoded).toString('hex');
  }

  /**
   * Verify a witness against current blockchain state (for testing)
   */
  async verifyWitness(witness: EthereumWitness): Promise<boolean> {
    try {
      // Get current proof for the same parameters
      const currentProof = await this.getStorageProof(
        witness.contractAddress,
        witness.storageKey,
        witness.blockHeight
      );

      // Compare storage values
      const currentValue = currentProof.storageProof[0]?.value || '0x0';
      return currentValue === witness.storageValue;
    } catch {
      return false;
    }
  }
}

/**
 * Utility functions for common use cases
 */

/**
 * Create a balance proof generator for a specific RPC endpoint
 */
export function createBalanceProofGenerator(rpcUrl: string): EthereumBalanceProofGenerator {
  return new EthereumBalanceProofGenerator(rpcUrl);
}

/**
 * Quick function to generate ERC20 balance proof
 */
export async function generateERC20Proof(
  userAddress: string,
  contractAddress: string,
  chainId: number,
  blockHeight: number,
  rpcUrl: string
): Promise<BalanceProofResult> {
  const generator = new EthereumBalanceProofGenerator(rpcUrl);
  return generator.generateERC20BalanceProof({
    address: userAddress,
    contractAddress,
    chainId,
    blockHeight,
    rpcUrl
  });
}

/**
 * Quick function to generate ERC721 ownership proof
 */
export async function generateERC721Proof(
  userAddress: string,
  contractAddress: string,
  tokenId: string,
  chainId: number,
  blockHeight: number,
  rpcUrl: string
): Promise<BalanceProofResult> {
  const generator = new EthereumBalanceProofGenerator(rpcUrl);
  return generator.generateERC721OwnershipProof({
    address: userAddress,
    contractAddress,
    chainId,
    blockHeight,
    tokenId,
    rpcUrl
  });
}

/**
 * Decode RLP encoded witness back to structured data
 */
export function decodeRLPWitness(rlpData: string): EthereumWitness {
  const buffer = Buffer.from(rlpData.slice(2), 'hex');
  const decoded = rlpEncode(buffer) as any;
  
  return {
    blockHash: decoded[0],
    blockHeight: parseInt(decoded[1], 16),
    accountAddress: decoded[2],
    contractAddress: decoded[3],
    storageKey: decoded[4],
    storageValue: decoded[5],
    accountProof: decoded[6],
    storageProof: decoded[7],
    chainId: parseInt(decoded[8], 16)
  };
}

// Export default instance for common Ethereum mainnet
export const mainnetProofGenerator = new EthereumBalanceProofGenerator('https://eth-mainnet.g.alchemy.com/v2/your-api-key');
