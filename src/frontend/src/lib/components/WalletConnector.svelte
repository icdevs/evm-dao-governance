<script>
    import { walletStore } from "../stores/wallet.js";
    import { providerStore } from "../stores/provider.js";
    import { getNetworkInfo, NETWORKS, formatAddress } from "../utils.js";

    export let showNetworkInfo = true;

    $: currentChainId = $walletStore.chainId;
    $: provider = $providerStore;
    let networkInfo = null;
    let showNetworkSelector = false;
    let metamaskAvailable = false;

    function detectMetaMask() {
        if (
            typeof window !== "undefined" &&
            window.ethereum &&
            window.ethereum.isMetaMask
        ) {
            metamaskAvailable = true;
        } else {
            metamaskAvailable = false;
        }
    }

    detectMetaMask();

    async function handleConnect(provider) {
        if (metamaskAvailable) {
            try {
                const walletData = await walletStore.connect(provider);
                networkInfo = getNetworkInfo(walletData.chainId);
                // Persist connection flag
                localStorage.setItem("isWalletConnected", "true");
            } catch (error) {
                console.error("Connection failed:", error);
            }
        } else {
            alert("MetaMask not found. Please install MetaMask.");
        }
    }

    function handleDisconnect() {
        walletStore.disconnect();
        networkInfo = null;
        showNetworkSelector = false;
        // Remove persistent connection flag
        localStorage.removeItem("isWalletConnected");
    }

    async function handleSwitchNetwork(targetChainId) {
        walletStore.switchChain(targetChainId);
        networkInfo = getNetworkInfo(targetChainId);
        showNetworkSelector = false;
    }

    async function handleNetworkSelected(chainId) {
        await handleSwitchNetwork(chainId);
    }
    // Auto-connect MetaMask on page load if available, not already connected, and user previously connected
    $: if (
        metamaskAvailable &&
        $walletStore.state === "disconnected" &&
        provider &&
        localStorage.getItem("isWalletConnected") === "true"
    ) {
        handleConnect(provider);
    }
</script>

<div class="wallet-connector">
    {#if $walletStore.state === "connected"}
        <div class="wallet-info">
            <div class="address-display">
                <span class="address"
                    >{formatAddress($walletStore.userAddress)}</span
                >
                <button class="disconnect-btn" on:click={handleDisconnect}
                    >Disconnect</button
                >
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
                                >Cancel</button
                            >
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    {:else}
        <div class="connect-section">
            <button class="connect-btn" on:click={() => handleConnect(provider)}
                >Connect MetaMask</button
            >
            {#if $walletStore.error}
                <div class="error-message">
                    {$walletStore.error}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .back-btn {
        margin-top: 0.5rem;
        padding: 0.4rem 1.2rem;
        border-radius: 7px;
        border: none;
        background: #444;
        color: #f7f7f7;
        font-size: 0.95rem;
        cursor: pointer;
        transition: background 0.2s;
    }
    .back-btn:hover {
        background: #666;
    }
    .back-btn {
        margin-top: 0.5rem;
        padding: 0.4rem 1.2rem;
        border-radius: 7px;
        border: none;
        background: #eee;
        color: #333;
        font-size: 0.95rem;
        cursor: pointer;
        transition: background 0.2s;
    }
    .back-btn:hover {
        background: #e0e0e0;
    }
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
