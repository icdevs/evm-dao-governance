<script>
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { authStore } from "../stores/auth.js";
    import { configStore } from "../stores/config.js";
    import { statusStore } from "../stores/status.js";
    import { governanceStatsStore } from "../stores/governance.js";
    import { balanceStore } from "../stores/balance.js";
    import { getUserTokenBalance } from '../votingAPI.js';
    import { CopyButton, Spinner } from "./ui/index.js";

    // Export the refresh function so parent can call it
    export let onRefresh = null;
    export let compact = false;

    // Subscribe to stores
    $: isConnected = $authStore.isAuthenticated;
    $: isConfigured = $configStore.isConfigured;
    $: canisterId = $configStore.canisterId;
    $: contractAddress = $configStore.contractAddress;
    $: balanceData = $balanceStore;

    // Derive values from store
    $: ethBalance = balanceData.ethBalance;
    $: tokenBalance = balanceData.tokenBalance;
    $: canisterAddress = balanceData.canisterAddress;
    $: isLoading = balanceData.isLoading;
    $: isInitialLoad = balanceData.isInitialLoad;
    $: chainId = balanceData.chainId;

    let initialized = false;
    let previousConnected = false;
    let previousConfigured = false;
    let previousCanisterId = "";

    onMount(async () => {
        if (isConnected && isConfigured) {
            // Check if we should load balances
            if (balanceStore.shouldLoad(balanceData)) {
                console.log("Loading balances (initial)...");
                try {
                    await balanceStore.load(getBalancesWithChainId, false);
                } catch (error) {
                    console.error("Failed to load balances:", error);
                    statusStore.add(`Failed to load balances: ${error.message}`, "error");
                }
            }
        }

        initialized = true;

        // Expose refresh function to parent
        if (onRefresh) {
            onRefresh(() => refreshBalances());
        }
    });

    async function refreshBalances() {
        console.log("Refreshing balances (manual)...");
        try {
            await balanceStore.load(getBalancesWithChainId, false);
        } catch (error) {
            console.error("Failed to refresh balances:", error);
            statusStore.add(`Failed to refresh balances: ${error.message}`, "error");
        }
    }

    async function getBalancesWithChainId() {
        const currentChainId = await getCurrentChainId();
        const balances = await getBalances();
        return {
            ...balances,
            chainId: currentChainId,
            canisterAddress: balances.canisterAddress || await getCanisterEthereumAddress(canisterId)
        };
    }

    async function getBalances() {
        if (!canisterId || !contractAddress) {
            console.log("Missing configuration for balance loading");
            return { 
                ethBalance: "0.0", 
                tokenBalance: "0.0",
                canisterAddress: ""
            };
        }

        try {
            // Use votingInterface to get token balance
            const tokenBal = await getUserTokenBalance(contractAddress, $authStore.walletAddress);
            return {
                ethBalance: "0.0", // If you want ETH, add similar logic
                tokenBalance: tokenBal.toString(),
                canisterAddress: contractAddress
            };
        } catch (error) {
            console.error("Error getting balances:", error);
            return { 
                ethBalance: "0.0", 
                tokenBalance: "0.0",
                canisterAddress: ""
            };
        }
    }

    // Watch for auth and config changes to trigger refresh
    $: {
        if (initialized && isConnected && isConfigured) {
            const connectionChanged = !previousConnected && isConnected;
            const configChanged = !previousConfigured && isConfigured;
            const canisterChanged = previousCanisterId !== canisterId && canisterId;

            if (connectionChanged || configChanged || canisterChanged) {
                // Use silent loading if we already have data and it's just a reconnection
                const useSilentLoading = balanceData.lastUpdated && connectionChanged;
                
                if (useSilentLoading) {
                    console.log("Updating balances silently...");
                    balanceStore.load(getBalancesWithChainId, true).catch(error => {
                        console.error("Silent balance update failed:", error);
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

    function formatAddressLocal(address) {
        return formatAddress(address);
    }
</script>

<div class="balance-dashboard">
    {#if compact === "address-only"}
        <!-- Treasury Address Only -->
        {#if canisterAddress}
            <div class="governance-info">
                <span class="governance-label">Treasury:</span>
                <div class="inline-address">
                    <span class="address-full">
                        {canisterAddress}
                    </span>
                    <CopyButton
                        value={canisterAddress}
                        size="xs"
                        variant="ghost"
                        title="Copy treasury address"
                    />
                </div>
            </div>
        {/if}
    {:else if compact === "balances-only"}
        <!-- Balances Only -->
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
    {:else}
        <!-- Default Compact Mode (all together) -->
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
            {#if canisterAddress}
                <div class="compact-balance-item">
                    <span class="compact-label">Treasury:</span>
                    <span class="compact-address">
                        {formatAddressLocal(canisterAddress)}
                    </span>
                    <CopyButton
                        value={canisterAddress}
                        size="xs"
                        variant="ghost"
                        title="Copy treasury address"
                    />
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .balance-dashboard {
        background: none;
        border: none;
        border-radius: 0;
        padding: 0;
        margin: 0;
    }

    .governance-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--color-text-secondary);
        flex: 1;
    }

    .governance-label {
        color: var(--color-text-secondary);
        font-weight: 500;
        font-size: 0.85rem;
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

    .address-full {
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 0.8rem;
        color: var(--color-primary);
        font-weight: 600;
    }

    /* Compact Mode Styles */
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

    .compact-address {
        color: var(--color-text-primary);
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 0.8rem;
        font-weight: 500;
    }

    @media (max-width: 768px) {
        .compact-balances {
            gap: 1rem;
        }
        
        .governance-info {
            gap: 0.5rem;
            font-size: 0.8rem;
        }
        
        .address-full {
            font-size: 0.75rem;
        }
    }
</style>
