import { MetaMaskBalanceProofGenerator, generateMetaMaskERC20Proof, generateMetaMaskERC721Proof } from './metamask-balance-proof';

// Mock MetaMask/window.ethereum
const mockEthereum = {
  isMetaMask: true,
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  send: jest.fn(),
  sendAsync: jest.fn(),
};

// Mock ethers BrowserProvider
const mockProvider = {
  send: jest.fn().mockImplementation((method, params) => {
    if (method === 'eth_requestAccounts') {
      return Promise.resolve(['0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4']);
    }
    if (method === 'eth_accounts') {
      return Promise.resolve(['0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4']);
    }
    if (method === 'eth_getProof') {
      return Promise.resolve({
        accountProof: ['0xproof1', '0xproof2'],
        storageProof: [{
          key: '0xstoragekey',
          value: '0x0de0b6b3a7640000', // 1 ETH in wei
          proof: ['0xstorageproof1', '0xstorageproof2']
        }]
      });
    }
    return Promise.resolve();
  }),
  getSigner: jest.fn().mockReturnValue({
    getAddress: jest.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4')
  }),
  getNetwork: jest.fn().mockResolvedValue({
    chainId: 1n
  }),
  getBlock: jest.fn().mockResolvedValue({
    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    number: 18500000
  })
};

jest.mock('ethers', () => ({
  ...jest.requireActual('ethers'),
  BrowserProvider: jest.fn().mockImplementation(() => mockProvider)
}));

describe('MetaMaskBalanceProofGenerator', () => {
  let generator: MetaMaskBalanceProofGenerator;

  beforeEach(() => {
    // Setup window.ethereum mock
    (global as any).window = {
      ethereum: mockEthereum
    };
    
    // Reset all mocks
    jest.clearAllMocks();
    
    generator = new MetaMaskBalanceProofGenerator();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('MetaMask availability', () => {
    it('should detect MetaMask availability', () => {
      expect(MetaMaskBalanceProofGenerator.isMetaMaskAvailable()).toBe(true);
    });

    it('should throw error when MetaMask is not available', () => {
      delete (global as any).window.ethereum;
      expect(() => new MetaMaskBalanceProofGenerator()).toThrow('MetaMask not found');
    });
  });

  describe('Wallet connection', () => {
    it('should connect to wallet successfully', async () => {
      const address = await generator.connectWallet();
      expect(address).toBe('0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4');
      expect(mockProvider.send).toHaveBeenCalledWith('eth_requestAccounts', []);
    });

    it('should get current account', async () => {
      const account = await generator.getCurrentAccount();
      expect(account).toBe('0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4');
      expect(mockProvider.send).toHaveBeenCalledWith('eth_accounts', []);
    });

    it('should get chain ID', async () => {
      const chainId = await generator.getChainId();
      expect(chainId).toBe(1);
      expect(mockProvider.getNetwork).toHaveBeenCalled();
    });
  });

  describe('ERC20 Balance Proof', () => {
    it('should generate ERC20 balance proof', async () => {
      const request = {
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a'
      };

      const result = await generator.generateERC20BalanceProof(request);

      expect(result).toHaveProperty('userAddress');
      expect(result).toHaveProperty('balance');
      expect(result).toHaveProperty('blockHash');
      expect(result).toHaveProperty('accountProof');
      expect(result).toHaveProperty('storageProof');
      expect(result).toHaveProperty('rlpEncodedProof');
      expect(result).toHaveProperty('witness');
      expect(result.witness.tokenType).toBe('ERC20');
      expect(mockProvider.send).toHaveBeenCalledWith('eth_requestAccounts', []);
      expect(mockProvider.send).toHaveBeenCalledWith('eth_getProof', expect.any(Array));
    });

    it('should generate ERC20 proof with custom block tag', async () => {
      const request = {
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a',
        blockTag: 18500000
      };

      const result = await generator.generateERC20BalanceProof(request);
      expect(result.witness.blockNumber).toBe(18500000);
    });

    it('should use custom slot index', async () => {
      const request = {
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a',
        slotIndex: 5
      };

      const result = await generator.generateERC20BalanceProof(request);
      // Storage key should be different when using different slot
      expect(result.storageKey).toBeDefined();
      expect(result.storageKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('ERC721 Ownership Proof', () => {
    it('should generate ERC721 ownership proof', async () => {
      const request = {
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a',
        tokenId: '1234'
      };

      const result = await generator.generateERC721OwnershipProof(request);

      expect(result).toHaveProperty('userAddress');
      expect(result).toHaveProperty('balance');
      expect(result).toHaveProperty('blockHash');
      expect(result).toHaveProperty('accountProof');
      expect(result).toHaveProperty('storageProof');
      expect(result).toHaveProperty('rlpEncodedProof');
      expect(result).toHaveProperty('witness');
      expect(result.witness.tokenType).toBe('ERC721');
      expect(result.witness.tokenId).toBe('1234');
    });

    it('should throw error when tokenId is missing', async () => {
      const request = {
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a'
      };

      await expect(generator.generateERC721OwnershipProof(request))
        .rejects.toThrow('Token ID is required');
    });
  });

  describe('Event listeners', () => {
    it('should set up account change listener', () => {
      const callback = jest.fn();
      generator.onAccountsChanged(callback);
      expect(mockEthereum.on).toHaveBeenCalledWith('accountsChanged', callback);
    });

    it('should set up chain change listener', () => {
      const callback = jest.fn();
      generator.onChainChanged(callback);
      expect(mockEthereum.on).toHaveBeenCalledWith('chainChanged', callback);
    });
  });

  describe('Utility functions', () => {
    it('should generate ERC20 proof using utility function', async () => {
      const result = await generateMetaMaskERC20Proof(
        '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a'
      );
      expect(result.witness.tokenType).toBe('ERC20');
    });

    it('should generate ERC721 proof using utility function', async () => {
      const result = await generateMetaMaskERC721Proof(
        '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a',
        '1234'
      );
      expect(result.witness.tokenType).toBe('ERC721');
      expect(result.witness.tokenId).toBe('1234');
    });
  });

  describe('Error handling', () => {
    it('should handle RPC errors gracefully', async () => {
      // Mock provider send to throw error for eth_getProof
      mockProvider.send.mockImplementation((method) => {
        if (method === 'eth_requestAccounts') {
          return Promise.resolve(['0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4']);
        }
        if (method === 'eth_getProof') {
          return Promise.reject(new Error('RPC Error'));
        }
        return Promise.resolve();
      });

      const request = {
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a'
      };

      await expect(generator.generateERC20BalanceProof(request))
        .rejects.toThrow('Failed to generate proof');
    });

    it('should handle wallet connection errors', async () => {
      // Mock provider send to throw error for connection
      mockProvider.send.mockImplementation((method) => {
        if (method === 'eth_requestAccounts') {
          return Promise.reject(new Error('User rejected'));
        }
        return Promise.resolve();
      });

      await expect(generator.connectWallet())
        .rejects.toThrow('Failed to connect to MetaMask');
    });
  });

  describe('Storage key calculation', () => {
    it('should calculate correct ERC20 storage keys', async () => {
      const request = {
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a',
        slotIndex: 0
      };

      const result = await generator.generateERC20BalanceProof(request);
      
      // Storage key should be deterministic based on user address and slot
      expect(result.storageKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should calculate correct ERC721 storage keys', async () => {
      const request = {
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a',
        tokenId: '1234',
        slotIndex: 2
      };

      const result = await generator.generateERC721OwnershipProof(request);
      
      // Storage key should be deterministic based on token ID and slot
      expect(result.storageKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('Balance calculation', () => {
    it('should correctly interpret ERC20 balance from storage', async () => {
      const request = {
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a'
      };

      const result = await generator.generateERC20BalanceProof(request);
      
      // Should convert hex storage value to decimal string
      expect(result.balance).toBe('1000000000000000000'); // 1 ETH in wei
    });

    it('should correctly interpret ERC721 ownership from storage', async () => {
      // Mock storage value that contains the user's address (padded)
      mockProvider.send.mockImplementation((method, params) => {
        if (method === 'eth_requestAccounts') {
          return Promise.resolve(['0x742d35Cc6634C0532925a3b8D4Ad53f38E5bC2E4']);
        }
        if (method === 'eth_getProof') {
          return Promise.resolve({
            accountProof: ['0xproof1', '0xproof2'],
            storageProof: [{
              key: '0xstoragekey',
              value: '0x000000000000000000000000742d35cc6634c0532925a3b8d4ad53f38e5bc2e4', // User's address
              proof: ['0xstorageproof1', '0xstorageproof2']
            }]
          });
        }
        return Promise.resolve();
      });

      const request = {
        contractAddress: '0xA0b86a33E6441f8F20e2DC5dCb5E32C8A6b8e68a',
        tokenId: '1234'
      };

      const result = await generator.generateERC721OwnershipProof(request);
      expect(result.balance).toBe('1'); // User owns the token
    });
  });
});
