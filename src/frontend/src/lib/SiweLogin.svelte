<script>
    import { onMount, onDestroy } from "svelte";
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
        cleanupSiwe,
    } from "./siwe";
    import {
        connectWallet,
        disconnectWallet,
        checkWalletConnection,
        isWalletConnected,
        walletAddress,
        isMetaMaskAvailable,
    } from "./wallet";

    // Props
    export let canisterId;
    export let httpAgentOptions = {};
    export let actorOptions = {};

    // Local state
    let loading = false;
    let error = "";

    onMount(async () => {
        try {
            console.log("Initializing SIWE with canister ID:", canisterId);

            // Initialize SIWE with options
            initSiwe(canisterId, {
                httpAgentOptions,
                actorOptions,
            });

            // Check if wallet is already connected
            await checkWalletConnection();
        } catch (e) {
            console.error("Error during initialization:", e);
            error = `Initialization error: ${e.message}`;
        }
    });

    onDestroy(() => {
        // Clean up SIWE resources when component is destroyed
        cleanupSiwe();
    });

    async function handleConnectWallet() {
        if (!isMetaMaskAvailable()) {
            error = "MetaMask not found. Please install MetaMask to continue.";
            return;
        }

        try {
            loading = true;
            error = "";
            await connectWallet();
        } catch (e) {
            error = e.message || "Failed to connect wallet";
            console.error("Wallet connection error:", e);
        } finally {
            loading = false;
        }
    }

    async function handleSiweLogin() {
        if (!$isWalletConnected) {
            error = "Please connect your wallet first";
            return;
        }

        try {
            loading = true;
            error = "";

            // Prepare login first if not already prepared
            if ($prepareLoginStatus !== "success") {
                console.log("Preparing login first...");
                siweActions.prepareLogin();

                // Wait for preparation to complete by polling status
                const maxWait = 30000; // 30 seconds max
                const startTime = Date.now();

                while (
                    $prepareLoginStatus !== "success" &&
                    Date.now() - startTime < maxWait
                ) {
                    await new Promise((resolve) => setTimeout(resolve, 100)); // Check every 100ms
                }

                if ($prepareLoginStatus !== "success") {
                    throw new Error("Login preparation timed out");
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

    async function handlePrepareLogin() {
        if (!$isWalletConnected) {
            error = "Please connect your wallet first";
            return;
        }

        try {
            error = "";
            console.log("Preparing SIWE login...");
            siweActions.prepareLogin();
        } catch (e) {
            error = e.message || "Failed to prepare login";
            console.error("Prepare login error:", e);
        }
    }

    function handleLogout() {
        try {
            siweActions.clear();
            disconnectWallet();
            error = "";
        } catch (e) {
            error = e.message || "Logout failed";
            console.error("Logout error:", e);
        }
    }

    // Reactive statements
    $: isConnecting = loading && !$isWalletConnected;
    $: canLogin =
        $isWalletConnected &&
        !$isLoggedIn &&
        !$isLoggingIn &&
        !$isPreparingLogin;
    $: canPrepareLogin =
        $isWalletConnected &&
        !$isLoggedIn &&
        !$isPreparingLogin &&
        $prepareLoginStatus !== "success";

    // Combine all possible errors for display
    $: allErrors = [
        error,
        $loginError?.message,
        $prepareLoginError?.message,
        $signMessageError?.message,
    ].filter(Boolean);
</script>

<div class="siwe-login">
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
        <div class="logged-in">
            <h3>✅ Signed In</h3>
            <p><strong>Ethereum Address:</strong> {$identityAddress}</p>
            <button on:click={handleLogout} class="logout-btn">
                Sign Out
            </button>
        </div>
    {:else}
        <div class="login-flow">
            <h3>Sign in with Ethereum</h3>

            <!-- Step 1: Connect Wallet -->
            {#if !$isWalletConnected}
                <div class="step">
                    <h4>Step 1: Connect Wallet</h4>
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
                            Connect MetaMask
                        {/if}
                    </button>
                </div>
            {:else}
                <div class="step completed">
                    <h4>✅ Step 1: Wallet Connected</h4>
                    <p><strong>Address:</strong> {$walletAddress}</p>
                </div>

                <!-- Step 2: Prepare Login (optional) -->
                {#if $prepareLoginStatus !== "success"}
                    <div class="step">
                        <h4>Step 2a: Prepare Login</h4>
                        <button
                            on:click={handlePrepareLogin}
                            disabled={!canPrepareLogin}
                            class="prepare-btn"
                        >
                            {#if $isPreparingLogin}
                                Preparing...
                            {:else}
                                Prepare SIWE Message
                            {/if}
                        </button>
                        <p class="help-text">
                            (Optional) Load the SIWE message from the backend.
                        </p>
                    </div>
                {:else}
                    <div class="step completed">
                        <h4>✅ Step 2a: Login Prepared</h4>
                    </div>
                {/if}

                <!-- Step 3: SIWE Login -->
                <div class="step">
                    <h4>
                        {$prepareLoginStatus === "success"
                            ? "Step 2b"
                            : "Step 2"}: Sign Message
                    </h4>
                    <button
                        on:click={handleSiweLogin}
                        disabled={!canLogin}
                        class="login-btn"
                    >
                        {#if $isLoggingIn}
                            Signing in...
                        {:else}
                            Sign in with Ethereum
                        {/if}
                    </button>
                    <p class="help-text">
                        You'll be asked to sign a message with your wallet to
                        authenticate.
                    </p>

                    <!-- Status indicators -->
                    {#if $prepareLoginStatus === "preparing"}
                        <p class="status preparing">
                            Preparing SIWE message...
                        </p>
                    {:else if $prepareLoginStatus === "success"}
                        <p class="status success">✅ SIWE message ready</p>
                    {:else if $loginStatus === "logging-in"}
                        <p class="status logging-in">🔄 Authenticating...</p>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .siwe-login {
        max-width: 400px;
        margin: 0 auto;
        padding: 20px;
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
    }

    .error {
        background: #fee;
        border: 1px solid #fcc;
        color: #c44;
        padding: 10px;
        border-radius: 5px;
        margin-bottom: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .error button {
        background: none;
        border: none;
        color: #c44;
        cursor: pointer;
        text-decoration: underline;
    }

    .logged-in {
        background: #efe;
        border: 1px solid #cfc;
        color: #4a4;
        padding: 15px;
        border-radius: 8px;
        text-align: center;
    }

    .logged-in h3 {
        margin: 0 0 10px 0;
    }

    .logged-in p {
        margin: 10px 0;
        word-break: break-all;
        font-size: 0.9em;
    }

    .login-flow {
        text-align: center;
    }

    .login-flow h3 {
        margin-bottom: 20px;
        color: #333;
    }

    .step {
        margin: 20px 0;
        padding: 15px;
        border: 1px solid #ddd;
        border-radius: 8px;
    }

    .step.completed {
        background: #f0f8f0;
        border-color: #c3e6c3;
    }

    .step h4 {
        margin: 0 0 10px 0;
        color: #555;
    }

    .step p {
        margin: 10px 0 0 0;
        color: #666;
        font-size: 0.9em;
        word-break: break-all;
    }

    .help-text {
        font-size: 0.8em;
        color: #888;
        margin-top: 8px;
    }

    button {
        background: #0066cc;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
    }

    button:hover:not(:disabled) {
        background: #0052a3;
    }

    button:disabled {
        background: #ccc;
        cursor: not-allowed;
    }

    .connect-btn {
        background: #ff6b35;
    }

    .connect-btn:hover:not(:disabled) {
        background: #e55a2b;
    }

    .login-btn {
        background: #4caf50;
    }

    .login-btn:hover:not(:disabled) {
        background: #45a049;
    }

    .logout-btn {
        background: #f44336;
        margin-top: 10px;
    }

    .logout-btn:hover {
        background: #da190b;
    }

    .prepare-btn {
        background: #2196f3;
    }

    .prepare-btn:hover:not(:disabled) {
        background: #1976d2;
    }

    .status {
        margin-top: 8px;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 0.85em;
        font-weight: 500;
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
