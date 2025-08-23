<script>
    import CopyButton from "./CopyButton.svelte";

    export let address;
    export let showCopy = true;
    export let truncate = true;
    export let truncateLength = 6; // Characters to show at start and end
    export let label = null;
    export let copySize = "sm";
    export let copyVariant = "ghost";
    export let compact = false;

    $: displayAddress =
        truncate && address
            ? `${address.slice(0, truncateLength)}...${address.slice(-truncateLength)}`
            : address;
</script>

<div class="address-display" class:compact>
    {#if label}
        <span class="address-label">{label}:</span>
    {/if}

    <code class="address-value" title={address}>
        {displayAddress}
    </code>

    {#if showCopy && address}
        <CopyButton
            value={address}
            size={copySize}
            variant={copyVariant}
            title="Copy {label ? label.toLowerCase() : 'address'}"
        />
    {/if}
</div>

<style>
    .address-display {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm) var(--spacing-md);
        background: rgba(0, 210, 255, 0.1);
        border: 1px solid rgba(0, 210, 255, 0.2);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
    }

    .address-label {
        font-weight: 600;
        color: var(--color-text-primary);
        white-space: nowrap;
    }

    .address-value {
        font-family: var(--font-family-mono);
        font-size: var(--font-size-sm);
        color: var(--color-primary);
        background: none;
        padding: 0;
        border: none;
        border-radius: 0;
        font-weight: 500;
    }

    /* Compact variant */
    .address-display.compact {
        padding: var(--spacing-xs) var(--spacing-sm);
        background: var(--color-surface);
        border-color: var(--color-border);
    }

    .compact .address-value {
        color: var(--color-text-primary);
    }
</style>
