<script>
    import "../../index.scss";
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import WalletConnector from "$lib/components/WalletConnector.svelte";
    import ProposalDetail from "$lib/components/ProposalDetail.svelte";

    let initialized = false;
    let proposalId = null;

    onMount(() => {
        if (browser) {
            initialized = true;

            // Get proposal ID from URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const id = urlParams.get("id") || $page.params.id;

            if (id) {
                proposalId = parseInt(id, 10);
            } else {
                // Try to get from URL path if structured as /proposal/123
                const pathSegments = window.location.pathname.split("/");
                const lastSegment = pathSegments[pathSegments.length - 1];
                const parsedId = parseInt(lastSegment, 10);
                if (!isNaN(parsedId)) {
                    proposalId = parsedId;
                }
            }
        }
    });

    function goBack() {
        if (browser) {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = "/";
            }
        }
    }
</script>

<svelte:head>
    <title
        >Proposal {proposalId ? `#${proposalId}` : ""} - EVM DAO Governance</title
    >
    <meta name="description" content="View and vote on DAO proposal" />
</svelte:head>

<main>
    {#if initialized}
        <div class="app-container">
            <header class="app-header">
                <div class="header-content">
                    <div class="header-nav">
                        <button class="back-btn" on:click={goBack}>
                            ← Back
                        </button>
                        <h1>Proposal Details</h1>
                    </div>
                </div>

                <div class="wallet-section">
                    <WalletConnector />
                </div>
            </header>

            <div class="content-area">
                {#if proposalId}
                    <ProposalDetail {proposalId} />
                {:else}
                    <div class="error-state">
                        <h2>Invalid Proposal</h2>
                        <p>No valid proposal ID was provided.</p>
                        <button class="primary-btn" on:click={goBack}>
                            Go Back
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    {:else}
        <div class="loading-screen">
            <div class="spinner"></div>
            <p>Loading proposal...</p>
        </div>
    {/if}
</main>

<style>
    .header-nav {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .back-btn {
        padding: 0.5rem 1rem;
        background: var(--color-surface, #fff);
        color: var(--color-primary, #007bff);
        border: 1px solid var(--color-primary, #007bff);
        border-radius: 6px;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s ease;
        text-decoration: none;
    }

    .back-btn:hover {
        background: var(--color-primary, #007bff);
        color: white;
    }

    .error-state {
        text-align: center;
        padding: 3rem;
        background: var(--color-surface, #fff);
        border-radius: 12px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .error-state h2 {
        color: var(--color-text-primary, #333);
        margin-bottom: 1rem;
    }

    .error-state p {
        color: var(--color-text-secondary, #666);
        margin-bottom: 2rem;
    }

    .primary-btn {
        padding: 0.75rem 1.5rem;
        background: var(--color-primary, #007bff);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 1rem;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .primary-btn:hover {
        background: var(--color-primary-dark, #0056b3);
    }
</style>
