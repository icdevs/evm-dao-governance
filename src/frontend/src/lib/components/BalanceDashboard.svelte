<script>
    import { onMount } from "svelte";
    import { authStore } from "../stores/auth.js";
    import { configStore } from "../stores/config.js";
    import { statusStore } from "../stores/status.js";
    import { getCurrentChainId } from "../ethereum.js";
    import {
        getCanisterEthereumAddress,
        getEthBalance,
        getTokenBalance,
        getBalanceInfo,
        formatAddress,
        getNativeCurrencySymbol,
    } from "../blockchain.js";

    let canisterAddress = "";
    let ethBalance = "0";
    let tokenBalance = "0";
    let isLoading = false;
    let chainId = null;

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

    async function refreshBalances() {
        if (!isConnected || !isConfigured) {
            statusStore.add(
                "Please connect wallet and configure settings",
                "warning"
            );
            return;
        }

        isLoading = true;

        try {
            statusStore.add(
                "Getting canister Ethereum address...",
                "info",
                3000
            );

            // Get canister's derived Ethereum address
            canisterAddress = await getCanisterEthereumAddress(canisterId);

            statusStore.add("Checking balances...", "info", 3000);

            // Get current chain ID if not already set
            if (!chainId) {
                chainId = await getCurrentChainId();
            }

            // Get balances
            const balanceInfo = await getBalanceInfo(
                canisterAddress,
                contractAddress,
                chainId
            );
            ethBalance = balanceInfo.ethBalance;
            tokenBalance = balanceInfo.tokenBalance;

            statusStore.add("Balances refreshed successfully", "success");
        } catch (error) {
            console.error("Failed to refresh balances:", error);
            statusStore.add(
                `Failed to refresh balances: ${error.message}`,
                "error"
            );

            // Reset on error
            if (!canisterAddress) canisterAddress = "";
            ethBalance = "Error";
            tokenBalance = "Error";
        } finally {
            isLoading = false;
        }
    }

    function copyAddress() {
        if (canisterAddress) {
            navigator.clipboard
                .writeText(canisterAddress)
                .then(() => {
                    statusStore.add(
                        "Address copied to clipboard",
                        "success",
                        2000
                    );
                })
                .catch(() => {
                    statusStore.add("Failed to copy address", "error");
                });
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
                refreshBalances();
            }
        }
        initialized = true;
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
            const canisterChanged = previousCanisterId !== canisterId && canisterId;
            
            if (connectionChanged || configChanged || canisterChanged) {
                refreshBalances();
            }
        }
        previousConnected = isConnected;
        previousConfigured = isConfigured;
        previousCanisterId = canisterId || "";
    }
</script>

<div class="balance-dashboard">
    <div class="dashboard-header">
        <h3>💰 DAO Treasury</h3>
        <button
            class="refresh-btn"
            on:click={refreshBalances}
            disabled={!isConnected || !isConfigured || isLoading}
            title="Refresh balances"
        >
            <svg
                class="refresh-icon"
                class:spinning={isLoading}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M1 4V10H7"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
                <path
                    d="M23 20V14H17"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
                <path
                    d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M3.51 15A9 9 0 0 0 18.36 18.36L23 14"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
            {isLoading ? "Refreshing..." : "Refresh"}
        </button>
    </div>

    <div class="balance-grid">
        <div class="balance-card canister-address">
            <div class="card-header">
                <h4>📍 Canister Address</h4>
                <button
                    class="copy-btn"
                    on:click={copyAddress}
                    disabled={!canisterAddress}
                    title="Copy address"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"
                            stroke="currentColor"
                            stroke-width="2"
                            fill="none"
                        />
                        <path
                            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                            stroke="currentColor"
                            stroke-width="2"
                            fill="none"
                        />
                    </svg>
                </button>
            </div>
            <div class="address-display">
                {#if canisterAddress}
                    <span class="address-short"
                        >{formatAddressLocal(canisterAddress)}</span
                    >
                    <span class="address-full">{canisterAddress}</span>
                {:else}
                    <span class="placeholder"
                        >Configure canister to view address</span
                    >
                {/if}
            </div>
        </div>

        <div class="balance-card eth-balance">
            <div class="card-header">
                <h4>
                    ⚡ Native {chainId
                        ? getNativeCurrencySymbol(chainId)
                        : "ETH"}
                </h4>
                <div class="balance-value">
                    {ethBalance}
                    {chainId ? getNativeCurrencySymbol(chainId) : "ETH"}
                </div>
            </div>
            <div class="balance-subtitle">Network gas fees & transactions</div>
        </div>

        <div class="balance-card token-balance">
            <div class="card-header">
                <h4>🪙 Governance Tokens</h4>
                <div class="balance-value">
                    {tokenBalance}
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
        justify-content: space-between;
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

    .refresh-btn {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1.25rem;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-primary-dark) 100%
        );
        color: white;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 600;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 8px rgba(0, 210, 255, 0.2);
    }

    .refresh-btn:hover:not(:disabled) {
        background: linear-gradient(
            135deg,
            var(--color-primary-light) 0%,
            var(--color-primary) 100%
        );
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(0, 210, 255, 0.3);
    }

    .refresh-btn:disabled {
        background: var(--color-border);
        cursor: not-allowed;
        transform: none;
        opacity: 0.6;
    }

    .refresh-icon {
        width: 1.2rem;
        height: 1.2rem;
        transition: transform 0.3s ease;
        filter: drop-shadow(0 0 4px currentColor);
    }

    .refresh-icon.spinning {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    .balance-grid {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr;
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

    .copy-btn {
        background: var(--color-surface-hover);
        border: 1px solid var(--color-border);
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 8px;
        color: var(--color-text-secondary);
        transition: all 0.3s ease;
        width: 2.5rem;
        height: 2.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .copy-btn:hover:not(:disabled) {
        background: var(--color-primary);
        color: white;
        border-color: var(--color-primary);
        transform: scale(1.05);
    }

    .copy-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
    }

    .copy-btn svg {
        width: 1.2rem;
        height: 1.2rem;
    }

    .address-display {
        position: relative;
    }

    .address-short {
        display: inline;
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 1rem;
        color: var(--color-primary);
        font-weight: 600;
        filter: drop-shadow(0 0 4px currentColor);
    }

    .address-full {
        display: none;
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        word-break: break-all;
        line-height: 1.4;
    }

    .canister-address:hover .address-short {
        display: none;
    }

    .canister-address:hover .address-full {
        display: inline;
    }

    .placeholder {
        color: var(--color-text-muted);
        font-style: italic;
        font-size: 0.9rem;
        opacity: 0.8;
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

        .refresh-btn {
            justify-content: center;
        }

        .balance-value {
            font-size: 1.25rem;
        }

        .card-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
        }

        .address-short,
        .address-full {
            font-size: 0.8rem;
        }
    }
</style>
