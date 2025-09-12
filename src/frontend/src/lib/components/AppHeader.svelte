<script>
    import SiweWalletConnector from "./SiweWalletConnector.svelte";

    export let title = "🗳️ DAO Governance";
    export let subtitle = "Cross-chain voting on Internet Computer";
    export let showNetworkInfo = true;
</script>

<header class="app-header">
    <div class="header-content">
        <div class="brand">
            <h1>{title}</h1>
            <p class="subtitle">
                {subtitle}
            </p>
        </div>
        <div class="header-actions">
            <SiweWalletConnector {showNetworkInfo} />
        </div>
    </div>
</header>

<style>
    .app-header {
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        padding: 1rem 0;
        position: sticky;
        top: 0;
        z-index: 100;
        backdrop-filter: blur(10px);
    }

    .header-content {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
    }

    .brand {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .brand h1 {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-text-primary);
        margin: 0;
        line-height: 1.2;
    }

    .subtitle {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        margin: 0;
        line-height: 1.4;
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-shrink: 0;
    }

    @media (max-width: 768px) {
        .header-content {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
            text-align: center;
        }

        .brand h1 {
            font-size: 1.25rem;
        }

        .subtitle {
            font-size: 0.8rem;
        }

        .header-actions {
            justify-content: center;
        }
    }
</style>
