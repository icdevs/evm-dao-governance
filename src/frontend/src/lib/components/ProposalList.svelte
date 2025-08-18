<script>
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { proposalsStore } from "../stores/proposals.js";
    import { getNetworkInfo } from "../utils.js";

    let filter = "any"; // any, active, executed, expired, pending, rejected

    const filterOptions = [
        { value: "any", label: "All Proposals" },
        { value: "active", label: "Active" },
        { value: "pending", label: "Pending" },
        { value: "executed", label: "Executed" },
        { value: "expired", label: "Expired" },
        { value: "rejected", label: "Rejected" },
    ];

    // Subscribe to proposals store
    $: ({ proposals, loading, error } = $proposalsStore);

    // Filter proposals based on selected filter
    $: filteredProposals =
        filter === "any"
            ? proposals
            : proposals.filter((proposal) => {
                  switch (filter) {
                      case "active":
                          return proposal.isActive;
                      case "executed":
                          return proposal.isExecuted;
                      case "pending":
                          return proposal.isPending;
                      case "expired":
                          return proposal.isExpired;
                      case "rejected":
                          return proposal.isRejected;
                      default:
                          return true;
                  }
              });

    onMount(() => {
        loadProposals();
    });

    async function loadProposals() {
        try {
            await proposalsStore.load();
        } catch (err) {
            console.error("Failed to load proposals:", err);
        }
    }

    function getActionTypeDisplay(action) {
        if (action.Motion) return "Motion";
        if (action.EthTransaction) return "Ethereum Transaction";
        if (action.ICPCall) return "ICP Call";
        return "Unknown";
    }

    function getActionDetails(action) {
        if (action.Motion) {
            return action.Motion;
        }
        if (action.EthTransaction) {
            const tx = action.EthTransaction;
            const networkInfo = getNetworkInfo(Number(tx.chain.chain_id));
            return `To: ${tx.to.slice(0, 10)}... on ${networkInfo.name}`;
        }
        if (action.ICPCall) {
            const call = action.ICPCall;
            return `${call.method} on ${call.canister}`;
        }
        return "Unknown action";
    }

    function getStatusBadgeClass(proposal) {
        if (proposal.isExecuted) return "status-executed";
        if (proposal.isFailed) return "status-failed";
        if (proposal.isExecuting) return "status-executing";
        if (proposal.isActive) return "status-active";
        return "status-pending";
    }

    function getStatusText(proposal) {
        if (proposal.isExecuted) return "Executed";
        if (proposal.isFailed) return "Failed";
        if (proposal.isExecuting) return "Executing";
        if (proposal.isActive) return "Active";
        return "Pending";
    }

    function getTallyPercentage(votes, total) {
        if (total === 0) return 0;
        return Math.round((Number(votes) / Number(total)) * 100);
    }

    function formatDate(date) {
        return date.toLocaleDateString() + " " + date.toLocaleTimeString();
    }
</script>

<div class="proposal-list">
    <div class="list-header">
        <h2>DAO Proposals</h2>

        <div class="filter-section">
            <label for="statusFilter">Filter by status:</label>
            <select id="statusFilter" class="form-control" bind:value={filter}>
                {#each filterOptions as option}
                    <option value={option.value}>{option.label}</option>
                {/each}
            </select>
        </div>
    </div>

    {#if error}
        <div class="alert alert-error">
            {error}
        </div>
    {/if}

    {#if loading}
        <div class="loading">
            <div class="spinner"></div>
            Loading proposals...
        </div>
    {:else if filteredProposals.length === 0}
        <div class="empty-state">
            <p>No proposals found.</p>
        </div>
    {:else}
        <div class="proposals">
            {#each filteredProposals as proposal}
                <div class="proposal-card">
                    <div class="proposal-header">
                        <div class="proposal-id">
                            <span class="id-label">#{proposal.id}</span>
                            <span class="action-type"
                                >{getActionTypeDisplay(proposal.action)}</span
                            >
                        </div>

                        <div class="proposal-status">
                            <span
                                class="status-badge {getStatusBadgeClass(
                                    proposal
                                )}"
                            >
                                {getStatusText(proposal)}
                            </span>
                        </div>
                    </div>

                    <div class="proposal-content">
                        <div class="action-details">
                            {getActionDetails(proposal.action)}
                        </div>

                        {#if proposal.metadata}
                            <div class="metadata">
                                {proposal.metadata}
                            </div>
                        {/if}
                    </div>

                    <div class="proposal-tally">
                        <div class="tally-summary">
                            <span class="total-votes"
                                >Total Votes: {proposal.tally.total}</span
                            >
                            <span
                                class="result {proposal.tally.result === 'Pass'
                                    ? 'result-pass'
                                    : 'result-fail'}"
                            >
                                {proposal.tally.result}
                            </span>
                        </div>

                        <div class="vote-breakdown">
                            <div class="vote-option yes">
                                <span class="vote-label">Yes</span>
                                <span class="vote-count"
                                    >{proposal.tally.yes}</span
                                >
                                <span class="vote-percentage">
                                    ({getTallyPercentage(
                                        proposal.tally.yes,
                                        proposal.tally.total
                                    )}%)
                                </span>
                            </div>

                            <div class="vote-option no">
                                <span class="vote-label">No</span>
                                <span class="vote-count"
                                    >{proposal.tally.no}</span
                                >
                                <span class="vote-percentage">
                                    ({getTallyPercentage(
                                        proposal.tally.no,
                                        proposal.tally.total
                                    )}%)
                                </span>
                            </div>

                            <div class="vote-option abstain">
                                <span class="vote-label">Abstain</span>
                                <span class="vote-count"
                                    >{proposal.tally.abstain}</span
                                >
                                <span class="vote-percentage">
                                    ({getTallyPercentage(
                                        proposal.tally.abstain,
                                        proposal.tally.total
                                    )}%)
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="proposal-footer">
                        <div class="timestamps">
                            <span class="created"
                                >Created: {formatDate(proposal.createdAt)}</span
                            >
                            <span class="deadline"
                                >Deadline: {formatDate(proposal.deadline)}</span
                            >
                        </div>

                        <div class="proposal-actions">
                            <span class="proposer">
                                Proposer: {proposal.proposer
                                    .toText()
                                    .slice(0, 10)}...
                            </span>

                            <button
                                class="view-proposal-btn"
                                on:click={() => goto(`/proposal?id=${proposal.id}`)}
                            >
                                View Details
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .proposal-list {
        padding: 0;
    }

    .list-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid var(--color-border-light);
        flex-wrap: wrap;
        gap: 1rem;
    }

    h2 {
        margin: 0;
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

    .filter-section {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
    }

    .filter-section label {
        font-weight: 600;
        color: var(--color-text-primary, #333);
    }

    /* Form controls now use unified styles from index.scss */

    /* Use unified alert styles from index.scss */

    .loading {
        text-align: center;
        padding: 3rem;
        color: var(--color-text-secondary, #666);
    }

    /* Use unified spinner styles from index.scss */
    .spinner {
        margin: 0 auto 1rem;
        width: 40px;
        height: 40px;
    }

    .empty-state {
        text-align: center;
        padding: 3rem;
        color: var(--color-text-secondary, #666);
    }

    .proposals {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .proposal-card {
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border, #ddd);
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: box-shadow 0.2s;
    }

    .proposal-card:hover {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .proposal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .proposal-id {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .id-label {
        font-weight: 700;
        font-size: 1.1rem;
        color: var(--color-primary, #007bff);
    }

    .action-type {
        background: var(--color-surface-secondary, #f8f9fa);
        color: var(--color-text-secondary, #666);
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: 600;
    }

    .status-badge {
        padding: 0.4rem 0.8rem;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    .status-active {
        background: var(--color-success-light, #d4edda);
        color: var(--color-success, #155724);
    }

    .status-executed {
        background: var(--color-info-light, #d1ecf1);
        color: var(--color-info, #0c5460);
    }

    .status-failed {
        background: var(--color-danger-light, #f8d7da);
        color: var(--color-danger, #721c24);
    }

    .status-executing {
        background: var(--color-warning-light, #fff3cd);
        color: var(--color-warning, #856404);
    }

    .status-pending {
        background: var(--color-secondary-light, #e2e3e5);
        color: var(--color-secondary, #383d41);
    }

    .proposal-content {
        margin-bottom: 1.5rem;
    }

    .action-details {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--color-text-primary, #333);
        margin-bottom: 0.5rem;
        word-break: break-word;
    }

    .metadata {
        color: var(--color-text-secondary, #666);
        font-size: 0.9rem;
        line-height: 1.4;
    }

    .proposal-tally {
        border: 1px solid var(--color-border, #ddd);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1rem;
        background: var(--color-surface-secondary, #f8f9fa);
    }

    .tally-summary {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        font-weight: 600;
    }

    .result-pass {
        color: var(--color-success, #28a745);
    }

    .result-fail {
        color: var(--color-danger, #dc3545);
    }

    .vote-breakdown {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 1rem;
    }

    .vote-option {
        text-align: center;
        padding: 0.75rem;
        border-radius: 6px;
        font-size: 0.9rem;
    }

    .vote-option.yes {
        background: var(--color-success-light, #d4edda);
        color: var(--color-success, #155724);
    }

    .vote-option.no {
        background: var(--color-danger-light, #f8d7da);
        color: var(--color-danger, #721c24);
    }

    .vote-option.abstain {
        background: var(--color-secondary-light, #e2e3e5);
        color: var(--color-secondary, #383d41);
    }

    .vote-label {
        display: block;
        font-weight: 600;
        margin-bottom: 0.25rem;
    }

    .vote-count {
        display: block;
        font-size: 1.1rem;
        font-weight: 700;
    }

    .vote-percentage {
        display: block;
        font-size: 0.8rem;
        opacity: 0.8;
    }

    .proposal-footer {
        display: flex;
        justify-content: space-between;
        align-items: end;
        font-size: 0.8rem;
        color: var(--color-text-secondary, #666);
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .timestamps {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .proposal-actions {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.5rem;
    }

    .proposer {
        font-family: "Courier New", monospace;
    }

    .view-proposal-btn {
        padding: 0.5rem 1rem;
        background: var(--color-primary, #007bff);
        color: white;
        text-decoration: none;
        border: none;
        border-radius: 4px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s;
        display: inline-block;
    }

    .view-proposal-btn:hover {
        background: var(--color-primary-dark, #0056b3);
    }

    @media (max-width: 768px) {
        .proposal-list {
            padding: 0.5rem;
        }

        .list-header {
            flex-direction: column;
            align-items: stretch;
        }

        .filter-section {
            justify-content: space-between;
        }

        .proposal-header {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
        }

        .proposal-id {
            justify-content: space-between;
        }

        .vote-breakdown {
            grid-template-columns: 1fr;
            gap: 0.5rem;
        }

        .proposal-footer {
            flex-direction: column;
            align-items: stretch;
        }
    }
</style>
