<script>
    import { balanceStore } from "../stores/balance.js";
    import { CopyButton } from "./ui/index.js";

    // Subscribe to balance store for treasury address
    $: balanceData = $balanceStore;
    $: canisterAddress = balanceData.canisterAddress;
</script>

{#if canisterAddress}
    <div class="governance-info">
        <span class="governance-label">Treasury:</span>
        <div class="inline-address">
            <span class="address-full">
                {canisterAddress}
            </span>
            <CopyButton
                value={canisterAddress}
                size="xs"
                variant="ghost"
                title="Copy treasury address"
            />
        </div>
    </div>
{/if}

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
