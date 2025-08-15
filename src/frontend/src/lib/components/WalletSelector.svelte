<script>
    import { onMount } from "svelte";
    import {
        getAvailableWallets,
        connectWallet,
        WALLET_TYPES,
    } from "../ethereum.js";
    import { authStore } from "../stores/auth.js";

    export let onWalletSelected = null; // Callback function
    export let showTitle = true;

    let availableWallets = [];
    let isConnecting = false;
    let error = null;

    onMount(() => {
        availableWallets = getAvailableWallets();
    });

    async function handleWalletSelect(wallet) {
        try {
            isConnecting = true;
            error = null;

            const address = await connectWallet(wallet.type);

            if (onWalletSelected) {
                onWalletSelected(wallet, address);
            }
        } catch (err) {
            console.error("Failed to connect to wallet:", err);
            error = err.message;
        } finally {
            isConnecting = false;
        }
    }
</script>

<div class="wallet-selector">
    {#if showTitle}
        <h3>Select Wallet</h3>
    {/if}

    {#if availableWallets.length === 0}
        <div class="no-wallets">
            <p>
                No compatible wallets found. Please install a wallet like
                MetaMask or Coinbase Wallet.
            </p>
            <div class="wallet-links">
                <a
                    href="https://metamask.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    🦊 Install MetaMask
                </a>
                <a
                    href="https://www.coinbase.com/wallet"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    🔵 Install Coinbase Wallet
                </a>
            </div>
        </div>
    {:else}
        <div class="wallet-list">
            {#each availableWallets as wallet}
                <button
                    class="wallet-option"
                    class:connecting={isConnecting}
                    disabled={isConnecting}
                    on:click={() => handleWalletSelect(wallet)}
                >
                    <span class="wallet-icon">{wallet.icon}</span>
                    <span class="wallet-name">{wallet.name}</span>
                    {#if isConnecting}
                        <span class="connecting-indicator">...</span>
                    {/if}
                </button>
            {/each}
        </div>
    {/if}

    {#if error}
        <div class="error-message">
            {error}
        </div>
    {/if}
</div>

<style>
    .wallet-selector {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        border: 1px solid var(--color-border, #e0e0e0);
        border-radius: 8px;
        background: var(--color-surface, #f9f9f9);
    }

    h3 {
        margin: 0;
        color: var(--color-text-primary, #333);
        font-size: 1.2rem;
    }

    .no-wallets {
        text-align: center;
        padding: 2rem;
    }

    .no-wallets p {
        margin-bottom: 1rem;
        color: var(--color-text-secondary, #666);
    }

    .wallet-links {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
    }

    .wallet-links a {
        display: inline-block;
        padding: 0.5rem 1rem;
        background: var(--color-primary, #007bff);
        color: white;
        text-decoration: none;
        border-radius: 4px;
        transition: background-color 0.2s;
    }

    .wallet-links a:hover {
        background: var(--color-primary-dark, #0056b3);
    }

    .wallet-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
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

    .wallet-option:hover:not(:disabled) {
        background: var(--color-surface-hover, #f0f0f0);
        border-color: var(--color-primary, #007bff);
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .wallet-option:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .wallet-option.connecting {
        background: var(--color-surface-active, #e3f2fd);
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

    .connecting-indicator {
        color: var(--color-primary, #007bff);
        font-weight: bold;
    }

    .error-message {
        padding: 0.75rem;
        background: var(--color-danger-light, #ffe6e6);
        color: var(--color-danger, #dc3545);
        border: 1px solid var(--color-danger, #dc3545);
        border-radius: 4px;
        font-size: 0.9rem;
    }
</style>
