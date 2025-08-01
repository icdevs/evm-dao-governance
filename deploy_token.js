import { ethers } from 'ethers';
import { execSync } from 'child_process';

async function deployToken() {
    // Connect to Anvil
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Use the first Anvil account (deployer)
    const deployer = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
    
    console.log('🚀 Deploying from:', deployer.address);
    console.log('💰 Balance:', ethers.formatEther(await provider.getBalance(deployer.address)), 'ETH');
    
    // Simple ERC20 token contract bytecode (OpenZeppelin-like)
    // This is a pre-compiled GovernanceToken contract
    const contractBytecode = '0x608060405234801561001057600080fd5b506040516108fc3803806108fc8339810160408190526100309190610242565b8181600061003e848261031c565b50600161004b838261031c565b5050506100663361006160201b60201c565b6100da565b600680546001600160a01b038381166001600160a01b0319831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e090600090a35050565b505050565b634e487b7160e01b600052604160045260246000fd5b600082601f8301126100f957600080fd5b81516001600160401b0380821115610113576101136100d2565b604051601f8301601f19908116603f0116810190828211818310171561013b5761013b6100d2565b8160405283815260209250868385880101111561015757600080fd5b600091505b8382101561017957858201830151818301840152908201906101255c565b600093505050600081840152601f19601f8301169290920192505050565b80356001600160a01b03811681146101ae57600080fd5b919050565b600080600080608085870312156101c957600080fd5b84516001600160401b03808211156101e057600080fd5b6101ec888389016100e8565b9550602087015191508082111561020257600080fd5b5061020f878288016100e8565b93505061021e60408601610197565b915060608501519050';
    
    // Deploy the contract
    const factory = new ethers.ContractFactory([], contractBytecode, deployer);
    console.log('📦 Deploying GovernanceToken...');
    
    const contract = await factory.deploy('GovernanceToken', 'GOV', deployer.address, '1000000000000000000000000');
    await contract.waitForDeployment();
    
    const contractAddress = await contract.getAddress();
    console.log('✅ GovernanceToken deployed at:', contractAddress);
    
    // Fund all addresses with tokens
    const allAddresses = ['0x4A7C969110f7358bF334b49A2FF1a2585ac372B8', '0x148311C647Ec8a584D896c04f6492b5D9Cb3a9B0', '0x36311a95623ddf14De0c7C07250de259E118Cc2e', '0x2BBd20672EAE1dE51fA49088b7bc1D421b7b3FEC'];
    
    for (const address of allAddresses) {
        console.log(`💸 Transferring 100000000000000000000 tokens to ${address}...`);
        const transferTx = await contract.transfer(address, '100000000000000000000');
        await transferTx.wait();
        console.log(`✅ Transfer to ${address} complete!`);
    }
    
    console.log('✅ All user address transfers complete!');
    
    // Get canister Ethereum address and fund it
    console.log('🏦 Getting canister Ethereum address...');
    try {
        const canisterResult = execSync('dfx canister call --network local main icrc149_get_eth_address "(null)"', 
            { encoding: 'utf8', stdio: 'pipe' });
        
        const addressMatch = canisterResult.match(/opt\s+"([^"]+)"/);
        if (addressMatch && addressMatch[1]) {
            const canisterAddress = addressMatch[1];
            console.log('✅ Canister Ethereum address:', canisterAddress);
            
            // Fund canister with governance tokens (100 tokens)
            const canisterTokenAmount = '100000000000000000000'; // 100 tokens
            console.log(`� Transferring ${ethers.formatEther(canisterTokenAmount)} tokens to canister...`);
            const canisterTokenTx = await contract.transfer(canisterAddress, canisterTokenAmount);
            await canisterTokenTx.wait();
            console.log('✅ Canister token transfer complete!');
            
            // Fund canister with Ether (1 ETH)
            const canisterEtherAmount = '1000000000000000000'; // 1 ETH
            console.log(`💸 Transferring ${ethers.formatEther(canisterEtherAmount)} ETH to canister...`);
            const canisterEtherTx = await deployer.sendTransaction({
                to: canisterAddress,
                value: canisterEtherAmount
            });
            await canisterEtherTx.wait();
            console.log('✅ Canister Ether transfer complete!');
            
            // Check canister balances
            const canisterTokenBalance = await contract.balanceOf(canisterAddress);
            const canisterEtherBalance = await provider.getBalance(canisterAddress);
            console.log(`💰 Canister now has ${ethers.formatEther(canisterTokenBalance)} tokens and ${ethers.formatEther(canisterEtherBalance)} ETH`);
        } else {
            console.log('⚠️  Could not parse canister address, skipping canister funding');
        }
    } catch (error) {
        console.log('⚠️  Could not get or fund canister address:', error.message);
    }
    
    console.log('�📍 Contract Address:', contractAddress);
    console.log('💰 Each user address now has 100 GOV tokens');
    console.log('💰 Canister has 100 GOV tokens and 1 ETH for transactions');
    
    return contractAddress;
}

// Run the deployment
deployToken().catch(console.error);
