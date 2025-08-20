<script>
    import { onMount } from "svelte";
    import { walletStore } from "../stores/wallet.js";
    import { configStore } from "../stores/config.js";
    import { statusStore } from "../stores/status.js";
    import { governanceStatsStore } from "../stores/governance.js";
    import { treasuryBalanceStore } from "../stores/balance.js";
    import { providerStore } from "../stores/provider.js";
    import { formatTokenAmount } from "../utils.js";

    // Export the refresh function so parent can call it
    export let onRefresh = null;

    // Store subscriptions
    $: walletData = $walletStore;
    $: configData = $configStore;
    $: treasuryBalanceData = $treasuryBalanceStore;

    // Derive reactive values
    $: provider = $providerStore;
    $: tokenInfo = $governanceStatsStore.tokenInfo;

    // Balance data
    $: isLoading = treasuryBalanceData?.isLoading || true;
    $: isInitialLoad = treasuryBalanceData.isInitialLoad;

    onMount(async () => {
        // Expose refresh function to parent
        if (onRefresh) {
            onRefresh(() => refreshBalances());
        }
    });

    async function refreshBalances() {
        console.log("Refreshing treasury balances...");
        try {
            await treasuryBalanceStore.load(provider, tokenInfo);
        } catch (error) {
            console.error("Failed to refresh treasury balances:", error);
            statusStore.add(
                `Failed to refresh treasury balances: ${error.message}`,
                "error"
            );
        }
    }
</script>

<div class="compact-balances">
    <div class="compact-balance-item">
        <span class="compact-label">ETH:</span>
        <span class="compact-value">
            {#if isInitialLoad && isLoading}
                -
            {:else}
                {formatTokenAmount(treasuryBalanceData.ethBalance)}
            {/if}
        </span>
    </div>
    <div class="compact-balance-item">
        <span class="compact-label">Tokens:</span>
        <span class="compact-value">
            {#if isInitialLoad && isLoading}
                -
            {:else}
                {treasuryBalanceData.tokenBalanceInfo.formatted}
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
