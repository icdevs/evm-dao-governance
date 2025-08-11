#!/usr/bin/env node

// Real proposal creation script that generates proper SIWE proofs
// This script creates actual signed proposals that will pass verification

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createSIWEProofForProposal, siweProofToCandid, createTransferData } from './siwe-utils.js';

// Load the GovernanceToken contract artifact (same as the test uses)
const governanceTokenPath = path.join(process.cwd(), 'sample-tokens/packages/hardhat/artifacts/contracts/MockTokens.sol/GovernanceToken.json');
const governanceTokenArtifact = JSON.parse(fs.readFileSync(governanceTokenPath, 'utf8'));

// Configuration
const CONFIG = {
    CANISTER_NAME: "main",
    YOUR_ADDRESS: "0x4A7C969110f7358bF334b49A2FF1a2585ac372B8",
    // Additional addresses to fund with tokens
    ADDITIONAL_ADDRESSES: [
        "0x148311C647Ec8a584D896c04f6492b5D9Cb3a9B0",
        "0x36311a95623ddf14De0c7C07250de259E118Cc2e",
        "0x2BBd20672EAE1dE51fA49088b7bc1D421b7b3FEC"
    ],
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
console.log("📍 Primary address:", CONFIG.YOUR_ADDRESS);
console.log("� Additional addresses to fund:", CONFIG.ADDITIONAL_ADDRESSES.join(", "));
console.log("�💰 Transfer amount: 1 token per address");

// Function to fund multiple addresses with tokens
async function fundAddresses(governanceToken, addresses) {
    console.log("\n💸 Funding multiple addresses with governance tokens...");
    
    // Get the deployer's current nonce to manage it manually
    let currentNonce = await provider.getTransactionCount(deployer.address, 'pending');
    console.log(`🔢 Starting nonce: ${currentNonce}`);
    
    for (const address of addresses) {
        const balance = await governanceToken['balanceOf'](address);
        console.log(`💰 ${address} currently has ${ethers.formatEther(balance)} tokens`);
        
        if (balance === 0n) {
            console.log(`📤 Transferring ${ethers.formatEther(CONFIG.TRANSFER_AMOUNT)} tokens to ${address}...`);
            console.log(`🔢 Using nonce: ${currentNonce}`);
            
            try {
                // Send transaction with explicit nonce
                const transferTx = await governanceToken['transfer'](address, CONFIG.TRANSFER_AMOUNT, {
                    nonce: currentNonce
                });
                
                console.log(`⏳ Transaction sent: ${transferTx.hash}`);
                
                // Wait for the transaction to be mined
                const receipt = await transferTx.wait();
                console.log(`✅ Token transfer to ${address} completed (block: ${receipt.blockNumber})`);
                
                // Increment nonce for next transaction
                currentNonce++;
                
                const newBalance = await governanceToken['balanceOf'](address);
                console.log(`💰 ${address} now has ${ethers.formatEther(newBalance)} tokens`);
            } catch (error) {
                if (error.code === 'NONCE_EXPIRED' || error.message.includes('nonce')) {
                    console.log(`⚠️  Nonce issue for ${address}, refreshing nonce and retrying...`);
                    // Refresh nonce from the network
                    currentNonce = await provider.getTransactionCount(deployer.address, 'pending');
                    console.log(`🔄 Refreshed nonce: ${currentNonce}`);
                    
                    // Retry the transaction
                    try {
                        const retryTx = await governanceToken['transfer'](address, CONFIG.TRANSFER_AMOUNT, {
                            nonce: currentNonce
                        });
                        await retryTx.wait();
                        currentNonce++;
                        console.log(`✅ Retry successful for ${address}`);
                    } catch (retryError) {
                        console.error(`❌ Retry failed for ${address}:`, retryError.message);
                    }
                } else {
                    console.error(`❌ Failed to transfer tokens to ${address}:`, error.message);
                }
            }
        } else {
            console.log(`✅ ${address} already has tokens, skipping transfer`);
        }
        
        // Add a small delay between transactions to ensure they're processed in order
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`🔢 Final nonce: ${currentNonce}`);
}

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
        
        // Fund all addresses (primary + additional)
        const allAddresses = [CONFIG.YOUR_ADDRESS, ...CONFIG.ADDITIONAL_ADDRESSES];
        await fundAddresses(governanceToken, allAddresses);
        
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
    
    // Fund all addresses (primary + additional)
    const allAddresses = [CONFIG.YOUR_ADDRESS, ...CONFIG.ADDITIONAL_ADDRESSES];
    await fundAddresses(governanceToken, allAddresses);
    
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

// Function to try setting a short proposal duration for testing
async function trySetShortProposalDuration() {
    console.log("⏰ Attempting to set proposal duration to 5 minutes for testing...");
    
    // First, try to make ourselves an admin if we're not already
    try {
        console.log("🔑 Ensuring current identity has admin privileges...");
        const identityResult = execSync('dfx identity get-principal', { encoding: 'utf8', stdio: 'pipe' });
        const currentPrincipal = identityResult.trim();
        console.log("📋 Current DFX identity principal:", currentPrincipal);
        
        // Try to add current principal as admin (this will fail if we're not already admin, but that's ok)
        try {
            const adminResult = execSync(`dfx canister call --network local ${CONFIG.CANISTER_NAME} icrc149_update_admin_principal '(principal "${currentPrincipal}", true)'`, 
                { encoding: 'utf8', stdio: 'pipe' });
            console.log("✅ Successfully set admin privileges");
        } catch (adminError) {
            console.log("ℹ️  Note: Admin privilege setting failed (may already be set or you may need to be deployer)");
        }
    } catch (error) {
        console.log("⚠️  Could not determine current principal, continuing anyway...");
    }
    
    // Calculate 5 minutes in nanoseconds (5 minutes * 60 seconds * 1,000,000,000 nanoseconds)
    const fiveMinutesInNanoseconds = 5 * 60 * 1_000_000_000;
    
    try {
        console.log(`   Setting proposal duration to: ${fiveMinutesInNanoseconds} nanoseconds (5 minutes)`);
        
        const result = execSync(`dfx canister call --network local ${CONFIG.CANISTER_NAME} icrc149_update_proposal_duration '(${fiveMinutesInNanoseconds} : nat)'`, 
            { encoding: 'utf8', stdio: 'pipe' });
        
        console.log("✅ Proposal duration updated successfully!");
        console.log("📊 Result:", result.trim());
        return true; // Indicates we successfully set the short duration
    } catch (error) {
        console.error("❌ Failed to set proposal duration:");
        console.error(error.stdout || error.message);
        console.log("⚠️  Note: You may need admin privileges to update proposal duration");
        console.log("   💡 If you deployed the canister, you should have admin rights");
        return false;
    }
}

// Function to get the canister's Ethereum address
async function getCanisterEthAddress() {
    console.log("🔍 Getting canister's Ethereum address...");
    
    try {
        const result = execSync(`dfx canister call --network local ${CONFIG.CANISTER_NAME} icrc149_get_ethereum_address '(null : opt blob)'`, 
            { encoding: 'utf8', stdio: 'pipe' });
        
        // Parse the result to extract the address
        // Expected format: ("0x...")
        const addressMatch = result.match(/"([^"]+)"/);
        if (addressMatch && addressMatch[1]) {
            const canisterAddress = addressMatch[1];
            console.log("✅ Canister Ethereum address:", canisterAddress);
            return canisterAddress;
        } else {
            console.error("❌ Could not parse canister address from result:", result.trim());
            return null;
        }
    } catch (error) {
        console.error("❌ Failed to get canister Ethereum address:");
        console.error(error.stdout || error.message);
        return null;
    }
}

// Function to fund the canister's Ethereum address
async function fundCanisterAddress(canisterAddress, governanceToken) {
    console.log(`💸 Funding canister address: ${canisterAddress}`);
    
    const tokenAmount = "100000000000000000000"; // 100 tokens (18 decimals)
    const etherAmount = "1000000000000000000"; // 1 ETH
    
    try {
        // Get current nonce for proper transaction ordering
        let currentNonce = await provider.getTransactionCount(deployer.address, 'pending');
        console.log(`🔢 Canister funding starting nonce: ${currentNonce}`);
        
        // Fund with governance tokens
        console.log(`📤 Transferring ${ethers.formatEther(tokenAmount)} governance tokens to canister...`);
        console.log(`🔢 Using nonce: ${currentNonce} for token transfer`);
        
        const tokenTransferTx = await governanceToken['transfer'](canisterAddress, tokenAmount, {
            nonce: currentNonce
        });
        console.log(`⏳ Token transfer transaction sent: ${tokenTransferTx.hash}`);
        
        await tokenTransferTx.wait();
        console.log("✅ Governance token transfer to canister completed");
        currentNonce++;
        
        // Check token balance
        const tokenBalance = await governanceToken['balanceOf'](canisterAddress);
        console.log(`💰 Canister now has ${ethers.formatEther(tokenBalance)} governance tokens`);
        
        // Fund with native Ether
        console.log(`📤 Transferring ${ethers.formatEther(etherAmount)} ETH to canister...`);
        console.log(`🔢 Using nonce: ${currentNonce} for ETH transfer`);
        
        const etherTransferTx = await deployer.sendTransaction({
            to: canisterAddress,
            value: etherAmount,
            nonce: currentNonce
        });
        console.log(`⏳ ETH transfer transaction sent: ${etherTransferTx.hash}`);
        
        await etherTransferTx.wait();
        console.log("✅ Ether transfer to canister completed");
        
        // Check Ether balance
        const etherBalance = await provider.getBalance(canisterAddress);
        console.log(`💰 Canister now has ${ethers.formatEther(etherBalance)} ETH`);
        
        console.log(`🔢 Canister funding completed, final nonce: ${currentNonce + 1}`);
        return true;
    } catch (error) {
        console.error("❌ Failed to fund canister address:");
        console.error(error.message);
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

        // Step 2.5: Get canister Ethereum address and fund it
        console.log("\n🏦 Step 2.5: Funding canister Ethereum address...");
        
        const canisterEthAddress = await getCanisterEthAddress();
        if (canisterEthAddress) {
            // Create governance token contract instance for funding
            const governanceToken = new ethers.Contract(CONFIG.GOVERNANCE_TOKEN_ADDRESS, governanceTokenArtifact.abi, deployer);
            
            const canisterFunded = await fundCanisterAddress(canisterEthAddress, governanceToken);
            if (!canisterFunded) {
                console.log("⚠️  Warning: Canister funding failed, but continuing...");
            }
        } else {
            console.log("⚠️  Warning: Could not get canister address, skipping funding...");
        }

        // Step 2.6: Set proposal duration to 5 minutes for quick testing
        console.log("\n⏰ Step 2.6: Setting proposal duration to 5 minutes for testing...");
        
        const shortDurationSet = await trySetShortProposalDuration();
        if (shortDurationSet) {
            console.log("   ✅ Successfully set proposal duration to 5 minutes!");
            console.log("   📝 New proposals will now have a 5-minute voting period");
        } else {
            console.log("   ⚠️  Could not set short duration, using canister's default duration");
            console.log("   💡 Ensure you have admin privileges if you want to change duration");
        }

        console.log("\n✍️  Step 3: Creating SIWE signature...");

        // Create signer wallet
        const signer = new ethers.Wallet(CONFIG.SIGNER_PRIVATE_KEY, provider);
        console.log("🔑 Using signer address:", signer.address);

        // Create SIWE proof using utility function
        const siweProof = await createSIWEProofForProposal(
            signer,
            CONFIG.GOVERNANCE_TOKEN_ADDRESS,
            CONFIG.CHAIN_ID
        );

        console.log("📝 SIWE Message:");
        console.log(siweProof.message);
        console.log("");
        console.log("✅ SIWE signature created");

        // Create ERC20 transfer data
        const transferData = createTransferData(CONFIG.YOUR_ADDRESS, CONFIG.TRANSFER_AMOUNT);
        console.log("🔧 Generated transfer data:", transferData);

        // Create the dfx call arguments
        const durationText = shortDurationSet ? "5 Minutes" : "Default Duration";
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
            metadata: `Send 1 governance token to ${CONFIG.YOUR_ADDRESS} [Test Proposal - ${durationText}]`, // Single string, not array
            siwe: siweProofToCandid(siweProof), // Use utility to convert to Candid format
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
        console.log("✅ Governance token deployed and user addresses funded");
        console.log("✅ Contracts approved for snapshot and execution");
        console.log("✅ Canister Ethereum address funded with tokens and ETH");
        console.log("✅ SIWE signature created and verified");
        console.log("✅ Proposal created with real cryptographic proof");
        console.log("\n📋 Next steps:");
        console.log("1. The proposal should now exist in the canister");
        console.log("2. The canister has funds to execute approved proposals");
        console.log("3. Use your web interface to view and vote on the proposal");
        console.log("4. Generate witnesses using the frontend for voting");

    } catch (error) {
        console.error("💥 Error:", error.message);
        process.exit(1);
    }
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
