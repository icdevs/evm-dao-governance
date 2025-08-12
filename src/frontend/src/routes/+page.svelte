<script>
    import "../index.scss";
    import { backend } from "$lib/canisters";
    import { onMount } from "svelte";
    import { browser } from "$app/environment";

    let initialized = false;

    onMount(() => {
        if (browser) {
            // Only initialize canister interactions on the client side
            initialized = true;
        }
    });
</script>

<main>
    {#if initialized}
        Test - Canister Ready
    {:else}
        Test - Loading...
    {/if}
</main>
