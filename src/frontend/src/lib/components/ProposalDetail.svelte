<script>
    import { onMount } from "svelte";
    import { backend } from "../canisters.js";
    import { authStore } from "../stores/auth.js";
    import { getNetworkInfo, formatTokenAmount } from "../utils.js";
    import VotingInterface from "./VotingInterface.svelte";

    export let proposalId;

    let proposal = null;
    let loading = true;
    let error = null;
    let userVote = null;
    let hasVoted = false;

    onMount(() => {
        if (proposalId) {
            loadProposal();
        }
    });

    async function loadProposal() {
        try {
            loading = true;
            error = null;

            // Load proposal details
            const result = await backend.icrc149_get_proposal(proposalId);

            if (!result || result.length === 0) {
                throw new Error("Proposal not found");
            }

            proposal = {
                ...result[0],
                createdAt: new Date(Number(result[0].created_at) / 1_000_000),
                deadline: new Date(Number(result[0].deadline) / 1_000_000),
                isActive: result[0].status.hasOwnProperty("open"),
                isExecuted: result[0].status.hasOwnProperty("executed"),
                isFailed: result[0].status.hasOwnProperty("failed"),
                isExecuting: result[0].status.hasOwnProperty("executing"),
            };

            // Load user vote if authenticated
            if ($authStore.isAuthenticated) {
                await loadUserVote();
            }
        } catch (err) {
            console.error("Failed to load proposal:", err);
            error = err.message || "Failed to load proposal";
        } finally {
            loading = false;
        }
    }

    async function loadUserVote() {
        try {
            const result = await backend.icrc149_get_user_vote(
                proposalId,
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

    function getActionTypeDisplay(action) {
        if (action.Motion) return "Motion";
        if (action.EthTransaction) return "Ethereum Transaction";
        if (action.ICPCall) return "ICP Call";
        return "Unknown";
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
        return date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function getTimeRemaining() {
        if (!proposal) return "";
        const now = Date.now();
        const deadline = proposal.deadline.getTime();
        const diff = deadline - now;

        if (diff <= 0) return "Expired";

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
            (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
        );
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) return `${days}d ${hours}h remaining`;
        if (hours > 0) return `${hours}h ${minutes}m remaining`;
        return `${minutes}m remaining`;
    }

    function handleVoteSubmitted(event) {
        console.log("Vote submitted:", event.detail);
        // Reload proposal to get updated tally
        loadProposal();
    }

    async function executeProposal() {
        if (!proposal || !proposal.isActive) return;

        try {
            const result = await backend.icrc149_execute_proposal(proposal.id);
            if ("Err" in result) {
                throw new Error(result.Err);
            }

            // Reload proposal to see updated status
            await loadProposal();
        } catch (err) {
            console.error("Failed to execute proposal:", err);
            error = err.message || "Failed to execute proposal";
        }
    }
</script>

<div class="proposal-detail">
    {#if loading}
        <div class="loading">
            <div class="spinner"></div>
            Loading proposal...
        </div>
    {:else if error}
        <div class="alert alert-error">
            {error}
        </div>
    {:else if proposal}
        <!-- Proposal Header -->
        <div class="proposal-header">
            <div class="header-top">
                <h1>Proposal #{proposal.id}</h1>
                <span class="status-badge {getStatusBadgeClass(proposal)}">
                    {getStatusText(proposal)}
                </span>
            </div>

            <div class="proposal-meta">
                <div class="meta-item">
                    <span class="meta-label">Type:</span>
                    <span class="meta-value"
                        >{getActionTypeDisplay(proposal.action)}</span
                    >
                </div>

                <div class="meta-item">
                    <span class="meta-label">Proposer:</span>
                    <span class="meta-value proposer"
                        >{proposal.proposer.toText()}</span
                    >
                </div>

                <div class="meta-item">
                    <span class="meta-label">Created:</span>
                    <span class="meta-value"
                        >{formatDate(proposal.createdAt)}</span
                    >
                </div>

                <div class="meta-item">
                    <span class="meta-label">Deadline:</span>
                    <span class="meta-value">
                        {formatDate(proposal.deadline)}
                        {#if proposal.isActive}
                            <span class="time-remaining"
                                >({getTimeRemaining()})</span
                            >
                        {/if}
                    </span>
                </div>
            </div>
        </div>

        <!-- Action Details -->
        <div class="action-section">
            <h2>Proposal Action</h2>

            {#if proposal.action.Motion}
                <div class="motion-details">
                    <div class="motion-text">
                        {proposal.action.Motion}
                    </div>
                </div>
            {:else if proposal.action.EthTransaction}
                {@const tx = proposal.action.EthTransaction}
                {@const networkInfo = getNetworkInfo(Number(tx.chain.chain_id))}

                <div class="eth-transaction-details">
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">To:</span>
                            <span class="detail-value address">{tx.to}</span>
                        </div>

                        <div class="detail-item">
                            <span class="detail-label">Value:</span>
                            <span class="detail-value">{tx.value} wei</span>
                        </div>

                        <div class="detail-item">
                            <span class="detail-label">Network:</span>
                            <span class="detail-value">{networkInfo.name}</span>
                        </div>

                        <div class="detail-item">
                            <span class="detail-label">Gas Limit:</span>
                            <span class="detail-value">{tx.gasLimit}</span>
                        </div>

                        {#if tx.data && tx.data.length > 2}
                            <div class="detail-item full-width">
                                <span class="detail-label">Data:</span>
                                <div class="detail-value data-hex">
                                    {#if typeof tx.data === "string"}
                                        {tx.data}
                                    {:else}
                                        {Array.from(tx.data)
                                            .map((b) =>
                                                b.toString(16).padStart(2, "0")
                                            )
                                            .join("")}
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            {:else if proposal.action.ICPCall}
                {@const call = proposal.action.ICPCall}

                <div class="icp-call-details">
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Canister:</span>
                            <span class="detail-value address"
                                >{call.canister}</span
                            >
                        </div>

                        <div class="detail-item">
                            <span class="detail-label">Method:</span>
                            <span class="detail-value">{call.method}</span>
                        </div>

                        <div class="detail-item">
                            <span class="detail-label">Cycles:</span>
                            <span class="detail-value">{call.cycles}</span>
                        </div>

                        {#if call.result}
                            <div class="detail-item full-width">
                                <span class="detail-label">Result:</span>
                                <div class="detail-value">
                                    {#if "Ok" in call.result}
                                        <span class="result-success"
                                            >Success</span
                                        >
                                    {:else}
                                        <span class="result-error"
                                            >Error: {call.result.Err}</span
                                        >
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>

        <!-- Description -->
        {#if proposal.metadata}
            <div class="description-section">
                <h2>Description</h2>
                <div class="description-text">
                    {proposal.metadata}
                </div>
            </div>
        {/if}

        <!-- Voting Results -->
        <div class="voting-results">
            <h2>Voting Results</h2>

            <div class="tally-overview">
                <div class="total-votes">
                    <span class="votes-number">{proposal.tally.total}</span>
                    <span class="votes-label">Total Votes</span>
                </div>

                <div class="result-indicator">
                    <span
                        class="result {proposal.tally.result === 'Pass'
                            ? 'result-pass'
                            : 'result-fail'}"
                    >
                        {proposal.tally.result}
                    </span>
                </div>
            </div>

            <div class="vote-breakdown">
                <div class="vote-bar">
                    <div
                        class="bar-section yes"
                        style="width: {getTallyPercentage(
                            proposal.tally.yes,
                            proposal.tally.total
                        )}%"
                    ></div>
                    <div
                        class="bar-section no"
                        style="width: {getTallyPercentage(
                            proposal.tally.no,
                            proposal.tally.total
                        )}%"
                    ></div>
                    <div
                        class="bar-section abstain"
                        style="width: {getTallyPercentage(
                            proposal.tally.abstain,
                            proposal.tally.total
                        )}%"
                    ></div>
                </div>

                <div class="vote-stats">
                    <div class="vote-stat yes">
                        <span class="stat-label">Yes</span>
                        <span class="stat-count">{proposal.tally.yes}</span>
                        <span class="stat-percentage"
                            >({getTallyPercentage(
                                proposal.tally.yes,
                                proposal.tally.total
                            )}%)</span
                        >
                    </div>

                    <div class="vote-stat no">
                        <span class="stat-label">No</span>
                        <span class="stat-count">{proposal.tally.no}</span>
                        <span class="stat-percentage"
                            >({getTallyPercentage(
                                proposal.tally.no,
                                proposal.tally.total
                            )}%)</span
                        >
                    </div>

                    <div class="vote-stat abstain">
                        <span class="stat-label">Abstain</span>
                        <span class="stat-count">{proposal.tally.abstain}</span>
                        <span class="stat-percentage"
                            >({getTallyPercentage(
                                proposal.tally.abstain,
                                proposal.tally.total
                            )}%)</span
                        >
                    </div>
                </div>
            </div>
        </div>

        <!-- Voting Interface -->
        <VotingInterface {proposal} on:voteSubmitted={handleVoteSubmitted} />

        <!-- Admin Actions -->
        {#if proposal.isActive && proposal.tally.result === "Pass"}
            <div class="admin-actions">
                <button class="execute-btn" on:click={executeProposal}>
                    Execute Proposal
                </button>
            </div>
        {/if}
    {:else}
        <div class="not-found">
            <h2>Proposal Not Found</h2>
            <p>The requested proposal could not be found.</p>
        </div>
    {/if}
</div>

<style>
    .proposal-detail {
        max-width: 800px;
        margin: 0 auto;
        padding: 1rem;
    }

    .loading {
        text-align: center;
        padding: 3rem;
        color: var(--color-text-secondary, #666);
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid var(--color-border, #ddd);
        border-top: 4px solid var(--color-primary, #007bff);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    .alert {
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }

    .alert-error {
        background: var(--color-danger-light, #f8d7da);
        color: var(--color-danger, #721c24);
        border: 1px solid var(--color-danger-border, #f5c6cb);
    }

    .proposal-header {
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border, #ddd);
        border-radius: 12px;
        padding: 2rem;
        margin-bottom: 2rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
        gap: 1rem;
    }

    h1 {
        margin: 0;
        color: var(--color-text-primary, #333);
        font-size: 2rem;
    }

    .status-badge {
        padding: 0.5rem 1rem;
        border-radius: 20px;
        font-size: 0.9rem;
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

    .proposal-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
    }

    .meta-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .meta-label {
        font-weight: 600;
        color: var(--color-text-secondary, #666);
        font-size: 0.9rem;
    }

    .meta-value {
        color: var(--color-text-primary, #333);
        font-size: 1rem;
    }

    .proposer {
        font-family: var(--font-family-mono, "Courier New");
        font-size: 0.9rem;
        word-break: break-all;
    }

    .time-remaining {
        color: var(--color-primary, #007bff);
        font-weight: 600;
    }

    .action-section,
    .description-section,
    .voting-results {
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border, #ddd);
        border-radius: 12px;
        padding: 2rem;
        margin-bottom: 2rem;
    }

    h2 {
        margin: 0 0 1.5rem 0;
        color: var(--color-text-primary, #333);
        font-size: 1.5rem;
    }

    .motion-text {
        font-size: 1.1rem;
        line-height: 1.6;
        color: var(--color-text-primary, #333);
        background: var(--color-surface-secondary, #f8f9fa);
        padding: 1.5rem;
        border-radius: 8px;
        border-left: 4px solid var(--color-primary, #007bff);
    }

    .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }

    .detail-item {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .detail-item.full-width {
        grid-column: 1 / -1;
    }

    .detail-label {
        font-weight: 600;
        color: var(--color-text-secondary, #666);
        font-size: 0.9rem;
    }

    .detail-value {
        color: var(--color-text-primary, #333);
        font-size: 1rem;
    }

    .address {
        font-family: var(--font-family-mono, "Courier New");
        font-size: 0.9rem;
        word-break: break-all;
    }

    .data-hex {
        font-family: var(--font-family-mono, "Courier New");
        font-size: 0.8rem;
        background: var(--color-surface-secondary, #f8f9fa);
        padding: 1rem;
        border-radius: 4px;
        word-break: break-all;
        max-height: 200px;
        overflow-y: auto;
    }

    .result-success {
        color: var(--color-success, #28a745);
        font-weight: 600;
    }

    .result-error {
        color: var(--color-danger, #dc3545);
        font-weight: 600;
    }

    .description-text {
        font-size: 1rem;
        line-height: 1.6;
        color: var(--color-text-primary, #333);
    }

    .tally-overview {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        flex-wrap: wrap;
        gap: 1rem;
    }

    .total-votes {
        text-align: center;
    }

    .votes-number {
        display: block;
        font-size: 2.5rem;
        font-weight: 700;
        color: var(--color-primary, #007bff);
    }

    .votes-label {
        display: block;
        color: var(--color-text-secondary, #666);
        font-size: 0.9rem;
    }

    .result-indicator .result {
        padding: 0.75rem 1.5rem;
        border-radius: 20px;
        font-size: 1.1rem;
        font-weight: 700;
        text-transform: uppercase;
    }

    .result-pass {
        background: var(--color-success-light, #d4edda);
        color: var(--color-success, #155724);
    }

    .result-fail {
        background: var(--color-danger-light, #f8d7da);
        color: var(--color-danger, #721c24);
    }

    .vote-bar {
        display: flex;
        height: 20px;
        border-radius: 10px;
        overflow: hidden;
        background: var(--color-border, #ddd);
        margin-bottom: 1rem;
    }

    .bar-section.yes {
        background: var(--color-success, #28a745);
    }

    .bar-section.no {
        background: var(--color-danger, #dc3545);
    }

    .bar-section.abstain {
        background: var(--color-secondary, #6c757d);
    }

    .vote-stats {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 1rem;
    }

    .vote-stat {
        text-align: center;
        padding: 1rem;
        border-radius: 8px;
    }

    .vote-stat.yes {
        background: var(--color-success-light, #d4edda);
        color: var(--color-success, #155724);
    }

    .vote-stat.no {
        background: var(--color-danger-light, #f8d7da);
        color: var(--color-danger, #721c24);
    }

    .vote-stat.abstain {
        background: var(--color-secondary-light, #e2e3e5);
        color: var(--color-secondary, #383d41);
    }

    .stat-label {
        display: block;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }

    .stat-count {
        display: block;
        font-size: 1.5rem;
        font-weight: 700;
    }

    .stat-percentage {
        display: block;
        font-size: 0.9rem;
        opacity: 0.8;
    }

    .admin-actions {
        text-align: center;
        padding: 2rem;
    }

    .execute-btn {
        padding: 1rem 2rem;
        background: var(--color-warning, #ffc107);
        color: var(--color-text-primary, #333);
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .execute-btn:hover {
        background: #e0a800;
    }

    .not-found {
        text-align: center;
        padding: 3rem;
        color: var(--color-text-secondary, #666);
    }

    @media (max-width: 768px) {
        .proposal-detail {
            padding: 0.5rem;
        }

        .proposal-header,
        .action-section,
        .description-section,
        .voting-results {
            padding: 1rem;
        }

        h1 {
            font-size: 1.5rem;
        }

        .header-top {
            flex-direction: column;
            align-items: stretch;
        }

        .proposal-meta {
            grid-template-columns: 1fr;
        }

        .detail-grid {
            grid-template-columns: 1fr;
        }

        .vote-stats {
            grid-template-columns: 1fr;
        }

        .tally-overview {
            flex-direction: column;
            text-align: center;
        }
    }
</style>
