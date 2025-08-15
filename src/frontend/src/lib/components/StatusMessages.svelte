<script>
    import { statusStore, MESSAGE_TYPES } from "../stores/status.js";
    import { fly } from "svelte/transition";

    $: messages = $statusStore;

    function getIcon(type) {
        switch (type) {
            case MESSAGE_TYPES.SUCCESS:
                return "✅";
            case MESSAGE_TYPES.ERROR:
                return "❌";
            case MESSAGE_TYPES.WARNING:
                return "⚠️";
            case MESSAGE_TYPES.INFO:
            default:
                return "ℹ️";
        }
    }

    function removeMessage(id) {
        statusStore.remove(id);
    }
</script>

<div class="status-container">
    {#each messages as message (message.id)}
        <div
            class="status-message {message.type}"
            transition:fly={{ y: -20, duration: 300 }}
        >
            <div class="message-content">
                <span class="message-icon">{getIcon(message.type)}</span>
                <span class="message-text">{message.message}</span>
            </div>
            <button
                class="close-btn"
                on:click={() => removeMessage(message.id)}
                title="Dismiss"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M18 6L6 18M6 6L18 18"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
        </div>
    {/each}
</div>

<style>
    .status-container {
        position: fixed;
        top: 1.5rem;
        right: 1.5rem;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 420px;
        pointer-events: none;
    }

    .status-message {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.25rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(20px);
        pointer-events: auto;
        border: 1px solid var(--color-border);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }

    .status-message::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        transition: all 0.3s ease;
    }

    .status-message:hover {
        transform: translateX(-4px);
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
    }

    .message-content {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex: 1;
    }

    .message-icon {
        font-size: 1.5rem;
        flex-shrink: 0;
        filter: drop-shadow(0 2px 4px currentColor);
    }

    .message-text {
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.5;
    }

    .close-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 8px;
        color: inherit;
        transition: all 0.3s ease;
        flex-shrink: 0;
        margin-left: 0.75rem;
        backdrop-filter: blur(10px);
    }

    .close-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.4);
        transform: scale(1.1);
    }

    .close-btn svg {
        width: 1.2rem;
        height: 1.2rem;
    }

    /* Message type styles */
    .status-message.success {
        background: linear-gradient(
            135deg,
            rgba(0, 255, 136, 0.9) 0%,
            rgba(0, 200, 100, 0.95) 100%
        );
        color: white;
        border-color: var(--color-success);
    }

    .status-message.success::before {
        background: var(--color-success);
    }

    .status-message.error {
        background: linear-gradient(
            135deg,
            rgba(255, 71, 87, 0.9) 0%,
            rgba(231, 76, 60, 0.95) 100%
        );
        color: white;
        border-color: var(--color-danger);
    }

    .status-message.error::before {
        background: var(--color-danger);
    }

    .status-message.warning {
        background: linear-gradient(
            135deg,
            rgba(255, 184, 0, 0.9) 0%,
            rgba(243, 156, 18, 0.95) 100%
        );
        color: var(--color-bg-primary);
        border-color: var(--color-warning);
    }

    .status-message.warning::before {
        background: var(--color-warning);
    }

    .status-message.info {
        background: linear-gradient(
            135deg,
            rgba(0, 210, 255, 0.9) 0%,
            rgba(116, 185, 255, 0.95) 100%
        );
        color: white;
        border-color: var(--color-primary);
    }

    .status-message.info::before {
        background: var(--color-primary);
    }

    @media (max-width: 768px) {
        .status-container {
            top: 1rem;
            right: 1rem;
            left: 1rem;
            max-width: none;
        }

        .status-message {
            padding: 1rem 1.25rem;
        }

        .message-text {
            font-size: 0.9rem;
        }

        .message-icon {
            font-size: 1.25rem;
        }

        .status-message:hover {
            transform: none;
        }
    }
</style>
