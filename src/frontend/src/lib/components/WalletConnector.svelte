<script>
    import { onMount } from "svelte";
    import { authStore } from "../stores/auth.js";
    import {
        connectWallet,
        disconnectWallet,
        getCurrentAddress,
        getCurrentChainId,
        getCurrentWalletType,
        isWalletConnected,
        getAvailableWallets,
        switchNetwork,
    } from "../ethereum.js";
    import { getNetworkInfo } from "../utils.js";

    export let showNetworkInfo = true;

    let currentChainId = null;
    let networkInfo = null;
    let showWalletSelector = false;
    let availableWallets = [];
    let connectedWalletType = null;

    function formatAddress(address) {
        if (!address) return "";
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    onMount(async () => {
        availableWallets = getAvailableWallets();

        // Check if wallet is already connected
        try {
            const connected = await isWalletConnected();
            if (connected) {
                const address = await getCurrentAddress();
                const chainId = await getCurrentChainId();
                connectedWalletType = getCurrentWalletType();

                if (address) {
                    authStore.update((state) => ({
                        ...state,
                        isAuthenticated: true,
                        walletAddress: address,
                    }));
                    currentChainId = chainId;
                    networkInfo = getNetworkInfo(chainId);
                }
            }
        } catch (error) {
            console.error("Failed to check wallet connection:", error);
        }
    });

    function handleConnect() {
        availableWallets = getAvailableWallets();

        if (availableWallets.length === 0) {
            alert(
                "No wallets detected. Please install MetaMask or Coinbase Wallet."
            );
            return;
        }

        if (availableWallets.length === 1) {
            // If only one wallet is available, connect directly
            handleWalletSelected(availableWallets[0]);
        } else {
            // Show wallet selector if multiple wallets are available
            showWalletSelector = true;
        }
    }

    async function handleWalletSelected(wallet) {
        try {
            const address = await connectWallet(wallet.type);
            connectedWalletType = wallet.type;
            currentChainId = await getCurrentChainId();
            networkInfo = getNetworkInfo(currentChainId);
            showWalletSelector = false;
        } catch (error) {
            console.error("Connection failed:", error);
        }
    }

    function handleDisconnect() {
        disconnectWallet();
        currentChainId = null;
        networkInfo = null;
        connectedWalletType = null;
        showWalletSelector = false;
    }

    async function handleSwitchNetwork(targetChainId) {
        try {
            await switchNetwork(targetChainId);
            currentChainId = targetChainId;
            networkInfo = getNetworkInfo(targetChainId);
        } catch (error) {
            console.error("Failed to switch network:", error);
        }
    }

    function getWalletDisplayName(walletType) {
        switch (walletType) {
            case "metamask":
                return "🦊 MetaMask";
            case "coinbase":
                return "🔵 Coinbase";
            default:
                return "💼 Wallet";
        }
    }
</script>

<div class="wallet-connector">
    {#if $authStore.isAuthenticated}
        <div class="wallet-info">
            <div class="address-display">
                <span class="address"
                    >{formatAddress($authStore.walletAddress)}</span
                >
                {#if connectedWalletType}
                    <span class="wallet-type-badge">
                        {getWalletDisplayName(connectedWalletType)}
                    </span>
                {/if}
                <button class="disconnect-btn" on:click={handleDisconnect}>
                    Disconnect
                </button>
            </div>

            {#if showNetworkInfo && networkInfo}
                <div class="network-info">
                    <span class="network-name">{networkInfo.name}</span>
                    {#if currentChainId === 31337}
                        <span class="network-badge local">Local</span>
                    {:else if currentChainId === 1}
                        <span class="network-badge mainnet">Mainnet</span>
                    {:else}
                        <span class="network-badge testnet">Testnet</span>
                    {/if}
                </div>
            {/if}
        </div>
    {:else}
        <div class="connect-section">
            {#if showWalletSelector}
                <div class="wallet-selector">
                    <h4>Select Wallet</h4>
                    <div class="wallet-list">
                        {#each availableWallets as wallet}
                            <button
                                class="wallet-option"
                                on:click={() => handleWalletSelected(wallet)}
                            >
                                <span class="wallet-icon">{wallet.icon}</span>
                                <span class="wallet-name">{wallet.name}</span>
                            </button>
                        {/each}
                    </div>
                    <button
                        class="back-btn"
                        on:click={() => (showWalletSelector = false)}
                    >
                        Back
                    </button>
                </div>
            {:else if $authStore.isConnecting}
                <button class="connect-btn connecting" disabled>
                    Connecting...
                </button>
            {:else}
                <button class="connect-btn" on:click={handleConnect}>
                    Connect Wallet
                </button>
            {/if}

            {#if $authStore.error}
                <div class="error-message">
                    {$authStore.error}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .wallet-connector {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .wallet-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .address-display {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        background: var(--color-surface, #f5f5f5);
        border-radius: 8px;
        border: 1px solid var(--color-border, #e0e0e0);
        flex-wrap: wrap;
    }

    .address {
        font-family: monospace;
        font-size: 0.9rem;
        color: var(--color-text-primary, #333);
    }

    .wallet-type-badge {
        padding: 0.25rem 0.5rem;
        background: var(--color-info-light, #e3f2fd);
        color: var(--color-info, #0288d1);
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
    }

    .disconnect-btn {
        padding: 0.25rem 0.75rem;
        background: var(--color-danger, #dc3545);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        transition: background-color 0.2s;
    }

    .disconnect-btn:hover {
        background: var(--color-danger-dark, #c82333);
    }

    .network-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: var(--color-surface-secondary, #ffffff);
        border-radius: 6px;
        border: 1px solid var(--color-border-light, #f0f0f0);
    }

    .network-name {
        font-size: 0.85rem;
        color: var(--color-text-secondary, #666);
    }

    .network-badge {
        padding: 0.125rem 0.375rem;
        border-radius: 3px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .network-badge.local {
        background: var(--color-warning-light, #fff3cd);
        color: var(--color-warning, #856404);
    }

    .network-badge.mainnet {
        background: var(--color-success-light, #d4edda);
        color: var(--color-success, #155724);
    }

    .network-badge.testnet {
        background: var(--color-info-light, #cce7ff);
        color: var(--color-info, #004085);
    }

    .connect-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .wallet-selector {
        padding: 1rem;
        border: 1px solid var(--color-border, #e0e0e0);
        border-radius: 8px;
        background: var(--color-surface, #f9f9f9);
    }

    .wallet-selector h4 {
        margin: 0 0 1rem 0;
        color: var(--color-text-primary, #333);
    }

    .wallet-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }

    .wallet-option {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        background: white;
        border: 1px solid var(--color-border, #e0e0e0);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 1rem;
    }

    .wallet-option:hover {
        background: var(--color-surface-hover, #f0f0f0);
        border-color: var(--color-primary, #007bff);
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .wallet-icon {
        font-size: 1.5rem;
        flex-shrink: 0;
    }

    .wallet-name {
        flex: 1;
        text-align: left;
        font-weight: 500;
        color: var(--color-text-primary, #333);
    }

    .connect-btn {
        padding: 0.75rem 1.5rem;
        background: var(--color-primary, #007bff);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.2s;
    }

    .connect-btn:hover:not(:disabled) {
        background: var(--color-primary-dark, #0056b3);
        transform: translateY(-1px);
    }

    .connect-btn.connecting {
        background: var(--color-secondary, #6c757d);
        cursor: not-allowed;
    }

    .back-btn {
        padding: 0.5rem 1rem;
        background: var(--color-secondary, #6c757d);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: background-color 0.2s;
    }

    .back-btn:hover {
        background: var(--color-secondary-dark, #545b62);
    }

    .error-message {
        padding: 0.5rem;
        background: var(--color-danger-light, #f8d7da);
        color: var(--color-danger, #721c24);
        border: 1px solid var(--color-danger-border, #f5c6cb);
        border-radius: 4px;
        font-size: 0.85rem;
    }
</style>
