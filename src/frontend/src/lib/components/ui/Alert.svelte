<script>
    export let variant = "info"; // success, error, warning, info
    export let dismissible = false;
    export let title = null;

    let dismissed = false;

    function dismiss() {
        dismissed = true;
    }
</script>

{#if !dismissed}
    <div class="alert alert-{variant}" role="alert">
        {#if dismissible}
            <button
                class="alert-close"
                on:click={dismiss}
                aria-label="Close alert"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M18 6L6 18M6 6L18 18"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
        {/if}

        <div class="alert-content">
            {#if title}
                <div class="alert-title">{title}</div>
            {/if}

            <div class="alert-message">
                <slot />
            </div>
        </div>
    </div>
{/if}

<style>
    .alert {
        position: relative;
        padding: var(--spacing-lg);
        border-radius: var(--radius-md);
        margin-bottom: var(--spacing-lg);
        font-weight: 500;
        border: 1px solid transparent;
        display: flex;
        align-items: flex-start;
        gap: var(--spacing-md);
    }

    .alert-content {
        flex: 1;
    }

    .alert-title {
        font-weight: 600;
        margin-bottom: var(--spacing-sm);
    }

    .alert-message {
        line-height: 1.5;
    }

    .alert-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--spacing-xs);
        border-radius: var(--radius-sm);
        color: currentColor;
        opacity: 0.7;
        transition: all var(--transition-fast);
        flex-shrink: 0;
        margin-left: auto;
    }

    .alert-close:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.1);
    }

    .alert-close svg {
        width: 16px;
        height: 16px;
    }

    /* Variants */
    .alert-success {
        background: var(--color-success-light);
        color: var(--color-success);
        border-color: rgba(0, 255, 136, 0.3);
    }

    .alert-error {
        background: var(--color-danger-light);
        color: var(--color-danger);
        border-color: rgba(255, 71, 87, 0.3);
    }

    .alert-warning {
        background: var(--color-warning-light);
        color: var(--color-warning);
        border-color: rgba(255, 184, 0, 0.3);
    }

    .alert-info {
        background: var(--color-info-light);
        color: var(--color-info);
        border-color: rgba(116, 185, 255, 0.3);
    }
</style>
