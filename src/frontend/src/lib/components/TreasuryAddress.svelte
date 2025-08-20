<script>
    import { configStore } from "../stores/config.js";
    import { agentStore } from "../stores/agent.js";
    import { CopyButton } from "./ui/index.js";
    import { treasuryBalanceStore } from "$lib/stores/balance.js";

    // Subscribe to balance store for treasury address
    $: configData = $configStore;
    $: treasuryBalance = $treasuryBalanceStore;
</script>

<div class="governance-info">
    <span class="governance-label">Treasury:</span>
    <div class="inline-address">
        {#if treasuryBalance.walletAddress}
            <span class="address-full">
                {treasuryBalance.walletAddress}
            </span>
            <CopyButton
                value={treasuryBalance.walletAddress}
                size="xs"
                variant="ghost"
                title="Copy treasury address"
            />
        {:else}
            <span class="address-full"> Loading... </span>
        {/if}
    </div>
</div>

<style>
    .governance-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--color-text-secondary);
        flex: 1;
    }

    .governance-label {
        color: var(--color-text-secondary);
        font-weight: 500;
        font-size: 0.85rem;
    }

    .inline-address {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.75rem;
        background: rgba(0, 210, 255, 0.1);
        border: 1px solid rgba(0, 210, 255, 0.2);
        border-radius: 8px;
        transition: all 0.3s ease;
    }

    .inline-address:hover {
        background: rgba(0, 210, 255, 0.15);
        border-color: rgba(0, 210, 255, 0.3);
    }

    .address-full {
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 0.8rem;
        color: var(--color-primary);
        font-weight: 600;
    }

    @media (max-width: 768px) {
        .governance-info {
            gap: 0.5rem;
            font-size: 0.8rem;
        }

        .address-full {
            font-size: 0.75rem;
        }
    }
</style>
