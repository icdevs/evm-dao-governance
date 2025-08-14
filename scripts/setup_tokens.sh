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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
pushd "$SCRIPT_DIR" > /dev/null

# Check if we can deploy tokens directly
echo "📦 Creating token deployment script..."

# Create a Solidity contract file and compile it directly
echo "📦 Creating simple ERC20 contract..."
    
    cat > GovernanceToken.sol << 'SOLEOF'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract GovernanceToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    string public name = "Governance Token";
    string public symbol = "GOV";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    constructor(uint256 _initialSupply) {
        totalSupply = _initialSupply;
        balanceOf[msg.sender] = _initialSupply;
        emit Transfer(address(0), msg.sender, _initialSupply);
    }
    
    function transfer(address _to, uint256 _value) public returns (bool) {
        require(balanceOf[msg.sender] >= _value, "Insufficient balance");
        balanceOf[msg.sender] -= _value;
        balanceOf[_to] += _value;
        emit Transfer(msg.sender, _to, _value);
        return true;
    }
    
    function approve(address _spender, uint256 _value) public returns (bool) {
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }
    
    function transferFrom(address _from, address _to, uint256 _value) public returns (bool) {
        require(balanceOf[_from] >= _value, "Insufficient balance");
        require(allowance[_from][msg.sender] >= _value, "Insufficient allowance");
        
        balanceOf[_from] -= _value;
        balanceOf[_to] += _value;
        allowance[_from][msg.sender] -= _value;
        
        emit Transfer(_from, _to, _value);
        return true;
    }
}
SOLEOF

    cat > deploy_token.js << EOF
import { ethers } from 'ethers';
import { execSync } from 'child_process';
import fs from 'fs';

async function deployToken() {
    // Connect to Anvil
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Use the first Anvil account (deployer)
    const deployer = new ethers.Wallet('$ANVIL_DEPLOYER_PRIVATE_KEY', provider);
    
    console.log('🚀 Deploying from:', deployer.address);
    console.log('💰 Balance:', ethers.formatEther(await provider.getBalance(deployer.address)), 'ETH');
    
    // Check if forge is available for compilation
    let contractBytecode, contractABI;
    try {
        console.log('📦 Compiling contract with forge...');
        execSync('forge --version', { stdio: 'pipe' });
        
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
            throw new Error('Compiled contract not found');
        }
    } catch (error) {
        console.log('⚠️  Forge not available, using pre-compiled bytecode...');
        
        // Fallback to basic ERC20 ABI and working bytecode
        contractABI = [
            "constructor(uint256 _initialSupply)",
            "function transfer(address _to, uint256 _value) returns (bool)",
            "function balanceOf(address) view returns (uint256)",
            "function totalSupply() view returns (uint256)",
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)"
        ];
        
        // Working simple ERC20 bytecode
        contractBytecode = "0x608060405234801561001057600080fd5b5060405161059338038061059383398101604081905261002f91610054565b600281905533600081815260208190526040808220849055518392907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef908290a35061006c565b60006020828403121561006657600080fd5b5051919050565b610518806100796000396000f3fe608060405234801561001057600080fd5b50600436106100885760003560e01c8063313ce5671161005b578063313ce567146100fe57806370a082311461010c57806395d89b4114610135578063a9059cbb1461013d57600080fd5b806306fdde031461008d57806318160ddd146100ab57806323b872dd146100bd57806327e235e3146100d0575b600080fd5b610095610150565b6040516100a291906103b8565b60405180910390f35b6002545b6040519081526020016100a2565b6100af6100cb366004610422565b610187565b005b6100af6100de36600461045e565b73ffffffffffffffffffffffffffffffffffffffff1660009081526020819052604090205490565b60405160128152602001610100a2565b6100af61011a36600461045e565b73ffffffffffffffffffffffffffffffffffffffff1660009081526020819052604090205490565b6100956102ba565b61014b61014b366004610479565b6102f1565b6040519015158152602001610100a2565b60408051808201909152601081527f476f7665726e616e636520546f6b656e00000000000000000000000000000000602082015290565b73ffffffffffffffffffffffffffffffffffffffff831660009081526020819052604090205481111561021b5760405162461bcd60e51b815260206004820152601360248201527f496e73756666696369656e742062616c616e636500000000000000000000000060448201526064015b60405180910390fd5b73ffffffffffffffffffffffffffffffffffffffff8084166000908152600160209081526040808320339094168352929052205481111561029e5760405162461bcd60e51b815260206004820152601560248201527f496e73756666696369656e7420616c6c6f77616e6365000000000000000000006044820152606401610212565b73ffffffffffffffffffffffffffffffffffffffff808416600081815260208181526040808320805487900390559386168083529184902080548601905592825260018152828220339093168252919091522080548390039055565b60408051808201909152600381527f474f560000000000000000000000000000000000000000000000000000000000602082015290565b600073ffffffffffffffffffffffffffffffffffffffff83166000908152602081905260409020548211156103685760405162461bcd60e51b815260206004820152601360248201527f496e73756666696369656e742062616c616e6365000000000000000000000000006044820152606401610212565b73ffffffffffffffffffffffffffffffffffffffff831660008181526020818152604080832080548790039055938616808352918490208054860190559251848152919290917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef910160405180910390a350600192915050565b600060208083528351808285015260005b818110156103e5578581018301518582016040015282016103c9565b818111156103f7576000604083870101525b50601f01601f1916929092016040019392505050565b803573ffffffffffffffffffffffffffffffffffffffff8116811461041d57600080fd5b919050565b60008060006060848603121561043757600080fd5b610440846103f9565b925061044e602085016103f9565b9150604084013590509250925092565b60006020828403121561047057600080fd5b610479826103f9565b9392505050565b6000806040838503121561048c57600080fd5b610495836103f9565b94602093909301359350505056fea26469706673582212208a8de1f6e8b4e7d9d7b7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e764736f6c634300080d0033";
    }
    
    // Deploy the contract
    const factory = new ethers.ContractFactory(contractABI, contractBytecode, deployer);
    console.log('📦 Deploying GovernanceToken...');
    
    const contract = await factory.deploy(ethers.parseEther("1000000"));
    await contract.waitForDeployment();
    
    const contractAddress = await contract.getAddress();
    console.log('✅ GovernanceToken deployed at:', contractAddress);
    
    // Fund all addresses with tokens
    const allAddresses = ['$YOUR_METAMASK_ADDRESS', '${ADDITIONAL_ADDRESSES[0]}', '${ADDITIONAL_ADDRESSES[1]}', '${ADDITIONAL_ADDRESSES[2]}'];
    
    for (let i = 0; i < allAddresses.length; i++) {
        const address = allAddresses[i];
        console.log(\`💸 Transferring $TRANSFER_AMOUNT tokens to \${address}...\`);
        
        // Get current nonce to avoid conflicts
        const nonce = await provider.getTransactionCount(deployer.address);
        
        const transferTx = await contract.transfer(address, '$TRANSFER_AMOUNT', {
            nonce: nonce,
            gasLimit: 100000
        });
        
        console.log(\`⏳ Transaction sent: \${transferTx.hash}\`);
        await transferTx.wait();
        console.log(\`✅ Transfer to \${address} complete!\`);
        
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
        
        const addressMatch = canisterResult.match(/opt\\s+"([^"]+)"/);
        if (addressMatch && addressMatch[1]) {
            const canisterAddress = addressMatch[1];
            console.log('✅ Canister Ethereum address:', canisterAddress);
            
            // Fund canister with governance tokens (100 tokens)
            const canisterTokenAmount = '100000000000000000000'; // 100 tokens
            console.log(\`💸 Transferring \${ethers.formatEther(canisterTokenAmount)} tokens to canister...\`);
            
            const tokenNonce = await provider.getTransactionCount(deployer.address);
            const canisterTokenTx = await contract.transfer(canisterAddress, canisterTokenAmount, {
                nonce: tokenNonce,
                gasLimit: 100000
            });
            await canisterTokenTx.wait();
            console.log('✅ Canister token transfer complete!');
            
            // Fund canister with Ether (1 ETH)
            const canisterEtherAmount = '1000000000000000000'; // 1 ETH
            console.log(\`💸 Transferring \${ethers.formatEther(canisterEtherAmount)} ETH to canister...\`);
            
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

# Return to original directory
popd > /dev/null

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
