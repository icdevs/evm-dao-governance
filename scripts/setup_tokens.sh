#!/bin/bash

# Script to deploy governance token and fund your MetaMask address
# This helps set up the testing environment for DAO voting
# Usage: ./setup_tokens.sh <YOUR_METAMASK_ADDRESS_1> [YOUR_METAMASK_ADDRESS_2] ...

set -e

# Check if MetaMask address is provided as argument
if [ $# -eq 0 ]; then
    echo "❌ Error: At least one MetaMask address is required!"
    echo "Usage: $0 <YOUR_METAMASK_ADDRESS_1> [YOUR_METAMASK_ADDRESS_2] ..."
    echo "Example: $0 0x4A7C969110f7358bF334b49A2FF1a2585ac372B8 0x148311C647Ec8a584D896c04f6492b5D9Cb3a9B0"
    exit 1
fi

# Configuration
ALL_ADDRESSES=("$@")

# Validate Ethereum address format (basic check)
for addr in "${ALL_ADDRESSES[@]}"; do
    if ! [[ $addr =~ ^0x[a-fA-F0-9]{40}$ ]]; then
        echo "❌ Error: Invalid Ethereum address format!"
        echo "Address must be in format: 0x followed by 40 hexadecimal characters"
        echo "Provided: $addr"
        exit 1
    fi
done
ANVIL_DEPLOYER_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"  # First Anvil account
INITIAL_SUPPLY="1000000000000000000000000"  # 1M tokens (18 decimals)
TRANSFER_AMOUNT="100000000000000000000"     # 100 tokens to each address

echo "🏗️  Setting up governance token for multiple addresses..."
echo "📍 Addresses to fund: ${ALL_ADDRESSES[*]}"

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
import path from 'path';

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
        
        // Initialize forge project if needed
        if (!fs.existsSync('./foundry.toml')) {
            console.log('🔧 Initializing minimal forge project...');
            execSync('forge init --no-git .', { stdio: 'pipe' });
        }
        
        // Copy our contract to src directory
        if (!fs.existsSync('./src')) {
            execSync('mkdir -p src', { stdio: 'pipe' });
        }
        execSync('cp GovernanceToken.sol src/', { stdio: 'pipe' });
        
        // Compile the contract
        execSync('forge build', { stdio: 'inherit' });
        
        // Read the compiled contract
        const artifactPath = './out/GovernanceToken.sol/GovernanceToken.json';
        const absolutePath = path.resolve(artifactPath);
        console.log('Checking for file at:', absolutePath);
        if (fs.existsSync(artifactPath)) {
            const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
            contractBytecode = artifact.bytecode.object;
            contractABI = artifact.abi;
            console.log('✅ Contract compiled successfully with forge');
        } else {
            throw new Error('Compiled contract not found');
        }
    } catch (error) {
        console.log('⚠️  Forge not available, using pre-compiled bytecode...', error);
        
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
        
        // Working simple ERC20 bytecode - correctly compiled with Forge
        contractBytecode = "0x60806040526040518060400160405280601081526020017f476f7665726e616e636520546f6b656e000000000000000000000000000000008152506002908161004891906103c6565b506040518060400160405280600381526020017f474f5600000000000000000000000000000000000000000000000000000000008152506003908161008d91906103c6565b50601260045f6101000a81548160ff021916908360ff1602179055503480156100b4575f5ffd5b5060405161127e38038061127e83398181016040528101906100d691906104c3565b80600581905550805f5f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f20819055503373ffffffffffffffffffffffffffffffffffffffff165f73ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8360405161017b91906104fd565b60405180910390a350610516565b5f81519050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b7f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b5f600282049050600182168061020457607f821691505b602082108103610217576102166101c0565b5b50919050565b5f819050815f5260205f209050919050565b5f6020601f8301049050919050565b5f82821b905092915050565b5f600883026102797fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8261023e565b610283868361023e565b95508019841693508086168417925050509392505050565b5f819050919050565b5f819050919050565b5f6102c76102c26102bd8461029b565b6102a4565b61029b565b9050919050565b5f819050919050565b6102e0836102ad565b6102f46102ec826102ce565b84845461024a565b825550505050565b5f5f905090565b61030b6102fc565b6103168184846102d7565b505050565b5b818110156103395761032e5f82610303565b60018101905061031c565b5b50505050565b601f82111561037e5761034f8161021d565b6103588461022f565b81016020851015610367578190505b61037b6103738561022f565b83018261031b565b50505b505050565b5f82821c905092915050565b5f61039e5f1984600802610383565b1980831691505092915050565b5f6103b6838361038f565b9150826002028217905092915050565b6103cf82610189565b67ffffffffffffffff8111156103e8576103e7610193565b5b6103f282546101ed565b6103fd82828561033d565b5f60209050601f83116001811461042e575f841561041c578287015190505b61042685826103ab565b86555061048d565b601f19841661043c8661021d565b5f5b828110156104635784890151825560018201915060208501945060208101905061043e565b86831015610480578489015161047c601f89168261038f565b8355505b6001600288020188555050505b505050505050565b5f5ffd5b6104a28161029b565b81146104ac575f5ffd5b50565b5f815190506104bd81610499565b92915050565b5f602082840312156104d8576104d7610495565b5b5f6104e5848285016104af565b91505092915050565b6104f78161029b565b82525050565b5f6020820190506105105f8301846104ee565b92915050565b610d5b806105235f395ff3fe608060405234801561000f575f5ffd5b5060043610610091575f3560e01c8063313ce56711610064578063313ce5671461013157806370a082311461014f57806395d89b411461017f578063a9059cbb1461019d578063dd62ed3e146101cd57610091565b806306fdde0314610095578063095ea7b3146100b357806318160ddd146100e357806323b872dd14610101575b5f5ffd5b61009d6101fd565b6040516100aa919061092e565b60405180910390f35b6100cd60048036038101906100c891906109df565b610289565b6040516100da9190610a37565b60405180910390f35b6100eb610376565b6040516100f89190610a5f565b60405180910390f35b61011b60048036038101906101169190610a78565b61037c565b6040516101289190610a37565b60405180910390f35b610139610659565b6040516101469190610ae3565b60405180910390f35b61016960048036038101906101649190610afc565b61066b565b6040516101769190610a5f565b60405180910390f35b61018761067f565b604051610194919061092e565b60405180910390f35b6101b760048036038101906101b291906109df565b61070b565b6040516101c49190610a37565b60405180910390f35b6101e760048036038101906101e29190610b27565b61089e565b6040516101f49190610a5f565b60405180910390f35b6002805461020a90610b92565b80601f016020809104026020016040519081016040528092919081815260200182805461023690610b92565b80156102815780601f1061025857610100808354040283529160200191610281565b820191905f5260205f20905b81548152906001019060200180831161026457829003601f168201915b505050505081565b5f8160015f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f20819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925846040516103649190610a5f565b60405180910390a36001905092915050565b60055481565b5f815f5f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205410156103fc576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016103f390610c0c565b60405180910390fd5b8160015f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205410156104b7576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016104ae90610c74565b60405180910390fd5b815f5f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282546105029190610cbf565b92505081905550815f5f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282546105549190610cf2565b925050819055508160015f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282546105e29190610cbf565b925050819055508273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040516106469190610a5f565b60405180910390a3600190509392505050565b60045f9054906101000a900460ff1681565b5f602052805f5260405f205f915090505481565b6003805461068c90610b92565b80601f01602080910402602001604051908101604052809291908181526020018280546106b890610b92565b80156107035780601f106106da57610100808354040283529160200191610703565b820191905f5260205f20905b8154815290600101906020018083116106e657829003601f168201915b505050505081565b5f815f5f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f2054101561078b576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161078290610c0c565b60405180910390fd5b815f5f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282546107d69190610cbf565b92505081905550815f5f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282546108289190610cf2565b925050819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8460405161088c9190610a5f565b60405180910390a36001905092915050565b6001602052815f5260405f20602052805f5260405f205f91509150505481565b";
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
        const canisterResult = execSync('dfx canister call --network local backend icrc149_get_ethereum_address "(null)"', 
            { encoding: 'utf8', stdio: 'pipe' });
        
        const addressMatch = canisterResult.match(/"([^"]+)"/);
        if (addressMatch && addressMatch[1]) {
            const canisterAddress = addressMatch[1];
            console.log('✅ Canister Ethereum address:', canisterAddress);
            
            // Fund canister with governance tokens (100 tokens)
            const canisterTokenAmount = '100000000000000000000'; // 100 tokens
            console.log(\`💸 Transferring \${ethers.formatEther(canisterTokenAmount)} tokens to canister...\`);
            
            const tokenNonce = await provider.getTransactionCount(deployer.address);
            const canisterTokenTx = await contract.transfer(canisterAddress, canisterTokenAmount, {
                nonce: tokenNonce + 1, // TODO this was the only way i could avoid 'reuse' of a nonce???
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
        process.exit(1);
    }
    
    console.log('�📍 Contract Address:', contractAddress);
    console.log('💰 Each user address now has 100 GOV tokens');
    console.log('💰 Canister has 100 GOV tokens and 1 ETH for transactions');
    
    
    // Add contract to backend configuration
    console.log('🏗️  Adding contract to backend configuration...');
    try {
        const result = execSync(
            \`dfx canister call --network local backend icrc149_update_snapshot_contract_config '("\${contractAddress}", opt record { contract_address = "\${contractAddress}"; chain = record { chain_id = 31337; network_name = "anvil" }; rpc_service = record { rpc_type = "custom"; canister_id = principal "7hfb6-caaaa-aaaar-qadga-cai"; custom_config = opt vec { record { "url"; "http://127.0.0.1:8545" } } }; balance_storage_slot = 0; contract_type = variant { ERC20 }; enabled = true })'\`,
            { encoding: 'utf8', stdio: 'pipe' }
        );
        
        console.log('✅ Contract added to backend configuration!');
        console.log('💡 Contract is now available for proposal creation');
    } catch (error) {
        console.log('⚠️  Failed to add contract to backend:', error.message);
        console.log('💡 You can add it manually via the frontend configuration panel');
        process.exit(1);
    }
    
    return contractAddress;
}

// Run the deployment
deployToken().catch(err => {
    console.error(err);
    process.exit(1);
});
EOF

    # Install ethers if needed (assuming Node.js is available)
    if command -v npm &> /dev/null; then
        echo "📦 Installing ethers.js for deployment..."
        npm init -y > /dev/null 2>&1
        
        # Add module type to package.json for ES6 imports
        cat > package.json << 'PKGEOF'
{
  "name": "token-deployment",
  "version": "1.0.0",
  "type": "module",
  "description": "Deploy governance tokens",
  "main": "deploy_token.js",
  "dependencies": {
    "ethers": "^6.0.0"
  }
}
PKGEOF
        
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
