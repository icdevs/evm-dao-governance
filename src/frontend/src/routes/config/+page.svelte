<script>
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import ConfigurationPanel from "$lib/components/ConfigurationPanel.svelte";
    import { configStore } from "$lib/stores/config.js";
    import { authStore } from "$lib/stores/auth.js";

    let configCompleted = false;

    // Subscribe to config changes
    $: if ($configStore.isConfigured && configCompleted) {
        // Redirect to dashboard when configuration is complete
        goto("/");
    }

    function handleConfigurationComplete() {
        configCompleted = true;
    }
</script>

<svelte:head>
    <title>Configuration - EVM DAO Governance</title>
    <meta name="description" content="Configure your DAO governance settings" />
</svelte:head>

<main>
    <div class="config-container">
        <!-- Header -->
        <header class="config-header">
            <div class="header-content">
                <div class="brand">
                    <h1>⚙️ Configuration</h1>
                    <p class="subtitle">
                        Set up your DAO governance parameters
                    </p>
                </div>

                {#if $configStore.isConfigured}
                    <a href="/" class="back-btn">
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
                    </a>
                {/if}
            </div>
        </header>

        <!-- Configuration Content -->
        <div class="config-content">
            <div class="config-wrapper">
                <ConfigurationPanel
                    isExpanded={true}
                    onConfigurationComplete={handleConfigurationComplete}
                />
            </div>
        </div>
    </div>
</main>

<style>
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

    /* Header */
    .config-header {
        background: rgba(30, 33, 38, 0.8);
        backdrop-filter: blur(20px);
        border: 1px solid var(--color-border);
        border-radius: 16px;
        padding: 2rem 2.5rem;
        margin-bottom: 2rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        position: relative;
        z-index: 1;
    }

    .config-header::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(
            90deg,
            var(--color-primary),
            var(--color-success)
        );
        opacity: 0.7;
    }

    .header-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: nowrap;
        gap: 1.5rem;
        position: relative;
        z-index: 1;
        width: 100%;
    }

    .brand {
        flex: 1;
        min-width: 0;
    }

    .brand h1 {
        margin: 0;
        font-size: 2.25rem;
        font-weight: 800;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-success) 100%
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: -0.02em;
    }

    .subtitle {
        margin: 0.5rem 0 0 0;
        color: var(--color-text-secondary);
        font-size: 1rem;
        font-weight: 500;
        opacity: 0.9;
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
    @media (min-width: 769px) {
        .header-content {
            flex-direction: row;
            flex-wrap: nowrap;
            text-align: left;
        }

        .brand {
            text-align: left;
        }
    }

    @media (max-width: 768px) {
        .config-container {
            padding: 1rem;
        }

        .config-header {
            padding: 1.5rem;
            border-radius: 12px;
        }

        .header-content {
            flex-direction: column;
            text-align: center;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .brand {
            width: 100%;
            text-align: center;
        }

        .brand h1 {
            font-size: 2rem;
        }

        .back-btn {
            justify-content: center;
        }
    }
</style>
