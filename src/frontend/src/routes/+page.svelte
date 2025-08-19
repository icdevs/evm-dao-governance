<script>
    import "../index.scss";
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import WalletConnector from "$lib/components/WalletConnector.svelte";
    import TreasuryAddress from "$lib/components/TreasuryAddress.svelte";
    import BalanceDisplay from "$lib/components/BalanceDisplay.svelte";
    import StatusMessages from "$lib/components/StatusMessages.svelte";
    import ProposalForm from "$lib/components/ProposalForm.svelte";
    import ProposalList from "$lib/components/ProposalList.svelte";
    import { configStore } from "$lib/stores/config.js";
    import { proposalsStore, proposalStats } from "$lib/stores/proposals.js";
    import { walletStore } from "$lib/stores/wallet.js";
    import { governanceStatsStore } from "$lib/stores/governance.js";
    import { contractsStore } from "$lib/stores/contracts.js";
    import { agentStore } from "$lib/stores/agent.js";
    import { ethers } from "ethers";

    let initialized = false;
    let showCreateProposal = false;

    // Dashboard refresh functionality
    let dashboardRefreshFn = null;
    let isDashboardLoading = false;

    let showContractDropdown = false;
    let isGlobalRefreshing = false;
    let proposalFilter = "any";

    // Subscribe to proposal statistics
    $: stats = $proposalStats;
    $: governanceStats = $governanceStatsStore;
    $: walletConnected = $walletStore.state === "connected";
    $: backendActor = $agentStore.actor;

    // Subscribe to contracts store
    $: contracts = $contractsStore;
    $: availableContracts = contracts.contracts;
    $: selectedContract = contracts.selectedContract;
    $: contractsLoading = contracts.loading;

    // Redirect to config page if not configured
    $: if (initialized && !$configStore.isConfigured) {
        goto("/config");
    }

    onMount(() => {
        if (typeof window !== "undefined" && window.ethereum) {
            walletStore.initialize(window.ethereum);
        }
        if (browser) {
            // Load configuration from localStorage
            configStore.load();
            initialized = true;

            // Only load data initially if configured and not already loaded
            if (backendActor) {
                // Load proposals if not already loaded
                if (
                    $proposalsStore.proposals.length === 0 &&
                    !$proposalsStore.loading
                ) {
                    proposalsStore.load(backendActor);
                }

                // Load governance stats if not already loaded
                if (
                    !$governanceStatsStore.lastUpdated &&
                    !$governanceStatsStore.loading
                ) {
                    governanceStatsStore.load().catch((error) => {
                        console.error(
                            "Failed to load governance stats:",
                            error
                        );
                    });
                }

                // Load contracts if not already loaded
                if (!$contractsStore.lastUpdated && !$contractsStore.loading) {
                    contractsStore.load().catch((error) => {
                        console.error("Failed to load contracts:", error);
                    });
                }
            }
        }
    });

    function handleProposalCreated(event) {
        const { id, proposal } = event.detail;
        console.log("Proposal created:", id, proposal);

        // Refresh proposals to include the new one
        proposalsStore.load(backendActor, [], true);

        // Refresh governance stats as well
        governanceStatsStore.load(true);

        // Close create proposal form
        showCreateProposal = false;
    }

    // Auto-load proposals when configuration is complete (only if not already loaded)
    let proposalsLoadAttempted = false;
    $: if (
        $agentStore.state === "connected" &&
        initialized &&
        $configStore.isConfigured &&
        !proposalsLoadAttempted &&
        $proposalsStore.proposals.length === 0 &&
        !$proposalsStore.loading
    ) {
        proposalsLoadAttempted = true;
        proposalsStore.load(backendActor).catch((error) => {
            console.error("Failed to load proposals:", error);
            // Reset flag on error so it can be retried
            proposalsLoadAttempted = false;
        });

        // Also load governance stats only if not already loaded
        if (!$governanceStatsStore.lastUpdated) {
            governanceStatsStore.load().catch((error) => {
                console.error("Failed to load governance stats:", error);
            });
        }

        // Also load contracts only if not already loaded
        if (!$contractsStore.lastUpdated) {
            contractsStore.load().catch((error) => {
                console.error("Failed to load contracts:", error);
            });
        }
    }

    // Handle comprehensive refresh of all data
    async function handleGlobalRefresh() {
        if (isGlobalRefreshing) return; // Prevent multiple simultaneous refreshes

        try {
            isGlobalRefreshing = true;

            // Refresh dashboard
            if (dashboardRefreshFn) {
                dashboardRefreshFn();
            }

            // Refresh proposals
            await proposalsStore.load(backendActor, [], true).catch((error) => {
                console.error("Failed to refresh proposals:", error);
            });

            // Refresh governance stats
            await governanceStatsStore.load(true).catch((error) => {
                console.error("Failed to refresh governance stats:", error);
            });

            // Refresh contracts
            await contractsStore.load(true).catch((error) => {
                console.error("Failed to refresh contracts:", error);
            });
        } finally {
            isGlobalRefreshing = false;
        }
    }

    // Handle dashboard refresh (legacy)
    function handleDashboardRefresh() {
        handleGlobalRefresh();
    }

    function setDashboardRefreshFn(refreshFn) {
        dashboardRefreshFn = refreshFn;
    }

    // Handle contract selection change
    function handleContractChange() {
        console.log("Selected contract changed to:", selectedContract);

        // Refresh dashboard with new contract
        handleDashboardRefresh();

        // Refresh proposals with new contract context
        proposalsStore.load(backendActor, [], true);

        // Refresh governance stats
        governanceStatsStore.load(true);
    }

    // Select contract and close dropdown
    function selectContract(address) {
        contractsStore.setSelectedContract(address);
        showContractDropdown = false;
        handleContractChange();
    }

    // Close dropdown when clicking outside
    function handleClickOutside(event) {
        if (
            showContractDropdown &&
            !event.target.closest(".selector-dropdown")
        ) {
            showContractDropdown = false;
        }
    }
</script>

<svelte:head>
    <title>EVM DAO Governance</title>
    <meta
        name="description"
        content="Decentralized governance for EVM-based DAOs using Internet Computer"
    />
</svelte:head>

<svelte:window on:click={handleClickOutside} />

<!-- Status Messages (Toast notifications) -->
<StatusMessages />

<main>
    {#if initialized}
        <div class="app-container">
            <!-- App Header -->
            <header class="app-header">
                <div class="header-content">
                    <div class="brand">
                        <h1>🗳️ DAO Governance</h1>
                        <p class="subtitle">
                            Cross-chain voting on Internet Computer
                        </p>
                    </div>

                    <div class="header-actions">
                        <WalletConnector showNetworkInfo={true} />
                    </div>
                </div>
            </header>

            <!-- Compact Dashboard Bar -->
            <div class="compact-dashboard">
                <div class="dashboard-left">
                    <!-- Contract Addresses Section -->
                    <div class="addresses-section">
                        <div class="governance-info">
                            <span class="governance-label"
                                >Governance Token:</span
                            >
                            {#if contractsLoading}
                                <div class="loading-inline">
                                    <div class="spinner-tiny"></div>
                                    <span>Loading...</span>
                                </div>
                            {:else if selectedContract}
                                <div class="inline-address">
                                    <span class="address-full">
                                        {selectedContract}
                                    </span>
                                    <button
                                        class="inline-copy-btn"
                                        on:click={() =>
                                            navigator.clipboard.writeText(
                                                selectedContract
                                            )}
                                        title="Copy address"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <rect
                                                x="9"
                                                y="9"
                                                width="13"
                                                height="13"
                                                rx="2"
                                                ry="2"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                fill="none"
                                            />
                                            <path
                                                d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                fill="none"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            {:else}
                                <span class="no-contract">Not configured</span>
                            {/if}
                        </div>

                        <!-- Treasury Address -->
                        <TreasuryAddress />
                    </div>
                </div>

                <div class="dashboard-center">
                    <!-- Balance Information -->
                    <BalanceDisplay
                        onRefresh={setDashboardRefreshFn}
                        bind:isLoading={isDashboardLoading}
                    />
                </div>

                <div class="dashboard-right">
                    <div class="compact-actions">
                        <button
                            class="refresh-btn-inline"
                            on:click={handleGlobalRefresh}
                            disabled={!walletConnected ||
                                !$configStore.isConfigured ||
                                isGlobalRefreshing}
                            title="Refresh all data"
                        >
                            <svg
                                class="refresh-icon-inline"
                                class:spinning={isGlobalRefreshing}
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M1 4V10H7"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M23 20V14H17"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M3.51 15A9 9 0 0 0 18.36 18.36L23 14"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </button>

                        {#if availableContracts.length > 1}
                            <div
                                class="selector-dropdown"
                                class:open={showContractDropdown}
                            >
                                <button
                                    class="change-btn"
                                    on:click={() =>
                                        (showContractDropdown =
                                            !showContractDropdown)}
                                    disabled={!walletConnected}
                                    title="Change governance contract"
                                >
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

                                {#if showContractDropdown}
                                    <div class="dropdown-menu">
                                        {#each availableContracts as contract}
                                            <button
                                                class="dropdown-item"
                                                class:selected={contract.address ===
                                                    selectedContract}
                                                on:click={() =>
                                                    selectContract(
                                                        contract.address
                                                    )}
                                            >
                                                <span class="contract-label"
                                                    >{contract.label}</span
                                                >
                                                <code class="contract-addr"
                                                    >{contract.address}</code
                                                >
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        <button
                            class="config-btn-inline"
                            on:click={() => goto("/config")}
                            title="Configuration"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 000 2l.15.08a2 2 0 011 1.73v.51a2 2 0 01-1 1.73l-.15.08a2 2 0 000 2l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 000-2l-.15-.08a2 2 0 01-1-1.73v-.51a2 2 0 011-1.73l.15-.08a2 2 0 000-2l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <circle
                                    cx="12"
                                    cy="12"
                                    r="3"
                                    stroke="currentColor"
                                    stroke-width="2"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Main Content -->
            <div class="main-content">
                <!-- Proposals Section -->
                <div class="proposals-section">
                    <div class="proposals-header">
                        <div class="section-title">
                            <h2>📋 Proposals</h2>
                            <div class="proposals-stats">
                                <div class="stat-item">
                                    <span class="stat-label">Total:</span>
                                    <span class="stat-value">
                                        {#if $proposalsStore.loading}
                                            -
                                        {:else}
                                            {stats.total}
                                        {/if}
                                    </span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Active:</span>
                                    <span class="stat-value">
                                        {#if $proposalsStore.loading}
                                            -
                                        {:else}
                                            {stats.active}
                                        {/if}
                                    </span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Members:</span>
                                    <span class="stat-value">
                                        {#if governanceStats.loading}
                                            -
                                        {:else}
                                            {governanceStats.memberCount}
                                        {/if}
                                    </span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Voting Power:</span
                                    >
                                    <span class="stat-value">
                                        {#if governanceStats.loading}
                                            -
                                        {:else}
                                            {governanceStats.totalVotingPower}
                                        {/if}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div class="proposals-actions">
                            <!-- Filter Section -->
                            <div class="filter-section">
                                <label for="statusFilter">Filter:</label>
                                <select
                                    id="statusFilter"
                                    class="form-control"
                                    bind:value={proposalFilter}
                                >
                                    <option value="any">All Proposals</option>
                                    <option value="active">Active</option>
                                    <option value="pending">Pending</option>
                                    <option value="executed">Executed</option>
                                    <option value="expired">Expired</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                            </div>

                            {#if walletConnected}
                                <button
                                    class="create-proposal-btn"
                                    on:click={() =>
                                        (showCreateProposal =
                                            !showCreateProposal)}
                                    class:active={showCreateProposal}
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
                                    {showCreateProposal
                                        ? "Cancel"
                                        : "Create Proposal"}
                                </button>
                            {:else}
                                <div class="auth-hint-compact">
                                    🔒 Connect wallet to create proposals
                                </div>
                            {/if}
                        </div>
                    </div>

                    {#if showCreateProposal}
                        <div class="create-proposal-form">
                            <ProposalForm
                                on:proposalCreated={handleProposalCreated}
                            />
                        </div>
                    {/if}

                    <div class="proposals-list">
                        <ProposalList filter={proposalFilter} />
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <div class="loading-screen">
            <div class="spinner"></div>
            <p>Initializing DAO Governance...</p>
        </div>
    {/if}
</main>

<style>
    /* Only keep CSS classes and selectors that are used in the markup */
    .app-container {
        min-height: 100vh;
        background: radial-gradient(
                circle at 20% 80%,
                rgba(0, 210, 255, 0.15) 0%,
                transparent 50%
            ),
            radial-gradient(
                circle at 80% 20%,
                rgba(0, 255, 136, 0.1) 0%,
                transparent 50%
            ),
            linear-gradient(
                135deg,
                var(--color-bg-primary) 0%,
                var(--color-bg-secondary) 100%
            );
        padding: 1.5rem;
        position: relative;
    }
    .app-header {
        background: rgba(30, 33, 38, 0.8);
        backdrop-filter: blur(20px);
        border: 1px solid var(--color-border);
        border-radius: 16px;
        padding: 2rem;
        margin-bottom: 2rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        position: relative;
        overflow: hidden;
    }
    .header-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1.5rem;
        width: 100%;
    }
    .brand h1 {
        margin: 0;
        font-size: 2.25rem;
        font-weight: 800;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-success) 100%
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: -0.02em;
    }
    .subtitle {
        margin: 0.5rem 0 0 0;
        color: var(--color-text-secondary);
        font-size: 1rem;
        font-weight: 500;
        opacity: 0.9;
    }
    .main-content {
        background: rgba(30, 33, 38, 0.6);
        backdrop-filter: blur(20px);
        border: 1px solid var(--color-border);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        position: relative;
    }
    .compact-dashboard {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 2rem;
        background: var(--color-surface-secondary);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        margin-bottom: 1.5rem;
        font-size: 0.9rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        gap: 2rem;
    }
    .dashboard-left {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        flex-shrink: 0;
    }
    .dashboard-center {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        min-width: 0;
    }
    .dashboard-right {
        display: flex;
        align-items: center;
        flex-shrink: 0;
    }
    .addresses-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .compact-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .governance-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--color-text-secondary);
        flex: 1;
    }
    .governance-info .inline-address {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.75rem;
        background: rgba(0, 210, 255, 0.1);
        border: 1px solid rgba(0, 210, 255, 0.2);
        border-radius: 8px;
        transition: all 0.3s ease;
    }
    .governance-info .address-full {
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 0.8rem;
        color: var(--color-primary);
        font-weight: 600;
    }
    .governance-info .inline-copy-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        color: var(--color-primary);
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .governance-info .inline-copy-btn svg {
        width: 14px;
        height: 14px;
    }
    .no-contract {
        color: var(--color-text-muted);
        font-style: italic;
    }
    .selector-dropdown {
        position: relative;
    }
    .change-btn {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        padding: 0.25rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
    }
    .dropdown-menu {
        position: absolute;
        top: 100%;
        right: 0;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        min-width: 280px;
        margin-top: 0.25rem;
        overflow: hidden;
    }
    .dropdown-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
        width: 100%;
        padding: 0.75rem 1rem;
        background: none;
        border: none;
        border-bottom: 1px solid var(--color-border);
        cursor: pointer;
        text-align: left;
        transition: background 0.2s ease;
    }
    .contract-label {
        font-weight: 500;
        color: var(--color-text-primary);
        font-size: 0.9rem;
    }
    .contract-addr {
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 0.8rem;
        color: var(--color-text-secondary);
    }
    .refresh-btn-inline {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .refresh-icon-inline {
        width: 14px;
        height: 14px;
        transition: transform 0.2s ease;
    }
    .config-btn-inline {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        color: var(--color-text-muted);
        cursor: pointer;
        text-decoration: none;
        transition: all 0.2s ease;
    }
    .config-btn-inline svg {
        width: 14px;
        height: 14px;
    }
    .loading-inline {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        color: var(--color-text-muted);
    }
    .spinner-tiny {
        width: 12px;
        height: 12px;
        border: 1px solid var(--color-border);
        border-top: 1px solid var(--color-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    .proposals-section {
        background: rgba(30, 33, 38, 0.6);
        backdrop-filter: blur(20px);
        border: 1px solid var(--color-border);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        position: relative;
    }
    .proposals-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2rem 2.5rem 1.5rem;
        background: var(--color-bg-secondary);
        border-bottom: 1px solid var(--color-border);
        gap: 2rem;
    }
    .section-title h2 {
        margin: 0 0 1rem 0;
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
    .proposals-stats {
        display: flex;
        gap: 2rem;
        flex-wrap: wrap;
    }
    .stat-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .stat-label {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .stat-value {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-primary);
    }
    .proposals-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-shrink: 0;
    }
    .filter-section {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
    }
    .filter-section label {
        color: var(--color-text-secondary);
        font-weight: 500;
        font-size: 0.85rem;
    }
    .filter-section select {
        padding: 0.5rem 0.75rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        color: var(--color-text-primary);
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    .create-proposal-btn {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 1.5rem;
        background: linear-gradient(
            135deg,
            var(--color-success) 0%,
            var(--color-success-dark, #16a34a) 100%
        );
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.95rem;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 16px rgba(34, 197, 94, 0.3);
    }
    .create-proposal-btn.active {
        background: linear-gradient(
            135deg,
            var(--color-danger) 0%,
            var(--color-danger-dark, #dc2626) 100%
        );
        box-shadow: 0 4px 16px rgba(239, 68, 68, 0.3);
    }
    .auth-hint-compact {
        font-size: 0.85rem;
        color: var(--color-text-muted);
        font-style: italic;
        padding: 0.5rem 1rem;
        background: rgba(239, 68, 68, 0.1);
        border-radius: 8px;
        border: 1px solid rgba(239, 68, 68, 0.2);
    }
    .create-proposal-form {
        padding: 2rem 2.5rem;
        background: var(--color-bg-primary);
        border-bottom: 1px solid var(--color-border);
    }
    .proposals-list {
        padding: 2rem 2.5rem;
        background: var(--color-bg-primary);
    }
</style>
