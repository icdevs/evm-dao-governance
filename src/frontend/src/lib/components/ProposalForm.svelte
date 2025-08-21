<script>
    import { createEventDispatcher, onMount } from "svelte";
    import { configStore } from "../stores/config.js";
    import { walletStore } from "../stores/wallet.js";
    import { agentStore } from "../stores/agent.js";
    import { backend } from "../canisters.js";
    import { createProposal } from "../votingAPI.js";
    import { isValidAddress } from "../utils.js";
    import { Principal } from "@dfinity/principal";
    import { Actor } from "@dfinity/agent";
    import { IDL, renderInput } from "@dfinity/candid";
    import { fetchActorFromCanister } from "../canisters.js";

    const dispatch = createEventDispatcher();

    // Form state
    let proposalType = "motion";
    let isSubmitting = false;
    let error = null;
    let success = null;

    // Motion proposal fields
    let motionText = "";

    // Ethereum transaction fields
    let ethTo = "";
    let ethValue = "0";
    let ethData = "";
    let ethGasLimit = "100000";
    let ethMaxFeePerGas = "2000000000";
    let ethMaxPriorityFeePerGas = "1000000000";

    // ERC20 transfer helper fields
    let erc20Mode = false;
    let erc20Recipient = "";
    let erc20Amount = "";
    let erc20Decimals = "18";

    // ICP call fields
    let icpCanister = "";
    let icpMethod = "";
    let icpArgs = "";
    let icpCycles = "0";

    // Dynamic ICP form state
    let icpMode = "dynamic"; // "dynamic" or "manual"
    let loadingCanister = false;
    let canisterActor = null;
    let availableMethods = [];
    let selectedMethod = "";
    let methodInputs = [];
    let argumentInputBoxes = [];

    // General fields
    let metadata = "";

    // Subscribe to stores
    $: config = $configStore;
    $: currentProvider = $walletStore.provider;
    $: currentSigner = $walletStore.signer;
    $: currentChainId = $walletStore.chainId;
    $: isAuthenticated = $walletStore.state === "connected";
    $: walletAddress = $walletStore.userAddress;
    $: agent = $agentStore.agent;

    // Check if all dependencies are available
    $: hasAllDependencies = !!(
        isAuthenticated &&
        walletAddress &&
        config.contractAddress &&
        currentProvider &&
        currentSigner &&
        currentChainId &&
        backend
    );

    async function loadCanisterInterface() {
        if (!icpCanister.trim()) {
            error = "Please enter a canister ID";
            return;
        }
        if (!agent) {
            error = "Agent is not available";
            return;
        }

        try {
            loadingCanister = true;
            error = null;

            const canisterId = Principal.fromText(icpCanister);
            canisterActor = await fetchActorFromCanister(agent, canisterId);

            if (canisterActor) {
                const interface_ = Actor.interfaceOf(canisterActor);
                availableMethods = interface_._fields
                    .map(([name, func]) => ({ name, func }))
                    .sort((a, b) => a.name.localeCompare(b.name));

                selectedMethod = "";
                methodInputs = [];
                argumentInputBoxes = [];
            }
        } catch (err) {
            console.error("Failed to load canister interface:", err);
            error = `Failed to load canister: ${err.message}`;
            canisterActor = null;
            availableMethods = [];
        } finally {
            loadingCanister = false;
        }
    }

    function selectMethod(methodName) {
        selectedMethod = methodName;
        const method = availableMethods.find((m) => m.name === methodName);

        if (method) {
            // Create input boxes for each argument
            argumentInputBoxes = method.func.argTypes.map((argType) => {
                const inputBox = renderInput(argType);
                return {
                    type: argType,
                    inputBox,
                    element: null,
                };
            });
        } else {
            argumentInputBoxes = [];
        }
    }

    function getMethodArguments() {
        if (icpMode === "manual") {
            return icpArgs;
        }

        // Parse arguments from dynamic form
        const args = argumentInputBoxes.map((argBox) => {
            return argBox.inputBox.parse();
        });

        // Check if any arguments are rejected
        const hasErrors = argumentInputBoxes.some((argBox) =>
            argBox.inputBox.isRejected()
        );
        if (hasErrors) {
            throw new Error("Invalid arguments provided");
        }

        // Convert to candid blob hex
        const method = availableMethods.find((m) => m.name === selectedMethod);
        if (method) {
            const encoded = IDL.encode(method.func.argTypes, args);
            return Array.from(encoded)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
        }

        return "";
    }

    async function handleSubmit() {
        if (!isAuthenticated) {
            error = "Please connect your wallet first";
            return;
        }

        if (!hasAllDependencies) {
            error =
                "Missing required dependencies. Please ensure wallet is connected and configuration is complete.";
            return;
        }

        try {
            isSubmitting = true;
            error = null;
            success = null;

            // Validate form based on proposal type
            if (!validateForm()) {
                return;
            }

            // Prepare proposal data based on type
            const proposalData = {
                type: proposalType,
                metadata: metadata,
            };

            // Add type-specific fields
            switch (proposalType) {
                case "motion":
                    proposalData.motionText = motionText;
                    break;

                case "eth_transaction":
                    proposalData.ethTo = ethTo;
                    proposalData.ethValue = ethValue;
                    proposalData.ethData = ethData;
                    proposalData.ethGasLimit = ethGasLimit;
                    proposalData.ethMaxFeePerGas = ethMaxFeePerGas;
                    proposalData.ethMaxPriorityFeePerGas =
                        ethMaxPriorityFeePerGas;

                    // ERC20 helper fields
                    if (erc20Mode) {
                        proposalData.erc20Mode = true;
                        proposalData.erc20Recipient = erc20Recipient;
                        proposalData.erc20Amount = erc20Amount;
                        proposalData.erc20Decimals = erc20Decimals;
                    }
                    break;

                case "icp_call":
                    proposalData.icpCanister = icpCanister;
                    proposalData.icpMethod =
                        icpMode === "dynamic" ? selectedMethod : icpMethod;
                    proposalData.icpArgs = getMethodArguments();
                    proposalData.icpCycles = icpCycles;
                    break;
            }

            // Prepare dependencies object for votingAPI
            const dependencies = {
                backendActor: backend,
                userAddress: walletAddress,
                contractAddress: config.contractAddress,
                chainId: currentChainId,
                signer: currentSigner,
                provider: currentProvider,
            };

            // Create proposal using votingAPI with dependencies
            const result = await createProposal(proposalData, dependencies);

            success = `Proposal created successfully! ID: ${result.id}`;
            dispatch("proposalCreated", result);

            // Reset form
            resetForm();
        } catch (err) {
            console.error("Failed to create proposal:", err);
            error = err.message || "Failed to create proposal";
        } finally {
            isSubmitting = false;
        }
    }

    function validateForm() {
        switch (proposalType) {
            case "motion":
                if (!motionText.trim()) {
                    error = "Motion text is required";
                    return false;
                }
                break;

            case "eth_transaction":
                if (!isValidAddress(ethTo)) {
                    error = "Invalid recipient address";
                    return false;
                }
                if (erc20Mode) {
                    if (!isValidAddress(erc20Recipient)) {
                        error = "Invalid ERC20 recipient address";
                        return false;
                    }
                    if (!erc20Amount || parseFloat(erc20Amount) <= 0) {
                        error = "Invalid ERC20 amount";
                        return false;
                    }
                }
                break;

            case "icp_call":
                if (!icpCanister.trim()) {
                    error = "Canister ID is required";
                    return false;
                }

                if (icpMode === "dynamic") {
                    if (!selectedMethod) {
                        error = "Please select a method";
                        return false;
                    }
                } else {
                    if (!icpMethod.trim()) {
                        error = "Method name is required";
                        return false;
                    }
                }
                break;
        }
        return true;
    }

    function resetForm() {
        motionText = "";
        ethTo = "";
        ethValue = "0";
        ethData = "";
        erc20Mode = false;
        erc20Recipient = "";
        erc20Amount = "";
        icpCanister = "";
        icpMethod = "";
        icpArgs = "";
        icpMode = "dynamic";
        canisterActor = null;
        availableMethods = [];
        selectedMethod = "";
        argumentInputBoxes = [];
        metadata = "";
    }

    // Reactive statement to reset ERC20 fields when unchecked
    $: if (!erc20Mode) {
        erc20Recipient = "";
        erc20Amount = "";
        ethData = "";
    }

    // Reset ICP form when mode changes
    $: if (icpMode === "dynamic") {
        icpMethod = "";
        icpArgs = "";
    } else {
        canisterActor = null;
        availableMethods = [];
        selectedMethod = "";
        argumentInputBoxes = [];
    }

    // Reference to the arguments container
    let argumentsContainer;

    $: if (argumentsContainer) {
        argumentsContainer.innerHTML = "";
        if (argumentInputBoxes && argumentInputBoxes.length > 0) {
            argumentInputBoxes.forEach((argBox, index) => {
                const wrapper = document.createElement("div");
                wrapper.className = "method-arg-group";
                const label = document.createElement("label");
                label.textContent = `Argument ${index + 1} (${argBox.type.display()})`;
                wrapper.appendChild(label);
                if (argBox.inputBox && argBox.inputBox.render) {
                    argBox.inputBox.render(wrapper);
                }
                argumentsContainer.appendChild(wrapper);
            });
        } else {
            const noneDiv = document.createElement("div");
            noneDiv.className = "method-arg-group";
            noneDiv.textContent = "None";
            argumentsContainer.appendChild(noneDiv);
        }
    }
</script>

<div class="proposal-form">
    <h2>Create New Proposal</h2>

    {#if !hasAllDependencies}
        <div class="alert alert-warning">
            <p>
                Please ensure wallet is connected and configuration is complete
                before creating proposals.
            </p>
        </div>
    {/if}

    {#if error}
        <div class="alert alert-error">
            {error}
        </div>
    {/if}

    {#if success}
        <div class="alert alert-success">
            {success}
        </div>
    {/if}

    <form on:submit|preventDefault={handleSubmit}>
        <!-- Proposal Type Selection -->
        <div class="form-group">
            <label for="proposalType">Proposal Type</label>
            <select
                id="proposalType"
                class="form-control"
                bind:value={proposalType}
                disabled={isSubmitting || !hasAllDependencies}
            >
                <option value="motion"
                    >Motion (Text-only governance decision)</option
                >
                <option value="eth_transaction">Ethereum Transaction</option>
                <option value="icp_call">ICP Canister Call</option>
            </select>
        </div>

        <!-- Motion Proposal Fields -->
        {#if proposalType === "motion"}
            <div class="form-group">
                <label for="motionText">Motion Text</label>
                <textarea
                    id="motionText"
                    class="form-control"
                    bind:value={motionText}
                    placeholder="Describe the motion for the DAO to vote on..."
                    rows="4"
                    disabled={isSubmitting || !hasAllDependencies}
                    required
                ></textarea>
            </div>
        {/if}

        <!-- Ethereum Transaction Fields -->
        {#if proposalType === "eth_transaction"}
            <div class="eth-transaction-section">
                <h3>Ethereum Transaction Details</h3>

                <!-- ERC20/Manual Mode Toggle -->
                <fieldset class="form-group">
                    <legend>Transaction Mode</legend>
                    <div class="toggle-group">
                        <button
                            type="button"
                            class:active={!erc20Mode}
                            on:click={() => (erc20Mode = false)}
                            disabled={isSubmitting || !hasAllDependencies}
                            >Manual</button
                        >
                        <button
                            type="button"
                            class:active={erc20Mode}
                            on:click={() => (erc20Mode = true)}
                            disabled={isSubmitting || !hasAllDependencies}
                            >ERC20 Token</button
                        >
                    </div>
                </fieldset>

                {#if erc20Mode}
                    <!-- ERC20 Transfer Helper -->
                    <div class="erc20-helper">
                        <div class="form-group">
                            <label for="erc20Contract"
                                >Token Contract Address</label
                            >
                            <input
                                id="erc20Contract"
                                type="text"
                                bind:value={ethTo}
                                placeholder="0x..."
                                disabled={isSubmitting || !hasAllDependencies}
                                required
                            />
                        </div>

                        <div class="form-group">
                            <label for="erc20Recipient">Recipient Address</label
                            >
                            <input
                                id="erc20Recipient"
                                type="text"
                                bind:value={erc20Recipient}
                                placeholder="0x..."
                                disabled={isSubmitting || !hasAllDependencies}
                                required
                            />
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="erc20Amount">Amount</label>
                                <input
                                    id="erc20Amount"
                                    type="number"
                                    bind:value={erc20Amount}
                                    step="any"
                                    min="0"
                                    placeholder="1.0"
                                    disabled={isSubmitting ||
                                        !hasAllDependencies}
                                    required
                                />
                            </div>

                            <div class="form-group">
                                <label for="erc20Decimals">Token Decimals</label
                                >
                                <input
                                    id="erc20Decimals"
                                    type="number"
                                    bind:value={erc20Decimals}
                                    min="0"
                                    max="18"
                                    disabled={isSubmitting ||
                                        !hasAllDependencies}
                                />
                            </div>
                        </div>
                    </div>
                {:else}
                    <!-- Manual Transaction Fields -->
                    <div class="form-group">
                        <label for="ethTo">To Address</label>
                        <input
                            id="ethTo"
                            type="text"
                            bind:value={ethTo}
                            placeholder="0x..."
                            disabled={isSubmitting || !hasAllDependencies}
                            required
                        />
                    </div>

                    <div class="form-group">
                        <label for="ethValue">ETH Value (wei)</label>
                        <input
                            id="ethValue"
                            type="number"
                            bind:value={ethValue}
                            min="0"
                            disabled={isSubmitting || !hasAllDependencies}
                        />
                    </div>

                    <div class="form-group">
                        <label for="ethData">Transaction Data (hex)</label>
                        <textarea
                            id="ethData"
                            bind:value={ethData}
                            placeholder="0x... (leave empty for simple transfer)"
                            rows="3"
                            disabled={isSubmitting || !hasAllDependencies}
                        ></textarea>
                    </div>
                {/if}

                <!-- Gas Settings -->
                <div class="gas-settings">
                    <h4>Gas Settings</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="ethGasLimit">Gas Limit</label>
                            <input
                                id="ethGasLimit"
                                type="number"
                                bind:value={ethGasLimit}
                                min="21000"
                                disabled={isSubmitting || !hasAllDependencies}
                            />
                        </div>

                        <div class="form-group">
                            <label for="ethMaxFeePerGas"
                                >Max Fee Per Gas (wei)</label
                            >
                            <input
                                id="ethMaxFeePerGas"
                                type="number"
                                bind:value={ethMaxFeePerGas}
                                min="0"
                                disabled={isSubmitting || !hasAllDependencies}
                            />
                        </div>

                        <div class="form-group">
                            <label for="ethMaxPriorityFeePerGas"
                                >Max Priority Fee Per Gas (wei)</label
                            >
                            <input
                                id="ethMaxPriorityFeePerGas"
                                type="number"
                                bind:value={ethMaxPriorityFeePerGas}
                                min="0"
                                disabled={isSubmitting || !hasAllDependencies}
                            />
                        </div>
                    </div>
                </div>
            </div>
        {/if}

        <!-- ICP Call Fields -->
        {#if proposalType === "icp_call"}
            <div class="icp-call-section">
                <h3>ICP Canister Call Details</h3>

                <!-- Dynamic/Manual Mode Toggle -->
                <fieldset class="form-group">
                    <legend>Input Mode</legend>
                    <div class="toggle-group">
                        <button
                            type="button"
                            class:active={icpMode === "dynamic"}
                            on:click={() => (icpMode = "dynamic")}
                            disabled={isSubmitting || !hasAllDependencies}
                            >Dynamic Form</button
                        >
                        <button
                            type="button"
                            class:active={icpMode === "manual"}
                            on:click={() => (icpMode = "manual")}
                            disabled={isSubmitting || !hasAllDependencies}
                            >Manual</button
                        >
                    </div>
                </fieldset>

                <div class="form-group">
                    <label for="icpCanister">Canister ID</label>
                    <div class="canister-input-group">
                        <input
                            id="icpCanister"
                            type="text"
                            bind:value={icpCanister}
                            placeholder="rdmx6-jaaaa-aaaaa-aaadq-cai"
                            disabled={isSubmitting || !hasAllDependencies}
                            required
                        />
                        {#if icpMode === "dynamic"}
                            <button
                                type="button"
                                class="load-canister-btn"
                                on:click={loadCanisterInterface}
                                disabled={isSubmitting ||
                                    !hasAllDependencies ||
                                    loadingCanister ||
                                    !icpCanister.trim()}
                            >
                                {#if loadingCanister}
                                    Loading...
                                {:else}
                                    Load Interface
                                {/if}
                            </button>
                        {/if}
                    </div>
                </div>

                {#if icpMode === "dynamic"}
                    <!-- Dynamic Interface -->
                    {#if availableMethods.length > 0}
                        <div class="form-group">
                            <label for="methodSelect">Method</label>
                            <select
                                id="methodSelect"
                                class="form-control"
                                bind:value={selectedMethod}
                                on:change={() => selectMethod(selectedMethod)}
                                disabled={isSubmitting || !hasAllDependencies}
                                required
                            >
                                <option value="">Select a method...</option>
                                {#each availableMethods as method}
                                    <option value={method.name}>
                                        {method.name}
                                    </option>
                                {/each}
                            </select>
                        </div>

                        {#if selectedMethod}
                            <div class="method-arguments">
                                <h4>Method Arguments</h4>
                                <div
                                    class="arguments-container"
                                    bind:this={argumentsContainer}
                                ></div>
                            </div>
                        {/if}
                    {:else if canisterActor !== null}
                        <div class="alert alert-warning">
                            <p>
                                No methods found or canister interface could not
                                be loaded.
                            </p>
                        </div>
                    {/if}
                {:else}
                    <!-- Manual Mode -->
                    <div class="form-group">
                        <label for="icpMethod">Method Name</label>
                        <input
                            id="icpMethod"
                            type="text"
                            bind:value={icpMethod}
                            placeholder="transfer"
                            disabled={isSubmitting || !hasAllDependencies}
                            required
                        />
                    </div>

                    <div class="form-group">
                        <label for="icpArgs">Arguments (Candid blob hex)</label>
                        <textarea
                            id="icpArgs"
                            bind:value={icpArgs}
                            placeholder="4449444c..."
                            rows="3"
                            disabled={isSubmitting || !hasAllDependencies}
                        ></textarea>
                    </div>
                {/if}

                <div class="form-group">
                    <label for="icpCycles">Cycles</label>
                    <input
                        id="icpCycles"
                        type="number"
                        bind:value={icpCycles}
                        min="0"
                        disabled={isSubmitting || !hasAllDependencies}
                    />
                </div>
            </div>
        {/if}

        <!-- General Fields -->
        <div class="form-group">
            <label for="metadata">Description</label>
            <textarea
                id="metadata"
                bind:value={metadata}
                placeholder="Provide additional context for this proposal..."
                rows="3"
                disabled={isSubmitting || !hasAllDependencies}
            ></textarea>
        </div>

        <!-- Submit Button -->
        <div class="form-actions">
            <button
                type="submit"
                class="submit-btn"
                disabled={isSubmitting || !hasAllDependencies}
            >
                {#if isSubmitting}
                    Creating Proposal...
                {:else if !hasAllDependencies}
                    Connect Wallet & Configure
                {:else}
                    Create Proposal
                {/if}
            </button>
        </div>
    </form>
</div>

<style>
    .proposal-form {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 2rem;
        margin-bottom: 2rem;
    }

    h2 {
        margin: 0 0 2rem 0;
        color: var(--color-text-primary);
        font-size: 1.5rem;
        font-weight: 700;
    }

    h3 {
        margin: 0 0 1.5rem 0;
        color: var(--color-text-primary);
        font-size: 1.25rem;
        font-weight: 600;
    }

    h4 {
        margin: 0 0 1rem 0;
        color: var(--color-text-secondary);
        font-size: 1.1rem;
        font-weight: 600;
    }

    .alert {
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
        font-weight: 500;
    }

    .alert-error {
        background: var(--color-danger-light);
        color: var(--color-danger);
        border: 1px solid rgba(255, 71, 87, 0.3);
    }

    .alert-success {
        background: var(--color-success-light);
        color: var(--color-success);
        border: 1px solid rgba(0, 255, 136, 0.3);
    }

    .alert-warning {
        background: var(--color-warning-light);
        color: var(--color-warning);
        border: 1px solid rgba(255, 184, 0, 0.3);
    }

    .form-group {
        margin-bottom: 1.5rem;
    }

    .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }

    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 600;
        color: var(--color-text-primary);
        font-size: 0.9rem;
    }

    .form-control,
    input,
    select,
    textarea {
        width: 100%;
        padding: 0.75rem;
        background: var(--color-surface-secondary);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        color: var(--color-text-primary);
        font-size: 0.9rem;
        transition: all 0.3s ease;
    }

    .form-control:focus,
    input:focus,
    select:focus,
    textarea:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px rgba(0, 210, 255, 0.2);
    }

    .form-control:disabled,
    input:disabled,
    select:disabled,
    textarea:disabled {
        background: var(--color-bg-secondary);
        color: var(--color-text-muted);
        border-color: var(--color-border-light);
        cursor: not-allowed;
        opacity: 0.6;
    }

    .eth-transaction-section,
    .icp-call-section {
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-light);
        border-radius: 8px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
    }

    .erc20-helper {
        background: rgba(0, 210, 255, 0.05);
        border: 1px solid rgba(0, 210, 255, 0.2);
        border-radius: 8px;
        padding: 1.5rem;
        margin-top: 1rem;
    }

    .gas-settings {
        margin-top: 1.5rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--color-border-light);
    }

    .form-actions {
        display: flex;
        justify-content: center;
        margin-top: 2rem;
        padding-top: 2rem;
        border-top: 1px solid var(--color-border-light);
    }

    .submit-btn {
        padding: 1rem 2rem;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-primary-dark) 100%
        );
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 16px rgba(0, 210, 255, 0.3);
        min-width: 200px;
    }

    .submit-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 210, 255, 0.4);
    }

    .submit-btn:disabled {
        background: var(--color-text-muted);
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
        opacity: 0.6;
    }

    .toggle-group {
        display: flex;
        gap: 1rem;
        margin-top: 0.5rem;
    }

    .toggle-group button {
        padding: 0.5rem 1.5rem;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-surface-secondary);
        color: var(--color-text-primary);
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        outline: none;
    }

    .toggle-group button.active,
    .toggle-group button:active {
        background: var(--color-primary);
        color: white;
        border-color: var(--color-primary);
    }

    .toggle-group button:disabled {
        background: var(--color-bg-secondary);
        color: var(--color-text-muted);
        border-color: var(--color-border-light);
        cursor: not-allowed;
        opacity: 0.6;
    }

    .canister-input-group {
        display: flex;
        gap: 0.5rem;
        align-items: stretch;
    }

    .canister-input-group input {
        flex: 1;
    }

    .load-canister-btn {
        padding: 0.75rem 1rem;
        background: var(--color-primary);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
    }

    .load-canister-btn:hover:not(:disabled) {
        background: var(--color-primary-dark);
    }

    .load-canister-btn:disabled {
        background: var(--color-text-muted);
        cursor: not-allowed;
        opacity: 0.6;
    }

    .method-arguments {
        background: rgba(0, 210, 255, 0.05);
        border: 1px solid rgba(0, 210, 255, 0.2);
        border-radius: 8px;
        padding: 1.5rem;
        margin-top: 1rem;
    }

    .arguments-container {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    :global(.method-arg-group) {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 1rem;
    }

    :global(.method-arg-group label) {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 600;
        color: var(--color-text-primary);
        font-size: 0.85rem;
    }

    :global(.method-arg-group input),
    :global(.method-arg-group textarea),
    :global(.method-arg-group select) {
        width: 100%;
        padding: 0.5rem;
        background: var(--color-surface-secondary);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        color: var(--color-text-primary);
        font-size: 0.85rem;
    }

    @media (max-width: 768px) {
        .proposal-form {
            padding: 1.5rem;
        }

        .form-row {
            grid-template-columns: 1fr;
        }

        .eth-transaction-section,
        .icp-call-section {
            padding: 1rem;
        }

        .erc20-helper {
            padding: 1rem;
        }

        .method-arguments {
            padding: 1rem;
        }

        .canister-input-group {
            flex-direction: column;
        }

        .load-canister-btn {
            align-self: stretch;
        }
    }
</style>
