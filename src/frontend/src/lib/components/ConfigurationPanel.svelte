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

    // Store subscriptions
    $: configData = $configStore;

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

            // Load current config values from store
            canisterId = configData.canisterId || "";
            environment = configData.environment || "local";
            contractAddress = configData.contractAddress || "";

            configLoaded = true;
        }
    });

    // Reactive statement to update local values when store changes
    $: if (configLoaded) {
        // Only update if values have actually changed to avoid loops
        if (canisterId !== configData.canisterId) {
            canisterId = configData.canisterId || "";
        }
        if (environment !== configData.environment) {
            environment = configData.environment || "local";
        }
        if (contractAddress !== configData.contractAddress) {
            contractAddress = configData.contractAddress || "";
        }
    }

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

    async function saveConfiguration() {
        // Save the configuration using individual updateField calls
        configStore.updateField("canisterId", canisterId);
        configStore.updateField("environment", environment);
        configStore.updateField("contractAddress", contractAddress);
        
        // The store will automatically calculate isConfigured
        
        try {
            // Initialize canister if needed
            // await initializeCanister(canisterId, environment);
            statusStore.add("Voting interface initialized!", "success");
        } catch (e) {
            statusStore.add(`Voting interface initialization failed: ${e.message}`, "error");
        }

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