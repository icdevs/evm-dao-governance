<script>
    import { configStore } from "../stores/config.js";
    import { statusStore } from "../stores/status.js";
    import { backend } from "../canisters.js";
    import { onMount } from "svelte";
    import { createEventDispatcher } from "svelte";
    import { browser } from "$app/environment";

    export let isExpanded = true; // Always expanded when used as standalone page
    export let onConfigurationComplete = null; // Callback for when config is complete

    const dispatch = createEventDispatcher();

    let canisterId = "";
    let environment = "local";
    let contractAddress = ""; // Start empty, will be populated from backend contracts

    // Available snapshot contracts from backend
    let availableContracts = [];
    let contractsLoading = false;

    // Add new contract form state
    let showAddContractForm = false;
    let newContractAddress = "";
    let newContractType = "ERC20";
    let newContractChainId = "31337";
    let newContractNetworkName = "anvil";
    let newContractRpcType = "custom"; // Changed from "local" to "custom"
    let newContractCustomUrl = "http://127.0.0.1:8545"; // Add custom URL field
    let newContractStorageSlot = "1";
    let addingContract = false;

    // Config loading state
    let configLoaded = false;

    onMount(async () => {
        if (browser) {
            // Wait for config to load
            await configStore.load();

            // Load current config values
            const currentConfig = $configStore;
            canisterId = currentConfig.canisterId || "";
            environment = currentConfig.environment || "local";
            contractAddress = currentConfig.contractAddress || "";

            configLoaded = true;
        }
    });

    async function loadAvailableContracts() {
        if (!canisterId) {
            console.log("loadAvailableContracts: No canister ID, skipping");
            return; // Can't load contracts without canister ID
        }

        console.log(
            "loadAvailableContracts: Loading contracts for canister:",
            canisterId
        );

        try {
            contractsLoading = true;
            const contracts = await backend.icrc149_get_snapshot_contracts();
            console.log(
                "loadAvailableContracts: Received contracts:",
                contracts
            );
            console.log(
                "loadAvailableContracts: First contract structure:",
                contracts[0]
            );

            availableContracts = contracts.map(([address, config]) => {
                console.log("Raw contract data:", { address, config });
                console.log(
                    "Address type:",
                    typeof address,
                    "Value:",
                    JSON.stringify(address)
                );
                console.log(
                    "Config contract_address:",
                    typeof config.contract_address,
                    "Value:",
                    JSON.stringify(config.contract_address)
                );

                // Use the address from the key, but fallback to config.contract_address if key is invalid
                let contractAddress = address;
                if (
                    !contractAddress ||
                    contractAddress === "" ||
                    !contractAddress.startsWith("0x")
                ) {
                    contractAddress = config.contract_address;
                }

                console.log("Final contract address:", contractAddress);

                // Check contract type safely
                let contractType = "Unknown";
                if (config.contract_type) {
                    if (config.contract_type.ERC20 !== undefined) {
                        contractType = "ERC20";
                    } else if (config.contract_type.ERC721 !== undefined) {
                        contractType = "ERC721";
                    } else {
                        contractType = "Other";
                    }
                }
                console.log("Contract type:", contractType);

                return {
                    address: contractAddress,
                    config,
                    label: `(${contractType}) ${contractAddress}`,
                };
            });

            console.log(
                "loadAvailableContracts: Mapped contracts:",
                availableContracts
            );

            // Check if current contract is valid (exists in the list)
            const currentContractValid =
                contractAddress &&
                availableContracts.some(
                    (contract) => contract.address === contractAddress
                );

            // If no contract is selected OR current contract is not in the list, select the first one
            if (
                (!contractAddress || !currentContractValid) &&
                availableContracts.length > 0
            ) {
                contractAddress = availableContracts[0].address;
                console.log(
                    "loadAvailableContracts: Auto-selected first contract:",
                    contractAddress
                );
                handleContractAddressChange(); // Trigger config update
            } else if (
                !currentContractValid &&
                availableContracts.length === 0
            ) {
                // Clear invalid contract if no contracts are available
                contractAddress = "";
                console.log(
                    "loadAvailableContracts: Cleared invalid contract, no contracts available"
                );
                handleContractAddressChange(); // Trigger config update
            }
        } catch (error) {
            console.error("Failed to load available contracts:", error);
            statusStore.add("Failed to load available contracts", "error");
        } finally {
            contractsLoading = false;
        }
    }

    async function addNewContract() {
        if (!newContractAddress || !isValidAddress(newContractAddress)) {
            statusStore.add("Please enter a valid contract address", "error");
            return;
        }

        try {
            addingContract = true;

            const contractConfig = {
                contract_address: newContractAddress,
                chain: {
                    chain_id: parseInt(newContractChainId),
                    network_name: newContractNetworkName,
                },
                rpc_service: {
                    rpc_type: newContractRpcType,
                    canister_id: "7hfb6-caaaa-aaaar-qadga-cai", // Default EVM RPC canister
                    custom_config: newContractRpcType === "custom" 
                        ? [["url", newContractCustomUrl]]
                        : [],
                },
                contract_type:
                    newContractType === "ERC20"
                        ? { ERC20: null }
                        : { ERC721: null },
                balance_storage_slot: parseInt(newContractStorageSlot),
                enabled: true,
            };

            const result =
                await backend.icrc149_update_snapshot_contract_config(
                    newContractAddress,
                    [contractConfig]
                );

            if ("Err" in result) {
                throw new Error(result.Err);
            }

            statusStore.add("Contract added successfully!", "success");

            // Reset form
            newContractAddress = "";
            newContractType = "ERC20";
            newContractChainId = "31337";
            newContractNetworkName = "anvil";
            newContractRpcType = "custom"; // Changed from "local" to "custom"
            newContractCustomUrl = "http://127.0.0.1:8545"; // Reset custom URL
            newContractStorageSlot = "1";
            showAddContractForm = false;

            // Reload contracts
            await loadAvailableContracts();
        } catch (error) {
            console.error("Failed to add contract:", error);
            statusStore.add(
                `Failed to add contract: ${error.message}`,
                "error"
            );
        } finally {
            addingContract = false;
        }
    }

    function isValidAddress(address) {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    function handleCanisterIdChange() {
        // Load available contracts when canister ID changes
        if (canisterId && isCanisterValid) {
            loadAvailableContracts();
        }
    }

    function handleEnvironmentChange() {
        // Update default contract address based on environment
        if (environment === "local") {
            contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
        } else {
            contractAddress = "";
        }
        // Just trigger validation, don't save automatically
    }

    function handleContractAddressChange() {
        // Just trigger validation, don't save automatically
    }

    function checkAndNotifyCompletion() {
        if (isConfigComplete && onConfigurationComplete) {
            onConfigurationComplete();
        }
    }

    function saveConfiguration() {
        // Save the configuration
        configStore.updateField("canisterId", canisterId);
        configStore.updateField("environment", environment);
        configStore.updateField("contractAddress", contractAddress);
        configStore.checkConfiguration();

        // Show success message
        statusStore.add("Configuration saved successfully!", "success");

        // Notify completion
        checkAndNotifyCompletion();
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

    // Load contracts when canister ID changes and is valid
    $: if (canisterId && isCanisterValid) {
        loadAvailableContracts();
    }
</script>

<div class="config-panel">
    {#if !isExpanded}
        <!-- Collapsible header - only show when not in standalone mode -->
        <div
            class="config-header"
            on:click={() => (isExpanded = true)}
            on:keydown={(e) => e.key === "Enter" && (isExpanded = true)}
            role="button"
            tabindex="0"
        >
            <div class="config-title">
                <h3>⚙️ Configuration</h3>
                <div class="config-status">
                    {#if isConfigComplete}
                        <span class="status-badge success">✓ Configured</span>
                    {:else}
                        <span class="status-badge warning"
                            >⚠ Setup Required</span
                        >
                    {/if}
                </div>
            </div>
            <button class="expand-btn">
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
    {/if}

    {#if isExpanded}
        <div class="config-content">
            {#if isExpanded === true}
                <!-- Show status header when in standalone mode -->
                <div class="standalone-header">
                    <div class="config-status-large">
                        {#if isConfigComplete}
                            <span class="status-badge success large"
                                >✓ Configuration Complete</span
                            >
                        {:else}
                            <span class="status-badge warning large"
                                >⚠ Setup Required</span
                            >
                        {/if}
                    </div>
                </div>
            {/if}
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
                    {#if contractsLoading}
                        <div class="loading-container">
                            <div class="spinner-small"></div>
                            <span>Loading available contracts...</span>
                        </div>
                    {:else}
                        <div class="contract-selector-group">
                            <select
                                id="contractAddress"
                                bind:value={contractAddress}
                                on:change={handleContractAddressChange}
                                class="select-input"
                            >
                                <option value=""
                                    >{availableContracts.length > 0
                                        ? "Select a governance token..."
                                        : "No contracts available - add one below"}</option
                                >
                                {#each availableContracts as contract}
                                    <option value={contract.address}>
                                        {contract.label}
                                    </option>
                                {/each}
                            </select>
                            <button
                                type="button"
                                class="add-contract-btn-inline"
                                on:click={() => (showAddContractForm = true)}
                                disabled={!canisterId || !isCanisterValid}
                                title="Add New Governance Contract"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M12 5V19M5 12H19"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div class="input-hint">
                            {#if !contractAddress && availableContracts.length > 0}
                                Choose the token contract for voting power
                            {:else if !contractAddress && availableContracts.length === 0}
                                Add a governance token contract to enable voting
                            {/if}
                        </div>
                    {/if}
                </div>

                <!-- Add Contract Form (Hidden by default) -->
                <div class="add-contract-section">
                    {#if showAddContractForm}
                        <div class="add-contract-form">
                            <div class="form-header">
                                <h4>Add New Governance Contract</h4>
                                <button
                                    type="button"
                                    class="close-btn"
                                    on:click={() =>
                                        (showAddContractForm = false)}
                                    disabled={addingContract}
                                >
                                    ✕
                                </button>
                            </div>

                            <div class="form-grid">
                                <div class="input-group">
                                    <label for="newContractAddress"
                                        >Contract Address</label
                                    >
                                    <input
                                        type="text"
                                        id="newContractAddress"
                                        bind:value={newContractAddress}
                                        placeholder="0x..."
                                        class="text-input mono"
                                        class:valid={isValidAddress(
                                            newContractAddress
                                        )}
                                        class:invalid={newContractAddress &&
                                            !isValidAddress(newContractAddress)}
                                        disabled={addingContract}
                                    />
                                </div>

                                <div class="input-group">
                                    <label for="newContractType"
                                        >Contract Type</label
                                    >
                                    <select
                                        id="newContractType"
                                        bind:value={newContractType}
                                        class="select-input"
                                        disabled={addingContract}
                                    >
                                        <option value="ERC20"
                                            >ERC20 Token</option
                                        >
                                        <option value="ERC721"
                                            >ERC721 NFT</option
                                        >
                                    </select>
                                </div>

                                <div class="input-group">
                                    <label for="newContractChainId"
                                        >Chain ID</label
                                    >
                                    <input
                                        type="number"
                                        id="newContractChainId"
                                        bind:value={newContractChainId}
                                        class="text-input"
                                        disabled={addingContract}
                                    />
                                </div>

                                <div class="input-group">
                                    <label for="newContractNetworkName"
                                        >Network Name</label
                                    >
                                    <input
                                        type="text"
                                        id="newContractNetworkName"
                                        bind:value={newContractNetworkName}
                                        placeholder="anvil, mainnet, sepolia..."
                                        class="text-input"
                                        disabled={addingContract}
                                    />
                                </div>

                                <div class="input-group">
                                    <label for="newContractRpcType"
                                        >RPC Service Type</label
                                    >
                                    <select
                                        id="newContractRpcType"
                                        bind:value={newContractRpcType}
                                        class="select-input"
                                        disabled={addingContract}
                                    >
                                        <option value="default"
                                            >Default (IC EVM RPC Service)</option
                                        >
                                        <option value="custom"
                                            >Custom RPC URL</option
                                        >
                                    </select>
                                    <div class="input-hint">
                                        Use default for production, custom for local development
                                    </div>
                                </div>

                                {#if newContractRpcType === "custom"}
                                    <div class="input-group">
                                        <label for="newContractCustomUrl"
                                            >Custom RPC URL</label
                                        >
                                        <input
                                            type="url"
                                            id="newContractCustomUrl"
                                            bind:value={newContractCustomUrl}
                                            placeholder="http://127.0.0.1:8545"
                                            class="text-input"
                                            disabled={addingContract}
                                        />
                                        <div class="input-hint">
                                            URL for custom Ethereum RPC endpoint
                                        </div>
                                    </div>
                                {/if}

                                <div class="input-group">
                                    <label for="newContractStorageSlot"
                                        >Balance Storage Slot</label
                                    >
                                    <input
                                        type="number"
                                        id="newContractStorageSlot"
                                        bind:value={newContractStorageSlot}
                                        class="text-input"
                                        disabled={addingContract}
                                    />
                                    <div class="input-hint">
                                        Storage slot for balance mapping
                                        (usually 1 for ERC20)
                                    </div>
                                </div>
                            </div>

                            <div class="form-actions">
                                <button
                                    type="button"
                                    class="cancel-btn"
                                    on:click={() =>
                                        (showAddContractForm = false)}
                                    disabled={addingContract}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    class="add-btn"
                                    on:click={addNewContract}
                                    disabled={!isValidAddress(
                                        newContractAddress
                                    ) || addingContract}
                                >
                                    {#if addingContract}
                                        <div class="spinner-small"></div>
                                        Adding...
                                    {:else}
                                        Add Contract
                                    {/if}
                                </button>
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Save Button -->
                <div class="save-section">
                    <button
                        class="save-btn"
                        on:click={saveConfiguration}
                        disabled={!isConfigComplete}
                        type="button"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                            <polyline
                                points="17,21 17,13 7,13 7,21"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                            <polyline
                                points="7,3 7,8 15,8"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                        {isConfigComplete
                            ? "Save Configuration"
                            : "Complete Setup to Save"}
                    </button>
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

    /* Standalone mode styles */
    .standalone-header {
        margin-bottom: 2rem;
        text-align: center;
    }

    .config-status-large {
        display: flex;
        justify-content: center;
    }

    .status-badge.large {
        padding: 1rem 2rem;
        font-size: 1.1rem;
        font-weight: 700;
    }

    /* Save Button Styles */
    .save-section {
        margin-top: 2rem;
        padding-top: 2rem;
        border-top: 1px solid var(--color-border-light);
        display: flex;
        justify-content: center;
    }

    .save-btn {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 2rem;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-success) 100%
        );
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 600;
        font-size: 1rem;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 16px rgba(0, 210, 255, 0.3);
        position: relative;
        overflow: hidden;
        min-width: 200px;
        justify-content: center;
    }

    .save-btn::before {
        content: "";
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
    }

    .save-btn:hover:not(:disabled)::before {
        left: 100%;
    }

    .save-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 210, 255, 0.4);
    }

    .save-btn:active:not(:disabled) {
        transform: translateY(0);
    }

    .save-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
        box-shadow: 0 2px 8px rgba(0, 210, 255, 0.2);
        background: linear-gradient(
            135deg,
            var(--color-text-muted) 0%,
            var(--color-border) 100%
        );
    }

    .save-btn svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
    }

    .loading-container {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        background: var(--color-surface-secondary, #f8f9fa);
        border: 1px solid var(--color-border, #ddd);
        border-radius: 8px;
        color: var(--color-text-secondary, #666);
    }

    .spinner-small {
        width: 16px;
        height: 16px;
        border: 2px solid var(--color-border, #ddd);
        border-top: 2px solid var(--color-primary, #007bff);
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

    /* Add Contract Form Styles */
    .add-contract-section {
        margin-top: 1.5rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--color-border-light, #e0e0e0);
    }

    .add-contract-form {
        background: var(--color-surface-secondary, #f8f9fa);
        border: 1px solid var(--color-border, #ddd);
        border-radius: 12px;
        padding: 1.5rem;
    }

    .form-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }

    .form-header h4 {
        margin: 0;
        color: var(--color-text-primary, #333);
        font-size: 1.1rem;
    }

    .close-btn {
        background: none;
        border: none;
        color: var(--color-text-secondary, #666);
        cursor: pointer;
        font-size: 1.2rem;
        padding: 0.25rem;
        transition: color 0.2s ease;
    }

    .close-btn:hover:not(:disabled) {
        color: var(--color-danger, #dc3545);
    }

    .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    .form-grid .input-group:first-child {
        grid-column: 1 / -1;
    }

    .form-actions {
        display: flex;
        gap: 1rem;
        justify-content: flex-end;
    }

    .cancel-btn {
        padding: 0.75rem 1.5rem;
        background: transparent;
        color: var(--color-text-secondary, #666);
        border: 1px solid var(--color-border, #ddd);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .cancel-btn:hover:not(:disabled) {
        background: var(--color-surface-secondary, #f8f9fa);
        border-color: var(--color-text-secondary, #666);
    }

    .add-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1.5rem;
        background: var(--color-primary, #007bff);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s ease;
    }

    .add-btn:hover:not(:disabled) {
        background: var(--color-primary-dark, #0056b3);
    }

    .add-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    /* Contract selector group with inline add button */
    .contract-selector-group {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .contract-selector-group select {
        flex: 1;
    }

    .add-contract-btn-inline {
        background: var(--color-primary, #007bff);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s ease;
        min-width: fit-content;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .add-contract-btn-inline svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
    }

    .add-contract-btn-inline:hover:not(:disabled) {
        background: var(--color-primary-dark, #0056b3);
        transform: translateY(-1px);
    }

    .add-contract-btn-inline:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    @media (max-width: 768px) {
        .form-grid {
            grid-template-columns: 1fr;
        }

        .form-actions {
            flex-direction: column;
        }

        .contract-selector-group {
            flex-direction: column;
            align-items: stretch;
            gap: 0.5rem;
        }

        .add-contract-btn-inline {
            width: 100%;
        }
    }
</style>
