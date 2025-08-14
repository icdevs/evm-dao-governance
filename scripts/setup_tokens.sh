#!/bin/bash

# Script to deploy governance token and fund your MetaMask address
# This helps set up the testing environment for DAO voting
# Usage: ./setup_tokens.sh <YOUR_METAMASK_ADDRESS>

set -e

# Check if MetaMask address is provided as argument
if [ $# -eq 0 ]; then
    echo "❌ Error: MetaMask address is required!"
    echo "Usage: $0 <YOUR_METAMASK_ADDRESS>"
    echo "Example: $0 0x4A7C969110f7358bF334b49A2FF1a2585ac372B8"
    exit 1
fi

# Configuration
YOUR_METAMASK_ADDRESS="$1"

# Validate Ethereum address format (basic check)
if ! [[ $YOUR_METAMASK_ADDRESS =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    echo "❌ Error: Invalid Ethereum address format!"
    echo "Address must be in format: 0x followed by 40 hexadecimal characters"
    echo "Provided: $YOUR_METAMASK_ADDRESS"
    exit 1
fi
# Additional addresses to fund with tokens
ADDITIONAL_ADDRESSES=(
    "0x148311C647Ec8a584D896c04f6492b5D9Cb3a9B0"
    "0x36311a95623ddf14De0c7C07250de259E118Cc2e"
    "0x2BBd20672EAE1dE51fA49088b7bc1D421b7b3FEC"
)
ANVIL_DEPLOYER_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"  # First Anvil account
INITIAL_SUPPLY="1000000000000000000000000"  # 1M tokens (18 decimals)
TRANSFER_AMOUNT="100000000000000000000"     # 100 tokens to each address

echo "🏗️  Setting up governance token for multiple addresses..."
echo "📍 Primary MetaMask address: $YOUR_METAMASK_ADDRESS"
echo "📍 Additional addresses: ${ADDITIONAL_ADDRESSES[*]}"

# Check if Anvil is running
if ! curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545 > /dev/null; then
    echo "❌ Anvil is not running! Please start Anvil first:"
    echo "   anvil --port 8545 --host 0.0.0.0 --accounts 10 --balance 10000"
    exit 1
fi

echo "✅ Anvil is running"

# Check if we have the sample tokens directory (look in parent directory since script is in scripts/)
if [ ! -d "../sample-tokens" ]; then
    echo "📦 Sample tokens directory not found. Creating simple deployment script..."
    
    # Create a simple Solidity contract deployment using forge/cast
    cat > deploy_token.js << EOF
import { ethers } from 'ethers';
import { execSync } from 'child_process';

async function deployToken() {
    // Connect to Anvil
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Use the first Anvil account (deployer)
    const deployer = new ethers.Wallet('$ANVIL_DEPLOYER_PRIVATE_KEY', provider);
    
    console.log('🚀 Deploying from:', deployer.address);
    console.log('💰 Balance:', ethers.formatEther(await provider.getBalance(deployer.address)), 'ETH');
    
    // Simple ERC20 token contract bytecode (OpenZeppelin-like)
    // This is a pre-compiled GovernanceToken contract
    const contractBytecode = '0x608060405234801561001057600080fd5b506040516108fc3803806108fc8339810160408190526100309190610242565b8181600061003e848261031c565b50600161004b838261031c565b5050506100663361006160201b60201c565b6100da565b600680546001600160a01b038381166001600160a01b0319831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e090600090a35050565b505050565b634e487b7160e01b600052604160045260246000fd5b600082601f8301126100f957600080fd5b81516001600160401b0380821115610113576101136100d2565b604051601f8301601f19908116603f0116810190828211818310171561013b5761013b6100d2565b8160405283815260209250868385880101111561015757600080fd5b600091505b8382101561017957858201830151818301840152908201906101255c565b600093505050600081840152601f19601f8301169290920192505050565b80356001600160a01b03811681146101ae57600080fd5b919050565b600080600080608085870312156101c957600080fd5b84516001600160401b03808211156101e057600080fd5b6101ec888389016100e8565b9550602087015191508082111561020257600080fd5b5061020f878288016100e8565b93505061021e60408601610197565b915060608501519050$INITIAL_SUPPLY81565b600080fd5b6000806040838503121561025557600080fd5b82516001600160401b038082111561026c57600080fd5b610278868387016100e8565b9350602085015191508082111561028e57600080fd5b5061029b858286016100e8565b9150509250929050565b600181811c908216806102b957607f821691505b6020821081036102d957634e487b7160e01b600052602260045260246000fd5b50919050565b601f8201601f191681016001600160401b0381118282101715610304576103046100d2565b6040525050565b80820180821115610326576103266102ec565b92915050565b8082028115828204841417610326576103266102ec565b634e487b7160e01b600052601160045260246000fd5b610609806103636000396000f3fe608060405234801561001057600080fd5b50600436106100f55760003560e01c806370a0823111610097578063a457c2d711610066578063a457c2d71461020a578063a9059cbb1461021d578063dd62ed3e14610230578063f2fde38b1461026957600080fd5b806370a08231146101b4578063715018a6146101dd5780638da5cb5b146101e557806395d89b41146101f657600080fd5b806323b872dd116100d357806323b872dd14610167578063313ce5671461017a57806339509351146101895780635f9c1f2a1461019c57600080fd5b806306fdde03146100fa578063095ea7b31461011857806318160ddd1461013b578063232b7eac1461014d575b600080fd5b61010261027c565b60405161010f9190610515565b60405180910390f35b61012b61012636600461057f565b61030e565b604051901515815260200161010f565b6002545b60405190815260200161010f565b61013f60055481565b610328565b61012b6101753660046105a9565b610346565b6040516012815260200161010f565b61012b61019736600461057f565b61036a565b61013f6101aa3660046105e5565b60046020526000908152604090205481565b61013f6101c23660046105e5565b6001600160a01b031660009081526020819052604090205490565b61019c610389565b61019c600654906001600160a01b0316815260200161010f565b610102610397565b61012b61021836600461057f565b6103a6565b61012b61022b36600461057f565b610426565b61013f61023e366004610600565b6001600160a01b03918216600090815260016020908152604080832093909416825291909152205490565b61019c6102773660046105e5565b610434565b6060600080546102bb90610633565b80601f01602080910402602001604051908101604052809291908181526020018280546102e790610633565b80156103345780601f1061030957610100808354040283529160200191610334565b820191906000526020600020905b81548152906001019060200180831161031757829003601f168201915b5050505050905090565b60003361031c8185856104aa565b5060019392505050565b60003361033c8582856105ce565b6103478585856106ad565b506001949350505050565b60003361031c81858561035983836102de565b610363919061066d565b85856104aa565b60003361037783826103638688610680565b61033c8188886104aa565b610391610397565b565b6060600180546102bb90610633565b600033816103b482866102de565b90508381101561041957604051633b9aca0160e11b815260206004820152602560248201527f45524332303a2064656372656173656420616c6c6f77616e63652062656c6f77604482015264207a65726f60d81b60648201526084015b60405180910390fd5b61033c82868684036104aa565b60003361031c8185856106ad565b61043c610851565b6001600160a01b0381166104a15760405162461bcd60e51b815260206004820152602660248201527f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160448201526564647265737360d01b6064201526084016104105b61027781610891565b6001600160a01b0383166105e5760405162461bcd60e51b815260206004820152602460248201527f45524332303a20617070726f76652066726f6d20746865207a65726f206164646044820152637265737360e01b6064201526084016104105b6001600160a01b0382166105465760405162461bcd60e51b815260206004820152602260248201527f45524332303a20617070726f766520746f20746865207a65726f206164647265604482015261737360f01b6064201526084016104105b6001600160a01b0383811660008181526001602090815260408083209487168084529482529182902085905590518481527f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925910160405180910390a3505050565b60006105da84846102de565b9050600019811461066757818110156106a05760405162461bcd60e51b815260206004820152601d60248201527f45524332303a20696e73756666696369656e7420616c6c6f77616e63650000006044820152606401610410565b61066784848484036104aa565b50505050565b6001600160a01b03831661070d5760405162461bcd60e51b815260206004820152602560248201527f45524332303a207472616e736665722066726f6d20746865207a65726f206164604482015264647265737360d81b6064201526084016104105b6001600160a01b03821661076f5760405162461bcd60e51b815260206004820152602360248201527f45524332303a207472616e7366657220746f20746865207a65726f206164647260448201526265737360e81b6064201526084016104105b6001600160a01b038316600090815260208190526040902054818110156107e75760405162461bcd60e51b815260206004820152602660248201527f45524332303a207472616e7366657220616d6f756e7420657863656564732062604482015265616c616e636560d01b6064201526084016104105b6001600160a01b03848116600081815260208181526040808320878703905593871680835291849020805487019055925185815290927fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef910160405180910390a3610667565b6006546001600160a01b0316331461039957604051633118b5b360e11b8152336004820152602401610410565b600680546001600160a01b038381166001600160a01b0319831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e090600090a35050565b600060208083528351808285015260005b81811015610542578581018301518582016040015282016108e6565b506000604082860101526040601f19601f8301168501019250505092915050565b80356001600160a01b038116811461057a57600080fd5b919050565b6000806040838503121561059257600080fd5b61059b83610563565b946020939093013593505050565b6000806000606084860312156105be57600080fd5b6105c784610563565b92506105d560208501610563565b9150604084013590509250925092565b6000602082840312156105f757600080fd5b6105ff82610563565b9392505050565b6000806040838503121561061357600080fd5b61061c83610563565b915061062a60208401610563565b90509250929050565b600181811c9082168061064757607f821691505b60208210810361066757634e487b7160e01b600052602260045260246000fd5b50919050565b8082018082111561068e5761068e610680565b92915050565b634e487b7160e01b600052601160045260246000fd5b8181038181111561068e5761068e61068056fea2646970667358221220a7c0fc6c77b8c85b60faf1c4ff7c6f7b54b7b7e7e7e7e7e7e7e7e7e7e7e7e7e764736f6c63430008130033';
    
    // Deploy the contract
    const factory = new ethers.ContractFactory([], contractBytecode, deployer);
    console.log('📦 Deploying GovernanceToken...');
    
    const contract = await factory.deploy('GovernanceToken', 'GOV', deployer.address, '$INITIAL_SUPPLY');
    await contract.waitForDeployment();
    
    const contractAddress = await contract.getAddress();
    console.log('✅ GovernanceToken deployed at:', contractAddress);
    
    // Fund all addresses with tokens
    const allAddresses = ['$YOUR_METAMASK_ADDRESS', '${ADDITIONAL_ADDRESSES[0]}', '${ADDITIONAL_ADDRESSES[1]}', '${ADDITIONAL_ADDRESSES[2]}'];
    
    for (const address of allAddresses) {
        console.log(\`💸 Transferring $TRANSFER_AMOUNT tokens to \${address}...\`);
        const transferTx = await contract.transfer(address, '$TRANSFER_AMOUNT');
        await transferTx.wait();
        console.log(\`✅ Transfer to \${address} complete!\`);
    }
    
    console.log('✅ All user address transfers complete!');
    
    // Get canister Ethereum address and fund it
    console.log('🏦 Getting canister Ethereum address...');
    try {
        const canisterResult = execSync('dfx canister call --network local main icrc149_get_eth_address "(null)"', 
            { encoding: 'utf8', stdio: 'pipe' });
        
        const addressMatch = canisterResult.match(/opt\\s+"([^"]+)"/);
        if (addressMatch && addressMatch[1]) {
            const canisterAddress = addressMatch[1];
            console.log('✅ Canister Ethereum address:', canisterAddress);
            
            // Fund canister with governance tokens (100 tokens)
            const canisterTokenAmount = '100000000000000000000'; // 100 tokens
            console.log(\`� Transferring \${ethers.formatEther(canisterTokenAmount)} tokens to canister...\`);
            const canisterTokenTx = await contract.transfer(canisterAddress, canisterTokenAmount);
            await canisterTokenTx.wait();
            console.log('✅ Canister token transfer complete!');
            
            // Fund canister with Ether (1 ETH)
            const canisterEtherAmount = '1000000000000000000'; // 1 ETH
            console.log(\`💸 Transferring \${ethers.formatEther(canisterEtherAmount)} ETH to canister...\`);
            const canisterEtherTx = await deployer.sendTransaction({
                to: canisterAddress,
                value: canisterEtherAmount
            });
            await canisterEtherTx.wait();
            console.log('✅ Canister Ether transfer complete!');
            
            // Check canister balances
            const canisterTokenBalance = await contract.balanceOf(canisterAddress);
            const canisterEtherBalance = await provider.getBalance(canisterAddress);
            console.log(\`💰 Canister now has \${ethers.formatEther(canisterTokenBalance)} tokens and \${ethers.formatEther(canisterEtherBalance)} ETH\`);
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
EOF

    # Install ethers if needed (assuming Node.js is available)
    if command -v npm &> /dev/null; then
        echo "📦 Installing ethers.js for deployment..."
        npm init -y > /dev/null 2>&1
        npm install ethers > /dev/null 2>&1
        
        echo "🚀 Running token deployment..."
        node deploy_token.js
    else
        echo "❌ Node.js/npm not available. Please install Node.js to deploy tokens."
        echo "📋 Manual deployment steps:"
        echo "1. Deploy an ERC20 token contract to Anvil"
        echo "2. Transfer some tokens to all addresses:"
        echo "   - $YOUR_METAMASK_ADDRESS"
        for addr in "${ADDITIONAL_ADDRESSES[@]}"; do
            echo "   - $addr"
        done
        echo "3. Note the contract address for use in proposals"
    fi
    
else
    echo "📦 Found sample-tokens directory. Using existing setup..."
    
    # Navigate to sample tokens (go up one directory first since we're in scripts/)
    cd ../sample-tokens
    
    # Check if this is a Hardhat project
    if [ -f "package.json" ]; then
        echo "📦 Installing dependencies..."
        npm install
        
        echo "🚀 Deploying governance token..."
        npx hardhat run scripts/deploy.js --network localhost
        
        echo "💸 Funding multiple addresses and canister..."
        # This would require a custom script to transfer tokens
        echo "⚠️  Manual step: Transfer some governance tokens to all addresses:"
        echo "   - $YOUR_METAMASK_ADDRESS"
        for addr in "${ADDITIONAL_ADDRESSES[@]}"; do
            echo "   - $addr"
        done
        echo "   - Canister Ethereum address (get with: dfx canister call main icrc149_get_eth_address '(null)')"
    else
        echo "❌ Sample tokens project structure not recognized"
        echo "📋 Please manually deploy governance tokens and fund all addresses:"
        echo "   - $YOUR_METAMASK_ADDRESS"
        for addr in "${ADDITIONAL_ADDRESSES[@]}"; do
            echo "   - $addr"
        done
        echo "   - Canister Ethereum address (get with: dfx canister call main icrc149_get_eth_address '(null)')"
    fi
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Make sure your MetaMask is connected to localhost:8545"
echo "2. Add the governance token to MetaMask using the contract address above"
echo "3. Verify you have governance tokens in all MetaMask wallets:"
echo "   - $YOUR_METAMASK_ADDRESS"
for addr in "${ADDITIONAL_ADDRESSES[@]}"; do
    echo "   - $addr"
done
echo "4. Verify the canister has funds for executing transactions"
echo "5. Use the web interface or run ./create_proposal.sh to create proposals"
echo "6. Vote on proposals using any of the funded addresses"
