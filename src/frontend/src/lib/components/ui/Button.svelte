<script>
    export let variant = "primary"; // primary, secondary, success, danger, warning, ghost, outline
    export let size = "md"; // xs, sm, md, lg, xl
    export let disabled = false;
    export let loading = false;
    export let fullWidth = false;
    export let href = null; // If provided, renders as a link
    export let type = "button"; // button, submit, reset

    // Additional props for hover effects
    export let glowEffect = false; // Adds glowing hover effect
    export let slideEffect = false; // Adds slide shimmer effect

    $: tag = href ? "a" : "button";

    $: classes = [
        "btn",
        `btn-${variant}`,
        `btn-${size}`,
        loading && "btn-loading",
        disabled && "btn-disabled",
        fullWidth && "btn-full-width",
        glowEffect && "btn-glow",
        slideEffect && "btn-slide",
    ]
        .filter(Boolean)
        .join(" ");
</script>

<svelte:element
    this={tag}
    class={classes}
    {disabled}
    {type}
    {href}
    role={href ? "link" : "button"}
    on:click
    on:mouseenter
    on:mouseleave
    on:focus
    on:blur
    {...$$restProps}
>
    {#if loading}
        <span class="btn-spinner"></span>
    {/if}

    <span class="btn-content" class:loading>
        <slot />
    </span>

    {#if slideEffect}
        <span class="btn-slide-shimmer"></span>
    {/if}
</svelte:element>

<style>
    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm) var(--spacing-lg);
        border: 1px solid transparent;
        border-radius: var(--radius-md);
        font-family: var(--font-family-sans);
        font-weight: 600;
        text-align: center;
        text-decoration: none;
        cursor: pointer;
        transition: all var(--transition-normal);
        position: relative;
        overflow: hidden;
        user-select: none;
        white-space: nowrap;
    }

    .btn:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(0, 210, 255, 0.2);
    }

    /* Sizes */
    .btn-xs {
        padding: var(--spacing-xs) var(--spacing-sm);
        font-size: var(--font-size-xs);
        min-height: 24px;
    }

    .btn-sm {
        padding: var(--spacing-sm) var(--spacing-md);
        font-size: var(--font-size-sm);
        min-height: 32px;
    }

    .btn-md {
        padding: var(--spacing-md) var(--spacing-lg);
        font-size: var(--font-size-lg);
        min-height: 40px;
    }

    .btn-lg {
        padding: var(--spacing-lg) var(--spacing-xl);
        font-size: var(--font-size-xl);
        min-height: 48px;
    }

    .btn-xl {
        padding: var(--spacing-xl) var(--spacing-xxl);
        font-size: var(--font-size-xxl);
        min-height: 56px;
    }

    /* Variants */
    .btn-primary {
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-primary-dark) 100%
        );
        color: white;
        box-shadow: var(--shadow-md);
    }

    .btn-primary:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: var(--shadow-primary-lg);
    }

    .btn-secondary {
        background: var(--color-surface);
        color: var(--color-text-primary);
        border-color: var(--color-border);
    }

    .btn-secondary:hover:not(:disabled) {
        background: var(--color-surface-secondary);
        border-color: var(--color-primary);
    }

    .btn-success {
        background: linear-gradient(
            135deg,
            var(--color-success) 0%,
            #00e676 100%
        );
        color: var(--color-bg-primary);
    }

    .btn-success:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 255, 136, 0.4);
    }

    .btn-danger {
        background: linear-gradient(
            135deg,
            var(--color-danger) 0%,
            #ff6b6b 100%
        );
        color: white;
    }

    .btn-danger:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(255, 71, 87, 0.4);
    }

    .btn-warning {
        background: linear-gradient(
            135deg,
            var(--color-warning) 0%,
            #ffa726 100%
        );
        color: var(--color-bg-primary);
    }

    .btn-warning:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(255, 184, 0, 0.4);
    }

    .btn-ghost {
        background: transparent;
        color: var(--color-text-primary);
    }

    .btn-ghost:hover:not(:disabled) {
        background: var(--color-surface);
    }

    .btn-outline {
        background: transparent;
        color: var(--color-primary);
        border-color: var(--color-primary);
    }

    .btn-outline:hover:not(:disabled) {
        background: var(--color-primary);
        color: white;
    }

    /* States */
    .btn-disabled,
    .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none !important;
        box-shadow: none !important;
    }

    .btn-loading {
        cursor: wait;
    }

    .btn-full-width {
        width: 100%;
    }

    /* Loading state */
    .btn-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid transparent;
        border-top: 2px solid currentColor;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    .btn-content.loading {
        opacity: 0.7;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* Glow effect */
    .btn-glow {
        transition:
            all var(--transition-normal),
            box-shadow var(--transition-slow);
    }

    .btn-glow.btn-primary:hover:not(:disabled) {
        box-shadow:
            var(--shadow-primary-lg),
            0 0 30px rgba(0, 210, 255, 0.6);
    }

    /* Slide shimmer effect */
    .btn-slide {
        overflow: hidden;
    }

    .btn-slide-shimmer {
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.2),
            transparent
        );
        transition: left 0.5s;
        pointer-events: none;
    }

    .btn-slide:hover:not(:disabled) .btn-slide-shimmer {
        left: 100%;
    }

    /* Active state */
    .btn:active:not(:disabled) {
        transform: translateY(0) !important;
    }
</style>
