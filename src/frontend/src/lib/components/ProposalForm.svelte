<script>
    import { createEventDispatcher } from "svelte";
    import { authStore } from "../stores/auth.js";
    import { backend } from "../canisters.js";
    import {
        createSiweProofForProposal,
        getCurrentChainId,
    } from "../ethereum.js";
    import {
        createTransferData,
        parseTokenAmount,
        isValidAddress,
        isValidAmount,
        getNetworkInfo,
    } from "../utils.js";

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

    // Update ERC20 data when helper fields change
    $: if (erc20Mode && proposalType === "eth_transaction") {
        if (erc20Recipient && erc20Amount) {
            try {
                const amount = parseTokenAmount(
                    erc20Amount,
                    parseInt(erc20Decimals)
                );
                ethData = createTransferData(erc20Recipient, amount);
                ethValue = "0"; // ERC20 transfers don't send ETH value
            } catch (error) {
                console.error("Failed to create transfer data:", error);
            }
        }
    }

    async function handleSubmit() {
        if (!$authStore.isAuthenticated) {
            error = "Please connect your wallet first";
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

            // Get current network info
            const chainId = await getCurrentChainId();
            const networkInfo = getNetworkInfo(chainId);

            // Create SIWE proof
            // Get the selected contract from the main page's governance selector
            const contracts = await backend.icrc149_get_snapshot_contracts();
            const contractAddress =
                contracts.length > 0 ? contracts[0][0] : null;

            if (!contractAddress) {
                throw new Error(
                    "No governance contract available. Please configure a contract in the settings first."
                );
            }

            const siweProof = await createSiweProofForProposal(
                contractAddress,
                chainId
            );

            // Build proposal object
            let proposal = {
                metadata,
                snapshotContract: contractAddress,
                siweProof,
            };

            switch (proposalType) {
                case "motion":
                    proposal.type = "motion";
                    proposal.motion = motionText;
                    break;

                case "eth_transaction":
                    proposal.type = "eth_transaction";
                    proposal.to = ethTo;
                    proposal.value = ethValue;
                    proposal.data = ethData || "0x";
                    proposal.chainId = chainId;
                    proposal.networkName = networkInfo.name
                        .toLowerCase()
                        .replace(/\s+/g, "_");
                    proposal.gasLimit = ethGasLimit;
                    proposal.maxFeePerGas = ethMaxFeePerGas;
                    proposal.maxPriorityFeePerGas = ethMaxPriorityFeePerGas;
                    break;

                case "icp_call":
                    proposal.type = "icp_call";
                    proposal.canister = icpCanister;
                    proposal.method = icpMethod;
                    proposal.args = icpArgs.startsWith("0x")
                        ? icpArgs
                        : `0x${icpArgs}`;
                    proposal.cycles = icpCycles;
                    break;
            }

            // Convert to Candid and submit
            const proposalData = {
                action: getActionVariant(proposal),
                metadata: proposal.metadata ? [proposal.metadata] : [],
                siwe: {
                    message: proposal.siweProof.message,
                    signature: proposal.siweProof.signature,
                },
                snapshot_contract: proposal.snapshotContract
                    ? [proposal.snapshotContract]
                    : [],
            };

            console.log("Submitting proposal:", proposalData);

            const result = await backend.icrc149_create_proposal(proposalData);

            if ("Err" in result) {
                throw new Error(result.Err);
            }

            success = `Proposal created successfully! ID: ${result.Ok}`;
            dispatch("proposalCreated", { id: result.Ok, proposal });

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

    function getActionVariant(proposal) {
        switch (proposal.type) {
            case "motion":
                return { Motion: proposal.motion };

            case "eth_transaction":
                return {
                    EthTransaction: {
                        to: proposal.to,
                        value: BigInt(proposal.value),
                        data: new Uint8Array(
                            Buffer.from(proposal.data.slice(2), "hex")
                        ),
                        chain: {
                            chain_id: BigInt(proposal.chainId),
                            network_name: proposal.networkName,
                        },
                        subaccount: [],
                        maxPriorityFeePerGas: BigInt(
                            proposal.maxPriorityFeePerGas
                        ),
                        maxFeePerGas: BigInt(proposal.maxFeePerGas),
                        gasLimit: BigInt(proposal.gasLimit),
                        signature: [],
                        nonce: [],
                    },
                };

            case "icp_call":
                return {
                    ICPCall: {
                        canister: proposal.canister,
                        method: proposal.method,
                        args: new Uint8Array(
                            Buffer.from(proposal.args.replace("0x", ""), "hex")
                        ),
                        cycles: BigInt(proposal.cycles),
                        best_effort_timeout: [],
                        result: [],
                    },
                };

            default:
                throw new Error(`Unknown proposal type: ${proposal.type}`);
        }
    }

    function toggleErc20Mode() {
        erc20Mode = !erc20Mode;
        if (!erc20Mode) {
            erc20Recipient = "";
            erc20Amount = "";
            ethData = "";
        }
    }
</script>

<div class="proposal-form">
    <h2>Create New Proposal</h2>

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
                disabled={isSubmitting}
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
                    disabled={isSubmitting}
                    required
                ></textarea>
            </div>
        {/if}

        <!-- Ethereum Transaction Fields -->
        {#if proposalType === "eth_transaction"}
            <div class="eth-transaction-section">
                <h3>Ethereum Transaction Details</h3>

                <!-- ERC20 Helper Toggle -->
                <div class="form-group">
                    <label class="checkbox-label">
                        <input
                            type="checkbox"
                            bind:checked={erc20Mode}
                            on:change={toggleErc20Mode}
                            disabled={isSubmitting}
                        />
                        Use ERC20 Token Transfer Helper
                    </label>
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
                                disabled={isSubmitting}
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
                                disabled={isSubmitting}
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
                                    disabled={isSubmitting}
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
                                    disabled={isSubmitting}
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
                            disabled={isSubmitting}
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
                            disabled={isSubmitting}
                        />
                    </div>

                    <div class="form-group">
                        <label for="ethData">Transaction Data (hex)</label>
                        <textarea
                            id="ethData"
                            bind:value={ethData}
                            placeholder="0x... (leave empty for simple transfer)"
                            rows="3"
                            disabled={isSubmitting}
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
                                disabled={isSubmitting}
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
                                disabled={isSubmitting}
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
                                disabled={isSubmitting}
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
                        disabled={isSubmitting}
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
                        disabled={isSubmitting}
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
                        disabled={isSubmitting}
                    ></textarea>
                </div>

                <div class="form-group">
                    <label for="icpCycles">Cycles</label>
                    <input
                        id="icpCycles"
                        type="number"
                        bind:value={icpCycles}
                        min="0"
                        disabled={isSubmitting}
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
                disabled={isSubmitting}
            ></textarea>
        </div>

        <!-- Submit Button -->
        <div class="form-actions">
            <button
                type="submit"
                class="submit-btn"
                disabled={isSubmitting || !$authStore.isAuthenticated}
            >
                {#if isSubmitting}
                    Creating Proposal...
                {:else}
                    Create Proposal
                {/if}
            </button>
        </div>
    </form>
</div>

<style>
    .proposal-form {
        width: 100%;
        margin: 0;
        padding: 2rem;
        background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            var(--color-surface-secondary) 100%
        );
        border: 1px solid var(--color-border);
        border-radius: 16px;
        position: relative;
        overflow: hidden;
    }

    .proposal-form::before {
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

    h2 {
        margin: 0 0 1.5rem 0;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid var(--color-border-light);
        color: var(--color-text-primary);
        font-size: 1.5rem;
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

    h3,
    h4 {
        margin: 1.5rem 0 1rem 0;
        color: var(--color-text-primary, #333);
        font-size: 1.1rem;
    }

    .alert {
        padding: 0.75rem 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
        font-size: 0.9rem;
    }

    .alert-error {
        background: var(--color-danger-light, #f8d7da);
        color: var(--color-danger, #721c24);
        border: 1px solid var(--color-danger-border, #f5c6cb);
    }

    .alert-success {
        background: var(--color-success-light, #d4edda);
        color: var(--color-success, #155724);
        border: 1px solid var(--color-success-border, #c3e6cb);
    }

    .form-group {
        margin-bottom: 1rem;
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
        color: var(--color-text-primary, #333);
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: normal;
        cursor: pointer;
    }

    input[type="checkbox"] {
        width: auto;
        margin: 0;
        accent-color: var(--color-primary);
        transform: scale(1.2);
    }

    /* Form controls use unified .form-control class styles from index.scss */

    textarea {
        resize: vertical;
        min-height: 100px;
    }

    .erc20-helper {
        padding: 1rem;
        background: var(--color-surface-secondary, #f8f9fa);
        border-radius: 8px;
        margin: 1rem 0;
    }

    .gas-settings {
        margin-top: 1.5rem;
        padding: 1rem;
        background: var(--color-surface-secondary, #f8f9fa);
        border-radius: 8px;
    }

    .form-actions {
        margin-top: 2rem;
        text-align: center;
    }

    .submit-btn {
        padding: 1rem 2rem;
        background: var(--color-primary, #007bff);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s;
        min-width: 200px;
    }

    .submit-btn:hover:not(:disabled) {
        background: var(--color-primary-dark, #0056b3);
    }

    .submit-btn:disabled {
        background: var(--color-secondary, #6c757d);
        cursor: not-allowed;
    }

    @media (max-width: 768px) {
        .proposal-form {
            padding: 1rem;
            margin: 1rem;
        }

        .form-row {
            grid-template-columns: 1fr;
        }
    }
</style>
