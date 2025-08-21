<script>
    export let label;
    export let id = null;
    export let value = "";
    export let placeholder = "";
    export let disabled = false;
    export let required = false;
    export let error = null;
    export let helperText = null;
    export let rows = 3;
    export let maxlength = null;
    export let resize = true;

    // Generate ID if not provided
    $: fieldId = id || label?.toLowerCase().replace(/\s+/g, "-") || "textarea";
    $: hasError = !!error;
</script>

<div class="form-group" class:has-error={hasError}>
    <label for={fieldId} class="form-label">
        {label}
        {#if required}<span class="required">*</span>{/if}
    </label>

    <textarea
        id={fieldId}
        bind:value
        class="form-control"
        class:error={hasError}
        class:no-resize={!resize}
        {placeholder}
        {disabled}
        {required}
        {rows}
        {maxlength}
        on:input
        on:change
        on:focus
        on:blur
        {...$$restProps}
    ></textarea>

    {#if error}
        <div class="form-error" role="alert">
            {error}
        </div>
    {:else if helperText}
        <div class="form-helper">
            {helperText}
        </div>
    {/if}
</div>

<style>
    .form-group {
        margin-bottom: var(--spacing-lg);
    }

    .form-label {
        display: block;
        margin-bottom: var(--spacing-sm);
        font-weight: 600;
        color: var(--color-text-primary);
        font-size: var(--font-size-md);
    }

    .required {
        color: var(--color-danger);
        margin-left: var(--spacing-xs);
    }

    .form-control {
        min-height: 80px;
        resize: vertical;
    }

    .form-control.no-resize {
        resize: none;
    }

    .form-control.error {
        border-color: var(--color-danger);
        background: var(--color-danger-light);
    }

    .form-control.error:focus {
        box-shadow: 0 0 0 3px rgba(255, 71, 87, 0.2);
        border-color: var(--color-danger);
    }

    .form-error {
        margin-top: var(--spacing-sm);
        color: var(--color-danger);
        font-size: var(--font-size-sm);
        font-weight: 500;
    }

    .form-helper {
        margin-top: var(--spacing-sm);
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
    }

    .has-error .form-label {
        color: var(--color-danger);
    }
</style>
