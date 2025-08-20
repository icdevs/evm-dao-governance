<script>
    import { onMount } from "svelte";
    import { proposalsStore } from "../stores/proposals.js";
    import { walletStore } from "../stores/wallet.js";
    import { configStore } from "../stores/config.js";
    import { statusStore } from "../stores/status.js";
    import { getNetworkInfo } from "../utils.js";
    import { agentStore } from "../stores/agent.js";
    import { getTokenBalanceInfo } from "../utils.js";

    // Export filter prop
    export let filter = "any"; // any, active, executed, expired, pending, rejected

    // Store subscriptions
    $: proposalsData = $proposalsStore;
    $: walletData = $walletStore;
    $: configData = $configStore;
    $: backendActor = $agentStore.actor;

    // Derived values
    $: proposals = proposalsData.proposals || [];
    $: loading = proposalsData.loading;
    $: error = proposalsData.error;
    $: isAuthenticated = walletData.state === "connected";
    $: walletAddress = walletData.userAddress;
    $: contractAddress = configData.contractAddress;
    $: provider = walletData.provider;

    // User token balance state
    let userTokenBalance = "0";
    let userVotingPower = "0";
    let isLoadingBalance = false;

    // User voting state (for demo purposes - in real app this would come from backend)
    let userVotes = {}; // proposalId -> 'yes' | 'no' | null

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

    // Reactive statement to load balance when auth/config changes
    $: if (isAuthenticated && walletAddress && contractAddress) {
        loadUserTokenBalance();
    }

    $: if (backendActor) {
        load();
    }

    async function load() {
        try {
            if (!backendActor) {
                console.error("Backend not available");
                return;
            }
            await proposalsStore.load(backendActor, [], false);
        } catch (err) {
            console.error("Failed to load proposals:", err);
            statusStore.add(
                `Failed to load proposals: ${err.message}`,
                "error"
            );
        }
    }

    async function loadUserTokenBalance() {
        if (!isAuthenticated || !walletAddress || !contractAddress) {
            userTokenBalance = "0";
            userVotingPower = "0";
            return;
        }

        isLoadingBalance = true;
        try {
            const tokenBalanceInfo = await getTokenBalanceInfo(
                provider,
                contractAddress,
                walletAddress
            );
            userTokenBalance = tokenBalanceInfo.formatted;
            userVotingPower = tokenBalanceInfo.balance.toString();
        } catch (error) {
            console.error("Failed to load user token balance:", error);
            userTokenBalance = "0";
            userVotingPower = "0";
        } finally {
            isLoadingBalance = false;
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
        if (total === 0 || !votes || !total) return 0;
        const percentage = Math.round((Number(votes) / Number(total)) * 100);
        return isNaN(percentage) ? 0 : percentage;
    }

    function getTimeRemaining(deadline) {
        const now = new Date();
        const endTime = new Date(deadline);
        const timeDiff = endTime - now;

        if (timeDiff <= 0) {
            return "Expired";
        }

        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
            (timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
        );

        if (days > 0) {
            if (hours > 0) {
                return `${days} day${days !== 1 ? "s" : ""}, ${hours} hour${hours !== 1 ? "s" : ""} remaining`;
            } else {
                return `${days} day${days !== 1 ? "s" : ""} remaining`;
            }
        } else if (hours > 0) {
            return `${hours} hour${hours !== 1 ? "s" : ""} remaining`;
        } else {
            return "Less than 1 hour remaining";
        }
    }

    function formatDate(date) {
        return date.toLocaleDateString() + " " + date.toLocaleTimeString();
    }

    async function handleVote(proposalId, vote) {
        if (!isAuthenticated || !walletAddress) {
            statusStore.add("Please connect your wallet first", "error");
            return;
        }

        if (parseFloat(userVotingPower) === 0) {
            statusStore.add("You need governance tokens to vote", "warning");
            return;
        }

        if (userVotes[proposalId]) {
            statusStore.add(
                "You have already voted on this proposal",
                "warning"
            );
            return;
        }

        try {
            // Show loading state
            userVotes[proposalId] = "loading";
            userVotes = { ...userVotes };

            // Submit vote using voting interface
            // Note: This would need to be updated with your actual voting implementation
            // await castVote(proposalId, vote, contractAddress);
            console.log(`Voting ${vote} on proposal ${proposalId}`);

            // For now, simulate success
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Update local state on success
            userVotes[proposalId] = vote;
            userVotes = { ...userVotes };

            // Refresh proposals to get updated tallies
            await load();

            statusStore.add(
                `Successfully voted ${vote} on proposal ${proposalId}`,
                "success"
            );
        } catch (error) {
            console.error("Vote submission failed:", error);

            // Clear loading state on error
            delete userVotes[proposalId];
            userVotes = { ...userVotes };

            // Show user-friendly error message
            let errorMessage = "Failed to submit vote. ";
            if (error.message.includes("already voted")) {
                errorMessage += "You have already voted on this proposal.";
            } else if (error.message.includes("not authenticated")) {
                errorMessage += "Please connect your wallet and try again.";
            } else if (error.message.includes("insufficient balance")) {
                errorMessage += "You need governance tokens to vote.";
            } else {
                errorMessage += error.message || "Please try again.";
            }

            statusStore.add(errorMessage, "error");
        }
    }
</script>

<div class="proposal-list">
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
                    <!-- Title Section -->
                    <div class="proposal-header">
                        <div class="proposal-title">
                            <div class="proposal-id">
                                <span class="id-label">#{proposal.id}</span>
                                <span class="action-type"
                                    >{getActionTypeDisplay(
                                        proposal.action
                                    )}</span
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
                    </div>

                    <!-- Voting & Details Section (2 columns) -->
                    <div class="proposal-main">
                        <!-- Left: Progress & Voting Section -->
                        <div class="voting-section">
                            <div class="votes-summary">
                                <div class="vote-percentages">
                                    <div class="yes-percent">
                                        <div class="caption">Adopt</div>
                                        <div class="percentage">
                                            {getTallyPercentage(
                                                proposal.tally.yes,
                                                proposal.tally.total
                                            )}%
                                        </div>
                                    </div>
                                    <h3 class="section-title">
                                        Voting Results
                                    </h3>
                                    <div class="no-percent">
                                        <div class="caption">Reject</div>
                                        <div class="percentage">
                                            {getTallyPercentage(
                                                proposal.tally.no,
                                                proposal.tally.total
                                            )}%
                                        </div>
                                    </div>
                                </div>

                                <div
                                    class="progressbar-container"
                                    style="--quorum-threshold: 25%; --majority-threshold: 50%;"
                                >
                                    <!-- Quorum threshold marker -->
                                    <div class="threshold quorum-threshold">
                                        <div class="threshold-icon"></div>
                                    </div>

                                    <!-- Majority threshold marker -->
                                    <div class="threshold majority-threshold">
                                        <div class="threshold-icon"></div>
                                    </div>

                                    <!-- Progress bar -->
                                    <div
                                        class="progressbar"
                                        role="progressbar"
                                        aria-valuemin="0"
                                        aria-valuenow={proposal.tally.yes +
                                            proposal.tally.no}
                                        aria-valuemax={proposal.tally.total}
                                    >
                                        <div
                                            class="yes"
                                            style="width: {getTallyPercentage(
                                                proposal.tally.yes,
                                                proposal.tally.total
                                            )}%;"
                                        ></div>
                                        <div
                                            class="no"
                                            style="width: {getTallyPercentage(
                                                proposal.tally.no,
                                                proposal.tally.total
                                            )}%;"
                                        ></div>
                                    </div>
                                </div>

                                <!-- Vote Counts under progress bar -->
                                <div class="vote-counts">
                                    <div class="yes-count">
                                        <span class="count-value"
                                            >{proposal.tally.yes}</span
                                        >
                                    </div>
                                    <div class="no-count">
                                        <span class="count-value"
                                            >{proposal.tally.no}</span
                                        >
                                    </div>
                                </div>
                            </div>

                            <!-- Voting Buttons (shown when logged in) -->
                            <div class="voting-actions">
                                <button
                                    class="vote-btn yes-btn"
                                    class:voted={userVotes[proposal.id] ===
                                        "yes"}
                                    class:other-voted={userVotes[
                                        proposal.id
                                    ] === "no"}
                                    class:loading={userVotes[proposal.id] ===
                                        "loading"}
                                    disabled={!proposal.isActive ||
                                        !isAuthenticated ||
                                        parseFloat(userVotingPower) === 0 ||
                                        userVotes[proposal.id]}
                                    on:click={() =>
                                        handleVote(proposal.id, "yes")}
                                >
                                    {userVotes[proposal.id] === "loading"
                                        ? "Submitting..."
                                        : userVotes[proposal.id] === "yes"
                                          ? "✓ Adopted"
                                          : "Adopt"}
                                </button>
                                <button
                                    class="vote-btn no-btn"
                                    class:voted={userVotes[proposal.id] ===
                                        "no"}
                                    class:other-voted={userVotes[
                                        proposal.id
                                    ] === "yes"}
                                    class:loading={userVotes[proposal.id] ===
                                        "loading"}
                                    disabled={!proposal.isActive ||
                                        !isAuthenticated ||
                                        parseFloat(userVotingPower) === 0 ||
                                        userVotes[proposal.id]}
                                    on:click={() =>
                                        handleVote(proposal.id, "no")}
                                >
                                    {userVotes[proposal.id] === "loading"
                                        ? "Submitting..."
                                        : userVotes[proposal.id] === "no"
                                          ? "✗ Rejected"
                                          : "Reject"}
                                </button>
                            </div>

                            <!-- User Voting Information -->
                            <div class="user-voting-info">
                                <div class="voting-power">
                                    <span class="label">Your Voting Power</span>
                                    <span
                                        class="value"
                                        class:loading={isLoadingBalance}
                                        class:disconnected={!isAuthenticated}
                                        class:has-power={parseFloat(
                                            userVotingPower
                                        ) > 0}
                                    >
                                        {#if isLoadingBalance}
                                            Loading...
                                        {:else if !isAuthenticated}
                                            Not connected
                                        {:else}
                                            {userTokenBalance}
                                        {/if}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Right: Proposal Details -->
                        <div class="proposal-details">
                            <dl class="details-list">
                                <div class="detail-item">
                                    <dt>Type</dt>
                                    <dd>
                                        {getActionTypeDisplay(proposal.action)}
                                    </dd>
                                </div>
                                <div class="detail-item">
                                    <dt>Time Remaining</dt>
                                    <dd class="countdown">
                                        {getTimeRemaining(proposal.deadline)}
                                    </dd>
                                </div>
                                <div class="detail-item">
                                    <dt>Created At</dt>
                                    <dd>{formatDate(proposal.createdAt)}</dd>
                                </div>
                                <div class="detail-item">
                                    <dt>Decided At</dt>
                                    <dd>-</dd>
                                </div>
                                <div class="detail-item">
                                    <dt>Executed At</dt>
                                    <dd>-</dd>
                                </div>
                                <div class="detail-item">
                                    <dt>Proposer</dt>
                                    <dd class="proposer">
                                        {proposal.proposer
                                            .toText()
                                            .slice(0, 10)}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </div>

                    <!-- Description Section -->
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

    .filter-section {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
    }

    /* Form controls now use unified styles from index.scss */

    /* Use unified alert styles from index.scss */
    .alert {
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
        font-weight: 500;
    }

    .alert-error {
        background: var(--color-danger-light);
        color: var(--color-danger);
        border: 1px solid rgba(255, 71, 87, 0.3);
    }

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
        border: 4px solid var(--color-border, #ddd);
        border-top: 4px solid var(--color-primary, #007bff);
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
        margin-bottom: 1rem;
    }

    .proposal-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .proposal-id {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .id-label {
        font-weight: 700;
        font-size: 1.2rem;
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

    /* Proposal Main Section (2 columns) */
    .proposal-main {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2rem;
        margin-bottom: 1.5rem;
    }

    /* Voting Section */
    .voting-section {
        padding: 1rem;
        background: var(--color-surface-secondary, #f8f9fa);
        border: 1px solid var(--color-border, #ddd);
        border-radius: 8px;
    }

    .section-title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text-primary, #333);
        text-align: center;
    }

    .votes-summary .vote-percentages {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.5rem;
        font-size: 0.85rem;
        font-weight: 600;
    }

    .yes-percent,
    .no-percent {
        display: flex;
        flex-direction: column;
    }

    .yes-percent {
        align-items: flex-start;
        text-align: left;
    }

    .no-percent {
        align-items: flex-end;
        text-align: right;
    }

    .yes-percent .caption {
        color: var(--color-success, #28a745);
        font-size: 0.85rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
    }

    .no-percent .caption {
        color: var(--color-danger, #dc3545);
        font-size: 0.85rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
    }

    .yes-percent .percentage {
        color: var(--color-success, #28a745);
        font-size: 1.1rem;
        font-weight: 700;
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    }

    .no-percent .percentage {
        color: var(--color-danger, #dc3545);
        font-size: 1.1rem;
        font-weight: 700;
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    }

    .progressbar-container {
        position: relative;
        height: 16px;
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border, #ddd);
        border-radius: 8px;
        overflow: hidden;
    }

    .threshold {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 1px;
        z-index: 2;
    }

    .quorum-threshold {
        left: var(--quorum-threshold);
        background: var(--color-warning, #ffc107);
    }

    .majority-threshold {
        left: var(--majority-threshold);
        background: var(--color-info, #17a2b8);
    }

    .threshold-icon {
        position: absolute;
        top: -4px;
        left: -2px;
        width: 5px;
        height: 5px;
        background: inherit;
        border-radius: 50%;
        border: 1px solid var(--color-surface, #fff);
    }

    .progressbar {
        position: relative;
        height: 100%;
        display: flex;
        border-radius: 7px;
        overflow: hidden;
    }

    .progressbar .yes {
        background: linear-gradient(90deg, #28a745, #34ce57);
        height: 100%;
        transition: width 0.3s ease;
        border-radius: 7px 0 0 7px;
    }

    .progressbar .no {
        background: linear-gradient(90deg, #dc3545, #e74c61);
        height: 100%;
        transition: width 0.3s ease;
        border-radius: 0 7px 7px 0;
        margin-left: auto;
    }

    /* Vote Counts */
    .vote-counts {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 0.125rem; /* Very close to progress bar */
        font-size: 0.75rem; /* Smaller font */
    }

    .yes-count,
    .no-count {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    .count-value {
        font-weight: 600; /* Reduced from 700 */
        font-size: 0.9rem; /* Smaller than before */
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    }

    .yes-count .count-value {
        color: var(--color-success, #28a745);
    }

    .no-count .count-value {
        color: var(--color-danger, #dc3545);
    }

    /* Voting Actions */
    .voting-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
    }

    .vote-btn {
        flex: 1;
        max-width: 150px;
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 0.9rem;
    }

    .yes-btn {
        background: var(--color-success, #28a745);
        color: white;
    }

    .yes-btn:hover:not(:disabled) {
        background: #1e7e34;
        transform: translateY(-1px);
    }

    .no-btn {
        background: var(--color-danger, #dc3545);
        color: white;
    }

    .no-btn:hover:not(:disabled) {
        background: #c82333;
        transform: translateY(-1px);
    }

    .vote-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        background: var(--color-secondary, #6c757d);
    }

    /* Voted button states */
    .vote-btn.voted {
        opacity: 1 !important;
        cursor: not-allowed;
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
        transform: none !important;
    }

    .yes-btn.voted {
        background: var(--color-success, #28a745) !important;
        border: 2px solid #1e7e34;
    }

    .no-btn.voted {
        background: var(--color-danger, #dc3545) !important;
        border: 2px solid #c82333;
    }

    .vote-btn.other-voted {
        opacity: 0.4;
        background: var(--color-secondary, #6c757d) !important;
    }

    .vote-btn.loading {
        opacity: 0.7;
        cursor: not-allowed;
        background: var(--color-info, #17a2b8) !important;
        color: white;
    }

    /* User Voting Information */
    .user-voting-info {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border-light, #eee);
        font-size: 0.85rem;
    }

    .user-voting-info > div {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }

    .user-voting-info > div:last-child {
        margin-bottom: 0;
    }

    .user-voting-info .label {
        color: var(--color-text-secondary, #666);
        font-weight: 500;
    }

    .user-voting-info .value {
        font-weight: 600;
        color: var(--color-text-primary, #333);
    }

    .voting-power .value {
        color: var(--color-primary, #007bff);
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    }

    .voting-power .value.loading {
        color: var(--color-text-secondary, #666);
        font-style: italic;
        font-family: inherit;
    }

    .voting-power .value.disconnected {
        color: var(--color-warning, #ffc107);
        font-style: italic;
        font-family: inherit;
    }

    .voting-power .value.has-power {
        color: var(--color-success, #28a745);
        font-weight: 700;
    }

    /* Proposal Details */
    .proposal-details {
        padding: 1rem;
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border-light, #eee);
        border-radius: 8px;
    }

    .details-list {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .detail-item {
        display: flex;
        align-items: center;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--color-border-light, #f0f0f0);
    }

    .detail-item:last-child {
        border-bottom: none;
    }

    .detail-item dt {
        flex: 0 0 140px;
        margin: 0;
        font-weight: 600;
        color: var(--color-text-secondary, #666);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .detail-item dd {
        flex: 1;
        margin: 0;
        font-weight: 500;
        color: var(--color-text-primary, #333);
        font-size: 0.9rem;
    }
    .detail-item dd.countdown {
        color: var(--color-primary, #007bff);
        font-weight: 600;
    }

    .detail-item dd.proposer {
        font-family: "Courier New", monospace;
        font-size: 0.8rem;
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
        padding: 1rem 0;
    }

    .action-details {
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text-primary, #333);
        margin-bottom: 0.75rem;
        line-height: 1.5;
        word-break: break-word;
    }

    .metadata {
        color: var(--color-text-secondary, #666);
        font-size: 0.9rem;
        line-height: 1.5;
        margin-top: 0.5rem;
    }

    @media (max-width: 768px) {
        .proposal-list {
            padding: 0.5rem;
        }

        .proposal-title {
            flex-direction: column;
            align-items: stretch;
            gap: 0.75rem;
        }

        .proposal-id {
            justify-content: space-between;
        }

        .proposal-main {
            grid-template-columns: 1fr;
            gap: 1.5rem;
        }

        .voting-actions {
            flex-direction: column;
        }

        .vote-btn {
            max-width: none;
        }

        .detail-item {
            flex-direction: column;
            align-items: stretch;
            gap: 0.25rem;
        }

        .detail-item dt {
            flex: none;
        }
    }
</style>
