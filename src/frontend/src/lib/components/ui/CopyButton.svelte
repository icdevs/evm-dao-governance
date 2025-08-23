<script>
    export let value = "";
    export let size = "sm"; // sm, md, lg
    export let variant = "ghost"; // ghost, filled, outline
    export let title = "Copy to clipboard";

    let copied = false;

    async function copyToClipboard() {
        if (!value) return;

        try {
            await navigator.clipboard.writeText(value);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch (error) {
            console.error("Failed to copy:", error);
        }
    }

    // Size classes
    $: sizeClass = {
        sm: "copy-btn-sm",
        md: "copy-btn-md",
        lg: "copy-btn-lg",
    }[size];

    // Variant classes
    $: variantClass = {
        ghost: "copy-btn-ghost",
        filled: "copy-btn-filled",
        outline: "copy-btn-outline",
    }[variant];
</script>

<button
    class="copy-btn {sizeClass} {variantClass}"
    class:copied
    on:click={copyToClipboard}
    {title}
    disabled={!value}
>
    {#if copied}
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M20 6L9 17L4 12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    {:else}
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect
                x="9"
                y="9"
                width="13"
                height="13"
                rx="2"
                ry="2"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
            />
            <path
                d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
            />
        </svg>
    {/if}
</button>

<style>
    .copy-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        cursor: pointer;
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
        font-family: inherit;
    }

    .copy-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .copy-btn svg {
        transition: transform var(--transition-fast);
    }

    .copy-btn:hover:not(:disabled) svg {
        transform: scale(1.1);
    }

    /* Sizes */
    .copy-btn-sm {
        padding: var(--spacing-xs);
        width: 24px;
        height: 24px;
    }

    .copy-btn-sm svg {
        width: 14px;
        height: 14px;
    }

    .copy-btn-md {
        padding: var(--spacing-sm);
        width: 32px;
        height: 32px;
    }

    .copy-btn-md svg {
        width: 16px;
        height: 16px;
    }

    .copy-btn-lg {
        padding: var(--spacing-md);
        width: 40px;
        height: 40px;
    }

    .copy-btn-lg svg {
        width: 20px;
        height: 20px;
    }

    /* Variants */
    .copy-btn-ghost {
        background: transparent;
        color: var(--color-text-muted);
    }

    .copy-btn-ghost:hover:not(:disabled) {
        background: var(--color-surface);
        color: var(--color-text-primary);
    }

    .copy-btn-filled {
        background: var(--color-surface);
        color: var(--color-text-primary);
        border: 1px solid var(--color-border);
    }

    .copy-btn-filled:hover:not(:disabled) {
        background: var(--color-surface-secondary);
        border-color: var(--color-primary);
        color: var(--color-primary);
    }

    .copy-btn-outline {
        background: transparent;
        color: var(--color-primary);
        border: 1px solid var(--color-border);
    }

    .copy-btn-outline:hover:not(:disabled) {
        background: var(--color-primary);
        color: white;
        border-color: var(--color-primary);
    }

    /* Copied state */
    .copy-btn.copied {
        color: var(--color-success);
    }

    .copy-btn-filled.copied {
        background: var(--color-success-light);
        border-color: var(--color-success);
    }
</style>
