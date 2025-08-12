<script>
    import "../index.scss";
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import WalletConnector from "$lib/components/WalletConnector.svelte";
    import ProposalForm from "$lib/components/ProposalForm.svelte";
    import ProposalList from "$lib/components/ProposalList.svelte";
    import { authStore } from "$lib/stores/auth.js";

    let initialized = false;
    let activeTab = "proposals"; // 'proposals' or 'create'

    onMount(() => {
        if (browser) {
            // Only initialize canister interactions on the client side
            initialized = true;
        }
    });

    function handleProposalCreated(event) {
        const { id, proposal } = event.detail;
        console.log("Proposal created:", id, proposal);

        // Switch back to proposals tab to see the new proposal
        activeTab = "proposals";

        // You might want to refresh the proposals list here
        // or emit an event to trigger a refresh
    }
</script>

<svelte:head>
    <title>EVM DAO Governance</title>
    <meta
        name="description"
        content="Decentralized governance for EVM-based DAOs using Internet Computer"
    />
</svelte:head>

<main>
    {#if initialized}
        <div class="app-container">
            <header class="app-header">
                <div class="header-content">
                    <h1>EVM DAO Governance</h1>
                    <p class="subtitle">
                        Cross-chain governance powered by Internet Computer
                    </p>
                </div>

                <div class="wallet-section">
                    <WalletConnector />
                </div>
            </header>

            <nav class="tab-navigation">
                <button
                    class="tab-btn {activeTab === 'proposals' ? 'active' : ''}"
                    on:click={() => (activeTab = "proposals")}
                >
                    View Proposals
                </button>
                <button
                    class="tab-btn {activeTab === 'create' ? 'active' : ''}"
                    on:click={() => (activeTab = "create")}
                    disabled={!$authStore.isAuthenticated}
                >
                    Create Proposal
                </button>
            </nav>

            <div class="content-area">
                {#if activeTab === "proposals"}
                    <ProposalList />
                {:else if activeTab === "create"}
                    {#if $authStore.isAuthenticated}
                        <ProposalForm
                            on:proposalCreated={handleProposalCreated}
                        />
                    {:else}
                        <div class="auth-required">
                            <h3>Wallet Connection Required</h3>
                            <p>
                                Please connect your wallet to create proposals.
                            </p>
                        </div>
                    {/if}
                {/if}
            </div>
        </div>
    {:else}
        <div class="loading-screen">
            <div class="spinner"></div>
            <p>Loading DAO Governance...</p>
        </div>
    {/if}
</main>
