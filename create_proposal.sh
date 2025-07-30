#!/bin/bash

# Script to create a proposal using dfx for the EvmDaoBridge canister
# This script will create a proposal for sending tokens from the DAO treasury

set -e  # Exit on any error

# Configuration
CANISTER_NAME="main"
YOUR_ADDRESS="0x4A7C969110f7358bF334b49A2FF1a2585ac372B8"
GOVERNANCE_TOKEN_ADDRESS="0x5FbDB2315678afecb367f032d93F642f64180aa3"  # This is the typical first contract deployed by Anvil
RECIPIENT_ADDRESS="$YOUR_ADDRESS"  # Send tokens to your MetaMask address
TRANSFER_AMOUNT="1000000000000000000"  # 1 token (18 decimals)

echo "🏗️  Creating proposal to transfer tokens to your MetaMask address..."
echo "📍 Your MetaMask address: $YOUR_ADDRESS"
echo "🪙 Governance token contract: $GOVERNANCE_TOKEN_ADDRESS"
echo "💰 Transfer amount: 1 token"

# Check if Anvil is running
if ! curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545 > /dev/null; then
    echo "❌ Anvil is not running! Please start Anvil first:"
    echo "   anvil --port 8545 --host 0.0.0.0 --accounts 10 --balance 10000"
    exit 1
fi

echo "✅ Anvil is running"

# Check if dfx is running locally
if ! dfx ping local > /dev/null 2>&1; then
    echo "❌ dfx local network is not running! Please start it first:"
    echo "   dfx start --clean"
    exit 1
fi

echo "✅ dfx local network is running"

# Deploy the canister if needed
echo "📦 Deploying canister (if not already deployed)..."
dfx deploy --network local

# Get current timestamp for SIWE message
CURRENT_TIME_NANOS=$(date +%s%N)
EXPIRATION_TIME_NANOS=$((CURRENT_TIME_NANOS + 600000000000))  # 10 minutes from now
CURRENT_TIME_ISO=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
EXPIRATION_TIME_ISO=$(date -u -d "@$((EXPIRATION_TIME_NANOS / 1000000000))" +"%Y-%m-%dT%H:%M:%S.%3NZ")

# Create the ERC20 transfer data
# transfer(address,uint256) function signature = 0xa9059cbb
# followed by 32-byte padded recipient address and 32-byte padded amount
TRANSFER_DATA="0xa9059cbb"
# Remove 0x prefix from recipient address and pad to 32 bytes
PADDED_RECIPIENT=$(printf "%064s" "${RECIPIENT_ADDRESS#0x}" | tr ' ' '0')
# Convert amount to hex and pad to 32 bytes
AMOUNT_HEX=$(printf "%064x" $TRANSFER_AMOUNT)
TRANSFER_DATA="${TRANSFER_DATA}${PADDED_RECIPIENT}${AMOUNT_HEX}"

echo "🔧 Generated transfer data: $TRANSFER_DATA"

# Create SIWE message for proposal creation
# Note: This is a template - in production you'd sign this with MetaMask
SIWE_MESSAGE="example.com wants you to sign in with your Ethereum account:
$YOUR_ADDRESS

Create proposal for contract $GOVERNANCE_TOKEN_ADDRESS

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: $EXPIRATION_TIME_NANOS
Issued At Nanos: $CURRENT_TIME_NANOS
Issued At: $CURRENT_TIME_ISO
Expiration Nanos: $EXPIRATION_TIME_NANOS
Expiration Time: $EXPIRATION_TIME_ISO"

echo "📝 SIWE Message created (you'll need to sign this with MetaMask in production):"
echo "$SIWE_MESSAGE"
echo ""

# Create the proposal using dfx
# Note: This uses a dummy signature - in production you'd get the real signature from MetaMask
echo "🗳️  Creating proposal via dfx..."

# Convert the data to the proper format for dfx call
cat > /tmp/create_proposal_args.txt << EOF
(
  record {
    action = variant { 
      EthTransaction = record {
        to = "$GOVERNANCE_TOKEN_ADDRESS";
        value = 0 : nat;
        data = blob "$TRANSFER_DATA";
        chain = record { 
          chain_id = 31337 : nat; 
          network_name = "anvil" 
        };
        subaccount = vec {};
        maxPriorityFeePerGas = 1000000000 : nat;
        maxFeePerGas = 2000000000 : nat;
        gasLimit = 100000 : nat;
        signature = vec {};
        nonce = vec {};
      }
    };
    metadata = vec { "Send 1 governance token to MetaMask address $YOUR_ADDRESS" };
    siwe = record {
      message = "$SIWE_MESSAGE";
      signature = blob "\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00";
    };
    snapshot_contract = vec { "$GOVERNANCE_TOKEN_ADDRESS" };
  }
)
EOF

echo "📞 Calling icrc149_create_proposal..."
dfx canister call --network local $CANISTER_NAME icrc149_create_proposal "$(cat /tmp/create_proposal_args.txt)"

# Clean up temp file
rm -f /tmp/create_proposal_args.txt

echo ""
echo "✅ Proposal creation call completed!"
echo ""
echo "📋 Next steps:"
echo "1. The call above may fail due to the dummy signature - this is expected"
echo "2. Use your frontend interface to create proposals with real MetaMask signatures"
echo "3. Your MetaMask address ($YOUR_ADDRESS) should have governance tokens to vote"
echo "4. Make sure Anvil is funded with tokens at your address for testing"
echo ""
echo "💡 To fund your MetaMask address with governance tokens, you can:"
echo "   1. Deploy governance token contract"
echo "   2. Transfer tokens to $YOUR_ADDRESS"
echo "   3. Use the web interface to create and vote on proposals"
