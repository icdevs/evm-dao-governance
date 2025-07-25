import { MetaMaskBalanceProofGenerator, generateMetaMaskERC20Proof, generateMetaMaskERC721Proof } from './metamask-balance-proof';

/**
 * Examples of how to use the MetaMask Balance Proof Generator
 */

async function basicERC20Example() {
  console.log('🔄 Basic ERC20 Balance Proof Example');
  
  try {
    // Check if MetaMask is available
    if (!MetaMaskBalanceProofGenerator.isMetaMaskAvailable()) {
      throw new Error('MetaMask not found. Please install MetaMask.');
    }

    // Create generator instance
    const generator = new MetaMaskBalanceProofGenerator();
    
    // Connect to wallet
    console.log('Connecting to MetaMask...');
    const userAddress = await generator.connectWallet();
    console.log(`✅ Connected: ${userAddress}`);
    
    // Get chain ID
    const chainId = await generator.getChainId();
    console.log(`🌐 Chain ID: ${chainId}`);
    
    // Generate proof for USDC balance (example contract)
    const usdcAddress = '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a';
    console.log(`🔍 Generating proof for USDC balance...`);
    
    const proof = await generator.generateERC20BalanceProof({
      contractAddress: usdcAddress,
      blockTag: 'latest' // Use latest block
    });
    
    console.log('✅ ERC20 Proof Generated:');
    console.log(`   Balance: ${proof.balance} wei`);
    console.log(`   Block: ${proof.blockNumber}`);
    console.log(`   RLP Proof: ${proof.rlpEncodedProof.slice(0, 50)}...`);
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function basicERC721Example() {
  console.log('🔄 Basic ERC721 Ownership Proof Example');
  
  try {
    // Use utility function for quick proof generation
    const nftAddress = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D'; // Bored Ape Yacht Club
    const tokenId = '1234';
    
    console.log(`🔍 Generating proof for NFT ownership...`);
    console.log(`   Contract: ${nftAddress}`);
    console.log(`   Token ID: ${tokenId}`);
    
    const proof = await generateMetaMaskERC721Proof(
      nftAddress,
      tokenId,
      'latest' // Block tag
    );
    
    console.log('✅ ERC721 Proof Generated:');
    console.log(`   User: ${proof.userAddress}`);
    console.log(`   Owns Token: ${proof.balance === '1' ? 'Yes' : 'No'}`);
    console.log(`   Block: ${proof.blockNumber}`);
    console.log(`   Storage Key: ${proof.storageKey}`);
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function advancedERC20Example() {
  console.log('🔄 Advanced ERC20 Example with Custom Parameters');
  
  try {
    const generator = new MetaMaskBalanceProofGenerator();
    
    // Connect wallet
    await generator.connectWallet();
    
    // Generate proof with custom parameters
    const proof = await generator.generateERC20BalanceProof({
      contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
      blockTag: 18500000, // Specific block number
      slotIndex: 2 // Custom storage slot (DAI uses slot 2 for balances)
    });
    
    console.log('✅ Advanced ERC20 Proof:');
    console.log(`   Contract: DAI Token`);
    console.log(`   Balance: ${BigInt(proof.balance) / BigInt(1e18)} DAI`);
    console.log(`   At Block: ${proof.blockNumber}`);
    console.log(`   Storage Slot: 2`);
    
    // Display witness data
    console.log('📋 Witness Data:');
    console.log(JSON.stringify(proof.witness, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function eventListenerExample() {
  console.log('🔄 Event Listener Example');
  
  try {
    const generator = new MetaMaskBalanceProofGenerator();
    
    // Set up event listeners
    generator.onAccountsChanged((accounts) => {
      console.log('👤 Account changed:', accounts[0] || 'No account');
    });
    
    generator.onChainChanged((chainId) => {
      console.log('🌐 Chain changed:', parseInt(chainId, 16));
    });
    
    // Connect and wait for potential changes
    await generator.connectWallet();
    console.log('✅ Event listeners set up. Try switching accounts or networks in MetaMask.');
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function batchProofExample() {
  console.log('🔄 Batch Proof Generation Example');
  
  try {
    const generator = new MetaMaskBalanceProofGenerator();
    await generator.connectWallet();
    
    // Generate multiple proofs in parallel
    const contracts = [
      { address: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a', name: 'USDC' },
      { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', name: 'DAI' },
      { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', name: 'USDT' }
    ];
    
    console.log('🔍 Generating proofs for multiple tokens...');
    
    const proofs = await Promise.all(
      contracts.map(async (contract) => {
        try {
          const proof = await generator.generateERC20BalanceProof({
            contractAddress: contract.address,
            blockTag: 'latest'
          });
          return { ...proof, contractName: contract.name };
        } catch (error) {
          console.error(`Failed to generate proof for ${contract.name}:`, error);
          return null;
        }
      })
    );
    
    // Display results
    proofs.forEach((proof, index) => {
      if (proof) {
        const balance = BigInt(proof.balance) / BigInt(1e18);
        console.log(`✅ ${proof.contractName}: ${balance} tokens`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function historicalProofExample() {
  console.log('🔄 Historical Proof Example');
  
  try {
    // Generate proof for a specific historical block
    const historicalBlock = 18000000; // Some block from the past
    
    const proof = await generateMetaMaskERC20Proof(
      '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a', // USDC
      historicalBlock
    );
    
    console.log('✅ Historical Proof Generated:');
    console.log(`   Block: ${proof.blockNumber}`);
    console.log(`   Block Hash: ${proof.blockHash}`);
    console.log(`   Balance at that time: ${proof.balance} wei`);
    
    // This proof can be used to verify what the balance was at that specific block
    console.log('💡 This proof cryptographically verifies the balance at block', historicalBlock);
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

// Error handling and recovery example
async function errorHandlingExample() {
  console.log('🔄 Error Handling Example');
  
  try {
    const generator = new MetaMaskBalanceProofGenerator();
    
    // Try to get current account without connecting first
    const currentAccount = await generator.getCurrentAccount();
    
    if (!currentAccount) {
      console.log('⚠️ No account connected, requesting connection...');
      await generator.connectWallet();
    } else {
      console.log(`✅ Already connected: ${currentAccount}`);
    }
    
    // Try proof generation with error handling
    try {
      const proof = await generator.generateERC20BalanceProof({
        contractAddress: '0xInvalidAddress' // This will fail
      });
    } catch (proofError) {
      console.log('⚠️ Proof generation failed (expected), trying with valid address...');
      
      const proof = await generator.generateERC20BalanceProof({
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a'
      });
      
      console.log('✅ Proof generated successfully after error recovery');
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

// Export all examples for easy use
export {
  basicERC20Example,
  basicERC721Example,
  advancedERC20Example,
  eventListenerExample,
  batchProofExample,
  historicalProofExample,
  errorHandlingExample
};

// Run examples if this file is executed directly
if (typeof window !== 'undefined') {
  console.log('🚀 MetaMask Balance Proof Examples');
  console.log('Use the exported functions to run specific examples:');
  console.log('- basicERC20Example()');
  console.log('- basicERC721Example()');
  console.log('- advancedERC20Example()');
  console.log('- eventListenerExample()');
  console.log('- batchProofExample()');
  console.log('- historicalProofExample()');
  console.log('- errorHandlingExample()');
}
