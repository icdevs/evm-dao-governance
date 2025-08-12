<script>
    import { onMount } from "svelte";
    import { authStore } from "../stores/auth.js";
    import {
        connectWallet,
        disconnectWallet,
        getCurrentAddress,
        getCurrentChainId,
        switchNetwork,
    } from "../ethereum.js";
    import { getNetworkInfo } from "../utils.js";

    export let showNetworkInfo = true;

    let currentChainId = null;
    let networkInfo = null;

    onMount(async () => {
        // Check if already connected
        if (window.ethereum && window.ethereum.selectedAddress) {
            try {
                const address = await getCurrentAddress();
                const chainId = await getCurrentChainId();
                if (address) {
                    authStore.update((state) => ({
                        ...state,
                        isAuthenticated: true,
                        walletAddress: address,
                    }));
                    currentChainId = chainId;
                    networkInfo = getNetworkInfo(chainId);
                }
            } catch (error) {
                console.error("Failed to get wallet info:", error);
            }
        }

        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on("accountsChanged", handleAccountsChanged);
            window.ethereum.on("chainChanged", handleChainChanged);
        }

        return () => {
            if (window.ethereum) {
                window.ethereum.removeListener(
                    "accountsChanged",
                    handleAccountsChanged
                );
                window.ethereum.removeListener(
                    "chainChanged",
                    handleChainChanged
                );
            }
        };
    });

    async function handleConnect() {
        try {
            const address = await connectWallet();
            currentChainId = await getCurrentChainId();
            networkInfo = getNetworkInfo(currentChainId);
        } catch (error) {
            console.error("Connection failed:", error);
        }
    }

    function handleDisconnect() {
        disconnectWallet();
        currentChainId = null;
        networkInfo = null;
    }

    function handleAccountsChanged(accounts) {
        if (accounts.length === 0) {
            handleDisconnect();
        } else {
            authStore.update((state) => ({
                ...state,
                walletAddress: accounts[0],
            }));
        }
    }

    async function handleChainChanged(chainId) {
        currentChainId = parseInt(chainId, 16);
        networkInfo = getNetworkInfo(currentChainId);

        // Update the store or trigger re-authentication if needed
        const address = await getCurrentAddress();
        if (address) {
            authStore.update((state) => ({
                ...state,
                walletAddress: address,
            }));
        }
    }

    async function handleSwitchNetwork(targetChainId) {
        try {
            await switchNetwork(targetChainId);
        } catch (error) {
            console.error("Failed to switch network:", error);
            alert(`Failed to switch network: ${error.message}`);
        }
    }

    function formatAddress(address) {
        if (!address) return "";
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
</script>

<div class="wallet-connector">
    {#if $authStore.isAuthenticated}
        <div class="wallet-info">
            <div class="address-display">
                <span class="address"
                    >{formatAddress($authStore.walletAddress)}</span
                >
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
            {#if $authStore.isConnecting}
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
        padding: 0.5rem 1rem;
        background: var(--color-surface, #f5f5f5);
        border-radius: 8px;
        border: 1px solid var(--color-border, #e0e0e0);
    }

    .address {
        font-family: "Courier New", monospace;
        font-size: 0.9rem;
        color: var(--color-text-primary, #333);
    }

    .disconnect-btn {
        padding: 0.25rem 0.75rem;
        background: var(--color-danger, #dc3545);
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .disconnect-btn:hover {
        background: var(--color-danger-dark, #c82333);
    }

    .network-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: var(--color-text-secondary, #666);
    }

    .network-badge {
        padding: 0.2rem 0.5rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    .network-badge.local {
        background: var(--color-info-light, #e3f2fd);
        color: var(--color-info, #1976d2);
    }

    .network-badge.mainnet {
        background: var(--color-success-light, #e8f5e8);
        color: var(--color-success, #28a745);
    }

    .network-badge.testnet {
        background: var(--color-warning-light, #fff3cd);
        color: var(--color-warning, #ffc107);
    }

    .connect-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .connect-btn {
        padding: 0.75rem 1.5rem;
        background: var(--color-primary, #007bff);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .connect-btn:hover:not(:disabled) {
        background: var(--color-primary-dark, #0056b3);
    }

    .connect-btn.connecting {
        background: var(--color-secondary, #6c757d);
        cursor: not-allowed;
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
