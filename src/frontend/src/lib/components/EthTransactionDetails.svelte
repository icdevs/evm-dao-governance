<script>
    export let tx;
    import { getNetworkInfo } from "../utils.js";
    $: networkInfo = getNetworkInfo(Number(tx.chain.chain_id));
</script>

<div>
    <strong>Ethereum Transaction</strong><br />
    <strong>To:</strong>
    {tx.to.slice(0, 10)}...<br />
    <strong>Network:</strong>
    {networkInfo.name}
</div>
