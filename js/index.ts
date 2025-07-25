/**
 * Ethereum Balance Proof Generator
 * 
 * A TypeScript library for generating cryptographic proofs of ERC20 token balances 
 * and ERC721 token ownership at specific Ethereum block heights.
 * 
 * This library now supports both traditional RPC-based proof generation and 
 * MetaMask-based proof generation for web applications.
 */

// Export the original RPC-based functionality
export {
  EthereumBalanceProofGenerator,
  createBalanceProofGenerator,
  generateERC20Proof,
  generateERC721Proof,
  decodeRLPWitness,
  mainnetProofGenerator
} from './ethereum-balance-proof';

// Export the new MetaMask-based functionality
export {
  MetaMaskBalanceProofGenerator,
  generateMetaMaskERC20Proof,
  generateMetaMaskERC721Proof,
  decodeMetaMaskRLPWitness
} from './metamask-balance-proof';

// Export types from original implementation
export type {
  BalanceProofRequest,
  BalanceProofResult,
  EthereumWitness
} from './ethereum-balance-proof';

// Export types from MetaMask implementation
export type {
  MetaMaskBalanceProofRequest,
  MetaMaskBalanceProofResult,
  MetaMaskEthereumWitness
} from './metamask-balance-proof';

// Export web integration helper (original)
export { WebPageBalanceProver } from './examples';

// Export example functions for reference (original)
export {
  exampleERC20Proof,
  exampleERC721Proof,
  exampleAdvancedUsage,
  exampleBatchProofs
} from './examples';

// Export MetaMask examples
export {
  basicERC20Example,
  basicERC721Example,
  advancedERC20Example,
  eventListenerExample,
  batchProofExample,
  historicalProofExample,
  errorHandlingExample
} from './metamask-examples';
