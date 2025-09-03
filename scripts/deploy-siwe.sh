#!/bin/bash

# Deploy ic_siwe_provider canister with configuration
# This script should be run from the project root directory

set -e

# --- Start of merged content from deploy-siwe-helper.sh ---

# Default configurations for different networks
deploy_local() {
    echo "🏠 Deploying to local network..."
    PORT=$(dfx info webserver-port)
    
    # Call the main deployment logic with local-specific parameters
    deploy \
        --domain "127.0.0.1" \
        --port "$PORT" \
        --salt "local-dev-salt-123" \
        --chain-id 31337 \
        --scheme "http" \
        --statement "Login to the EVM DAO Governance app (Local)" \
        --sign-in-ttl 300000000000 \
        --session-ttl 604800000000000
}

deploy_mainnet() {
    echo "🌍 Deploying to IC mainnet..."
    if [[ -z "$MAINNET_DOMAIN" ]]; then
        echo "❌ Please set MAINNET_DOMAIN environment variable"
        exit 1
    fi
    
    if [[ -z "$MAINNET_SALT" ]]; then
        echo "❌ Please set MAINNET_SALT environment variable for production"
        exit 1
    fi
    
    # Call the main deployment logic with mainnet-specific parameters
    deploy \
        --network ic \
        --domain "$MAINNET_DOMAIN" \
        --salt "$MAINNET_SALT" \
        --chain-id 1 \
        --scheme "https" \
        --statement "Login to the EVM DAO Governance app" \
        --sign-in-ttl 300000000000 \
        --session-ttl 604800000000000
}

# --- End of merged content ---

# Main deployment function
deploy() {
    # Initialize variables
    NETWORK=""
    DOMAIN=""
    PORT=""
    SALT=""
    CHAIN_ID=""
    SCHEME=""
    STATEMENT=""
    SIGN_IN_EXPIRES_IN=""
    SESSION_EXPIRES_IN=""

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --network)
                NETWORK="$2"
                shift 2
                ;;
            --domain)
                DOMAIN="$2"
                shift 2
                ;;
            --port)
                PORT="$2"
                shift 2
                ;;
            --salt)
                SALT="$2"
                shift 2
                ;;
            --chain-id)
                CHAIN_ID="$2"
                shift 2
                ;;
            --scheme)
                SCHEME="$2"
                shift 2
                ;;
            --statement)
                STATEMENT="$2"
                shift 2
                ;;
            --sign-in-ttl)
                SIGN_IN_EXPIRES_IN="$2"
                shift 2
                ;;
            --session-ttl)
                SESSION_EXPIRES_IN="$2"
                shift 2
                ;;
            *)
                echo "❌ Internal error: Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Check for required parameters
    MISSING_PARAMS=()
    [[ -z "$DOMAIN" ]] && MISSING_PARAMS+=("--domain")
    if [[ "$NETWORK" == "local" && -z "$PORT" ]]; then
        MISSING_PARAMS+=("--port")
    fi
    [[ -z "$SALT" ]] && MISSING_PARAMS+=("--salt")
    [[ -z "$CHAIN_ID" ]] && MISSING_PARAMS+=("--chain-id")
    [[ -z "$SCHEME" ]] && MISSING_PARAMS+=("--scheme")
    [[ -z "$STATEMENT" ]] && MISSING_PARAMS+=("--statement")
    [[ -z "$SIGN_IN_EXPIRES_IN" ]] && MISSING_PARAMS+=("--sign-in-ttl")
    [[ -z "$SESSION_EXPIRES_IN" ]] && MISSING_PARAMS+=("--session-ttl")

    if [[ ${#MISSING_PARAMS[@]} -gt 0 ]]; then
        echo "❌ Missing required parameters: ${MISSING_PARAMS[*]}"
        echo ""
        usage
        exit 1
    fi

    # Set network to 'local' if not provided
    if [[ -z "$NETWORK" ]]; then
        NETWORK="local"
    fi

    # Construct URI from domain and port if a port is provided
    if [[ -n "$PORT" ]]; then
        URI="$SCHEME://$DOMAIN:$PORT"
    else
        URI="$SCHEME://$DOMAIN"
    fi

    echo "🚀 Deploying ic_siwe_provider canister to network: $NETWORK"
    echo ""
    echo "Configuration:"
    echo "  Network: $NETWORK"
    echo "  Domain: $DOMAIN"
    echo "  URI: $URI"
    echo "  Chain ID: $CHAIN_ID"
    echo "  Scheme: $SCHEME"
    echo "  Statement: $STATEMENT"
    echo "  Sign-in TTL: $SIGN_IN_EXPIRES_IN nanoseconds"
    echo "  Session TTL: $SESSION_EXPIRES_IN nanoseconds"
    echo ""

    # Prepare dfx arguments
    DFX_ARGS=()
    if [[ "$NETWORK" != "local" ]]; then
        DFX_ARGS+=(--network "$NETWORK")
    fi

    # Validate network connectivity
    echo "🔍 Checking network connectivity..."
    if ! dfx ping "${DFX_ARGS[@]}" >/dev/null 2>&1; then
        echo "❌ Cannot connect to network '$NETWORK'. Please check:"
        echo "   - Network name is correct"
        echo "   - dfx is running (for local network)"
        echo "   - Internet connection (for remote networks)"
        exit 1
    fi
    echo "✅ Network '$NETWORK' is accessible"

    # Check for required canister IDs
    echo "📋 Checking required canister deployments..."

    # Check if backend canister exists
    if ! BACKEND_CANISTER_ID=$(dfx canister id backend "${DFX_ARGS[@]}" 2>/dev/null); then
        echo "❌ Backend canister is not deployed on network '$NETWORK'"
        echo "   Please deploy the backend canister first with:"
        if [[ "$NETWORK" == "local" ]]; then
            echo "   dfx deploy backend"
        else
            echo "   dfx deploy backend --network $NETWORK"
        fi
        exit 1
    fi
    echo "✅ Backend canister found: $BACKEND_CANISTER_ID"

    # Check if ic_siwe_provider canister exists (it's okay if it doesn't, we'll create it)
    SIWE_CANISTER_ID=""
    if SIWE_CANISTER_ID=$(dfx canister id ic_siwe_provider "${DFX_ARGS[@]}" 2>/dev/null); then
        echo "✅ ic_siwe_provider canister found: $SIWE_CANISTER_ID (will be upgraded)"
    else
        echo "ℹ️  ic_siwe_provider canister not found (will be created)"
    fi

    echo ""

    # Build the deployment argument (no optional fields)
    # Note: If SIWE canister doesn't exist yet, we'll only include backend in targets
    TARGETS_LIST="\"$BACKEND_CANISTER_ID\""
    if [[ -n "$SIWE_CANISTER_ID" ]]; then
        TARGETS_LIST="\"$SIWE_CANISTER_ID\"; $TARGETS_LIST"
    fi

    DEPLOY_ARG="record {
        domain = \"$DOMAIN\";
        uri = \"$URI\";
        salt = \"$SALT\";
        chain_id = $CHAIN_ID;
        scheme = \"$SCHEME\";
        statement = \"$STATEMENT\";
        sign_in_expires_in = $SIGN_IN_EXPIRES_IN;
        session_expires_in = $SESSION_EXPIRES_IN;
        targets = vec { $TARGETS_LIST };
    }"

    echo "🔧 Deploying with argument:"
    echo "$DEPLOY_ARG"
    echo ""

    # Deploy the canister with the specified network
    dfx deploy ic_siwe_provider "${DFX_ARGS[@]}" --argument "$DEPLOY_ARG"

    # Get the deployed canister ID
    DEPLOYED_CANISTER_ID=$(dfx canister id ic_siwe_provider "${DFX_ARGS[@]}")

    # If this was a fresh deployment and we didn't have the SIWE canister ID before,
    # we should upgrade with the correct targets including itself
    if [[ -z "$SIWE_CANISTER_ID" ]]; then
        echo "🔄 Updating canister with its own ID in targets..."
        
        UPDATED_DEPLOY_ARG="record {
            domain = \"$DOMAIN\";
            uri = \"$URI\";
            salt = \"$SALT\";
            chain_id = $CHAIN_ID;
            scheme = \"$SCHEME\";
            statement = \"$STATEMENT\";
            sign_in_expires_in = $SIGN_IN_EXPIRES_IN;
            session_expires_in = $SESSION_EXPIRES_IN;
            targets = vec { \"$DEPLOYED_CANISTER_ID\"; \"$BACKEND_CANISTER_ID\" };
        }"
        
        dfx canister install ic_siwe_provider "${DFX_ARGS[@]}" --mode upgrade --argument "$UPDATED_DEPLOY_ARG"
    fi

    echo ""
    echo "✅ ic_siwe_provider canister deployed successfully!"
    echo "   Network: $NETWORK"
    echo "   Canister ID: $DEPLOYED_CANISTER_ID"

    if [[ "$NETWORK" == "ic" ]]; then
        echo "   Dashboard: https://dashboard.internetcomputer.org/canister/$DEPLOYED_CANISTER_ID"
    fi

    echo ""
    echo "🔗 Next steps:"
    echo "   1. The canister ID will be automatically available in your frontend via VITE_CANISTER_IC_SIWE_PROVIDER"
    echo "   2. Make sure your frontend is served from: $URI"
    echo "   3. Test the SIWE login flow at: $URI/siwe"
    echo ""
    echo "🎉 SIWE setup complete!"
}

# Function to display usage
usage() {
    echo "Usage: $0 [local|mainnet]"
    echo ""
    echo "This script simplifies deployment of the SIWE provider canister."
    echo ""
    echo "Commands:"
    echo "  local      - Deploys to the local dfx network."
    echo "  mainnet    - Deploys to the IC mainnet. Requires MAINNET_DOMAIN and MAINNET_SALT."
    echo ""
    echo "Environment variables for mainnet:"
    echo "  MAINNET_DOMAIN   - Domain for mainnet deployment (required)"
    echo "  MAINNET_SALT     - Salt for mainnet deployment (required)"
    echo ""
    echo "Examples:"
    echo "  $0 local"
    echo "  MAINNET_DOMAIN=myapp.com MAINNET_SALT=super-secret-salt $0 mainnet"
}

# Main logic
case "${1:-}" in
    local)
        deploy_local
        ;;
    mainnet)
        deploy_mainnet
        ;;
    *)
        usage
        exit 1
        ;;
esac
