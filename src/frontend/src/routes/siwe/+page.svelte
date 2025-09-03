<script lang="ts">
    import { onMount } from "svelte";
    import SiweLogin from "$lib/SiweLogin.svelte";
    import { isLoggedIn, identity, identityAddress } from "$lib/siwe";

    // Use the canister ID from config (environment variable)
    let canisterId = process.env.CANISTER_IC_SIWE_PROVIDER;
    let canisterIdError = "";

    onMount(async () => {
        // Check if we have a canister ID
        if (!canisterId) {
            canisterIdError =
                "SIWE canister ID not found. Please deploy the ic_siwe_provider canister first.";
            console.error(
                "SIWE_CANISTER_ID not set. Expected VITE_CANISTER_IC_SIWE_PROVIDER environment variable."
            );
        } else {
            console.log("Using SIWE canister ID:", canisterId);
        }
    });

    async function testAuthenticatedCall() {
        if (!$identity) {
            alert("Not authenticated");
            return;
        }

        try {
            // Example: You could make a call to your backend canister here
            // using the authenticated identity

            alert(
                `Authenticated call would be made with Principal: ${$identity.getPrincipal().toString()}`
            );

            // Example of how you might use this with your actual backend:
            /*
      import { createActor } from '../../declarations/backend';
      
      const actor = createActor(backendCanisterId, {
        agentOptions: {
          identity: $identity,
        },
      });
      
      const result = await actor.someAuthenticatedMethod();
      console.log('Result:', result);
      */
        } catch (error) {
            console.error("Error making authenticated call:", error);
            alert(
                "Error making authenticated call. Check console for details."
            );
        }
    }
</script>

<svelte:head>
    <title>SIWE Authentication Demo</title>
</svelte:head>

<div class="container">
    <header>
        <h1>🔐 Sign in with Ethereum Demo</h1>
        <p>
            This demo shows how to authenticate users with their Ethereum
            wallets using SIWE (Sign-In with Ethereum) on the Internet Computer.
        </p>
    </header>

    <main>
        {#if canisterIdError}
            <div class="error-section">
                <h2>❌ Configuration Error</h2>
                <p>{canisterIdError}</p>
                <div class="deployment-help">
                    <h3>To deploy the SIWE canister:</h3>
                    <ol>
                        <li>Run: <code>./deploy-siwe.sh</code></li>
                        <li>
                            Or manually: <code
                                >dfx deploy ic_siwe_provider --argument '...'</code
                            >
                        </li>
                    </ol>
                </div>
            </div>
        {:else if canisterId}
            <div class="canister-info">
                <p>
                    <strong>Using SIWE Provider:</strong>
                    <code>{canisterId}</code>
                </p>
            </div>

            <SiweLogin {canisterId} />

            {#if $isLoggedIn}
                <section class="demo-section">
                    <h2>🎉 Authentication Successful!</h2>
                    <div class="identity-info">
                        <h3>Identity Information</h3>
                        <div class="info-item">
                            <span class="info-label">Ethereum Address:</span>
                            <code>{$identityAddress}</code>
                        </div>
                        <div class="info-item">
                            <span class="info-label">IC Principal:</span>
                            <code>{$identity?.getPrincipal().toString()}</code>
                        </div>
                    </div>

                    <div class="demo-actions">
                        <h3>What you can do now:</h3>
                        <ul>
                            <li>
                                Make authenticated calls to Internet Computer
                                canisters
                            </li>
                            <li>Your identity is consistent across sessions</li>
                            <li>
                                Your Ethereum address is mapped to an IC
                                Principal
                            </li>
                            <li>
                                Sessions can be configured with expiration times
                            </li>
                        </ul>

                        <div class="api-demo">
                            <h4>Try making an authenticated call:</h4>
                            <button
                                class="demo-btn"
                                on:click={() => testAuthenticatedCall()}
                            >
                                Test Authenticated Call
                            </button>
                        </div>
                    </div>
                </section>
            {/if}
        {:else}
            <div class="loading">
                <p>Loading canister configuration...</p>
            </div>
        {/if}
    </main>

    <footer>
        <div class="links">
            <h3>Learn More:</h3>
            <ul>
                <li>
                    <a
                        href="https://github.com/kristoferlund/ic-siwe"
                        target="_blank">ic-siwe GitHub Repository</a
                    >
                </li>
                <li>
                    <a
                        href="https://eips.ethereum.org/EIPS/eip-4361"
                        target="_blank">EIP-4361: Sign-In with Ethereum</a
                    >
                </li>
                <li>
                    <a href="https://internetcomputer.org/" target="_blank"
                        >Internet Computer</a
                    >
                </li>
            </ul>
        </div>
    </footer>
</div>

<style>
    .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
        line-height: 1.6;
    }

    header {
        text-align: center;
        margin-bottom: 40px;
        padding-bottom: 20px;
        border-bottom: 1px solid #eee;
    }

    header h1 {
        color: #333;
        margin-bottom: 10px;
    }

    header p {
        color: #666;
        font-size: 1.1em;
    }

    main {
        margin-bottom: 40px;
    }

    .loading {
        text-align: center;
        padding: 40px;
        color: #666;
    }

    .error-section {
        background: #fee;
        border: 1px solid #fcc;
        color: #c44;
        padding: 20px;
        border-radius: 8px;
        margin: 20px 0;
    }

    .error-section h2 {
        color: #c44;
        margin-top: 0;
    }

    .deployment-help {
        background: white;
        padding: 15px;
        border-radius: 5px;
        margin-top: 15px;
    }

    .deployment-help h3 {
        margin-top: 0;
        color: #333;
    }

    .deployment-help ol {
        margin: 10px 0;
        padding-left: 20px;
    }

    .deployment-help code {
        background: #f1f3f4;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: "Courier New", monospace;
        font-size: 0.9em;
    }

    .canister-info {
        background: #e8f4fd;
        border: 1px solid #bee5eb;
        color: #0c5460;
        padding: 10px 15px;
        border-radius: 5px;
        margin-bottom: 20px;
        font-size: 0.9em;
    }

    .canister-info code {
        background: rgba(255, 255, 255, 0.7);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: "Courier New", monospace;
    }

    .demo-section {
        margin-top: 30px;
        padding: 20px;
        background: #f8f9fa;
        border-radius: 8px;
    }

    .demo-section h2 {
        color: #28a745;
        text-align: center;
        margin-bottom: 20px;
    }

    .identity-info {
        background: white;
        padding: 15px;
        border-radius: 5px;
        margin: 20px 0;
        border-left: 4px solid #007bff;
    }

    .identity-info h3 {
        margin-top: 0;
        color: #333;
    }

    .info-item {
        margin: 10px 0;
    }

    .info-item .info-label {
        font-weight: bold;
        display: inline-block;
        width: 150px;
        color: #555;
    }

    .info-item code {
        background: #f1f3f4;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: "Courier New", monospace;
        font-size: 0.9em;
        word-break: break-all;
    }

    .demo-actions {
        margin-top: 20px;
    }

    .demo-actions h3 {
        color: #333;
    }

    .demo-actions ul {
        background: white;
        padding: 15px 15px 15px 35px;
        border-radius: 5px;
        margin: 15px 0;
    }

    .demo-actions li {
        margin: 8px 0;
        color: #555;
    }

    .api-demo {
        background: white;
        padding: 15px;
        border-radius: 5px;
        margin-top: 15px;
    }

    .api-demo h4 {
        margin-top: 0;
        color: #333;
    }

    .demo-btn {
        background: #28a745;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
    }

    .demo-btn:hover {
        background: #218838;
    }

    footer {
        border-top: 1px solid #eee;
        padding-top: 20px;
        text-align: center;
    }

    .links h3 {
        color: #333;
        margin-bottom: 15px;
    }

    .links ul {
        list-style: none;
        padding: 0;
    }

    .links li {
        margin: 10px 0;
    }

    .links a {
        color: #007bff;
        text-decoration: none;
    }

    .links a:hover {
        text-decoration: underline;
    }

    @media (max-width: 600px) {
        .container {
            padding: 15px;
        }

        .info-item .info-label {
            width: 100%;
            display: block;
            margin-bottom: 5px;
        }
    }
</style>
