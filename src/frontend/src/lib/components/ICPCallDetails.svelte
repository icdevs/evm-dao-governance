<script>
    export let call;
    export let agent;
    import { decode } from "@dfinity/didc";
    import { fetchDidFromCanister } from "../canisters.js";
    let candidArgs = "";
    let hexArgs = "";
    let loading = true;
    let error = null;
    function uint8ArrayToHex(arr) {
        return Array.from(arr)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }
    $: if (call && agent) {
        loadDetails();
    }
    async function loadDetails() {
        loading = true;
        error = null;
        try {
            hexArgs = uint8ArrayToHex(call.args);
            if (hexArgs == "4449444c0000") {
                candidArgs = "( )";
            } else {
                const didText = await fetchDidFromCanister(
                    agent,
                    call.canister
                );
                candidArgs = decode({
                    idl: didText,
                    input: hexArgs,
                    serviceMethod: call.method,
                    inputFormat: "hex",
                    targetFormat: "candid",
                    useServiceMethodReturnType: false,
                });
            }
        } catch (e) {
            error = e;
        } finally {
            loading = false;
        }
    }
</script>

{#if loading}
    <div class="icp-details-card icp-details-loading">
        Loading ICP Call details...
    </div>
{:else if error}
    <div class="icp-details-card icp-details-error">
        Error loading details: {error.message}
    </div>
{:else}
    <div class="icp-details-card">
        <div class="icp-details-title">ICP Call</div>
        <div class="icp-details-list">
            <div>
                <span class="icp-details-label">Method:</span>
                <span class="icp-details-value">{call.method}</span>
            </div>
            <div>
                <span class="icp-details-label">Canister:</span>
                <span class="icp-details-value">{call.canister}</span>
            </div>
            <div>
                <span class="icp-details-label">Args:</span>
                <span class="icp-details-args">{candidArgs}</span>
            </div>
            <div>
                <span class="icp-details-label">Raw Args:</span>
                <span class="icp-details-raw">0x{hexArgs}</span>
            </div>
        </div>
    </div>
{/if}

<style>
    .icp-details-card {
        background: var(--color-surface-secondary, #f8f9fa);
        border: 1px solid var(--color-border, #ddd);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 0.5rem;
        font-size: 0.98rem;
        color: var(--color-text-primary, #333);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }
    .icp-details-title {
        font-weight: 700;
        font-size: 1.05rem;
        margin-bottom: 0.5rem;
        color: var(--color-info, #0c5460);
    }
    .icp-details-list {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }
    .icp-details-label {
        font-weight: 600;
        color: var(--color-text-secondary, #666);
        font-size: 0.92rem;
        margin-right: 0.5rem;
    }
    .icp-details-value {
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-weight: 500;
        color: var(--color-text-primary, #333);
        word-break: break-all;
    }
    .icp-details-args {
        background: #f3f3f3;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 0.92rem;
        color: #444;
    }
    .icp-details-raw {
        background: #f3f3f3;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 0.92rem;
        color: #444;
    }
    .icp-details-error {
        color: var(--color-danger, #dc3545);
        font-weight: 600;
        background: var(--color-danger-light, #f8d7da);
        border-radius: 4px;
        padding: 4px 8px;
        margin-bottom: 0.5rem;
    }
    .icp-details-loading {
        color: var(--color-text-secondary, #666);
        font-style: italic;
        font-size: 0.98rem;
        margin-bottom: 0.5rem;
    }
</style>
