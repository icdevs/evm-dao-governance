<script>
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import {
        siweActions,
        initSiwe,
        isLoggedIn,
        loginStatus,
        prepareLoginStatus,
        isLoggingIn,
        isPreparingLogin,
        identityAddress,
        loginError,
        prepareLoginError,
        signMessageError,
        cleanupSiweComponent,
        cleanupSiwe,
    } from "../siwe";
    import { walletStore } from "../stores/wallet.js";
    import { providerStore } from "../stores/provider.js";
    import { getNetworkInfo, NETWORKS, formatAddress } from "../utils.js";

    // Props
    export let httpAgentOptions = {};
    export let actorOptions = {};
    export let showNetworkInfo = true;

    // Local state
    let loading = false;
    let error = "";
    let networkInfo = null;
    let showNetworkSelector = false;
    let networkDisplayButton = null;

    // Computed values from wallet store
    $: walletData = $walletStore;
    $: provider = $providerStore;
    $: isWalletConnected = walletData.state === "connected";
    $: walletAddress = walletData.userAddress;
    $: currentChainId = walletData.chainId;
    $: walletSigner = walletData.signer;

    $: if (isWalletConnected && currentChainId) {
        networkInfo = getNetworkInfo(currentChainId);
    }

    // Track initialization and session restoration
    let isInitialized = false;
    let hasCheckedForExistingSession = false;
    let hasAttemptedAutoPrepare = false;
    let isSyncingWallet = false; // Prevent multiple wallet sync attempts

    // Helper function to check and handle session state
    async function handleSessionCheck() {
        if (!browser || !isInitialized || hasCheckedForExistingSession) {
            return;
        }

        hasCheckedForExistingSession = true;
        console.log("SIWE initialized, checking session...");

        try {
            const sessionInfo = siweActions.checkExistingSession();
            console.log("Session check result:", sessionInfo);
        } catch (error) {
            console.warn("Error checking session:", error);
        }
    }

    // Helper function to handle auto-prepare
    async function handleAutoPrepare() {
        if (
            !browser ||
            !isInitialized ||
            !hasCheckedForExistingSession ||
            hasAttemptedAutoPrepare ||
            !isWalletConnected ||
            $isLoggedIn ||
            $prepareLoginStatus !== "idle"
        ) {
            return;
        }

        console.log("Auto-preparing login for connected wallet...", {
            isWalletConnected,
            isLoggedIn: $isLoggedIn,
            prepareLoginStatus: $prepareLoginStatus,
        });

        hasAttemptedAutoPrepare = true;

        // Use setTimeout to avoid potential race conditions
        setTimeout(() => {
            // Double-check conditions before proceeding
            if (
                $prepareLoginStatus === "idle" &&
                isWalletConnected &&
                !$isLoggedIn &&
                browser
            ) {
                try {
                    console.log("Executing auto-prepare login...");
                    siweActions.prepareLogin();
                } catch (error) {
                    console.error("Auto-prepare login failed:", error);
                }
            } else {
                console.log("Skipping auto-prepare - conditions changed");
            }
        }, 500);
    }

    // Reset auto-prepare flag when user disconnects or logs in
    $: if (!isWalletConnected || $isLoggedIn) {
        if (hasAttemptedAutoPrepare) {
            console.log(
                "Resetting auto-prepare flag due to wallet/login state change"
            );
            hasAttemptedAutoPrepare = false;
        }
    }

    // Watch for wallet connection changes and trigger auto-prepare
    // Temporarily disabled to prevent loops
    // $: if (isWalletConnected && isInitialized && hasCheckedForExistingSession && !$isLoggedIn) {
    //     handleAutoPrepare();
    // }

    // Watch for SIWE login success and sync wallet once
    $: if (browser && $isLoggedIn && $identityAddress && !isSyncingWallet) {
        handleSiweWalletSync();
    }

    async function handleSiweWalletSync() {
        // Prevent multiple sync attempts
        if (isSyncingWallet) return;

        // If wallet is already connected, no need to sync
        if (isWalletConnected) return;

        // If no provider, can't sync
        if (!provider) return;

        console.log("SIWE logged in but wallet store not connected - attempting sync");
        isSyncingWallet = true;

        try {
            // Check if MetaMask is actually connected first
            const accounts = await window.ethereum?.request?.({
                method: "eth_accounts",
            });

            if (accounts?.length > 0) {
                console.log("MetaMask has connected accounts, syncing wallet store...");
                await attemptCreateWalletConnection();
            } else {
                console.log("MetaMask has no connected accounts, SIWE session may be stale");
                // SIWE session might be stale if wallet is not connected
                // Clear the SIWE session since wallet is disconnected
                siweActions.clear();
            }
        } catch (error) {
            console.warn("Could not sync wallet store after SIWE login:", error);
        } finally {
            // Reset flag after a delay to ensure wallet connection stabilizes
            setTimeout(() => {
                isSyncingWallet = false;
            }, 1000);
        }
    }

    onMount(async () => {
        console.log("SiweWalletConnector mounted, initializing...");

        // Initialize SIWE with canister ID first
        try {
            const manager = await initSiwe({ httpAgentOptions, actorOptions });
            console.log("SIWE initialized successfully", { reused: !!manager });
            isInitialized = true;

            // Check session state after initialization
            await handleSessionCheck();
        } catch (error) {
            console.error("Failed to initialize SIWE:", error);
            return;
        }

        // Wait for provider to be available, then attempt to restore wallet connection
        const waitForProvider = () => {
            return new Promise((resolve) => {
                const checkProvider = () => {
                    if (provider) {
                        resolve(provider);
                    } else {
                        setTimeout(checkProvider, 100);
                    }
                };
                checkProvider();
            });
        };

        try {
            await waitForProvider();
            console.log(
                "Provider available, attempting to restore wallet connection..."
            );

            // Attempt to restore existing wallet connection (like attemptCreateWalletClient in example)
            const wasConnected = await attemptCreateWalletConnection();

            if (wasConnected) {
                console.log("Wallet connection restored successfully");
            } else {
                console.log("No existing wallet connection found");
                // Clear the localStorage flag since wallet is not actually connected
                if (browser) {
                    localStorage.removeItem("isWalletConnected");
                }
            }
        } catch (error) {
            console.error("Failed to check wallet connection:", error);
            if (browser) {
                localStorage.removeItem("isWalletConnected");
            }
        }

        // Session checking is now handled by reactive statements above
    });

    onDestroy(() => {
        // Clean up SIWE component resources when component is destroyed
        // This only cleans up subscriptions, doesn't clear the session
        try {
            cleanupSiweComponent();
        } catch (error) {
            console.warn(
                "Error during SIWE component cleanup in component destroy:",
                error
            );
        }
    });

    // Check if MetaMask is available
    function isMetaMaskAvailable() {
        return (
            browser &&
            typeof window.ethereum !== "undefined" &&
            window.ethereum.isMetaMask
        );
    }

    // Attempt to create wallet connection without requesting permissions (like attemptCreateWalletClient in example)
    async function attemptCreateWalletConnection() {
        if (!isMetaMaskAvailable() || !provider) {
            return false;
        }

        try {
            // Check if wallet is already connected without requesting permissions
            const accounts = await window.ethereum.request({
                method: "eth_accounts",
            });

            if (accounts && accounts.length > 0) {
                console.log("Wallet already connected, syncing with store...");
                // Wallet is connected, sync with our store
                const signerInstance = await provider.getSigner();
                const network = await provider.getNetwork();

                // Update wallet store directly with existing connection
                walletStore.connect(provider);

                if (browser) {
                    localStorage.setItem("isWalletConnected", "true");
                }
                return true;
            }
        } catch (error) {
            console.warn("Could not check wallet connection:", error);
        }

        return false;
    }

    // Ensure wallet is connected - helper function used by both manual connect and SIWE operations
    async function ensureWalletConnection() {
        if (!isMetaMaskAvailable()) {
            throw new Error(
                "MetaMask not found. Please install MetaMask to continue."
            );
        }

        if (!provider) {
            throw new Error("Provider not available");
        }

        // If wallet store shows disconnected, connect it
        if (!isWalletConnected) {
            console.log("Connecting wallet via wallet store...");
            await walletStore.connect(provider);
            if (browser) {
                localStorage.setItem("isWalletConnected", "true");
            }
        }

        return true;
    }

    async function handleConnectWallet() {
        try {
            loading = true;
            error = "";
            await ensureWalletConnection();
            console.log("Wallet connected successfully");
        } catch (e) {
            error = e.message || "Failed to connect wallet";
            console.error("Wallet connection error:", e);
        } finally {
            loading = false;
        }
    }

    async function handleSiweLogin() {
        try {
            loading = true;
            error = "";

            // Ensure wallet is connected before attempting SIWE login
            await ensureWalletConnection();

            // Check if we need to prepare login
            console.log(
                "Current prepare status before login:",
                $prepareLoginStatus
            );

            if ($prepareLoginStatus !== "success") {
                console.log("Preparing login...", $prepareLoginStatus);

                // Only trigger prepareLogin if we're in idle state
                if ($prepareLoginStatus === "idle") {
                    siweActions.prepareLogin();
                }

                // Wait for preparation to complete by polling the status
                let attempts = 0;
                const maxAttempts = 40; // 20 seconds max
                let lastStatus = $prepareLoginStatus;

                while (
                    ($prepareLoginStatus === "preparing" ||
                        $prepareLoginStatus === "idle") &&
                    attempts < maxAttempts
                ) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    attempts++;

                    if ($prepareLoginStatus !== lastStatus) {
                        console.log(
                            `Preparation status changed from ${lastStatus} to ${$prepareLoginStatus}`
                        );
                        lastStatus = $prepareLoginStatus;
                    }

                    // If we're stuck in idle for too long, try again
                    if (
                        $prepareLoginStatus === "idle" &&
                        attempts > 5 &&
                        attempts % 10 === 0
                    ) {
                        console.log(
                            "Retrying prepareLogin due to idle state..."
                        );
                        siweActions.prepareLogin();
                    }
                }

                console.log("Final preparation status:", $prepareLoginStatus);

                if ($prepareLoginStatus !== "success") {
                    if ($prepareLoginError) {
                        throw new Error(
                            `Login preparation failed: ${$prepareLoginError.message || $prepareLoginError}`
                        );
                    }
                    throw new Error(
                        `Login preparation failed with status: ${$prepareLoginStatus}. Try refreshing the page and connecting your wallet again.`
                    );
                }
            }

            // Perform the actual login
            console.log("Performing SIWE login...");
            const identity = await siweActions.login();

            if (identity) {
                console.log(
                    "SIWE login successful!",
                    identity.getPrincipal().toString()
                );
            }
        } catch (e) {
            error = e.message || "Login failed";
            console.error("SIWE login error:", e);
        } finally {
            loading = false;
        }
    }

    function handleLogout() {
        try {
            siweActions.clear();
            walletStore.disconnect();
            if (browser) {
                localStorage.removeItem("isWalletConnected");
                // No need to manually manage siweSessionPersisted - SIWE library handles this
            }
            error = "";
            networkInfo = null;
            showNetworkSelector = false;
        } catch (e) {
            error = e.message || "Logout failed";
            console.error("Logout error:", e);
        }
    }

    async function handleSwitchNetwork(targetChainId) {
        if (!walletSigner || !provider) {
            error = "Wallet not connected";
            return;
        }

        try {
            error = "";
            // Use the provider's send method to switch chain
            await provider.send("wallet_switchEthereumChain", [
                { chainId: `0x${targetChainId.toString(16)}` },
            ]);
            showNetworkSelector = false;
        } catch (e) {
            console.error("Failed to switch network:", e);
            error = e.message || "Failed to switch network";
            showNetworkSelector = false;
        }
    }

    function toggleNetworkSelector(event) {
        event.preventDefault();
        event.stopPropagation();

        console.log(
            "Toggle network selector clicked, current state:",
            showNetworkSelector
        );
        showNetworkSelector = !showNetworkSelector;
        console.log("New state:", showNetworkSelector);
    }

    // Reactive statements
    $: isConnecting = loading && !isWalletConnected;
    $: canLogin = !$isLoggedIn && !$isLoggingIn && !loading;

    // Combine all possible errors for display
    $: allErrors = [
        error,
        $loginError?.message,
        $prepareLoginError?.message,
        $signMessageError?.message,
    ].filter(Boolean);
</script>

<div class="siwe-wallet-connector">
    {#if allErrors.length > 0}
        <div class="error">
            {#each allErrors as errorMsg}
                <p>{errorMsg}</p>
            {/each}
            <button
                on:click={() => {
                    error = "";
                }}>Dismiss</button
            >
        </div>
    {/if}

    {#if $isLoggedIn}
        <!-- Authenticated State - Show user info and network controls -->
        <div class="authenticated-state">
            <div class="user-info">
                <div class="address-display">
                    <span class="address-label">🔐 SIWE:</span>
                    <span class="address"
                        >{formatAddress($identityAddress || "")}</span
                    >
                </div>
                <button class="logout-btn" on:click={handleLogout}>
                    Disconnect
                </button>
            </div>

            {#if showNetworkInfo && networkInfo}
                <div class="network-info">
                    <div
                        class="network-display"
                        bind:this={networkDisplayButton}
                    >
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
                            on:click={toggleNetworkSelector}
                        >
                            Switch Network
                        </button>
                    </div>

                    <!-- Inline Network Selector - kept close to the button for now -->
                    {#if showNetworkSelector}
                        <div class="network-selector-inline">
                            <h4>Select Network</h4>
                            <div class="network-list">
                                {#each Object.entries(NETWORKS) as [chainId, network]}
                                    <button
                                        class="network-option"
                                        class:active={parseInt(chainId) ===
                                            currentChainId}
                                        on:click={() =>
                                            handleSwitchNetwork(
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
        <!-- Login Flow -->
        <div class="login-flow">
            {#if !isWalletConnected}
                <!-- Step 1: Connect Wallet -->
                <div class="login-step">
                    <button
                        on:click={handleConnectWallet}
                        disabled={isConnecting}
                        class="connect-btn"
                    >
                        {#if isConnecting}
                            Connecting...
                        {:else if !isMetaMaskAvailable()}
                            Install MetaMask
                        {:else}
                            🦊 Connect Wallet
                        {/if}
                    </button>
                </div>
            {:else}
                <!-- Step 2: SIWE Authentication -->
                <div class="login-step">
                    <div class="wallet-connected-info">
                        <span class="wallet-label">Wallet:</span>
                        <span class="wallet-address"
                            >{formatAddress(walletAddress)}</span
                        >
                    </div>
                    <button
                        on:click={handleSiweLogin}
                        disabled={!canLogin}
                        class="siwe-btn"
                    >
                        {#if $isLoggingIn}
                            🔐 Authenticating...
                        {:else if $isPreparingLogin}
                            📝 Preparing...
                        {:else}
                            🔐 Sign In with Ethereum
                        {/if}
                    </button>

                    <!-- Status indicators -->
                    {#if $prepareLoginStatus === "preparing"}
                        <p class="status preparing">
                            Preparing SIWE message...
                        </p>
                    {:else if $prepareLoginStatus === "success"}
                        <p class="status success">✅ Ready to sign</p>
                    {:else if $loginStatus === "logging-in"}
                        <p class="status logging-in">🔄 Authenticating...</p>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .siwe-wallet-connector {
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
    }

    .error {
        background: #fee;
        border: 1px solid #fcc;
        color: #c44;
        padding: 8px 12px;
        border-radius: 4px;
        margin-bottom: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.9em;
    }

    .error button {
        background: none;
        border: none;
        color: #c44;
        cursor: pointer;
        text-decoration: underline;
        font-size: 0.9em;
    }

    .authenticated-state {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .user-info {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 12px;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 6px;
    }

    .address-display {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .address-label {
        font-size: 0.85em;
        color: #6c757d;
        font-weight: 500;
    }

    .address {
        font-family: monospace;
        font-size: 0.9em;
        color: #495057;
        font-weight: 500;
    }

    .logout-btn {
        background: #dc3545;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85em;
        transition: background-color 0.2s;
    }

    .logout-btn:hover {
        background: #c82333;
    }

    .network-info {
        position: relative;
        z-index: 100;
    }

    .network-display {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        font-size: 0.9em;
        position: relative;
        z-index: 1000;
    }

    .network-name {
        font-weight: 500;
        color: #495057;
    }

    .network-badge {
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.75em;
        font-weight: 600;
        text-transform: uppercase;
    }

    .network-badge.local {
        background: #fff3cd;
        color: #856404;
    }

    .network-badge.mainnet {
        background: #d4edda;
        color: #155724;
    }

    .network-badge.testnet {
        background: #cce7ff;
        color: #004085;
    }

    .switch-network-btn {
        background: #007bff;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.8em;
        margin-left: auto;
    }

    .switch-network-btn:hover {
        background: #0056b3;
    }

    .network-selector-inline {
        position: absolute;
        top: 100%;
        right: 0;
        z-index: 1000;
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        min-width: 280px;
        max-width: 320px;
        max-height: 400px;
        overflow-y: auto;
        margin-top: 4px;
    }

    .network-selector-inline h4 {
        margin: 0 0 10px 0;
        font-size: 0.9em;
        color: #495057;
    }

    .network-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 10px;
    }

    .network-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85em;
        transition: background-color 0.2s;
    }

    .network-option:hover:not(:disabled) {
        background: #e9ecef;
    }

    .network-option:disabled {
        background: #e9ecef;
        cursor: not-allowed;
        opacity: 0.7;
    }

    .network-option.active {
        background: #007bff;
        color: white;
        border-color: #007bff;
    }

    .back-btn {
        background: #6c757d;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85em;
        width: 100%;
    }

    .back-btn:hover {
        background: #5a6268;
    }

    .login-flow {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .login-step {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .wallet-connected-info {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        font-size: 0.85em;
    }

    .wallet-label {
        color: #6c757d;
        font-weight: 500;
    }

    .wallet-address {
        font-family: monospace;
        color: #495057;
    }

    .connect-btn,
    .siwe-btn {
        background: #007bff;
        color: white;
        border: none;
        padding: 10px 16px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 0.9em;
        font-weight: 500;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
    }

    .connect-btn:hover:not(:disabled) {
        background: #0056b3;
    }

    .siwe-btn {
        background: #28a745;
    }

    .siwe-btn:hover:not(:disabled) {
        background: #218838;
    }

    .connect-btn:disabled,
    .siwe-btn:disabled {
        background: #6c757d;
        cursor: not-allowed;
    }

    .status {
        margin: 4px 0 0 0;
        padding: 4px 8px;
        border-radius: 3px;
        font-size: 0.8em;
        font-weight: 500;
        text-align: center;
    }

    .status.preparing {
        background: #fff3cd;
        color: #856404;
        border: 1px solid #ffeaa7;
    }

    .status.success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
    }

    .status.logging-in {
        background: #cce7ff;
        color: #004085;
        border: 1px solid #b3d7ff;
    }
</style>
