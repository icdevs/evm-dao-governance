<script>
    import "../../index.scss";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import AppHeader from "$lib/components/AppHeader.svelte";
    import ConfigurationPanel from "$lib/components/ConfigurationPanel.svelte";
    import { configStore } from "$lib/stores/config.js";

    let configCompleted = false;
    let configLoaded = false;

    // Subscribe to config changes
    $: if ($configStore.isConfigured && configCompleted) {
        // Redirect to dashboard when configuration is complete
        goto("/");
    }

    // Track when config is loaded
    $: configLoaded = $configStore.loaded;

    onMount(async () => {
        // Ensure config is loaded when directly accessing this page
        if (!$configStore.loaded) {
            configStore.load();
        }
    });

    function handleConfigurationComplete() {
        configCompleted = true;
    }
</script>

<svelte:head>
    <title>Configuration - EVM DAO Governance</title>
    <meta name="description" content="Configure your DAO governance settings" />
</svelte:head>

<!-- Shared App Header -->
<AppHeader
    title="⚙️ Configuration"
    subtitle="Set up your DAO governance parameters"
/>

<main>
    <div class="config-container">
        {#if !configLoaded}
            <!-- Loading state while config is being loaded -->
            <div class="loading-container">
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <p>Loading configuration...</p>
                </div>
            </div>
        {:else}
            <!-- Configuration Content -->
            <div class="config-content">
                {#if $configStore.isConfigured}
                    <div class="back-button-container">
                        <button class="back-btn" on:click={() => goto("/")}>
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M19 12H5"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M12 19L5 12L12 5"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                            Back to Dashboard
                        </button>
                    </div>
                {/if}
                <div class="config-wrapper">
                    <ConfigurationPanel
                        isExpanded={true}
                        onConfigurationComplete={handleConfigurationComplete}
                    />
                </div>
            </div>
        {/if}
    </div>
</main>

<style>
    /* Dark Theme Variables */
    :global(:root) {
        --color-bg-primary: #0a0b0d;
        --color-bg-secondary: #1a1d21;
        --color-bg-tertiary: #2a2d35;
        --color-surface: #1e2126;
        --color-surface-secondary: #262a30;
        --color-surface-hover: #32363e;
        --color-border: #3a3f47;
        --color-border-light: #2a2f37;
        --color-text-primary: #ffffff;
        --color-text-secondary: #b4b8c0;
        --color-text-muted: #8b909a;
        --color-primary: #00d2ff;
        --color-primary-dark: #00b8e6;
        --color-primary-light: #33dbff;
        --color-success: #00ff88;
        --color-success-light: rgba(0, 255, 136, 0.1);
        --color-warning: #ffb800;
        --color-warning-light: rgba(255, 184, 0, 0.1);
        --color-danger: #ff4757;
        --color-danger-light: rgba(255, 71, 87, 0.1);
        --color-info: #74b9ff;
        --color-info-light: rgba(116, 185, 255, 0.1);
    }

    :global(body) {
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
        font-family:
            "Inter",
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            sans-serif;
    }

    /* Dark Theme Variables (inherits from global) */
    .config-container {
        min-height: 100vh;
        background: radial-gradient(
                circle at 20% 80%,
                rgba(0, 210, 255, 0.15) 0%,
                transparent 50%
            ),
            radial-gradient(
                circle at 80% 20%,
                rgba(0, 255, 136, 0.1) 0%,
                transparent 50%
            ),
            linear-gradient(
                135deg,
                var(--color-bg-primary) 0%,
                var(--color-bg-secondary) 100%
            );
        padding: 1.5rem;
        position: relative;
    }

    .config-container::before {
        content: "";
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(
                circle at 20% 80%,
                rgba(0, 210, 255, 0.05) 0%,
                transparent 50%
            ),
            radial-gradient(
                circle at 80% 20%,
                rgba(0, 255, 136, 0.05) 0%,
                transparent 50%
            );
        pointer-events: none;
    }

    /* Loading State */
    .loading-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 50vh;
        padding: 2rem;
    }

    .loading-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        color: var(--color-text-secondary);
    }

    .loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--color-border);
        border-top: 3px solid var(--color-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    /* Back Button Container */
    .back-button-container {
        margin-bottom: 2rem;
        display: flex;
        justify-content: flex-start;
        padding: 0 1rem;
    }

    .back-btn {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1.5rem;
        background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            var(--color-surface-secondary) 100%
        );
        color: var(--color-text-primary);
        text-decoration: none;
        border: 1px solid var(--color-border);
        border-radius: 12px;
        font-weight: 600;
        font-size: 0.95rem;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        flex-shrink: 0;
    }

    .back-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 210, 255, 0.3);
        border-color: var(--color-primary);
    }

    .back-btn svg {
        width: 18px;
        height: 18px;
    }

    /* Content Area */
    .config-content {
        position: relative;
        z-index: 1;
    }

    .config-wrapper {
        max-width: 800px;
        margin: 0 auto;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
        .config-container {
            padding: 1rem;
        }

        .back-button-container {
            padding: 0 0.5rem;
        }

        .back-btn {
            justify-content: center;
            width: 100%;
        }
    }
</style>
