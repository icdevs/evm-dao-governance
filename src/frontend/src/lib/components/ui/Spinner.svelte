<script>
    export let size = "md"; // xs, sm, md, lg, xl
    export let color = "primary"; // primary, secondary, success, danger, warning
    export let centered = false;

    $: sizeClass = `spinner-${size}`;
    $: colorClass = `spinner-${color}`;
</script>

<div class="spinner-container" class:centered>
    <div class="spinner {sizeClass} {colorClass}"></div>
</div>

<style>
    .spinner-container {
        display: inline-block;
    }

    .spinner-container.centered {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .spinner {
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

    /* Sizes */
    .spinner-xs {
        width: 12px;
        height: 12px;
        border-width: 1px;
    }

    .spinner-sm {
        width: 16px;
        height: 16px;
        border-width: 2px;
    }

    .spinner-md {
        width: 24px;
        height: 24px;
        border-width: 2px;
    }

    .spinner-lg {
        width: 32px;
        height: 32px;
        border-width: 3px;
    }

    .spinner-xl {
        width: 40px;
        height: 40px;
        border-width: 3px;
    }

    /* Colors */
    .spinner-primary {
        border: currentColor solid;
        border-top-color: var(--color-primary);
        color: var(--color-border);
    }

    .spinner-secondary {
        border: currentColor solid;
        border-top-color: var(--color-text-secondary);
        color: var(--color-border);
    }

    .spinner-success {
        border: currentColor solid;
        border-top-color: var(--color-success);
        color: var(--color-border);
    }

    .spinner-danger {
        border: currentColor solid;
        border-top-color: var(--color-danger);
        color: var(--color-border);
    }

    .spinner-warning {
        border: currentColor solid;
        border-top-color: var(--color-warning);
        color: var(--color-border);
    }
</style>
