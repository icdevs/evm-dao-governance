// Real Canister Interface using DFinity Libraries
import { HttpAgent, Actor } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
import { Principal } from '@dfinity/principal';
import { ethers } from 'ethers';
import { idlFactory } from '../src/declarations/main/main.did.js';

// Global state
let metamaskProvider = null;
let dfxAgent = null;
let canisterActor = null;
let userAddress = null;
let currentChainId = null;
let storageSlot = null;

// Known chain configurations
const CHAIN_CONFIGS = {
    1: { name: 'Ethereum Mainnet', symbol: 'ETH', rpc: 'https://eth.llamarpc.com' },
    11155111: { name: 'Sepolia Testnet', symbol: 'ETH', rpc: 'https://sepolia.infura.io/v3/' },
    137: { name: 'Polygon Mainnet', symbol: 'MATIC', rpc: 'https://polygon-rpc.com' },
    80001: { name: 'Polygon Mumbai', symbol: 'MATIC', rpc: 'https://rpc-mumbai.maticvigil.com' },
    42161: { name: 'Arbitrum One', symbol: 'ETH', rpc: 'https://arb1.arbitrum.io/rpc' },
    421613: { name: 'Arbitrum Goerli', symbol: 'ETH', rpc: 'https://goerli-rollup.arbitrum.io/rpc' },
    10: { name: 'Optimism', symbol: 'ETH', rpc: 'https://mainnet.optimism.io' },
    420: { name: 'Optimism Goerli', symbol: 'ETH', rpc: 'https://goerli.optimism.io' },
    31337: { name: 'Local/Anvil', symbol: 'ETH', rpc: 'http://127.0.0.1:8545' }
};

// IDL factory is now imported from generated declarations
// This ensures we always have the correct, up-to-date interface definitions

// Initialize on page load
window.addEventListener('load', () => {
    initializeApp();
});

// Make functions available globally
window.connectWallet = connectWallet;
window.updateEnvironment = updateEnvironment;
window.updateChainId = updateChainId;
window.loadProposals = loadProposals;
window.discoverStorageSlot = discoverStorageSlot;
window.castVote = castVote;
window.endVote = endVote;
window.loadVoteTally = loadVoteTally;

async function initializeApp() {
    try {
        console.log('Initializing app with real DFinity libraries...');
        
        // Check if MetaMask is available
        if (typeof window.ethereum !== 'undefined') {
            metamaskProvider = new ethers.BrowserProvider(window.ethereum);
            
            // Listen for account changes
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    disconnectWallet();
                } else {
                    userAddress = accounts[0];
                    updateUI();
                }
            });
            
            // Listen for chain changes
            window.ethereum.on('chainChanged', (chainId) => {
                currentChainId = parseInt(chainId, 16);
                updateUI();
            });
            
            // Check if already connected
            const accounts = await metamaskProvider.send("eth_accounts", []);
            if (accounts.length > 0) {
                userAddress = accounts[0];
                const network = await metamaskProvider.getNetwork();
                currentChainId = Number(network.chainId);
                updateConnectionStatus(true);
            }
        } else {
            showStatus('MetaMask not detected. Please install MetaMask to use this interface.', 'error');
        }
        
        updateUI();
        showStatus('✅ Real DFinity libraries loaded successfully', 'success');
    } catch (error) {
        console.error('Initialization error:', error);
        showStatus('Failed to initialize application: ' + error.message, 'error');
    }
}

async function connectWallet() {
    try {
        if (!metamaskProvider) {
            throw new Error('MetaMask not available');
        }
        
        await metamaskProvider.send("eth_requestAccounts", []);
        const signer = await metamaskProvider.getSigner();
        userAddress = await signer.getAddress();
        
        const network = await metamaskProvider.getNetwork();
        currentChainId = Number(network.chainId);
        
        updateConnectionStatus(true);
        showStatus(`Connected to ${userAddress}`, 'success');
    } catch (error) {
        console.error('Connection error:', error);
        showStatus('Failed to connect wallet: ' + error.message, 'error');
    }
}

function disconnectWallet() {
    userAddress = null;
    currentChainId = null;
    updateConnectionStatus(false);
    showStatus('Wallet disconnected', 'info');
}

function updateConnectionStatus(connected) {
    const indicator = document.getElementById('networkIndicator');
    const status = document.getElementById('networkStatus');
    const connectBtn = document.getElementById('connectBtn');
    
    if (connected) {
        indicator.classList.add('connected');
        status.textContent = `Connected: ${userAddress?.slice(0, 6)}...${userAddress?.slice(-4)} (Chain: ${currentChainId})`;
        connectBtn.textContent = 'Disconnect';
        connectBtn.onclick = disconnectWallet;
        
        // Update the UI to reflect the current chain
        updateUI();
    } else {
        indicator.classList.remove('connected');
        status.textContent = 'Disconnected';
        connectBtn.textContent = 'Connect Wallet';
        connectBtn.onclick = connectWallet;
    }
}

function updateEnvironment() {
    const env = document.getElementById('environment').value;
    // Auto-set canister ID for local development
    if (env === 'local') {
        document.getElementById('canisterId').value = 'rdmx6-jaaaa-aaaaa-aaadq-cai';
    }
    showStatus(`Environment set to: ${env}`, 'info');
}

function updateChainId() {
    const select = document.getElementById('chainIdSelect');
    const input = document.getElementById('chainIdInput');
    
    if (select.value === 'custom') {
        select.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
    } else if (select.value) {
        input.classList.add('hidden');
        select.classList.remove('hidden');
        input.value = select.value;
    }
}

async function initializeDfxAgent() {
    const env = document.getElementById('environment').value;
    const canisterId = document.getElementById('canisterId').value;
    
    if (!canisterId) {
        throw new Error('Canister ID is required');
    }
    
    try {
        let agent;
        
        if (env === 'local') {
            // Local development configuration
            agent = new HttpAgent({
                host: 'http://127.0.0.1:8080'
            });
            
            // Fetch root key for local development
            await agent.fetchRootKey();
            console.log('✅ Root key fetched for localhost');
        } else {
            // Internet Computer configuration
            agent = new HttpAgent({
                host: 'https://ic0.app'
            });
        }
        
        dfxAgent = agent;
        
        // Create canister actor
        canisterActor = Actor.createActor(idlFactory, {
            agent: dfxAgent,
            canisterId: Principal.fromText(canisterId)
        });
        
        showStatus(`✅ Connected to canister: ${canisterId}`, 'success');
        return canisterActor;
        
    } catch (error) {
        console.error('DFX agent initialization error:', error);
        throw new Error(`Failed to connect to canister: ${error.message}`);
    }
}

async function loadProposals() {
    const loadBtn = document.getElementById('loadProposalsBtn');
    const spinner = document.getElementById('loadingSpinner');
    const container = document.getElementById('proposalsContainer');
    
    try {
        loadBtn.disabled = true;
        spinner.classList.remove('hidden');
        
        if (!userAddress) {
            throw new Error('Please connect your wallet first');
        }
        
        const chainId = document.getElementById('chainIdInput').value || document.getElementById('chainIdSelect').value;
        const contractAddress = document.getElementById('contractAddress').value;
        
        if (!chainId || !contractAddress) {
            throw new Error('Please specify chain ID and contract address');
        }
        
        // Initialize DFX agent if not already done
        if (!canisterActor) {
            await initializeDfxAgent();
        }
        
        // Get contract configuration from canister
        const contractConfig = await getContractConfig(chainId, contractAddress);
        if (contractConfig) {
            storageSlot = Number(contractConfig.balance_storage_slot);
            showStatus(`✅ Contract configuration loaded. Storage slot: ${storageSlot}`, 'success');
        }
        
        // Load proposals for this contract
        const proposals = await loadProposalsFromCanister(chainId, contractAddress);
        
        // Get user's voting power and existing votes
        const userVotingData = await getUserVotingData(chainId, contractAddress, userAddress, proposals);
        
        // Render proposals
        renderProposals(proposals, userVotingData);
        
    } catch (error) {
        console.error('Load proposals error:', error);
        showStatus('Failed to load proposals: ' + error.message, 'error');
        container.innerHTML = `<div class="status error">Error: ${error.message}</div>`;
    } finally {
        loadBtn.disabled = false;
        spinner.classList.add('hidden');
    }
}

async function getContractConfig(chainId, contractAddress) {
    try {
        showStatus('📡 Getting contract configuration from canister...', 'info');
        const result = await canisterActor.icrc149_get_snapshot_contracts();
        
        // Find the contract in the returned array
        //compare lower case addresses for consistency
        const contractConfig = result.find(([address, config]) => address.toLowerCase() === contractAddress.toLowerCase());

        if (contractConfig) {
            return contractConfig[1]; // Return the config part of the tuple
        } else {
            console.warn('Contract config not found for address:', contractAddress);
            return null;
        }
    } catch (error) {
        console.error('Failed to get contract config:', error);
        return null;
    }
}

async function loadProposalsFromCanister(chainId, contractAddress) {
    try {
        showStatus('📡 Loading proposals from canister...', 'info');
        const result = await canisterActor.icrc149_get_proposals([], [BigInt(10)], []);
        
        const proposals = result.map(proposal => ({
            ...proposal,
            id: Number(proposal.id),
            deadline: Number(proposal.deadline),
            created_at: Number(proposal.created_at)
        }));
        
        showStatus(`✅ Loaded ${proposals.length} proposals`, 'success');
        return proposals;
    } catch (error) {
        console.error('Failed to load proposals:', error);
        throw error;
    }
}

async function getUserVotingData(chainId, contractAddress, userAddress, proposals) {
    try {
        // Get user's token balance at various blocks
        const balance = await getUserTokenBalance(contractAddress, userAddress);
        
        // Get user's existing votes using the bulk vote checking function
        const existingVotes = new Map(); // proposalId -> vote choice
        
        if (canisterActor && userAddress && proposals && proposals.length > 0) {
            try {
                // Build requests array for bulk vote checking using the already-retrieved proposals
                const voteRequests = proposals.map(proposal => ({
                    proposal_id: BigInt(Number(proposal.id)),
                    user_address: userAddress
                }));
                
                // Use the bulk vote checking function
                const voteResults = await canisterActor.icrc149_get_user_votes(voteRequests);
                
                // Process results into the existing votes map
                voteResults.forEach(result => {
                    const proposalId = Number(result.proposal_id);
                    if (result.vote && result.vote.length > 0) {
                        // Extract the vote choice from the optional variant
                        const voteChoice = Object.keys(result.vote[0])[0]; // 'Yes', 'No', or 'Abstain'
                        existingVotes.set(proposalId, voteChoice);
                        console.log(`Found existing vote for proposal ${proposalId}: ${voteChoice}`);
                    }
                });
                
                console.log(`✅ Loaded voting data for ${voteResults.length} proposals, found ${existingVotes.size} existing votes`);
            } catch (voteError) {
                console.error('Failed to get user votes from canister:', voteError);
                showStatus('⚠️ Could not load your voting history', 'warning');
            }
        }
        
        return {
            balance: balance,
            existingVotes: existingVotes
        };
    } catch (error) {
        console.error('Failed to get user voting data:', error);
        return {
            balance: BigInt(0),
            existingVotes: new Map()
        };
    }
}

async function getUserTokenBalance(contractAddress, userAddress) {
    try {
        if (!metamaskProvider) {
            return BigInt(0);
        }
        
        // ERC20 balanceOf function call
        const balanceData = `0x70a08231${userAddress.slice(2).padStart(64, '0')}`;
        const result = await metamaskProvider.send('eth_call', [
            {
                to: contractAddress,
                data: balanceData
            },
            'latest'
        ]);
        
        // Handle empty or invalid responses
        if (!result || result === '0x' || result === '0x0') {
            return BigInt(0);
        }
        
        try {
            return ethers.getBigInt(result);
        } catch (conversionError) {
            console.warn('Failed to convert balance result to BigInt:', result, conversionError);
            return BigInt(0);
        }
    } catch (error) {
        console.error('Failed to get token balance:', error);
        return BigInt(0);
    }
}

function renderProposals(proposals, userVotingData) {
    const container = document.getElementById('proposalsContainer');
    
    if (proposals.length === 0) {
        container.innerHTML = '<div class="status info">No proposals found for this contract.</div>';
        return;
    }
    
    const proposalsHtml = proposals.map(proposal => {
        // Get vote tally from canister (this would need a separate call)
        // For now, we'll show basic proposal info without vote tallies
        
        const hasVoted = userVotingData.existingVotes.has(proposal.id);
        const userVote = userVotingData.existingVotes.get(proposal.id);
        const isActive = Number(proposal.deadline) > Date.now() * 1_000_000; // Convert ms to nanoseconds
        const isPastDeadline = Number(proposal.deadline) <= Date.now() * 1_000_000;
        const userBalance = Number(userVotingData.balance);
        
        // Determine action type for display
        let actionType = 'Unknown';
        let actionDescription = 'Unknown action';
        if ('Motion' in proposal.action) {
            actionType = 'Motion';
            actionDescription = proposal.action.Motion;
        } else if ('EthTransaction' in proposal.action) {
            actionType = 'Ethereum Transaction';
            actionDescription = `Transaction to ${proposal.action.EthTransaction.to}`;
        } else if ('ICPCall' in proposal.action) {
            actionType = 'ICP Call';
            actionDescription = `Call ${proposal.action.ICPCall.method} on ${proposal.action.ICPCall.canister}`;
        }
        
        return `
            <div class="proposal-card">
                <div class="proposal-header">
                    <div class="proposal-id">Proposal #${proposal.id}</div>
                    <div class="proposal-status ${isActive ? 'status-active' : 'status-expired'}">${isActive ? 'Active' : 'Expired'}</div>
                </div>
                
                <div class="proposal-metadata">
                    <strong>Action Type:</strong> ${actionType}<br>
                    <strong>Description:</strong> ${proposal.metadata || actionDescription}<br>
                    <strong>Proposer:</strong> ${proposal.proposer.toString()}
                </div>
                
                <div class="proposal-details">
                    <p><strong>Created:</strong> ${new Date(Number(proposal.created_at) / 1_000_000).toLocaleString()}</p>
                    <p><strong>Deadline:</strong> ${new Date(Number(proposal.deadline) / 1_000_000).toLocaleString()}</p>
                    ${proposal.snapshot && proposal.snapshot[0] ? `<p><strong>Snapshot Block:</strong> ${Number(proposal.snapshot[0].block_number)}</p>` : ''}
                    <p><strong>Your Balance:</strong> ${ethers.formatEther(userBalance.toString())} tokens</p>
                    ${hasVoted ? `<p><strong>Your Vote:</strong> ${userVote}</p>` : ''}
                </div>
                
                <div class="vote-info">
                    <div class="vote-tally">
                        <div class="tally-row">
                            <span><strong>Yes:</strong> ${ethers.formatEther(Number(proposal.tally.yes).toString())} (${proposal.tally.total > 0 ? ((Number(proposal.tally.yes) / Number(proposal.tally.total)) * 100).toFixed(1) : 0}%)</span>
                        </div>
                        <div class="tally-bar">
                            <div class="tally-fill tally-yes" style="width: ${proposal.tally.total > 0 ? ((Number(proposal.tally.yes) / Number(proposal.tally.total)) * 100) : 0}%"></div>
                        </div>
                        
                        <div class="tally-row">
                            <span><strong>No:</strong> ${ethers.formatEther(Number(proposal.tally.no).toString())} (${proposal.tally.total > 0 ? ((Number(proposal.tally.no) / Number(proposal.tally.total)) * 100).toFixed(1) : 0}%)</span>
                        </div>
                        <div class="tally-bar">
                            <div class="tally-fill tally-no" style="width: ${proposal.tally.total > 0 ? ((Number(proposal.tally.no) / Number(proposal.tally.total)) * 100) : 0}%"></div>
                        </div>
                        
                        <div class="tally-row">
                            <span><strong>Abstain:</strong> ${ethers.formatEther(Number(proposal.tally.abstain).toString())} (${proposal.tally.total > 0 ? ((Number(proposal.tally.abstain) / Number(proposal.tally.total)) * 100).toFixed(1) : 0}%)</span>
                        </div>
                        <div class="tally-bar">
                            <div class="tally-fill tally-abstain" style="width: ${proposal.tally.total > 0 ? ((Number(proposal.tally.abstain) / Number(proposal.tally.total)) * 100) : 0}%"></div>
                        </div>
                        
                        <div class="tally-row">
                            <span><strong>Total:</strong> ${ethers.formatEther(Number(proposal.tally.total).toString())} tokens</span>
                        </div>
                        
                        <div class="tally-result">
                            <strong>Status:</strong> <span class="${proposal.tally.result.includes('in progress') || proposal.tally.result === 'Active' ? 'status-active' : (proposal.tally.result === 'Passed' ? 'status-passed' : 'status-failed')}">${proposal.tally.result}</span>
                        </div>
                    </div>
                </div>
                
                ${isActive && !hasVoted && userBalance > 0 ? `
                    <div class="vote-buttons">
                        <button class="btn-success" onclick="castVote(${proposal.id}, 'Yes')">
                            Vote Yes
                        </button>
                        <button class="btn-danger" onclick="castVote(${proposal.id}, 'No')">
                            Vote No
                        </button>
                        <button class="btn-secondary" onclick="castVote(${proposal.id}, 'Abstain')">
                            Abstain
                        </button>
                    </div>
                ` : ''}
                
                ${isPastDeadline ? `
                    <div class="vote-buttons">
                        <button class="btn-warning" onclick="endVote(${proposal.id})">
                            Execute Proposal
                        </button>
                    </div>
                ` : ''}
                
                ${hasVoted ? `
                    <div class="status success">
                        ✅ You have already voted: ${userVote}
                    </div>
                ` : ''}
                
                ${userBalance === 0 ? `
                    <div class="status warning">
                        ⚠️ You have no voting power (0 tokens)
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    container.innerHTML = proposalsHtml;
}

async function loadVoteTally(proposalId, tallyData = null) {
    try {
        const tallyContainer = document.getElementById(`tally-${proposalId}`);
        tallyContainer.innerHTML = '<div class="loading">Loading vote tally...</div>';
        
        let tally = tallyData;
        
        // If tally data wasn't provided, get it from the proposals
        if (!tally) {
            if (!canisterActor) {
                await initializeDfxAgent();
            }
            
            // Get the specific proposal with tally data
            const proposals = await canisterActor.icrc149_get_proposals(null, BigInt(1), [{ by_id: BigInt(proposalId) }]);
            
            if (proposals.length === 0) {
                throw new Error('Proposal not found');
            }
            
            tally = proposals[0].tally;
        }
        
        const totalVotes = Number(tally.total);
        const yesVotes = Number(tally.yes);
        const noVotes = Number(tally.no);
        const abstainVotes = Number(tally.abstain);
        
        const yesPercent = totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 0;
        const noPercent = totalVotes > 0 ? (noVotes / totalVotes) * 100 : 0;
        const abstainPercent = totalVotes > 0 ? (abstainVotes / totalVotes) * 100 : 0;
        
        // Determine if voting is still active based on the tally result
        const isActive = tally.result.includes('in progress') || tally.result === 'Active';
        const resultClass = isActive ? 'status-active' : 
                           (tally.result === 'Passed' ? 'status-passed' : 'status-failed');
        
        tallyContainer.innerHTML = `
            <div class="vote-tally">
                <div class="tally-row">
                    <span><strong>Yes:</strong> ${ethers.formatEther(yesVotes.toString())} (${yesPercent.toFixed(1)}%)</span>
                </div>
                <div class="tally-bar">
                    <div class="tally-fill tally-yes" style="width: ${yesPercent}%"></div>
                </div>
                
                <div class="tally-row">
                    <span><strong>No:</strong> ${ethers.formatEther(noVotes.toString())} (${noPercent.toFixed(1)}%)</span>
                </div>
                <div class="tally-bar">
                    <div class="tally-fill tally-no" style="width: ${noPercent}%"></div>
                </div>
                
                <div class="tally-row">
                    <span><strong>Abstain:</strong> ${ethers.formatEther(abstainVotes.toString())} (${abstainPercent.toFixed(1)}%)</span>
                </div>
                <div class="tally-bar">
                    <div class="tally-fill tally-abstain" style="width: ${abstainPercent}%"></div>
                </div>
                
                <div class="tally-row">
                    <span><strong>Total:</strong> ${ethers.formatEther(totalVotes.toString())} tokens</span>
                </div>
                
                <div class="tally-result">
                    <strong>Status:</strong> <span class="${resultClass}">${tally.result}</span>
                    ${isActive ? ' (Voting in progress)' : ' (Voting completed)'}
                </div>
            </div>
        `;
        
   
        
    } catch (error) {
        console.error('Failed to load vote tally:', error);
        const tallyContainer = document.getElementById(`tally-${proposalId}`);
        tallyContainer.innerHTML = `<div class="status error">Failed to load tally: ${error.message}</div>`;
    }
}

async function castVote(proposalId, choice) {
    try {
        if (!userAddress) {
            throw new Error('Please connect your wallet first');
        }
        
        if (!canisterActor) {
            await initializeDfxAgent();
        }
        
        const chainId = document.getElementById('chainIdInput').value || document.getElementById('chainIdSelect').value;
        const contractAddress = document.getElementById('contractAddress').value;
        
        showStatus(`Preparing to cast ${choice} vote for proposal ${proposalId}...`, 'info');
        
        // Generate SIWE proof
        const siweProof = await generateSIWEProof(proposalId, choice, contractAddress);
        
        // Generate witness proof
        const witness = await generateWitnessProof(contractAddress, userAddress, proposalId);
        
        // Cast vote
        const voteArgs = {
            proposal_id: BigInt(proposalId),
            voter: Array.from(ethers.getBytes(userAddress)),
            choice: choice === 'Yes' ? { Yes: null } : choice === 'No' ? { No: null } : { Abstain: null },
            siwe: siweProof,
            witness: witness
        };
        
        showStatus(`🗳️ Submitting ${choice} vote to canister...`, 'info');
        
        // Call canister
        const result = await canisterActor.icrc149_vote_proposal(voteArgs);
        
        if ('Ok' in result) {
            showStatus(`✅ Vote cast successfully: ${choice}`, 'success');
            // Reload proposals to show updated state
            await loadProposals();
        } else {
            throw new Error(`Vote failed: ${result.Err}`);
        }
        
    } catch (error) {
        console.error('Vote casting error:', error);
        showStatus('Failed to cast vote: ' + error.message, 'error');
    }
}

async function endVote(proposalId) {
    try {
        if (!canisterActor) {
            await initializeDfxAgent();
        }
        
        showStatus(`🔄 Executing proposal ${proposalId}...`, 'info');
        
        const result = await canisterActor.icrc149_execute_proposal(BigInt(proposalId));
        
        if ('Ok' in result) {
            showStatus(`✅ Proposal ${proposalId} executed successfully`, 'success');
            await loadProposals();
        } else {
            throw new Error(`Execution failed: ${result.Err}`);
        }
        
    } catch (error) {
        console.error('Proposal execution error:', error);
        showStatus('Failed to execute proposal: ' + error.message, 'error');
    }
}

async function generateSIWEProof(proposalId, choice, contractAddress) {
    try {
        const signer = await metamaskProvider.getSigner();
        
        // Create SIWE message
        const domain = 'dao-voting.example.com';
        const address = await signer.getAddress();
        const statement = `Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}`;
        const uri = `https://${domain}`;
        const version = '1';
        const chainId = currentChainId;
        
        // Calculate times in nanoseconds (like the working implementation)
        const currentTimeMs = Date.now();
        const currentTimeNanos = BigInt(currentTimeMs) * 1_000_000n;
        const expirationTimeNanos = currentTimeNanos + 540_000_000_000n; // 9 minutes (well under 10 minutes)
        
        const nonce = currentTimeNanos.toString(); // Use current time in nanoseconds as nonce
        const issuedAt = new Date(Number(currentTimeNanos / 1_000_000n)).toISOString();
        const expirationTime = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
        
        const message = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At Nanos: ${currentTimeNanos}
Issued At: ${issuedAt}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTime}`;

        console.log('SIWE Message:', message);
        
        const signature = await signer.signMessage(message);
        
        return {
            message: message,
            signature: Array.from(ethers.getBytes(signature))
        };
        
    } catch (error) {
        console.error('SIWE proof generation error:', error);
        throw new Error('Failed to generate SIWE proof: ' + error.message);
    }
}

async function generateWitnessProof(contractAddress, userAddress, proposalId) {
    try {
        // Get the proposal to find the snapshot block
        const proposals = await loadProposalsFromCanister(currentChainId, contractAddress);
        const proposal = proposals.find(p => p.id === proposalId);
        
        if (!proposal) {
            throw new Error('Proposal not found');
        }
        
        const blockNumber = proposal.snapshot && proposal.snapshot[0] ? proposal.snapshot[0].block_number : null;
        
        if (blockNumber === null || blockNumber === undefined) {
            throw new Error('Proposal does not have a snapshot block number');
        }
        
        // Generate storage key for user's balance
        const slot = storageSlot || 0; // Use discovered slot or default to 0
        const storageKey = getERC20BalanceStorageKey(userAddress, slot);
        
        // Get proof from Ethereum
        const proof = await metamaskProvider.send('eth_getProof', [
            contractAddress,
            [storageKey],
            `0x${blockNumber.toString(16)}`
        ]);
        
        const block = await metamaskProvider.send('eth_getBlockByNumber', [
            `0x${blockNumber.toString(16)}`,
            false
        ]);
        
        return {
            blockHash: Array.from(ethers.getBytes(block.hash)),
            blockNumber: BigInt(blockNumber),
            userAddress: Array.from(ethers.getBytes(userAddress)),
            contractAddress: Array.from(ethers.getBytes(contractAddress)),
            storageKey: Array.from(ethers.getBytes(storageKey)),
            storageValue: Array.from(ethers.getBytes(ethers.toBeHex(proof.storageProof[0]?.value || '0x0', 32))),
            accountProof: proof.accountProof.map(p => Array.from(ethers.getBytes(p))),
            storageProof: proof.storageProof[0]?.proof.map(p => Array.from(ethers.getBytes(p))) || []
        };
        
    } catch (error) {
        console.error('Witness proof generation error:', error);
        throw new Error('Failed to generate witness proof: ' + error.message);
    }
}

function getERC20BalanceStorageKey(userAddress, slotIndex) {
    // Standard ERC20 balance mapping: mapping(address => uint256) balances
    // Storage key = keccak256(abi.encode(userAddress, slotIndex))
    const paddedAddress = ethers.zeroPadValue(userAddress, 32);
    const paddedSlot = ethers.zeroPadValue(ethers.toBeHex(BigInt(slotIndex), 32), 32);
    return ethers.keccak256(ethers.concat([paddedAddress, paddedSlot]));
}

async function discoverStorageSlot() {
    try {
        if (!userAddress) {
            throw new Error('Please connect your wallet first');
        }
        
        const contractAddress = document.getElementById('contractAddress').value;
        if (!contractAddress) {
            throw new Error('Please enter a contract address');
        }
        
        showStatus('🔍 Discovering storage slot for balance mapping...', 'info');
        
        // Get current balance via balanceOf call
        const actualBalance = await getUserTokenBalance(contractAddress, userAddress);
        
        if (actualBalance === BigInt(0)) {
            throw new Error('You have 0 tokens. Storage slot discovery requires a non-zero balance.');
        }
        
        showStatus(`Current balance: ${ethers.formatEther(actualBalance.toString())} tokens. Searching for storage slot...`, 'info');
        
        // Try common storage slots (0-10)
        for (let slot = 0; slot <= 10; slot++) {
            try {
                const storageKey = getERC20BalanceStorageKey(userAddress, slot);
                const storageValue = await metamaskProvider.send('eth_getStorageAt', [
                    contractAddress,
                    storageKey,
                    'latest'
                ]);
                
                const storageBalance = ethers.getBigInt(storageValue || '0x0');
                
                if (storageBalance === actualBalance) {
                    storageSlot = slot;
                    showStatus(`✅ Found storage slot: ${slot}`, 'success');
                    
                    // If we have a canister actor, update the configuration
                    if (canisterActor) {
                        try {
                            const chainId = document.getElementById('chainIdInput').value || document.getElementById('chainIdSelect').value;
                            await updateCanisterStorageSlot(chainId, contractAddress, slot);
                        } catch (updateError) {
                            console.error('Failed to update canister config:', updateError);
                        }
                    }
                    
                    return slot;
                }
            } catch (error) {
                console.log(`Slot ${slot} check failed:`, error.message);
            }
        }
        
        throw new Error('Could not find storage slot in range 0-10. The contract may use a non-standard storage layout.');
        
    } catch (error) {
        console.error('Storage slot discovery error:', error);
        showStatus('Storage slot discovery failed: ' + error.message, 'error');
    }
}

async function updateCanisterStorageSlot(chainId, contractAddress, slot) {
    try {
        showStatus('📡 Updating canister configuration...', 'info');
        
        const config = {
            contract_address: contractAddress,
            chain: { 
                chain_id: BigInt(chainId), 
                network_name: CHAIN_CONFIGS[chainId]?.name || 'Unknown' 
            },
            balance_storage_slot: BigInt(slot),
            enabled: true
        };
        
        const result = await canisterActor.icrc149_update_snapshot_contract_config(contractAddress, [config]);
        
        if ('Ok' in result) {
            showStatus(`✅ Canister configuration updated with storage slot ${slot}`, 'success');
        } else {
            throw new Error(`Failed to update canister: ${result.Err}`);
        }
    } catch (error) {
        console.error('Failed to update canister storage slot:', error);
        showStatus('Failed to update canister configuration: ' + error.message, 'warning');
    }
}

function updateUI() {
    // Update chain ID in the form when MetaMask chain changes
    if (currentChainId) {
        const chainIdSelect = document.getElementById('chainIdSelect');
        const chainIdInput = document.getElementById('chainIdInput');
        
        // Check if current chain ID is in our known chains
        if (CHAIN_CONFIGS[currentChainId]) {
            // Set the dropdown to the detected chain
            chainIdSelect.value = currentChainId.toString();
            chainIdInput.value = currentChainId.toString();
            chainIdInput.classList.add('hidden');
            chainIdSelect.classList.remove('hidden');
            
            const config = CHAIN_CONFIGS[currentChainId];
            showStatus(`🔗 Detected ${config.name} (Chain ID: ${currentChainId})`, 'info');
        } else {
            // Unknown chain, show custom input
            chainIdSelect.value = 'custom';
            chainIdInput.value = currentChainId.toString();
            chainIdSelect.classList.add('hidden');
            chainIdInput.classList.remove('hidden');
            
            showStatus(`🔗 Connected to unknown chain (ID: ${currentChainId})`, 'warning');
        }
    }
}

function showStatus(message, type) {
    const container = document.getElementById('statusMessages');
    const statusDiv = document.createElement('div');
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = message;
    
    container.appendChild(statusDiv);
    
    // Auto-remove after 5 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.parentNode.removeChild(statusDiv);
            }
        }, 5000);
    }
    
    // Scroll to show the message
    statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

console.log('✅ Real canister interface loaded successfully');
