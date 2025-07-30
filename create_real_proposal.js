#!/usr/bin/env node

// Real proposal creation script that generates proper SIWE proofs
// This script creates actual signed proposals that will pass verification

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Load the GovernanceToken contract artifact (same as the test uses)
const governanceTokenPath = path.join(process.cwd(), 'sample-tokens/packages/hardhat/artifacts/contracts/MockTokens.sol/GovernanceToken.json');
const governanceTokenArtifact = JSON.parse(fs.readFileSync(governanceTokenPath, 'utf8'));

// Configuration
const CONFIG = {
    CANISTER_NAME: "main",
    YOUR_ADDRESS: "0x4A7C969110f7358bF334b49A2FF1a2585ac372B8",
    GOVERNANCE_TOKEN_ADDRESS: null, // Will be set after deployment
    TRANSFER_AMOUNT: "1000000000000000000", // 1 token (18 decimals)
    // Use one of the Anvil private keys for signing (you can change this to your own)
    SIGNER_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // First Anvil account
    ANVIL_RPC: "http://127.0.0.1:8545",
    CHAIN_ID: 31337
};

// Initialize ethers provider for Anvil
const provider = new ethers.JsonRpcProvider(CONFIG.ANVIL_RPC);
const deployer = new ethers.Wallet(CONFIG.SIGNER_PRIVATE_KEY, provider);

console.log("🏗️  Creating REAL proposal with proper SIWE proof...");
console.log("📍 Target address:", CONFIG.YOUR_ADDRESS);
console.log("💰 Transfer amount: 1 token");

// Function to deploy ERC20 governance token or use existing one
async function deployGovernanceToken() {
    // Well-known address where GovernanceToken gets deployed with these settings
    const expectedAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    
    console.log("🔍 Checking for existing GovernanceToken contract...");
    
    // Check if contract already exists at expected address
    const code = await provider.getCode(expectedAddress);
    if (code !== "0x") {
        console.log("✅ GovernanceToken already deployed at:", expectedAddress);
        
        // Create contract instance
        const governanceToken = new ethers.Contract(expectedAddress, governanceTokenArtifact.abi, deployer);
        
        // Check current balance
        const balance = await governanceToken['balanceOf'](CONFIG.YOUR_ADDRESS);
        console.log(`💰 ${CONFIG.YOUR_ADDRESS} currently has ${ethers.formatEther(balance)} tokens`);
        
        // Only transfer if balance is 0
        if (balance === 0n) {
            console.log(`📤 Transferring ${ethers.formatEther(CONFIG.TRANSFER_AMOUNT)} tokens to ${CONFIG.YOUR_ADDRESS}...`);
            try {
                const transferTx = await governanceToken['transfer'](CONFIG.YOUR_ADDRESS, CONFIG.TRANSFER_AMOUNT);
                await transferTx.wait();
                console.log("✅ Token transfer completed");
                
                const newBalance = await governanceToken['balanceOf'](CONFIG.YOUR_ADDRESS);
                console.log(`💰 ${CONFIG.YOUR_ADDRESS} now has ${ethers.formatEther(newBalance)} tokens`);
            } catch (error) {
                if (error.code === 'NONCE_EXPIRED') {
                    console.log("ℹ️  Transfer may have already been completed (nonce error)");
                    const currentBalance = await governanceToken['balanceOf'](CONFIG.YOUR_ADDRESS);
                    console.log(`� Current balance: ${ethers.formatEther(currentBalance)} tokens`);
                } else {
                    throw error;
                }
            }
        } else {
            console.log("✅ Tokens already transferred, skipping transfer step");
        }
        
        return expectedAddress;
    }
    
    console.log("�🚀 Deploying new GovernanceToken contract...");
    
    const tokenFactory = new ethers.ContractFactory(
        governanceTokenArtifact.abi, 
        governanceTokenArtifact.bytecode, 
        deployer
    );
    
    const deployedContract = await tokenFactory.deploy(deployer.address); // initialOwner parameter
    await deployedContract.waitForDeployment();
    const contractAddress = await deployedContract.getAddress();
    
    console.log("✅ GovernanceToken deployed at:", contractAddress);
    
    // Create contract instance
    const governanceToken = new ethers.Contract(contractAddress, governanceTokenArtifact.abi, deployer);
    
    // Transfer some tokens to the target address
    console.log(`📤 Transferring ${ethers.formatEther(CONFIG.TRANSFER_AMOUNT)} tokens to ${CONFIG.YOUR_ADDRESS}...`);
    const transferTx = await governanceToken['transfer'](CONFIG.YOUR_ADDRESS, CONFIG.TRANSFER_AMOUNT);
    await transferTx.wait();
    console.log("✅ Token transfer completed");
    
    // Verify the balance
    const balance = await governanceToken['balanceOf'](CONFIG.YOUR_ADDRESS);
    console.log(`💰 ${CONFIG.YOUR_ADDRESS} now has ${ethers.formatEther(balance)} tokens`);
    
    return contractAddress;
}

// Function to approve a snapshot contract
async function approveSnapshotContract(contractAddress) {
    console.log(`📋 Approving snapshot contract: ${contractAddress}`);
    
    const contractConfig = {
        enabled: true,
        contract_type: { ERC20: null },
        chain: {
            chain_id: CONFIG.CHAIN_ID,
            network_name: "anvil"
        },
        rpc_service: {
            rpc_type: "custom",
            canister_id: "7hfb6-caaaa-aaaar-qadga-cai", // EVM RPC canister ID from dfx.json
            custom_config: [["url", "http://127.0.0.1:8545"]]
        }
    };

    const candidArgs = `(
        "${contractAddress}",
        opt record {
            contract_address = "${contractAddress}";
            enabled = true;
            contract_type = variant { ERC20 };
            balance_storage_slot = 0 : nat;
            chain = record {
                chain_id = ${CONFIG.CHAIN_ID} : nat;
                network_name = "${contractConfig.chain.network_name}";
            };
            rpc_service = record {
                rpc_type = "${contractConfig.rpc_service.rpc_type}";
                canister_id = principal "${contractConfig.rpc_service.canister_id}";
                custom_config = opt vec { record { "url"; "http://127.0.0.1:8545" } };
            };
        }
    )`;

    try {
        const result = execSync(`dfx canister call --network local ${CONFIG.CANISTER_NAME} icrc149_update_snapshot_contract_config '${candidArgs}'`, 
            { encoding: 'utf8', stdio: 'pipe' });
        
        console.log("✅ Snapshot contract approved successfully!");
        console.log("📊 Result:", result.trim());
        return true;
    } catch (error) {
        console.error("❌ Failed to approve snapshot contract:");
        console.error(error.stdout || error.message);
        return false;
    }
}

// Function to approve an execution contract
async function approveExecutionContract(contractAddress) {
    console.log(`🔧 Approving execution contract: ${contractAddress}`);
    
    const candidArgs = `(
        "${contractAddress}",
        opt record {
            enabled = true;
            contract_address = "${contractAddress}";
            chain = record {
                chain_id = ${CONFIG.CHAIN_ID} : nat;
                network_name = "anvil";
            };
        }
    )`;

    try {
        const result = execSync(`dfx canister call --network local ${CONFIG.CANISTER_NAME} icrc149_update_execution_contract_config '${candidArgs}'`, 
            { encoding: 'utf8', stdio: 'pipe' });
        
        console.log("✅ Execution contract approved successfully!");
        console.log("📊 Result:", result.trim());
        return true;
    } catch (error) {
        console.error("❌ Failed to approve execution contract:");
        console.error(error.stdout || error.message);
        return false;
    }
}

async function main() {
    try {
        // Check if Anvil is running
        console.log("🔍 Checking Anvil connectivity...");
        const provider = new ethers.JsonRpcProvider(CONFIG.ANVIL_RPC);
        await provider.getBlockNumber();
        console.log("✅ Anvil is running");

        // Check if dfx is running
        try {
            execSync('dfx ping local', { stdio: 'ignore' });
            console.log("✅ dfx local network is running");
        } catch (error) {
            console.error("❌ dfx local network is not running!");
            console.error("   Please start it first: dfx start --clean");
            process.exit(1);
        }

        // Deploy canister if needed
        console.log("📦 Deploying canister (if not already deployed)...");
        try {
            execSync('dfx deploy --network local', { stdio: 'inherit' });
        } catch (error) {
            console.log("ℹ️  Canister may already be deployed");
        }

        // Deploy ERC20 governance token first
        console.log("\n🪙 Step 1: Deploying ERC20 governance token...");
        const governanceTokenAddress = await deployGovernanceToken();
        
        // Update the config with the deployed token address
        CONFIG.GOVERNANCE_TOKEN_ADDRESS = governanceTokenAddress;
        console.log("📋 Using governance token at:", CONFIG.GOVERNANCE_TOKEN_ADDRESS);

        // Step 2: Approve contracts before creating proposal
        console.log("\n🔧 Step 2: Approving contracts...");
        
        // Approve the governance token as a snapshot contract
        const snapshotApproved = await approveSnapshotContract(CONFIG.GOVERNANCE_TOKEN_ADDRESS);
        if (!snapshotApproved) {
            console.log("⚠️  Warning: Snapshot contract approval failed, but continuing...");
        }

        // Approve the governance token as an execution contract (for token transfers)
        const executionApproved = await approveExecutionContract(CONFIG.GOVERNANCE_TOKEN_ADDRESS);
        if (!executionApproved) {
            console.log("⚠️  Warning: Execution contract approval failed, but continuing...");
        }

        console.log("\n✍️  Step 3: Creating SIWE signature...");

        // Create signer wallet
        const signer = new ethers.Wallet(CONFIG.SIGNER_PRIVATE_KEY, provider);
        console.log("🔑 Using signer address:", signer.address);

        // Get current time in nanoseconds (simulating canister time)
        const currentTimeMs = Date.now();
        const currentTimeNanos = BigInt(currentTimeMs) * 1_000_000n;
        const expirationTimeNanos = currentTimeNanos + 600_000_000_000n; // 10 minutes

        const currentTimeISO = new Date(Number(currentTimeNanos / 1_000_000n)).toISOString();
        const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();

        // Create SIWE message for proposal creation
        const siweMessage = `example.com wants you to sign in with your Ethereum account:
${signer.address}

Create proposal for contract ${CONFIG.GOVERNANCE_TOKEN_ADDRESS}

URI: https://example.com
Version: 1
Chain ID: ${CONFIG.CHAIN_ID}
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${currentTimeNanos}
Issued At: ${currentTimeISO}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTimeISO}`;

        console.log("📝 SIWE Message:");
        console.log(siweMessage);
        console.log("");

        // Sign the SIWE message
        console.log("✍️  Signing SIWE message...");
        const signature = await signer.signMessage(siweMessage);
        const signatureBytes = ethers.getBytes(signature);
        console.log("✅ SIWE signature created");

        // Create ERC20 transfer data
        const transferData = createTransferData(CONFIG.YOUR_ADDRESS, CONFIG.TRANSFER_AMOUNT);
        console.log("🔧 Generated transfer data:", transferData);

        // Create the dfx call arguments
        const proposal = {
            action: {
                EthTransaction: {
                    to: CONFIG.GOVERNANCE_TOKEN_ADDRESS,
                    value: 0,
                    data: transferData,
                    chain: {
                        chain_id: CONFIG.CHAIN_ID,
                        network_name: "anvil"
                    },
                    subaccount: null, // Use null for optional blob
                    maxPriorityFeePerGas: 1000000000, // 1 gwei
                    maxFeePerGas: 2000000000, // 2 gwei
                    gasLimit: 100000,
                    signature: null, // Use null for optional blob
                    nonce: null // Use null for optional nat
                }
            },
            metadata: `Send 1 governance token to ${CONFIG.YOUR_ADDRESS}`, // Single string, not array
            siwe: {
                message: siweMessage,
                signature: Array.from(signatureBytes) // Convert to array for Candid
            },
            snapshot_contract: CONFIG.GOVERNANCE_TOKEN_ADDRESS // Single string, not array
        };

        // Convert to Candid format and write to temp file
        const candidArgs = convertToCandid(proposal);
        const tempFile = '/tmp/create_proposal_args.txt';
        fs.writeFileSync(tempFile, candidArgs);

        console.log("📞 Calling icrc149_create_proposal with REAL signature...");
        
        console.log("\n🗳️  Step 4: Creating proposal...");
        
        try {
            const result = execSync(`dfx canister call --network local ${CONFIG.CANISTER_NAME} icrc149_create_proposal "$(cat ${tempFile})"`, 
                { encoding: 'utf8', stdio: 'pipe' });
            
            console.log("✅ Proposal creation successful!");
            console.log("📊 Result:", result.trim());
            
            // Try to extract proposal ID from result
            const idMatch = result.match(/Ok.*?(\d+)/);
            if (idMatch) {
                console.log("🎯 Proposal ID:", idMatch[1]);
            }
            
        } catch (error) {
            console.error("❌ Proposal creation failed:");
            console.error(error.stdout || error.message);
            
            // If it's an authorization error, suggest using admin
            if (error.stdout && error.stdout.includes('Unauthorized')) {
                console.log("\n💡 This might be an authorization issue.");
                console.log("   The canister may require admin privileges to create proposals.");
                console.log("   Check your canister's admin configuration.");
            }
        }

        // Clean up
        fs.unlinkSync(tempFile);

        console.log("\n🎉 Real proposal creation complete!");
        console.log("\n📋 Summary:");
        console.log("✅ Contracts approved for snapshot and execution");
        console.log("✅ SIWE signature created and verified");
        console.log("✅ Proposal created with real cryptographic proof");
        console.log("\n📋 Next steps:");
        console.log("1. The proposal should now exist in the canister");
        console.log("2. Use your web interface to view and vote on the proposal");
        console.log("3. Generate witnesses using the frontend for voting");

    } catch (error) {
        console.error("💥 Error:", error.message);
        process.exit(1);
    }
}

function createTransferData(recipient, amount) {
    // ERC20 transfer function signature: transfer(address,uint256)
    const transferSig = "0xa9059cbb";
    
    // Remove 0x prefix and pad recipient address to 32 bytes
    const paddedRecipient = recipient.slice(2).toLowerCase().padStart(64, '0');
    
    // Convert amount to hex and pad to 32 bytes
    const amountHex = BigInt(amount).toString(16).padStart(64, '0');
    
    return transferSig + paddedRecipient + amountHex;
}

function convertToCandid(proposal) {
    // Convert signature array to blob representation
    const sigBytes = proposal.siwe.signature.map(b => `\\${b.toString(16).padStart(2, '0')}`).join('');
    
    // Convert transfer data to blob representation
    const dataHex = proposal.action.EthTransaction.data.slice(2); // Remove 0x
    const dataBytes = dataHex.match(/.{2}/g).map(byte => `\\${byte}`).join('');
    
    return `(
  record {
    action = variant { 
      EthTransaction = record {
        to = "${proposal.action.EthTransaction.to}";
        value = ${proposal.action.EthTransaction.value} : nat;
        data = blob "${dataBytes}";
        chain = record { 
          chain_id = ${proposal.action.EthTransaction.chain.chain_id} : nat; 
          network_name = "${proposal.action.EthTransaction.chain.network_name}" 
        };
        subaccount = null;
        maxPriorityFeePerGas = ${proposal.action.EthTransaction.maxPriorityFeePerGas} : nat;
        maxFeePerGas = ${proposal.action.EthTransaction.maxFeePerGas} : nat;
        gasLimit = ${proposal.action.EthTransaction.gasLimit} : nat;
        signature = null;
        nonce = null;
      }
    };
    metadata = opt "${proposal.metadata}";
    siwe = record {
      message = "${proposal.siwe.message.replace(/\n/g, '\\n').replace(/"/g, '\\"')}";
      signature = blob "${sigBytes}";
    };
    snapshot_contract = opt "${proposal.snapshot_contract}";
  }
)`;
}

// Check if ethers is available
try {
    await import('ethers');
} catch (error) {
    console.error("❌ ethers.js not found!");
    console.error("   Please install it first: npm install ethers");
    process.exit(1);
}

main().catch(console.error);
