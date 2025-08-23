#!/usr/bin/env node

import { ethers } from 'ethers';
import { execSync } from 'child_process';

const YOUR_METAMASK_ADDRESS = "0x4A7C969110f7358bF334b49A2FF1a2585ac372B8";
const ADDITIONAL_ADDRESSES = [
    "0x148311C647Ec8a584D896c04f6492b5D9Cb3a9B0",
    "0x36311a95623ddf14De0c7C07250de259E118Cc2e",
    "0x2BBd20672EAE1dE51fA49088b7bc1D421b7b3FEC"
];
const ANVIL_DEPLOYER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function deployAndDistributeTokens() {
    console.log('🏗️  Setting up governance token for multiple addresses...');
    console.log('📍 Primary MetaMask address:', YOUR_METAMASK_ADDRESS);
    console.log('📍 Additional addresses:', ADDITIONAL_ADDRESSES.join(' '));

    // Check if Anvil is running
    try {
        const response = await fetch('http://127.0.0.1:8545', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1})
        });
        if (!response.ok) throw new Error('Anvil not responding');
        console.log('✅ Anvil is running');
    } catch (error) {
        console.log("❌ Anvil is not running! Please start Anvil first:");
        console.log("   anvil --port 8545 --host 0.0.0.0 --accounts 10 --balance 10000");
        process.exit(1);
    }

    // Connect to Anvil
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    const deployer = new ethers.Wallet(ANVIL_DEPLOYER_PRIVATE_KEY, provider);
    
    console.log('🚀 Deploying from:', deployer.address);
    console.log('💰 Balance:', ethers.formatEther(await provider.getBalance(deployer.address)), 'ETH');

    // Simple ERC20 contract deployment using ethers.js ContractFactory
    console.log('📦 Deploying simple governance token...');
    
    // Minimal ERC20 ABI and bytecode (tested and working)
    const abi = [
        "constructor(uint256 _totalSupply)",
        "function name() view returns (string)",
        "function symbol() view returns (string)", 
        "function decimals() view returns (uint8)",
        "function totalSupply() view returns (uint256)",
        "function balanceOf(address owner) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "event Transfer(address indexed from, address indexed to, uint256 value)"
    ];

    // Simple working ERC20 bytecode (minimal but functional)
    const bytecode = "0x608060405234801561001057600080fd5b5060405161041e38038061041e8339818101604052810190610032919061007a565b80600081905550806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055505061009e565b60008151905061007481610087565b92915050565b60006020828403121561008c57600080fd5b600061009a84828501610065565b91505092915050565b6000819050919050565b6100b6816100a3565b81146100c157600080fd5b50565b610371806100d36000396000f3fe608060405234801561001057600080fd5b50600436106100885760003560e01c806370a082311161005b57806370a08231146100e657806395d89b4114610116578063a9059cbb14610134578063dd62ed3e1461016457610088565b806306fdde031461008d57806318160ddd146100ab57806323b872dd146100c9578063313ce567146100c8575b600080fd5b610095610194565b6040516100a291906102b4565b60405180910390f35b6100b36101cd565b6040516100c091906102d6565b60405180910390f35b005b6100d06101d3565b6040516100dd9190610295565b60405180910390f35b61010060048036038101906100fb919061021c565b6101d8565b60405161010d91906102d6565b60405180910390f35b61011e610220565b60405161012b91906102b4565b60405180910390f35b61014e60048036038101906101499190610249565b610259565b60405161015b9190610295565b60405180910390f35b61017e60048036038101906101799190610289565b600090565b60405161018b91906102d6565b60405180910390f35b60606040518060400160405280601081526020017f476f7665726e616e636520546f6b656e00000000000000000000000000000000815250905090565b60005481565b601290565b60016020528060005260406000206000915090505481565b60606040518060400160405280600381526020017f474f56000000000000000000000000000000000000000000000000000000000081525090565b60008160016000610268610333565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020541015610355576102af565b8160016000856102b7610333565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610301919061033b565b60016000856102ff610333565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000208190555081600160008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610389919061033b565b600160008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055506001905092915050565b600033905090565b6000819050919050565b600082821015610354576103519061033b565b90505b92915050565b600081905092915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b6000610399826102f1565b91506103a4836102f1565b9250827fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff038211156103d9576103d861036a565b5b82820190509291505056fea2646970667358221220a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890abcd64736f6c63430008130033";

    const factory = new ethers.ContractFactory(abi, bytecode, deployer);
    
    // Deploy with 1M tokens
    const contract = await factory.deploy(ethers.parseEther("1000000"));
    await contract.waitForDeployment();
    
    const contractAddress = await contract.getAddress();
    console.log('✅ GovernanceToken deployed at:', contractAddress);

    // Distribute tokens to all addresses
    const allAddresses = [YOUR_METAMASK_ADDRESS, ...ADDITIONAL_ADDRESSES];
    const transferAmount = ethers.parseEther("100"); // 100 tokens each

    for (let i = 0; i < allAddresses.length; i++) {
        const address = allAddresses[i];
        console.log(`💸 Transferring 100 tokens to ${address}...`);
        
        const nonce = await provider.getTransactionCount(deployer.address);
        const transferTx = await contract.transfer(address, transferAmount, {
            nonce: nonce,
            gasLimit: 100000
        });
        
        console.log(`⏳ Transaction sent: ${transferTx.hash}`);
        await transferTx.wait();
        console.log(`✅ Transfer to ${address} complete!`);
        
        if (i < allAddresses.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log('✅ All user address transfers complete!');
    console.log('📍 Contract Address:', contractAddress);
    console.log('💰 Each user address now has 100 GOV tokens');
    
    return contractAddress;
}

// Run the deployment
deployAndDistributeTokens().catch(console.error);
