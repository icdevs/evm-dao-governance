<script>
    import { walletStore } from "../stores/wallet.js";
    import { getNetworkInfo, NETWORKS, formatAddress } from "../utils.js";

    export let showNetworkInfo = true;

    $: currentChainId = $walletStore.chainId;
    let networkInfo = null;
    let showWalletSelector = false;
    let showNetworkSelector = false;
    let availableWallets = [{ type: "metamask", name: "MetaMask", icon: "🦊" }];

    function handleConnect() {
        // Only MetaMask supported
        handleWalletSelected(availableWallets[0]);
    }

    async function handleWalletSelected(wallet) {
        try {
            const walletData = await walletStore.connect();
            networkInfo = getNetworkInfo(walletData.chainId);
            showWalletSelector = false;
        } catch (error) {
            console.error("Connection failed:", error);
        }
    }

    function handleDisconnect() {
        // MetaMask disconnect is not programmatic; just clear state
        walletStore.disconnect();
        networkInfo = null;
        showWalletSelector = false;
    }

    async function handleSwitchNetwork(targetChainId) {
        walletStore.switchChain(targetChainId);
        networkInfo = getNetworkInfo(targetChainId);
        showWalletSelector = false;
    }

    async function handleNetworkSelected(chainId) {
        showNetworkSelector = false;
        await handleSwitchNetwork(chainId);
    }
</script>

<div class="wallet-connector">
    {#if $walletStore.state === "connected"}
        <div class="wallet-info">
            <div class="address-display">
                <span class="address"
                    >{formatAddress($walletStore.userAddress)}</span
                >
                <button class="disconnect-btn" on:click={handleDisconnect}>
                    Disconnect
                </button>
            </div>

            {#if showNetworkInfo && networkInfo}
                <div class="network-info">
                    <div class="network-display">
                        <span class="network-name">{networkInfo.name}</span>
                        {#if currentChainId === 31337}
                            <span class="network-badge local">Local</span>
                        {:else if currentChainId === 1}
                            <span class="network-badge mainnet">Mainnet</span>
                        {:else}
                            <span class="network-badge testnet">Testnet</span>
                        {/if}
                        <button
                            class="switch-network-btn"
                            on:click={() =>
                                (showNetworkSelector = !showNetworkSelector)}
                        >
                            Switch Network
                        </button>
                    </div>

                    {#if showNetworkSelector}
                        <div class="network-selector">
                            <h4>Select Network</h4>
                            <div class="network-list">
                                {#each Object.entries(NETWORKS) as [chainId, network]}
                                    <button
                                        class="network-option"
                                        class:active={parseInt(chainId) ===
                                            currentChainId}
                                        on:click={() =>
                                            handleNetworkSelected(
                                                parseInt(chainId)
                                            )}
                                        disabled={parseInt(chainId) ===
                                            currentChainId}
                                    >
                                        <span class="network-name"
                                            >{network.name}</span
                                        >
                                        {#if parseInt(chainId) === 31337}
                                            <span class="network-badge local"
                                                >Local</span
                                            >
                                        {:else if parseInt(chainId) === 1}
                                            <span class="network-badge mainnet"
                                                >Mainnet</span
                                            >
                                        {:else}
                                            <span class="network-badge testnet"
                                                >Testnet</span
                                            >
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                            <button
                                class="back-btn"
                                on:click={() => (showNetworkSelector = false)}
                            >
                                Cancel
                            </button>
                        </div>
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
            {:else if $walletStore.state === "connecting"}
                <button class="connect-btn connecting" disabled>
                    Connecting...
                </button>
            {:else if $walletStore.state === "disconnected"}
                <button class="connect-btn" on:click={handleConnect}>
                    Connect Wallet
                </button>
            {/if}

            {#if $walletStore.error}
                <div class="error-message">
                    {$walletStore.error}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .wallet-connector {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .wallet-info {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .address-display {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            var(--color-surface-secondary) 100%
        );
        border-radius: 12px;
        border: 1px solid var(--color-border);
        flex-wrap: wrap;
        transition: all 0.3s ease;
    }

    .address-display:hover {
        border-color: var(--color-primary);
        box-shadow: 0 4px 16px rgba(0, 210, 255, 0.2);
    }

    .address {
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 0.95rem;
        color: var(--color-text-primary);
        font-weight: 500;
    }

    .disconnect-btn {
        padding: 0.375rem 1rem;
        background: linear-gradient(
            135deg,
            var(--color-danger) 0%,
            #e74c3c 100%
        );
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(255, 71, 87, 0.3);
    }

    .disconnect-btn:hover {
        background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(255, 71, 87, 0.4);
    }

    .network-info {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
        background: linear-gradient(
            135deg,
            var(--color-bg-secondary) 0%,
            var(--color-surface) 100%
        );
        border-radius: 12px;
        border: 1px solid var(--color-border-light);
        transition: all 0.3s ease;
    }

    .network-info:hover {
        border-color: var(--color-primary);
        box-shadow: 0 4px 16px rgba(0, 210, 255, 0.1);
    }

    .network-display {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .network-name {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }

    .network-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .network-badge.local {
        background: var(--color-warning-light);
        color: var(--color-warning);
        border: 1px solid rgba(255, 184, 0, 0.2);
    }

    .network-badge.mainnet {
        background: var(--color-success-light);
        color: var(--color-success);
        border: 1px solid rgba(0, 255, 136, 0.2);
    }

    .network-badge.testnet {
        background: var(--color-info-light);
        color: var(--color-info);
        border: 1px solid rgba(116, 185, 255, 0.2);
    }

    .switch-network-btn {
        padding: 0.375rem 0.75rem;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-primary-dark) 100%
        );
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: 600;
        transition: all 0.3s ease;
        margin-left: auto;
        box-shadow: 0 2px 8px rgba(0, 210, 255, 0.2);
    }

    .switch-network-btn:hover {
        background: linear-gradient(
            135deg,
            var(--color-primary-light) 0%,
            var(--color-primary) 100%
        );
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(0, 210, 255, 0.3);
    }

    .network-selector {
        padding: 1.5rem;
        border: 1px solid var(--color-border);
        border-radius: 12px;
        background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            var(--color-surface-secondary) 100%
        );
        margin-top: 0.75rem;
        backdrop-filter: blur(10px);
    }

    .network-selector h4 {
        margin: 0 0 1.5rem 0;
        color: var(--color-text-primary);
        font-size: 1rem;
        font-weight: 700;
    }

    .network-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
    }

    .network-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-size: 0.9rem;
        font-weight: 500;
    }

    .network-option:hover:not(:disabled) {
        background: var(--color-surface-hover);
        border-color: var(--color-primary);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 210, 255, 0.2);
    }

    .network-option:disabled {
        background: var(--color-success-light);
        border-color: var(--color-success);
        cursor: not-allowed;
        opacity: 0.8;
        transform: none;
    }

    .network-option.active {
        background: var(--color-success-light);
        border-color: var(--color-success);
        box-shadow: 0 4px 16px rgba(0, 255, 136, 0.2);
    }

    .connect-section {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .wallet-selector {
        padding: 1.5rem;
        border: 1px solid var(--color-border);
        border-radius: 12px;
        background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            var(--color-surface-secondary) 100%
        );
        backdrop-filter: blur(10px);
    }

    .wallet-selector h4 {
        margin: 0 0 1.5rem 0;
        color: var(--color-text-primary);
        font-weight: 700;
        font-size: 1rem;
    }

    .wallet-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
    }

    .wallet-option {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.25rem;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-size: 1rem;
        font-weight: 500;
    }

    .wallet-option:hover {
        background: var(--color-surface-hover);
        border-color: var(--color-primary);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 210, 255, 0.2);
    }

    .wallet-icon {
        font-size: 1.75rem;
        flex-shrink: 0;
        filter: drop-shadow(0 2px 4px currentColor);
    }

    .wallet-name {
        flex: 1;
        text-align: left;
        font-weight: 600;
        color: var(--color-text-primary);
    }

    .connect-btn {
        padding: 1rem 1.5rem;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-primary-dark) 100%
        );
        color: white;
        border: none;
        border-radius: 10px;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 16px rgba(0, 210, 255, 0.3);
    }

    .connect-btn:hover:not(:disabled) {
        background: linear-gradient(
            135deg,
            var(--color-primary-light) 0%,
            var(--color-primary) 100%
        );
        transform: translateY(-2px);
        box-shadow: 0 8px 32px rgba(0, 210, 255, 0.4);
    }

    .connect-btn.connecting {
        background: var(--color-border);
        cursor: not-allowed;
        transform: none;
        opacity: 0.7;
    }

    .back-btn {
        padding: 0.75rem 1.25rem;
        background: var(--color-surface-hover);
        color: var(--color-text-secondary);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 600;
        transition: all 0.3s ease;
    }

    .back-btn:hover {
        background: var(--color-border);
        color: var(--color-text-primary);
        border-color: var(--color-primary);
    }

    .error-message {
        padding: 1rem;
        background: var(--color-danger-light);
        color: var(--color-danger);
        border: 1px solid rgba(255, 71, 87, 0.2);
        border-radius: 10px;
        font-size: 0.9rem;
        font-weight: 500;
        backdrop-filter: blur(10px);
    }
</style>
