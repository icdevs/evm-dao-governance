#!/bin/bash

# Function to cleanup background processes on exit
cleanup() {
    echo "Cleaning up processes..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Prompt for clean instance
read -p "Start with clean instance? (y/N): " clean_choice
DFX_COMMAND="dfx start"
if [[ "$clean_choice" =~ ^[Yy]$ ]]; then
    DFX_COMMAND="dfx start --clean"
fi

# Collect ETH addresses
echo "Enter ETH addresses (press Enter with blank value to finish):"
ETH_ADDRESSES=()
while true; do
    read -p "ETH Address: " address
    if [ -z "$address" ]; then
        break
    fi
    ETH_ADDRESSES+=("$address")
done

if [ ${#ETH_ADDRESSES[@]} -eq 0 ]; then
    echo "No ETH addresses provided. Exiting."
    exit 1
fi

echo "Starting DFX..."
$DFX_COMMAND &
DFX_PID=$!

# Wait for DFX to be ready
sleep 5

echo "Deploying dependencies and backend..."
dfx deps deploy
dfx deploy backend
./scripts/deploy-siwe.sh local

echo "Starting Anvil..."
anvil --port 8545 --host 0.0.0.0 --accounts 10 --balance 10000 &
ANVIL_PID=$!

# Wait for Anvil to be ready
sleep 3



echo "Setting up tokens for addresses: ${ETH_ADDRESSES[*]}"
for address in "${ETH_ADDRESSES[@]}"; do
    ./scripts/setup_tokens.sh "$address"
done


echo "Starting frontend..."
cd src/frontend
npm start &
NPM_PID=$!
cd ../..

echo "Environment ready! Press Ctrl+C to stop all services."
wait