import { ethers } from 'ethers';
import { execSync } from 'child_process';
import fs from 'fs';

async function deployToken() {
    // Connect to Anvil
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Use the first Anvil account (deployer)
    const deployer = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
    
    console.log('🚀 Deploying from:', deployer.address);
    console.log('💰 Balance:', ethers.formatEther(await provider.getBalance(deployer.address)), 'ETH');
    
    // Check if forge is available for compilation
    let contractBytecode, contractABI;
    
    console.log('📦 Compiling contract with forge...');
    try {
        execSync('forge --version', { stdio: 'pipe' });
    } catch (error) {
        console.error('❌ Forge is required but not installed!');
        console.error('');
        console.error('Please install Foundry (which includes forge):');
        console.error('curl -L https://foundry.paradigm.xyz | bash');
        console.error('foundryup');
        console.error('');
        console.error('Then run this script again.');
        process.exit(1);
    }
    
    // Compile the contract
    execSync('forge build --contracts GovernanceToken.sol --out forge-out', { stdio: 'inherit' });
    
    // Read the compiled contract
    const artifactPath = 'forge-out/GovernanceToken.sol/GovernanceToken.json';
    if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        contractBytecode = artifact.bytecode.object;
        contractABI = artifact.abi;
        console.log('✅ Contract compiled successfully with forge');
    } else {
        console.error('❌ Compiled contract not found at:', artifactPath);
        process.exit(1);
    }
    
    // Deploy the contract
    const factory = new ethers.ContractFactory(contractABI, contractBytecode, deployer);
    console.log('📦 Deploying GovernanceToken...');
    
    const contract = await factory.deploy(ethers.parseEther("1000000"));
    await contract.waitForDeployment();
    
    const contractAddress = await contract.getAddress();
    console.log('✅ GovernanceToken deployed at:', contractAddress);
    
    // Fund all addresses with tokens
    const allAddresses = ['0x4A7C969110f7358bF334b49A2FF1a2585ac372B8', '0x148311C647Ec8a584D896c04f6492b5D9Cb3a9B0', '0x36311a95623ddf14De0c7C07250de259E118Cc2e', '0x2BBd20672EAE1dE51fA49088b7bc1D421b7b3FEC'];
    
    for (let i = 0; i < allAddresses.length; i++) {
        const address = allAddresses[i];
        console.log(`💸 Transferring 100000000000000000000 tokens to ${address}...`);
        
        // Get current nonce to avoid conflicts
        const nonce = await provider.getTransactionCount(deployer.address);
        
        const transferTx = await contract.transfer(address, '100000000000000000000', {
            nonce: nonce,
            gasLimit: 100000
        });
        
        console.log(`⏳ Transaction sent: ${transferTx.hash}`);
        await transferTx.wait();
        console.log(`✅ Transfer to ${address} complete!`);
        
        // Small delay between transfers to ensure nonce updates
        if (i < allAddresses.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
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
            console.log(`💸 Transferring ${ethers.formatEther(canisterTokenAmount)} tokens to canister...`);
            
            const tokenNonce = await provider.getTransactionCount(deployer.address);
            const canisterTokenTx = await contract.transfer(canisterAddress, canisterTokenAmount, {
                nonce: tokenNonce,
                gasLimit: 100000
            });
            await canisterTokenTx.wait();
            console.log('✅ Canister token transfer complete!');
            
            // Fund canister with Ether (1 ETH)
            const canisterEtherAmount = '1000000000000000000'; // 1 ETH
            console.log(`💸 Transferring ${ethers.formatEther(canisterEtherAmount)} ETH to canister...`);
            
            const etherNonce = await provider.getTransactionCount(deployer.address);
            const canisterEtherTx = await deployer.sendTransaction({
                to: canisterAddress,
                value: canisterEtherAmount,
                nonce: etherNonce,
                gasLimit: 21000
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
    
    
    console.log('📍 Contract Address:', contractAddress);
    console.log('💰 Each user address now has 100 GOV tokens');
    console.log('💰 Canister has 100 GOV tokens and 1 ETH for transactions');
    
    // Add contract to backend configuration
    console.log('🏗️  Adding contract to backend configuration...');
    try {
        const result = execSync(
            `dfx canister call --network local backend icrc149_update_snapshot_contract_config '("${contractAddress}", opt record { contract_address = "${contractAddress}"; chain = record { chain_id = 31337; network_name = "anvil" }; rpc_service = record { rpc_type = "local"; canister_id = principal "7hfb6-caaaa-aaaar-qadga-cai"; custom_config = null }; balance_storage_slot = 1; contract_type = variant { ERC20 }; enabled = true })'`,
            { encoding: 'utf8', stdio: 'pipe' }
        );
        
        console.log('✅ Contract added to backend configuration!');
        console.log('💡 Contract is now available for proposal creation');
    } catch (error) {
        console.log('⚠️  Failed to add contract to backend:', error.message);
        console.log('💡 You can add it manually via the frontend configuration panel');
    }
    
    return contractAddress;
}

// Run the deployment
deployToken().catch(console.error);
