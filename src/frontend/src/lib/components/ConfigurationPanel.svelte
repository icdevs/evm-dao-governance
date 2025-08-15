<script>
    import { configStore } from "../stores/config.js";
    import { statusStore } from "../stores/status.js";
    import { onMount } from "svelte";

    export let isExpanded = false;

    let canisterId = "";
    let environment = "local";
    let contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    // Subscribe to config store
    configStore.subscribe((config) => {
        canisterId = config.canisterId;
        environment = config.environment;
        contractAddress = config.contractAddress;
    });

    onMount(() => {
        configStore.load();
    });

    function handleCanisterIdChange() {
        configStore.updateField("canisterId", canisterId);
        configStore.checkConfiguration();
    }

    function handleEnvironmentChange() {
        configStore.updateField("environment", environment);

        // Update default contract address based on environment
        if (environment === "local") {
            contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
        } else {
            contractAddress = "";
        }
        configStore.updateField("contractAddress", contractAddress);
    }

    function handleContractAddressChange() {
        configStore.updateField("contractAddress", contractAddress);
        configStore.checkConfiguration();
    }

    function toggleExpanded() {
        isExpanded = !isExpanded;
    }

    function validateCanisterId(id) {
        // Basic validation for canister ID format
        const pattern = /^[a-z0-9-]+$/;
        return pattern.test(id) && id.length > 5;
    }

    function validateContractAddress(address) {
        // Basic validation for Ethereum address
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    $: isCanisterValid = validateCanisterId(canisterId);
    $: isAddressValid = validateContractAddress(contractAddress);
    $: isConfigComplete = isCanisterValid && isAddressValid;
</script>

<div class="config-panel">
    <div
        class="config-header"
        on:click={toggleExpanded}
        on:keydown={(e) => e.key === "Enter" && toggleExpanded()}
        role="button"
        tabindex="0"
    >
        <div class="config-title">
            <h3>⚙️ Configuration</h3>
            <div class="config-status">
                {#if isConfigComplete}
                    <span class="status-badge success">✓ Configured</span>
                {:else}
                    <span class="status-badge warning">⚠ Setup Required</span>
                {/if}
            </div>
        </div>
        <button class="expand-btn" class:expanded={isExpanded}>
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M6 9L12 15L18 9"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        </button>
    </div>

    {#if isExpanded}
        <div class="config-content">
            <div class="form-section">
                <div class="input-group">
                    <label for="environment">Environment</label>
                    <select
                        id="environment"
                        bind:value={environment}
                        on:change={handleEnvironmentChange}
                        class="select-input"
                    >
                        <option value="local">🏠 Local Development</option>
                        <option value="ic">🌐 Internet Computer</option>
                    </select>
                    <div class="input-hint">
                        {environment === "local"
                            ? "Using local dfx replica"
                            : "Connected to IC mainnet"}
                    </div>
                </div>

                <div class="input-group">
                    <label for="canisterId">DAO Canister ID</label>
                    <input
                        type="text"
                        id="canisterId"
                        bind:value={canisterId}
                        on:input={handleCanisterIdChange}
                        placeholder="e.g., rdmx6-jaaaa-aaaah-qca7a-cai"
                        class="text-input"
                        class:valid={isCanisterValid && canisterId}
                        class:invalid={canisterId && !isCanisterValid}
                    />
                    <div class="input-hint">
                        {#if canisterId && !isCanisterValid}
                            <span class="error">Invalid canister ID format</span
                            >
                        {:else}
                            Enter your DAO canister identifier
                        {/if}
                    </div>
                </div>

                <div class="input-group">
                    <label for="contractAddress"
                        >Governance Token Contract</label
                    >
                    <input
                        type="text"
                        id="contractAddress"
                        bind:value={contractAddress}
                        on:input={handleContractAddressChange}
                        placeholder="0x..."
                        class="text-input mono"
                        class:valid={isAddressValid}
                        class:invalid={contractAddress && !isAddressValid}
                    />
                    <div class="input-hint">
                        {#if contractAddress && !isAddressValid}
                            <span class="error"
                                >Invalid Ethereum address format</span
                            >
                        {:else}
                            Contract address for the governance token
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .config-panel {
        background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            var(--color-surface-secondary) 100%
        );
        border: 1px solid var(--color-border);
        border-radius: 16px;
        margin-bottom: 2rem;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(10px);
        position: relative;
    }

    .config-panel::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(
            90deg,
            var(--color-primary),
            var(--color-success)
        );
        opacity: 0.7;
    }

    .config-panel:hover {
        box-shadow: 0 8px 32px rgba(0, 210, 255, 0.2);
        border-color: var(--color-primary);
    }

    .config-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.5rem 2rem;
        background: rgba(30, 33, 38, 0.5);
        cursor: pointer;
        transition: all 0.3s ease;
        border-bottom: 1px solid var(--color-border-light);
        backdrop-filter: blur(10px);
    }

    .config-header:hover {
        background: rgba(50, 54, 62, 0.7);
    }

    .config-title {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        flex: 1;
    }

    .config-title h3 {
        margin: 0;
        color: var(--color-text-primary);
        font-size: 1.25rem;
        font-weight: 700;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-success) 100%
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .config-status {
        display: flex;
        align-items: center;
    }

    .status-badge {
        padding: 0.5rem 1rem;
        border-radius: 1.5rem;
        font-size: 0.8rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .status-badge.success {
        background: var(--color-success-light);
        color: var(--color-success);
        border: 1px solid rgba(0, 255, 136, 0.2);
    }

    .status-badge.warning {
        background: var(--color-warning-light);
        color: var(--color-warning);
        border: 1px solid rgba(255, 184, 0, 0.2);
    }

    .expand-btn {
        background: var(--color-surface-hover);
        border: 1px solid var(--color-border);
        cursor: pointer;
        padding: 0.75rem;
        border-radius: 10px;
        color: var(--color-text-secondary);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .expand-btn:hover {
        background: var(--color-primary);
        color: white;
        border-color: var(--color-primary);
        transform: scale(1.05);
    }

    .expand-btn svg {
        width: 1.5rem;
        height: 1.5rem;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        filter: drop-shadow(0 2px 4px currentColor);
    }

    .expand-btn.expanded svg {
        transform: rotate(180deg);
    }

    .config-content {
        padding: 2rem;
        animation: slideDown 0.3s ease-out;
        background: var(--color-bg-primary);
    }

    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .form-section {
        display: grid;
        gap: 2rem;
    }

    .input-group {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    label {
        font-weight: 700;
        color: var(--color-text-primary);
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .text-input,
    .select-input {
        padding: 1rem 1.5rem;
        border: 2px solid var(--color-border);
        border-radius: 12px;
        font-size: 1rem;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        background: var(--color-surface);
        color: var(--color-text-primary);
        font-weight: 500;
    }

    .text-input:focus,
    .select-input:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 4px rgba(0, 210, 255, 0.2);
        background: var(--color-surface-secondary);
    }

    .text-input::placeholder {
        color: var(--color-text-muted);
        opacity: 0.7;
    }

    .text-input.valid {
        border-color: var(--color-success);
        box-shadow: 0 0 0 3px rgba(0, 255, 136, 0.2);
    }

    .text-input.invalid {
        border-color: var(--color-danger);
        box-shadow: 0 0 0 3px rgba(255, 71, 87, 0.2);
    }

    .mono {
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 0.9rem;
        font-weight: 600;
    }

    .input-hint {
        font-size: 0.85rem;
        color: var(--color-text-muted);
        font-weight: 500;
        opacity: 0.9;
    }

    .input-hint .error {
        color: var(--color-danger);
        font-weight: 600;
    }

    .select-input {
        cursor: pointer;
    }

    .select-input option {
        background: var(--color-surface);
        color: var(--color-text-primary);
        padding: 0.5rem;
    }

    @media (max-width: 768px) {
        .config-header {
            padding: 1rem 1.5rem;
        }

        .config-content {
            padding: 1.5rem;
        }

        .config-title {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
        }

        .config-title h3 {
            font-size: 1.1rem;
        }

        .text-input,
        .select-input {
            padding: 0.75rem 1rem;
            font-size: 0.9rem;
        }
    }
</style>
