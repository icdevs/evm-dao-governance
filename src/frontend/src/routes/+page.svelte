<script>
    import "../index.scss";
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import WalletConnector from "$lib/components/WalletConnector.svelte";
    import BalanceDashboard from "$lib/components/BalanceDashboard.svelte";
    import StatusMessages from "$lib/components/StatusMessages.svelte";
    import ProposalForm from "$lib/components/ProposalForm.svelte";
    import ProposalList from "$lib/components/ProposalList.svelte";
    import { authStore } from "$lib/stores/auth.js";
    import { configStore } from "$lib/stores/config.js";
    import { proposalsStore, proposalStats } from "$lib/stores/proposals.js";
    import { autoUserStats } from "$lib/stores/userStats.js";
    import {
        governanceStatsStore,
    } from "$lib/stores/governance.js";
    import { contractsStore } from "$lib/stores/contracts.js";
    import { backend } from "$lib/canisters.js";

    let initialized = false;
    let activeTab = "dashboard"; // 'dashboard', 'proposals', 'create'

    // Dashboard refresh functionality
    let dashboardRefreshFn = null;
    let isDashboardLoading = false;

    let showContractDropdown = false;
    let isGlobalRefreshing = false;

    // Subscribe to proposal statistics
    $: stats = $proposalStats;
    $: userStats = $autoUserStats;
    $: governanceStats = $governanceStatsStore;
    
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
        if (browser) {
            // Load configuration from localStorage
            configStore.load();
            initialized = true;

            // Only load data initially if configured and not already loaded
            if ($configStore.isConfigured) {
                // Load proposals if not already loaded
                if ($proposalsStore.proposals.length === 0 && !$proposalsStore.loading) {
                    proposalsStore.load();
                }
                
                // Load governance stats if not already loaded
                if (!$governanceStatsStore.lastUpdated && !$governanceStatsStore.loading) {
                    governanceStatsStore.load().catch((error) => {
                        console.error("Failed to load governance stats:", error);
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
        proposalsStore.load([], true);

        // Refresh governance stats as well
        governanceStatsStore.load(true);

        // Switch back to proposals tab to see the new proposal
        activeTab = "proposals";
    }

    // Auto-load proposals when configuration is complete (only if not already loaded)
    let proposalsLoadAttempted = false;
    $: if (
        initialized &&
        $configStore.isConfigured &&
        !proposalsLoadAttempted &&
        $proposalsStore.proposals.length === 0 &&
        !$proposalsStore.loading
    ) {
        proposalsLoadAttempted = true;
        proposalsStore.load().catch((error) => {
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
            await proposalsStore.load([], true).catch((error) => {
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
        proposalsStore.load([], true);

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

            <!-- Governance Contract Selector (Inline) -->
            <div class="governance-selector-bar">
                <div class="governance-info">
                    <span class="governance-label">Governance Token:</span>
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

                <div class="governance-actions">
                    <button
                        class="refresh-btn-inline"
                        on:click={handleGlobalRefresh}
                        disabled={!$authStore.isAuthenticated ||
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
                                disabled={!$authStore.isAuthenticated}
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
                        on:click={() => goto('/config')}
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

            <!-- Main Content -->
            <div class="main-content">
                <!-- Navigation Tabs -->
                <nav class="tab-navigation">
                    <button
                        class="tab-btn {activeTab === 'dashboard'
                            ? 'active'
                            : ''}"
                        on:click={() => (activeTab = "dashboard")}
                    >
                        <span class="tab-icon">📊</span>
                        Dashboard
                    </button>
                    <button
                        class="tab-btn {activeTab === 'proposals'
                            ? 'active'
                            : ''}"
                        on:click={() => (activeTab = "proposals")}
                    >
                        <span class="tab-icon">📋</span>
                        Proposals
                    </button>
                    <button
                        class="tab-btn {activeTab === 'create' ? 'active' : ''}"
                        on:click={() => (activeTab = "create")}
                        disabled={!$authStore.isAuthenticated}
                    >
                        <span class="tab-icon">✨</span>
                        Create
                    </button>
                </nav>

                <!-- Content Area -->
                <div class="content-area">
                    {#if activeTab === "dashboard"}
                        <div class="dashboard-view">
                            <BalanceDashboard
                                onRefresh={setDashboardRefreshFn}
                                bind:isLoading={isDashboardLoading}
                            />

                            <!-- Quick Stats -->
                            <div class="quick-stats">
                                <div class="stat-card">
                                    <h4>📊 Total Proposals</h4>
                                    <div class="stat-value">
                                        {#if $proposalsStore.loading}
                                            -
                                        {:else}
                                            {stats.total}
                                        {/if}
                                    </div>
                                    <div class="stat-subtitle">
                                        {#if !$proposalsStore.loading}
                                            {stats.active} active, {stats.executed}
                                            executed
                                        {:else}
                                            Loading...
                                        {/if}
                                    </div>
                                </div>
                                <div class="stat-card">
                                    <h4>👥 Members</h4>
                                    <div class="stat-value">
                                        {#if governanceStats.loading}
                                            -
                                        {:else}
                                            {governanceStats.memberCount}
                                        {/if}
                                    </div>
                                    <div class="stat-subtitle">
                                        {#if !governanceStats.loading}
                                            Token holders
                                        {:else}
                                            Loading...
                                        {/if}
                                    </div>
                                </div>
                                <div class="stat-card">
                                    <h4>⚡ Total Voting Power</h4>
                                    <div class="stat-value">
                                        {#if governanceStats.loading}
                                            -
                                        {:else}
                                            {governanceStats.totalVotingPower}
                                        {/if}
                                    </div>
                                    <div class="stat-subtitle">
                                        {#if !governanceStats.loading}
                                            Governance token supply
                                        {:else}
                                            Loading...
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        </div>
                    {:else if activeTab === "proposals"}
                        <div class="proposals-view">
                            <div class="proposals-container">
                                <ProposalList />
                            </div>
                        </div>
                    {:else if activeTab === "create"}
                        {#if $authStore.isAuthenticated}
                            <div class="create-view">
                                <ProposalForm
                                    on:proposalCreated={handleProposalCreated}
                                />
                            </div>
                        {:else}
                            <div class="create-view">
                                <div class="auth-required">
                                    <div class="auth-icon">🔒</div>
                                    <h3>Wallet Connection Required</h3>
                                    <p>
                                        Connect your wallet to create and vote
                                        on proposals.
                                    </p>
                                    <div class="auth-hint">
                                        Use the wallet connector in the header
                                        to get started.
                                    </div>
                                </div>
                            </div>
                        {/if}
                    {/if}
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
    /* App Layout */
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

    .app-container::before {
        content: "";
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(
                circle at 20% 80%,
                rgba(0, 210, 255, 0.03) 0%,
                transparent 50%
            ),
            radial-gradient(
                circle at 80% 20%,
                rgba(0, 255, 136, 0.02) 0%,
                transparent 50%
            );
        pointer-events: none;
        z-index: -1;
    }

    /* Header */
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

    .app-header::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
            135deg,
            rgba(0, 210, 255, 0.05) 0%,
            transparent 50%,
            rgba(0, 255, 136, 0.03) 100%
        );
        pointer-events: none;
    }

    .header-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: nowrap;
        gap: 1.5rem;
        position: relative;
        z-index: 1;
        width: 100%;
    }

    .brand {
        flex: 1;
        min-width: 0;
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

    .header-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-shrink: 0;
    }

    .config-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            var(--color-surface-secondary) 100%
        );
        border: 1px solid var(--color-border);
        border-radius: 12px;
        color: var(--color-text-secondary);
        text-decoration: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .config-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 210, 255, 0.3);
        border-color: var(--color-primary);
        color: var(--color-primary);
    }

    .config-btn svg {
        width: 20px;
        height: 20px;
        transition: transform 0.3s ease;
    }

    .config-btn:hover svg {
        transform: rotate(90deg);
    }

    /* Main Content */
    .main-content {
        background: rgba(30, 33, 38, 0.6);
        backdrop-filter: blur(20px);
        border: 1px solid var(--color-border);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        position: relative;
    }

    .main-content::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(
            90deg,
            transparent 0%,
            var(--color-primary) 50%,
            transparent 100%
        );
        opacity: 0.5;
    }

    /* Tab Navigation */
    .tab-navigation {
        display: flex;
        background: var(--color-bg-secondary);
        border-bottom: 1px solid var(--color-border);
        padding: 0.5rem;
        margin-bottom: 0;
        gap: 0.25rem;
        position: relative;
    }

    .tab-btn {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.5rem;
        background: none;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 600;
        color: var(--color-text-secondary);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        font-size: 0.95rem;
    }

    .tab-btn:hover:not(:disabled) {
        background: var(--color-surface-hover);
        color: var(--color-text-primary);
        transform: translateY(-1px);
    }

    .tab-btn.active {
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-primary-dark) 100%
        );
        color: #ffffff;
        box-shadow: 0 4px 16px rgba(0, 210, 255, 0.3);
        transform: translateY(-1px);
    }

    .tab-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
    }

    .tab-icon {
        font-size: 1.2rem;
        filter: drop-shadow(0 0 4px currentColor);
    }

    /* Content Area */
    .content-area {
        padding: 1.5rem 2.5rem 1rem 2.5rem;
        min-height: 60vh;
        background: var(--color-bg-primary);
    }

    /* Dashboard */
    .dashboard-view {
        display: flex;
        flex-direction: column;
        gap: 2.5rem;
        position: relative;
    }

    /* Proposals View - Similar structure to dashboard */
    .proposals-view {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        position: relative;
    }

    /* Create View - Similar structure to dashboard */
    .create-view {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        position: relative;
    }

    /* Proposals Container - Grey sub-box styling similar to balance dashboard */
    .proposals-container {
        background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            var(--color-surface-secondary) 100%
        );
        border: 1px solid var(--color-border);
        border-radius: 16px;
        padding: 2rem;
        position: relative;
        overflow: hidden;
    }

    .proposals-container::before {
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

    .dashboard-controls {
        display: flex;
        justify-content: flex-end;
        margin-bottom: -1rem; /* Negative margin to reduce gap with dashboard content */
    }

    .refresh-btn {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1.5rem;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-primary-dark) 100%
        );
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.95rem;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 16px rgba(0, 210, 255, 0.3);
        position: relative;
        overflow: hidden;
    }

    .refresh-btn::before {
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

    .refresh-btn:hover::before {
        left: 100%;
    }

    .refresh-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 210, 255, 0.4);
    }

    .refresh-btn:active:not(:disabled) {
        transform: translateY(0);
    }

    .refresh-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
        box-shadow: 0 2px 8px rgba(0, 210, 255, 0.2);
    }

    .refresh-icon {
        width: 18px;
        height: 18px;
        transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .refresh-icon.spinning {
        animation: spin-counterclockwise 1s linear infinite;
    }

    @keyframes spin-counterclockwise {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(-360deg);
        }
    }

    .quick-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 2rem;
    }

    .stat-card {
        background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            var(--color-surface-secondary) 100%
        );
        border: 1px solid var(--color-border);
        border-radius: 16px;
        padding: 2rem;
        text-align: center;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }

    .stat-card::before {
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
        opacity: 0;
        transition: opacity 0.3s ease;
    }

    .stat-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
        border-color: var(--color-primary);
    }

    .stat-card:hover::before {
        opacity: 1;
    }

    .stat-card h4 {
        margin: 0 0 1.5rem 0;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .stat-value {
        font-size: 3rem;
        font-weight: 800;
        background: linear-gradient(
            135deg,
            var(--color-primary) 0%,
            var(--color-success) 100%
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-bottom: 0.75rem;
        line-height: 1;
    }

    .stat-subtitle {
        font-size: 0.85rem;
        color: var(--color-text-muted);
        font-weight: 500;
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
    }

    /* Auth Required */
    .auth-required {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 4rem 2rem;
        min-height: 400px;
        background: var(--color-surface);
        border-radius: 16px;
        border: 1px solid var(--color-border);
    }

    .auth-icon {
        font-size: 4rem;
        margin-bottom: 2rem;
        opacity: 0.6;
        filter: drop-shadow(0 0 8px currentColor);
    }

    .auth-required h3 {
        margin: 0 0 1rem 0;
        color: var(--color-text-primary);
        font-size: 1.5rem;
        font-weight: 700;
    }

    .auth-required p {
        margin: 0 0 1.5rem 0;
        color: var(--color-text-secondary);
        font-size: 1.1rem;
        max-width: 400px;
        line-height: 1.6;
    }

    .auth-hint {
        font-size: 0.9rem;
        color: var(--color-text-muted);
        font-style: italic;
        opacity: 0.8;
    }

    /* Loading Screen */
    .loading-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
    }

    .spinner {
        width: 3rem;
        height: 3rem;
        border: 3px solid var(--color-border);
        border-top: 3px solid var(--color-primary);
        border-radius: 50%;
        animation: spin-clockwise 1s linear infinite;
        margin-bottom: 2rem;
        box-shadow: 0 0 20px rgba(0, 210, 255, 0.3);
    }

    @keyframes spin-clockwise {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    .loading-screen p {
        font-size: 1.1rem;
        font-weight: 500;
        opacity: 0.9;
        color: var(--color-text-secondary);
    }

    /* Governance Selector Bar - Inline */
    .governance-selector-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 2rem;
        background: var(--color-surface-secondary);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        margin-bottom: 1.5rem;
        font-size: 0.9rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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

    .governance-info .inline-address:hover {
        background: rgba(0, 210, 255, 0.15);
        border-color: rgba(0, 210, 255, 0.3);
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

    .governance-info .inline-copy-btn:hover {
        background: rgba(0, 210, 255, 0.2);
        transform: scale(1.1);
    }

    .governance-info .inline-copy-btn svg {
        width: 14px;
        height: 14px;
    }

    .governance-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .governance-label {
        font-weight: 500;
    }

    .contract-display {
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        background: var(--color-surface);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        border: 1px solid var(--color-border);
        color: var(--color-text-primary);
        font-size: 0.85rem;
    }

    .copy-btn-inline {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: all 0.2s ease;
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .copy-btn-inline:hover {
        background: var(--color-surface);
        color: var(--color-text-primary);
    }

    .copy-btn-inline svg {
        width: 14px;
        height: 14px;
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

    .refresh-btn-inline:hover:not(:disabled) {
        background: var(--color-surface-secondary);
        border-color: var(--color-primary);
        color: var(--color-primary);
    }

    .refresh-btn-inline:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .refresh-icon-inline {
        width: 14px;
        height: 14px;
        transition: transform 0.2s ease;
    }

    .refresh-icon-inline.spinning {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
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

    .config-btn-inline:hover {
        background: var(--color-surface-secondary);
        border-color: var(--color-primary);
        color: var(--color-primary);
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

    .copy-btn-inline {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 3px;
        transition: background 0.2s ease;
        font-size: 0.8rem;
        opacity: 0.7;
    }

    .copy-btn-inline:hover {
        background: var(--color-surface);
        opacity: 1;
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
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
    }

    .change-btn:hover:not(:disabled) {
        background: var(--color-surface-secondary);
        border-color: var(--color-primary);
    }

    .change-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .change-btn svg {
        width: 14px;
        height: 14px;
        transition: transform 0.2s ease;
    }

    .selector-dropdown.open .change-btn svg {
        transform: rotate(180deg);
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

    .dropdown-item:last-child {
        border-bottom: none;
    }

    .dropdown-item:hover {
        background: var(--color-surface-secondary);
    }

    .dropdown-item.selected {
        background: var(--color-primary-light, rgba(0, 123, 255, 0.1));
        border-left: 3px solid var(--color-primary);
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

    /* Responsive Design */
    @media (max-width: 768px) {
        .governance-selector-bar {
            flex-direction: column;
            gap: 0.5rem;
            align-items: flex-start;
        }

        .governance-info {
            width: 100%;
        }

        .governance-actions {
            width: 100%;
            justify-content: flex-end;
        }

        .contract-display {
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    @media (min-width: 769px) {
        .header-content {
            flex-direction: row;
            flex-wrap: nowrap;
            text-align: left;
        }

        .header-actions {
            justify-content: flex-end;
        }

        .brand {
            text-align: left;
        }
    }

    @media (max-width: 768px) {
        .app-container {
            padding: 1rem;
        }

        .app-header {
            padding: 1.5rem;
            border-radius: 12px;
        }

        .header-content {
            flex-direction: column;
            text-align: center;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .header-actions {
            width: 100%;
            justify-content: center;
        }

        .brand {
            width: 100%;
            text-align: center;
        }

        .brand h1 {
            font-size: 2rem;
        }

        .tab-navigation {
            flex-direction: column;
            padding: 1rem;
        }

        .tab-btn {
            border-radius: 8px;
            justify-content: center;
            padding: 1rem;
        }

        .content-area {
            padding: 1.5rem;
        }

        .quick-stats {
            grid-template-columns: 1fr;
            gap: 1.5rem;
        }

        .stat-card {
            padding: 1.5rem;
        }

        .stat-value {
            font-size: 2.5rem;
        }

        .auth-required {
            padding: 2rem 1rem;
            min-height: 300px;
        }

        .auth-icon {
            font-size: 3rem;
            margin-bottom: 1.5rem;
        }

        .auth-required h3 {
            font-size: 1.25rem;
        }

        .auth-required p {
            font-size: 1rem;
        }
    }

    /* Scrollbar Styling */
    :global(::-webkit-scrollbar) {
        width: 8px;
    }

    :global(::-webkit-scrollbar-track) {
        background: var(--color-bg-secondary);
    }

    :global(::-webkit-scrollbar-thumb) {
        background: var(--color-border);
        border-radius: 4px;
    }

    :global(::-webkit-scrollbar-thumb:hover) {
        background: var(--color-primary);
    }
</style>
