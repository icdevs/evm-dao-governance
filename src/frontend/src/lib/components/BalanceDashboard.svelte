<script>
    import { onMount } from "svelte";
    import { authStore } from "../stores/auth.js";
    import { configStore } from "../stores/config.js";
    import { statusStore } from "../stores/status.js";
    import { governanceStatsStore } from "../stores/governance.js";
    import { getCurrentChainId } from "../ethereum.js";
    import { backend } from "../canisters.js";
    import {
        getCanisterEthereumAddress,
        getEthBalance,
        getTokenBalance,
        getBalanceInfo,
        formatAddress,
        getNativeCurrencySymbol,
    } from "../blockchain.js";
    import { CopyButton, Spinner } from "./ui/index.js";

    let canisterAddress = "";
    let ethBalance = "0.0";
    let tokenBalance = "0.0";
    let isLoading = false;
    let isInitialLoad = true;
    let chainId = null;

    // Export the refresh function so parent can call it
    export let onRefresh = null;

    // Export loading state so parent can show it
    export { isLoading };

    // Subscribe to auth and config stores
    $: isConnected = $authStore.isAuthenticated;
    $: isConfigured = $configStore.isConfigured;
    $: canisterId = $configStore.canisterId;
    $: contractAddress = $configStore.contractAddress;

    onMount(async () => {
        if (isConnected) {
            chainId = await getCurrentChainId();
        }
    });

    async function loadBalances() {
        console.log("Loading balances...");
        isLoading = true;

        try {
            const balances = await getBalances();
            console.log("Balances loaded:", balances);
            ethBalance = balances.ethBalance || "0.0";
            tokenBalance = balances.tokenBalance || "0.0";

            // After first successful load, no longer initial load
            isInitialLoad = false;
        } catch (error) {
            console.error("Failed to load balances:", error);
            statusStore.add(
                `Failed to load balances: ${error.message}`,
                "error"
            );
        } finally {
            isLoading = false;
        }
    }

    async function getBalances() {
        if (!canisterId || !contractAddress) {
            console.log("Missing configuration for balance loading");
            return { ethBalance: "0.0", tokenBalance: "0.0" };
        }

        try {
            // Get contract configuration from backend to get the correct chain ID
            const contracts = await backend.icrc149_get_snapshot_contracts();
            console.log("Available contracts:", contracts);

            // Find the configuration for our selected contract
            const contractConfig = contracts.find(
                ([address, config]) =>
                    address === contractAddress ||
                    config.contract_address === contractAddress
            );

            if (!contractConfig) {
                console.log(
                    "Contract configuration not found for address:",
                    contractAddress
                );
                return { ethBalance: "0.0", tokenBalance: "0.0" };
            }

            const [configAddress, config] = contractConfig;
            const actualContractAddress = config.contract_address;
            const configChainId = config.chain.chain_id;

            console.log("Using contract config:", {
                address: actualContractAddress,
                chainId: configChainId,
                networkName: config.chain.network_name,
            });

            // Use the chain ID from contract config
            chainId = configChainId;

            // Get canister address
            if (!canisterAddress) {
                canisterAddress = await getCanisterEthereumAddress(canisterId);
            }

            console.log(
                "Getting balances for canister address:",
                canisterAddress,
                "on chain:",
                chainId
            );

            // Get ETH balance using the correct chain ID
            const ethBal = await getEthBalance(canisterAddress, configChainId);
            console.log("ETH balance:", ethBal);

            // Get token balance using the actual contract address from config
            const tokenBal = await getTokenBalance(
                canisterAddress,
                actualContractAddress,
                configChainId
            );
            console.log("Token balance:", tokenBal);

            return {
                ethBalance: ethBal || "0.0",
                tokenBalance: tokenBal || "0.0",
            };
        } catch (error) {
            console.error("Error getting balances:", error);
            return { ethBalance: "0.0", tokenBalance: "0.0" };
        }
    }

    function formatAddressLocal(address) {
        return formatAddress(address);
    }

    // Initialize balances when component mounts and conditions are met
    let initialized = false;

    onMount(async () => {
        if (isConnected) {
            chainId = await getCurrentChainId();
            if (isConfigured) {
                loadBalances();
            }
        }
        initialized = true;

        // Expose refresh function to parent
        if (onRefresh) {
            onRefresh(loadBalances);
        }
    });

    // Watch for auth and config changes to trigger refresh (prevent loops)
    let previousConnected = false;
    let previousConfigured = false;
    let previousCanisterId = "";

    $: {
        // Only refresh if we have meaningful state changes and component is initialized
        if (initialized && isConnected && isConfigured) {
            const connectionChanged = !previousConnected && isConnected;
            const configChanged = !previousConfigured && isConfigured;
            const canisterChanged =
                previousCanisterId !== canisterId && canisterId;

            if (connectionChanged || configChanged || canisterChanged) {
                loadBalances();
            }
        }
        previousConnected = isConnected;
        previousConfigured = isConfigured;
        previousCanisterId = canisterId || "";
    }
</script>

<div class="balance-dashboard">
    <div class="dashboard-header">
        <div class="header-left">
            <h3>💰 DAO Treasury</h3>
            {#if canisterAddress}
                <div class="inline-address">
                    <span class="address-full">
                        {canisterAddress}
                    </span>
                    <CopyButton
                        value={canisterAddress}
                        size="sm"
                        variant="ghost"
                        title="Copy address"
                    />
                </div>
            {/if}
        </div>
    </div>

    <div class="balance-grid">
        <div class="balance-card eth-balance">
            <div class="card-header">
                <h4>
                    ⚡ Native {chainId
                        ? getNativeCurrencySymbol(chainId)
                        : "ETH"}
                </h4>
                <div class="balance-value">
                    {#if isInitialLoad && isLoading}
                        -
                    {:else}
                        {ethBalance}
                    {/if}
                    {#if !isInitialLoad || !isLoading}
                        {chainId ? getNativeCurrencySymbol(chainId) : "ETH"}
                    {/if}
                </div>
            </div>
            <div class="balance-subtitle">Network gas fees & transactions</div>
        </div>

        <div class="balance-card token-balance">
            <div class="card-header">
                <h4>🪙 Governance Tokens</h4>
                <div class="balance-value">
                    {#if isInitialLoad && isLoading}
                        -
                    {:else}
                        {tokenBalance}
                    {/if}
                </div>
            </div>
            <div class="balance-subtitle">Voting power available</div>
        </div>
    </div>

    {#if !isConnected}
        <div class="status-message warning">
            <span>⚠️ Connect your wallet to view treasury balances</span>
        </div>
    {:else if !isConfigured}
        <div class="status-message warning">
            <span>⚙️ Complete configuration to view treasury balances</span>
        </div>
    {/if}
</div>

<style>
    .balance-dashboard {
        background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            var(--color-surface-secondary) 100%
        );
        border: 1px solid var(--color-border);
        border-radius: 16px;
        padding: 2rem;
        margin-bottom: 2rem;
        position: relative;
        overflow: hidden;
    }

    .balance-dashboard::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(
            90deg,
            var(--color-primary),
            var(--color-success)
        );
        opacity: 0.7;
    }

    .dashboard-header {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        margin-bottom: 2rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid var(--color-border-light);
    }

    .dashboard-header h3 {
        margin: 0;
        color: var(--color-text-primary);
        font-size: 1.5rem;
        font-weight: 700;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-success) 100%
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
    }

    .inline-address {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.75rem;
        background: rgba(0, 210, 255, 0.1);
        border: 1px solid rgba(0, 210, 255, 0.2);
        border-radius: 8px;
        transition: all 0.3s ease;
    }

    .inline-address:hover {
        background: rgba(0, 210, 255, 0.15);
        border-color: rgba(0, 210, 255, 0.3);
    }

    .inline-address .address-full {
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 0.8rem;
        color: var(--color-primary);
        font-weight: 600;
    }

    @keyframes spin-counterclockwise {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(-360deg);
        }
    }

    .balance-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
        margin-bottom: 1.5rem;
    }

    .balance-card {
        background: linear-gradient(
            135deg,
            var(--color-bg-secondary) 0%,
            var(--color-surface) 100%
        );
        border: 1px solid var(--color-border-light);
        border-radius: 12px;
        padding: 1.5rem;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }

    .balance-card::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(
            90deg,
            var(--color-primary),
            var(--color-success)
        );
        opacity: 0;
        transition: opacity 0.3s ease;
    }

    .balance-card:hover {
        border-color: var(--color-primary);
        box-shadow: 0 8px 32px rgba(0, 210, 255, 0.2);
        transform: translateY(-2px);
    }

    .balance-card:hover::before {
        opacity: 1;
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
    }

    .card-header h4 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .balance-value {
        font-size: 1.5rem;
        font-weight: 800;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-success) 100%
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        line-height: 1;
    }

    .balance-subtitle {
        font-size: 0.8rem;
        color: var(--color-text-muted);
        margin-top: 0.5rem;
        font-weight: 500;
        opacity: 0.9;
    }

    .address-short {
        display: inline;
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 1rem;
        color: var(--color-primary);
        font-weight: 600;
        filter: drop-shadow(0 0 4px currentColor);
    }

    .status-message {
        padding: 1.5rem;
        border-radius: 12px;
        text-align: center;
        font-weight: 600;
        font-size: 1rem;
    }

    .status-message.warning {
        background: var(--color-warning-light);
        color: var(--color-warning);
        border: 1px solid rgba(255, 184, 0, 0.2);
    }

    @media (max-width: 768px) {
        .balance-dashboard {
            padding: 1.5rem;
        }

        .balance-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
        }

        .dashboard-header {
            flex-direction: column;
            gap: 1.5rem;
            align-items: stretch;
        }

        .header-left {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
        }

        .inline-address {
            align-self: flex-start;
        }

        .inline-address .address-full {
            font-size: 0.75rem;
        }

        .balance-value {
            font-size: 1.25rem;
        }

        .card-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
        }
    }
</style>
