<script>
    import { onMount } from "svelte";
    import { providerStore } from "$lib/stores/provider.js";
    import { configStore } from "$lib/stores/config.js";

    onMount(() => {
        providerStore.initialize(window.ethereum);
        configStore.load();
    });
</script>

<slot />
