<script>
    import { onMount } from "svelte";
    import { walletStore } from "../stores/wallet.js";
    import { configStore } from "../stores/config.js";
    import { statusStore } from "../stores/status.js";
    import { balanceStore } from "../stores/balance.js";
    import { getTokenBalanceInfo } from "../utils.js";

    // Export the refresh function so parent can call it
    export let onRefresh = null;

    // Store subscriptions
    $: walletData = $walletStore;
    $: configData = $configStore;
    $: balanceData = $balanceStore;

    // Derive reactive values
    $: isConnected = walletData.state === "connected";
    $: isConfigured = configData.isConfigured;
    $: canisterId = configData.canisterId;
    $: contractAddress = configData.contractAddress;
    $: walletAddress = walletData.userAddress;
    $: provider = walletData.provider;

    // Balance data
    $: ethBalance = balanceData.ethBalance;
    $: tokenBalance = balanceData.tokenBalance;
    $: isLoading = balanceData?.isLoading || true;
    $: isInitialLoad = balanceData.isInitialLoad;

    let initialized = false;
    let previousConnected = false;
    let previousConfigured = false;
    let previousCanisterId = "";

    onMount(async () => {
        if (isConnected && isConfigured) {
            // Check if we should load balances
            if (shouldLoadBalances(balanceData)) {
                await refreshBalances();
            }
        }

        initialized = true;

        // Expose refresh function to parent
        if (onRefresh) {
            onRefresh(() => refreshBalances());
        }
    });

    // Helper function to check if we should load balances
    function shouldLoadBalances(currentBalanceData) {
        if (!currentBalanceData.lastUpdated) return true;
        if (
            currentBalanceData.ethBalance === "0.0" &&
            currentBalanceData.tokenBalance === "0.0"
        )
            return true;

        const age = Date.now() - currentBalanceData.lastUpdated.getTime();
        return age > 60000; // 1 minute
    }

    async function refreshBalances() {
        console.log("Refreshing balances...");
        try {
            await balanceStore.load(getBalancesWithChainId, false);
        } catch (error) {
            console.error("Failed to refresh balances:", error);
            statusStore.add(
                `Failed to refresh balances: ${error.message}`,
                "error"
            );
        }
    }

    async function getBalancesWithChainId() {
        const balances = await getBalances();
        return {
            ...balances,
            canisterAddress: balances.canisterAddress,
        };
    }

    async function getBalances() {
        if (!canisterId || !contractAddress || !walletAddress) {
            console.log("Missing configuration for balance loading");
            return {
                ethBalance: "0.0",
                tokenBalance: "0.0",
                canisterAddress: "",
            };
        }

        try {
            const tokenBalanceInfo = await getTokenBalanceInfo(
                provider,
                contractAddress,
                walletAddress
            );
            return {
                ethBalance: "0.0", // If you want ETH, add similar logic
                tokenBalance: tokenBalanceInfo.formatted,
                canisterAddress: contractAddress,
            };
        } catch (error) {
            console.error("Error getting balances:", error);
            return {
                ethBalance: "0.0",
                tokenBalance: "0.0",
                canisterAddress: contractAddress,
            };
        }
    }

    // Watch for auth and config changes to trigger refresh
    $: {
        if (initialized && isConnected && isConfigured) {
            const connectionChanged = !previousConnected && isConnected;
            const configChanged = !previousConfigured && isConfigured;
            const canisterChanged =
                previousCanisterId !== canisterId && canisterId;

            if (connectionChanged || configChanged || canisterChanged) {
                // Use silent loading if we already have data and it's just a reconnection
                const useSilentLoading =
                    balanceData.lastUpdated && connectionChanged;

                if (useSilentLoading) {
                    console.log("Updating balances silently...");
                    balanceStore
                        .load(getBalancesWithChainId, true)
                        .catch((error) => {
                            console.error(
                                "Silent balance update failed:",
                                error
                            );
                        });
                } else {
                    refreshBalances();
                }
            }
        }

        // Clear balance data when user disconnects
        if (previousConnected && !isConnected) {
            balanceStore.clear();
        }

        previousConnected = isConnected;
        previousConfigured = isConfigured;
        previousCanisterId = canisterId || "";
    }
</script>

<div class="compact-balances">
    <div class="compact-balance-item">
        <span class="compact-label">ETH:</span>
        <span class="compact-value">
            {#if isInitialLoad && isLoading}
                -
            {:else}
                {ethBalance}
            {/if}
        </span>
    </div>
    <div class="compact-balance-item">
        <span class="compact-label">Tokens:</span>
        <span class="compact-value">
            {#if isInitialLoad && isLoading}
                -
            {:else}
                {tokenBalance}
            {/if}
        </span>
    </div>
</div>

<style>
    .compact-balances {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        flex-wrap: wrap;
    }

    .compact-balance-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
    }

    .compact-label {
        color: var(--color-text-secondary);
        font-weight: 500;
        font-size: 0.85rem;
    }

    .compact-value {
        color: var(--color-primary);
        font-weight: 600;
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    }

    @media (max-width: 768px) {
        .compact-balances {
            gap: 1rem;
        }
    }
</style>
