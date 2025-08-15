<script>
    export let label;
    export let id = null;
    export let value = "";
    export let options = []; // Array of {value, label} objects or simple strings
    export let placeholder = "Select an option";
    export let disabled = false;
    export let required = false;
    export let error = null;
    export let helperText = null;

    // Generate ID if not provided
    $: fieldId = id || label?.toLowerCase().replace(/\s+/g, "-") || "select";
    $: hasError = !!error;

    // Normalize options to have consistent structure
    $: normalizedOptions = options.map((option) => {
        if (typeof option === "string") {
            return { value: option, label: option };
        }
        return option;
    });
</script>

<div class="form-group" class:has-error={hasError}>
    <label for={fieldId} class="form-label">
        {label}
        {#if required}<span class="required">*</span>{/if}
    </label>

    <select
        id={fieldId}
        bind:value
        class="form-control"
        class:error={hasError}
        {disabled}
        {required}
        on:change
        on:focus
        on:blur
        {...$$restProps}
    >
        {#if placeholder}
            <option value="" disabled>{placeholder}</option>
        {/if}

        {#each normalizedOptions as option}
            <option value={option.value}>{option.label}</option>
        {/each}
    </select>

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
