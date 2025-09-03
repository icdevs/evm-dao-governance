<script lang="ts">
    import { onMount } from "svelte";
    import {
        siweActions,
        initSiwe,
        isLoggedIn,
        loginStatus,
        identityAddress,
        loginError,
    } from "../lib/siwe";
    import {
        connectWallet,
        disconnectWallet,
        checkWalletConnection,
        isWalletConnected,
        walletAddress,
        isMetaMaskAvailable,
    } from "../lib/wallet";

    // Props
    export let canisterId: string;

    // Local state
    let loading = false;
    let error = "";

    onMount(async () => {
        // Initialize SIWE
        initSiwe(canisterId);

        // Check if wallet is already connected
        try {
            await checkWalletConnection();
        } catch (e) {
            console.error("Error checking wallet connection:", e);
        }
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
        } catch (e: any) {
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
            await siweActions.login();
        } catch (e: any) {
            error = e.message || "Login failed";
            console.error("SIWE login error:", e);
        } finally {
            loading = false;
        }
    }

    function handleLogout() {
        try {
            siweActions.clear();
            disconnectWallet();
            error = "";
        } catch (e: any) {
            error = e.message || "Logout failed";
            console.error("Logout error:", e);
        }
    }

    // Reactive statements
    $: isConnecting = loading && !$isWalletConnected;
    $: isLoggingIn = $loginStatus === "logging-in";
    $: canLogin = $isWalletConnected && !$isLoggedIn && !isLoggingIn;
</script>

<div class="siwe-login">
    {#if error}
        <div class="error">
            <p>{error}</p>
            <button on:click={() => (error = "")}>Dismiss</button>
        </div>
    {/if}

    {#if $loginError}
        <div class="error">
            <p>Login Error: {$loginError.message}</p>
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

                <!-- Step 2: SIWE Login -->
                <div class="step">
                    <h4>Step 2: Sign Message</h4>
                    <button
                        on:click={handleSiweLogin}
                        disabled={!canLogin || isLoggingIn}
                        class="login-btn"
                    >
                        {#if isLoggingIn}
                            Signing in...
                        {:else}
                            Sign in with Ethereum
                        {/if}
                    </button>
                    <p class="help-text">
                        You'll be asked to sign a message with your wallet to
                        authenticate.
                    </p>
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
</style>
