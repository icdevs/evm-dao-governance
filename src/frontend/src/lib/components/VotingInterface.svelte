<script>
    import { createEventDispatcher } from "svelte";
    import { authStore } from "../stores/auth.js";
    import { backend } from "../canisters.js";
    import {
        createSiweProofForVoting,
        getCurrentChainId,
    } from "../ethereum.js";

    export let proposal;

    const dispatch = createEventDispatcher();

    let isVoting = false;
    let error = null;
    let success = null;
    let userVote = null;
    let hasVoted = false;
    let selectedChoice = "Yes";

    // Load user's existing vote if they're authenticated
    $: if ($authStore.isAuthenticated && proposal) {
        loadUserVote();
    }

    async function loadUserVote() {
        try {
            const result = await backend.icrc149_get_user_vote(
                proposal.id,
                $authStore.walletAddress
            );

            if (result && result.length > 0) {
                hasVoted = true;
                const vote = result[0];
                if ("Yes" in vote) userVote = "Yes";
                else if ("No" in vote) userVote = "No";
                else if ("Abstain" in vote) userVote = "Abstain";
            }
        } catch (err) {
            console.error("Failed to load user vote:", err);
        }
    }

    async function handleVote() {
        if (!$authStore.isAuthenticated) {
            error = "Please connect your wallet first";
            return;
        }

        if (hasVoted) {
            error = "You have already voted on this proposal";
            return;
        }

        try {
            isVoting = true;
            error = null;
            success = null;

            // Get current chain ID
            const chainId = await getCurrentChainId();

            // Get snapshot contract from proposal (if available)
            const snapshotContract =
                proposal.snapshot?.contract_address ||
                (await getDefaultSnapshotContract());

            if (!snapshotContract) {
                throw new Error("No snapshot contract available for voting");
            }

            // Create SIWE proof for voting
            const siweProof = await createSiweProofForVoting(
                proposal.id,
                selectedChoice,
                snapshotContract,
                chainId
            );

            // Create witness (this would normally be generated from Ethereum state)
            // For now, we'll create a placeholder witness structure
            const witness = await createWitnessForVoting(
                $authStore.walletAddress,
                snapshotContract,
                chainId
            );

            // Submit vote
            const voteArgs = {
                proposal_id: proposal.id,
                choice: { [selectedChoice]: null },
                voter: new Uint8Array(
                    Buffer.from($authStore.walletAddress.slice(2), "hex")
                ),
                siwe: {
                    message: siweProof.message,
                    signature: siweProof.signature,
                },
                witness: witness,
            };

            const result = await backend.icrc149_vote_proposal(voteArgs);

            if ("Err" in result) {
                throw new Error(result.Err);
            }

            success = `Vote submitted successfully! Choice: ${selectedChoice}`;
            hasVoted = true;
            userVote = selectedChoice;

            dispatch("voteSubmitted", {
                proposalId: proposal.id,
                choice: selectedChoice,
            });
        } catch (err) {
            console.error("Failed to submit vote:", err);
            error = err.message || "Failed to submit vote";
        } finally {
            isVoting = false;
        }
    }

    async function getDefaultSnapshotContract() {
        try {
            const contracts = await backend.icrc149_get_snapshot_contracts();
            if (contracts.length > 0) {
                return contracts[0][0]; // Return first contract address
            }
        } catch (err) {
            console.error("Failed to get snapshot contracts:", err);
        }
        return null;
    }

    // Placeholder function for creating witness
    // In a real implementation, this would generate Merkle proofs from Ethereum state
    async function createWitnessForVoting(
        userAddress,
        contractAddress,
        chainId
    ) {
        // This is a placeholder - you would need to implement actual witness generation
        // that creates Merkle proofs of the user's token balance at the snapshot block
        return {
            accountProof: [new Uint8Array(32)], // Placeholder proof
            blockHash: new Uint8Array(32),
            blockNumber: 0,
            contractAddress: new Uint8Array(
                Buffer.from(contractAddress.slice(2), "hex")
            ),
            storageKey: new Uint8Array(32),
            storageProof: [new Uint8Array(32)],
            storageValue: new Uint8Array(32),
            userAddress: new Uint8Array(
                Buffer.from(userAddress.slice(2), "hex")
            ),
        };
    }

    function getChoiceVariant(choice) {
        switch (choice) {
            case "Yes":
                return { Yes: null };
            case "No":
                return { No: null };
            case "Abstain":
                return { Abstain: null };
            default:
                return { Yes: null };
        }
    }

    function isProposalActive() {
        return proposal && "open" in proposal.status;
    }

    function isProposalExpired() {
        if (!proposal) return false;
        const now = Date.now();
        const deadline = Number(proposal.deadline) / 1_000_000; // Convert from nanoseconds
        return now > deadline;
    }
</script>

<div class="voting-section">
    <h3>Cast Your Vote</h3>

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

    {#if !$authStore.isAuthenticated}
        <div class="auth-warning">
            <p>Connect your wallet to vote on this proposal.</p>
        </div>
    {:else if !isProposalActive()}
        <div class="status-warning">
            <p>
                {#if isProposalExpired()}
                    This proposal has expired and is no longer accepting votes.
                {:else}
                    This proposal is not currently open for voting.
                {/if}
            </p>
        </div>
    {:else if hasVoted}
        <div class="vote-status voted">
            <div class="vote-indicator">
                <span class="vote-icon">✓</span>
                <span class="vote-text"
                    >You voted: <strong>{userVote}</strong></span
                >
            </div>
            <p class="vote-message">
                Thank you for participating in governance!
            </p>
        </div>
    {:else}
        <div class="voting-form">
            <div class="vote-options">
                <label class="vote-option">
                    <input
                        type="radio"
                        bind:group={selectedChoice}
                        value="Yes"
                        disabled={isVoting}
                    />
                    <span class="option-label yes">Yes</span>
                    <span class="option-description">Support this proposal</span
                    >
                </label>

                <label class="vote-option">
                    <input
                        type="radio"
                        bind:group={selectedChoice}
                        value="No"
                        disabled={isVoting}
                    />
                    <span class="option-label no">No</span>
                    <span class="option-description">Oppose this proposal</span>
                </label>

                <label class="vote-option">
                    <input
                        type="radio"
                        bind:group={selectedChoice}
                        value="Abstain"
                        disabled={isVoting}
                    />
                    <span class="option-label abstain">Abstain</span>
                    <span class="option-description">No strong preference</span>
                </label>
            </div>

            <div class="vote-actions">
                <button
                    class="vote-button"
                    on:click={handleVote}
                    disabled={isVoting || !selectedChoice}
                >
                    {#if isVoting}
                        Submitting Vote...
                    {:else}
                        Submit Vote
                    {/if}
                </button>
            </div>

            <div class="voting-info">
                <p class="info-text">
                    <strong>Note:</strong> Voting requires cryptographic proof of
                    your token holdings and cannot be changed once submitted.
                </p>
            </div>
        </div>
    {/if}
</div>

<style>
    .voting-section {
        padding: 1.5rem;
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border, #ddd);
        border-radius: var(--border-radius-lg, 12px);
        margin-top: 1.5rem;
    }

    h3 {
        margin: 0 0 1.5rem 0;
        color: var(--color-text-primary, #333);
        font-size: 1.3rem;
    }

    .alert {
        padding: 0.75rem 1rem;
        border-radius: var(--border-radius-md, 8px);
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

    .auth-warning,
    .status-warning {
        text-align: center;
        padding: 1.5rem;
        background: var(--color-surface-secondary, #f8f9fa);
        border-radius: var(--border-radius-md, 8px);
        color: var(--color-text-secondary, #666);
    }

    .auth-warning p,
    .status-warning p {
        margin: 0;
        font-size: 1rem;
    }

    .vote-status.voted {
        text-align: center;
        padding: 1.5rem;
        background: var(--color-success-light, #d4edda);
        border: 1px solid var(--color-success-border, #c3e6cb);
        border-radius: var(--border-radius-md, 8px);
        color: var(--color-success, #155724);
    }

    .vote-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
    }

    .vote-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        background: var(--color-success, #28a745);
        color: white;
        border-radius: 50%;
        font-size: 1.2rem;
        font-weight: bold;
    }

    .vote-text {
        font-size: 1.1rem;
        font-weight: 600;
    }

    .vote-message {
        margin: 0;
        font-size: 0.9rem;
        opacity: 0.9;
    }

    .voting-form {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .vote-options {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .vote-option {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        border: 2px solid var(--color-border, #ddd);
        border-radius: var(--border-radius-md, 8px);
        cursor: pointer;
        transition: all 0.2s ease;
        background: var(--color-surface, #fff);
    }

    .vote-option:hover {
        border-color: var(--color-primary, #007bff);
        background: var(--color-surface-secondary, #f8f9fa);
    }

    .vote-option input[type="radio"] {
        width: 1.2rem;
        height: 1.2rem;
        margin: 0;
        cursor: pointer;
    }

    .vote-option input[type="radio"]:checked + .option-label.yes {
        color: var(--color-success, #28a745);
    }

    .vote-option input[type="radio"]:checked + .option-label.no {
        color: var(--color-danger, #dc3545);
    }

    .vote-option input[type="radio"]:checked + .option-label.abstain {
        color: var(--color-secondary, #6c757d);
    }

    .option-label {
        font-weight: 600;
        font-size: 1.1rem;
        min-width: 80px;
    }

    .option-description {
        color: var(--color-text-secondary, #666);
        font-size: 0.9rem;
        flex: 1;
    }

    .vote-actions {
        display: flex;
        justify-content: center;
    }

    .vote-button {
        padding: 1rem 2rem;
        background: var(--color-primary, #007bff);
        color: white;
        border: none;
        border-radius: var(--border-radius-md, 8px);
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s ease;
        min-width: 160px;
    }

    .vote-button:hover:not(:disabled) {
        background: var(--color-primary-dark, #0056b3);
    }

    .vote-button:disabled {
        background: var(--color-secondary, #6c757d);
        cursor: not-allowed;
    }

    .voting-info {
        text-align: center;
        padding: 1rem;
        background: var(--color-info-light, #d1ecf1);
        border-radius: var(--border-radius-md, 8px);
        border: 1px solid rgba(23, 162, 184, 0.2);
    }

    .info-text {
        margin: 0;
        color: var(--color-info, #0c5460);
        font-size: 0.85rem;
        line-height: 1.4;
    }

    @media (max-width: 768px) {
        .voting-section {
            padding: 1rem;
        }

        .vote-option {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
            text-align: left;
        }

        .vote-option input[type="radio"] {
            align-self: flex-start;
        }

        .option-label {
            min-width: auto;
        }
    }
</style>
