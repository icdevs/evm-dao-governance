import {
  EthereumBalanceProofGenerator,
  generateERC20Proof,
  generateERC721Proof,
  createBalanceProofGenerator,
  BalanceProofRequest,
  BalanceProofResult
} from './ethereum-balance-proof';

/**
 * Example usage of the Ethereum Balance Proof Generator
 */

// Example 1: Generate ERC20 balance proof
async function exampleERC20Proof() {
  console.log('=== ERC20 Balance Proof Example ===');
  
  try {
    const proof = await generateERC20Proof(
      '0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4', // User address
      '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a', // USDC contract on mainnet
      1, // Ethereum mainnet
      18500000, // Block height
      'https://eth-mainnet.g.alchemy.com/v2/your-api-key'
    );

    console.log('Balance:', proof.balance);
    console.log('Block Hash:', proof.blockHash);
    console.log('RLP Encoded Proof:', proof.rlpEncodedProof);
    console.log('Witness:', JSON.stringify(proof.witness, null, 2));
  } catch (error) {
    console.error('Error generating ERC20 proof:', error);
  }
}

// Example 2: Generate ERC721 ownership proof
async function exampleERC721Proof() {
  console.log('=== ERC721 Ownership Proof Example ===');
  
  try {
    const proof = await generateERC721Proof(
      '0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4', // User address
      '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC contract
      '1234', // Token ID
      1, // Ethereum mainnet
      18500000, // Block height
      'https://eth-mainnet.g.alchemy.com/v2/your-api-key'
    );

    console.log('Owns token:', proof.balance === '1' ? 'Yes' : 'No');
    console.log('Block Hash:', proof.blockHash);
    console.log('RLP Encoded Proof:', proof.rlpEncodedProof);
  } catch (error) {
    console.error('Error generating ERC721 proof:', error);
  }
}

// Example 3: Using the class directly for more control
async function exampleAdvancedUsage() {
  console.log('=== Advanced Usage Example ===');
  
  const generator = createBalanceProofGenerator('https://polygon-mainnet.g.alchemy.com/v2/your-api-key');
  
  const request: BalanceProofRequest = {
    address: '0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4',
    contractAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC on Polygon
    chainId: 137, // Polygon
    blockHeight: 48000000,
    rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/your-api-key'
  };

  try {
    const proof = await generator.generateERC20BalanceProof(request);
    
    // Verify the proof
    const isValid = await generator.verifyWitness(proof.witness);
    console.log('Proof is valid:', isValid);
    
    console.log('Complete proof result:', proof);
  } catch (error) {
    console.error('Error in advanced usage:', error);
  }
}

// Example 4: Batch proof generation
async function exampleBatchProofs() {
  console.log('=== Batch Proof Generation Example ===');
  
  const generator = createBalanceProofGenerator('https://eth-mainnet.g.alchemy.com/v2/your-api-key');
  
  const requests: BalanceProofRequest[] = [
    {
      address: '0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4',
      contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a', // USDC
      chainId: 1,
      blockHeight: 18500000,
      rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/your-api-key'
    },
    {
      address: '0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4',
      contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      chainId: 1,
      blockHeight: 18500000,
      rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/your-api-key'
    }
  ];

  try {
    const proofs = await Promise.all(
      requests.map(request => generator.generateERC20BalanceProof(request))
    );

    proofs.forEach((proof, index) => {
      console.log(`Proof ${index + 1}:`, {
        balance: proof.balance,
        blockHash: proof.blockHash.slice(0, 10) + '...',
        rlpSize: proof.rlpEncodedProof.length
      });
    });
  } catch (error) {
    console.error('Error in batch processing:', error);
  }
}

// Example 5: Web page integration helper
export class WebPageBalanceProver {
  private generator: EthereumBalanceProofGenerator;
  
  constructor(rpcUrl: string) {
    this.generator = new EthereumBalanceProofGenerator(rpcUrl);
  }

  /**
   * Generate proof with web-friendly error handling
   */
  async generateProofForWebPage(
    userAddress: string,
    contractAddress: string,
    chainId: number,
    blockHeight: number,
    tokenType: 'ERC20' | 'ERC721',
    tokenId?: string
  ): Promise<{ success: boolean; data?: BalanceProofResult; error?: string }> {
    try {
      const request: BalanceProofRequest = {
        address: userAddress,
        contractAddress,
        chainId,
        blockHeight,
        tokenId,
        rpcUrl: '' // Already configured in constructor
      };

      let proof: BalanceProofResult;
      
      if (tokenType === 'ERC20') {
        proof = await this.generator.generateERC20BalanceProof(request);
      } else {
        if (!tokenId) {
          return { success: false, error: 'Token ID required for ERC721' };
        }
        proof = await this.generator.generateERC721OwnershipProof(request);
      }

      return { success: true, data: proof };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get compressed proof suitable for web transmission
   */
  async getCompressedProof(
    userAddress: string,
    contractAddress: string,
    chainId: number,
    blockHeight: number,
    tokenType: 'ERC20' | 'ERC721',
    tokenId?: string
  ): Promise<string | null> {
    const result = await this.generateProofForWebPage(
      userAddress,
      contractAddress,
      chainId,
      blockHeight,
      tokenType,
      tokenId
    );

    return result.success ? result.data!.rlpEncodedProof : null;
  }
}

// Run examples if this file is executed directly
// Note: This check works in Node.js but may need adjustment for different environments
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('examples.ts')) {
  console.log('Running Ethereum Balance Proof Examples...\n');
  
  Promise.all([
    exampleERC20Proof(),
    exampleERC721Proof(),
    exampleAdvancedUsage(),
    exampleBatchProofs()
  ]).then(() => {
    console.log('\nAll examples completed!');
  }).catch(error => {
    console.error('Error running examples:', error);
  });
}

export {
  exampleERC20Proof,
  exampleERC721Proof,
  exampleAdvancedUsage,
  exampleBatchProofs
};
