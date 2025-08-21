<script>
    import { createEventDispatcher } from "svelte";
    import { configStore } from "../stores/config.js";
    import { walletStore } from "../stores/wallet.js";
    import { backend } from "../canisters.js";
    import { createProposal } from "../votingAPI.js";
    import { isValidAddress } from "../utils.js";

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

    // General fields
    let metadata = "";

    // Subscribe to stores
    $: config = $configStore;
    $: currentProvider = $walletStore.provider;
    $: currentSigner = $walletStore.signer;
    $: currentChainId = $walletStore.chainId;
    $: isAuthenticated = $walletStore.state === "connected";
    $: walletAddress = $walletStore.userAddress;

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
                    proposalData.icpMethod = icpMethod;
                    proposalData.icpArgs = icpArgs;
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
                if (!icpMethod.trim()) {
                    error = "Method name is required";
                    return false;
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
        metadata = "";
    }

    // Reactive statement to reset ERC20 fields when unchecked
    $: if (!erc20Mode) {
        erc20Recipient = "";
        erc20Amount = "";
        ethData = "";
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
                <div class="form-group">
                    <label>Transaction Mode</label>
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
                </div>

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

                <div class="form-group">
                    <label for="icpCanister">Canister ID</label>
                    <input
                        id="icpCanister"
                        type="text"
                        bind:value={icpCanister}
                        placeholder="rdmx6-jaaaa-aaaaa-aaadq-cai"
                        disabled={isSubmitting || !hasAllDependencies}
                        required
                    />
                </div>

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

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
    }

    .checkbox-label input[type="checkbox"] {
        margin: 0;
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
    }
</style>
