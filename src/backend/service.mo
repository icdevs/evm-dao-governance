// This is the service definition file. There should not be any code in this file other than the service definition that defines the types of public functions for a canister implementing this module and the types needed to call to call those functions .

// Example:

//  public type Message = Text;
//
//  public type Service = actor {
//     hello : (Text) -> async Message;
//     hello2 : query (Text) -> async Message;
//  };

module {

  ////////////////////////////////////
  // Governance Configuration Types
  ////////////////////////////////////

  // Configuration for approved snapshot contracts (ERC-20/721 tokens for voter eligibility)
  public type SnapshotContractConfig = {
    contract_address : Text;
    chain : EthereumNetwork;
    rpc_service : EthereumRPCService;
    contract_type : { #ERC20; #ERC721; #Other : Text }; // Type of token contract
    balance_storage_slot : Nat; // Storage slot number for balance mapping (security requirement)
    enabled : Bool;
  };

  // Configuration for approved execution contracts (targets for ETH transactions)
  public type ExecutionContractConfig = {
    contract_address : Text;
    chain : EthereumNetwork;
    description : ?Text; // Human readable description of what this contract does
    enabled : Bool;
  };

  public type ICPMethodConfig = {
    canister : Principal;
    method : Text;
    enabled : Bool;
  };

  public type EthereumRPCService = {
    rpc_type : Text; // "mainnet", "sepolia", "custom", etc.
    canister_id : Principal;
    custom_config : ?[(Text, Text)]; // For custom RPC configurations
  };

  public type GovernanceConfigShared = {
    snapshot_contracts : [(Text, SnapshotContractConfig)];
    execution_contracts : [(Text, ExecutionContractConfig)];
    approved_icp_methods : [(Text, ICPMethodConfig)];
    admin_principals : [Principal];
    default_snapshot_contract : ?Text;
  };

  ////////////////////////////////////
  // Types (ICRC-149 Spec)
  ////////////////////////////////////

  public type Network = {
    #Ethereum : EthereumNetwork;
    #ICP : Text;
    #Other : { key : Text; value : Value };
  };

  public type EthereumNetwork = {
    chain_id : Nat;
    network_name : Text; // e.g. "mainnet", "sepolia"
  };

  public type ProposalSnapshot = {
    contract_address : Text;
    chain : EthereumNetwork;
    block_number : Nat;
    state_root : Blob;
    total_supply : Nat;
    snapshot_time : Nat;
  };

  public type Witness = {
    blockHash : Blob;
    blockNumber : Nat;
    userAddress : Blob; // 20 bytes
    contractAddress : Blob; // 20 bytes
    storageKey : Blob; // 32 bytes
    storageValue : Blob; // Variable length, typically 32 bytes
    accountProof : [Blob]; // Array of RLP-encoded proof nodes
    storageProof : [Blob]; // Array of RLP-encoded proof nodes
  };

  public type SIWEProof = {
    message : Text;
    signature : Blob;
  };

  public type SIWEResult = {
    #Ok : {
      address : Text;
      domain : Text;
      statement : ?Text;
      issued_at : Nat; // Nanoseconds timestamp
      issued_at_iso : Text; // ISO 8601 format for human readability
      expiration_time : Nat; // Nanoseconds timestamp, must be within 10 minutes of issued_at
      expiration_time_iso : Text; // ISO 8601 format for human readability
      proposal_id : Nat; // Extracted from message
      vote_choice : Text; // Extracted from message ("Yes", "No", "Abstain")
      contract_address : Text; // Extracted from message
      chain_id : Nat; // Extracted from message
      nonce : Text; // Should match expiration_time nanoseconds
    };
    #Err : Text;
  };

  public type WitnessResult = {
    #Ok : {
      valid : Bool;
      user_address : Text;
      contract_address : Text;
      balance : Nat;
      block_number : Nat;
      state_root_verified : Bool;
    };
    #Err : Text;
  };

  public type EthTx = {
    to : Text;
    value : Nat;
    data : Blob;
    chain : EthereumNetwork;
    subaccount : ?Blob; // Subaccount for derivation path in ECDSA signing
    maxPriorityFeePerGas : Nat; // Gas parameters for EIP-1559 transactions
    maxFeePerGas : Nat;
    gasLimit : Nat;
    signature : ?Blob; // signature for the transaction after execution
    nonce : ?Nat; // Transaction nonce, set during execution
  };

  public type ICPCall = {
    canister : Principal; // ICP canister ID
    method : Text; // Method to call
    args : Blob; // Arguments for the method
    cycles : Nat; // Cycles to pay for the call
    best_effort_timeout : ?Nat32; // Best effort timeout for the call in nanoseconds
    result : ?{ #Ok : Blob; #Err : Text }; // Result of the call once executed
  };

  // DAO proposal content specific to EVM bridge

  public type Proposal = {
    id : Nat;
    proposer : Principal;
    action : {
      #Motion : Text;
      #EthTransaction : EthTx;
      #ICPCall : ICPCall;
    };
    created_at : Nat;
    snapshot : ?ProposalSnapshot; // Include full snapshot data instead of just ID
    deadline : Nat;
    metadata : ?Text;
    status : {
      #open;
      #executing;
      #executed;
      #failed;
    };
  };

  // Enhanced proposal type that includes user vote information
  public type ProposalWithUserVote = {
    proposal : Proposal;
    user_vote : ?{ #Yes; #No; #Abstain };
    user_has_voted : Bool;
  };

  // ICRC-149 filters & supporting types following ICRC-137 pattern
  public type ProposalInfoFilter = {
    #by_id : Nat;
    #by_proposer : Principal;
    #by_status : ProposalStatusFilter;
    #by_action_type : ActionTypeFilter;
  };

  public type ProposalStatusFilter = {
    #pending;
    #active;
    #executed;
    #rejected;
    #expired;
    #any;
  };

  public type ActionTypeFilter = {
    #motion;
    #eth_transaction;
    #any;
  };

  public type VoteArgs = {
    proposal_id : Nat;
    voter : Blob; // 20 bytes - Ethereum address
    choice : { #Yes; #No; #Abstain };
    siwe : SIWEProof;
    witness : Witness;
  };

  public type TallyResult = {
    yes : Nat;
    no : Nat;
    abstain : Nat;
    total : Nat;
    result : Text;
  };

  // Enhanced proposal type that includes tally information
  public type ProposalWithTally = {
    id : Nat;
    proposer : Principal;
    action : {
      #Motion : Text;
      #EthTransaction : EthTx;
      #ICPCall : ICPCall;
    };
    created_at : Nat;
    snapshot : ?ProposalSnapshot;
    deadline : Nat;
    metadata : ?Text;
    status : {
      #open;
      #executing;
      #executed;
      #failed;
    };
    tally : TallyResult;
  };

  public type Value = {
    #Nat : Nat;
    #Nat8 : Nat8;
    #Int : Int;
    #Text : Text;
    #Blob : Blob;
    #Bool : Bool;
    #Array : [Value];
    #Map : [(Text, Value)];
  };

  // Result types for consensus
  public type Result<Ok, Err> = {
    #Ok : Ok;
    #Err : Err;
  };

  public type CreateProposalRequest = {
    action : { #Motion : Text; #EthTransaction : EthTx; #ICPCall : ICPCall };
    metadata : ?Text;
    snapshot_contract : ?Text; // Optional snapshot contract for proposal
    siwe : SIWEProof; // Required SIWE proof for proposal creation
  };

  ////////////////////////////////////
  // Service (Public API)
  ////////////////////////////////////

  public type Service = actor {
    // Governance Config - Updated for multiple contracts
    icrc149_governance_config : query () -> async GovernanceConfigShared;

    // Governance Management - Separated snapshot and execution contracts
    icrc149_get_snapshot_contracts : query () -> async [(Text, SnapshotContractConfig)];
    icrc149_get_execution_contracts : query () -> async [(Text, ExecutionContractConfig)];
    icrc149_get_approved_icp_methods : query () -> async [(Text, ICPMethodConfig)];
    icrc149_update_snapshot_contract_config : (Text, ?SnapshotContractConfig) -> async Result<(), Text>;
    icrc149_update_execution_contract_config : (Text, ?ExecutionContractConfig) -> async Result<(), Text>;
    icrc149_update_icp_method_config : (Principal, Text, ?ICPMethodConfig) -> async Result<(), Text>;
    icrc149_update_admin_principal : (Principal, Bool) -> async Result<(), Text>;
    icrc149_update_evm_rpc_canister : (Principal) -> async Result<(), Text>;

    // Get proposal snapshot for a specific proposal
    icrc149_proposal_snapshot : query (Nat) -> async ProposalSnapshot;

    // SIWE Authentication
    icrc149_verify_siwe : (SIWEProof) -> async SIWEResult;

    // Witness Verification for ETH Proofs
    icrc149_verify_witness : (Witness, ?Nat) -> async WitnessResult;

    // Test helper function to add snapshots for testing with chain_id
    icrc149_add_test_snapshot : (Nat, Nat, Blob, Text, Nat, Text) -> async ();

    // Proposal - Updated to include snapshot_contract
    icrc149_create_proposal : (CreateProposalRequest) -> async Result<Nat, Text>;
    icrc149_vote_proposal : (VoteArgs) -> async Result<(), Text>;
    icrc149_execute_proposal : (Nat) -> async Result<Text, Text>;

    // Helper functions for getting proposals
    icrc149_get_proposal : (Nat) -> async ?Proposal;
    icrc149_get_proposals : query (?Nat, ?Nat, [ProposalInfoFilter]) -> async [ProposalWithTally];

    // User Vote Queries
    icrc149_get_user_votes : query ([{ proposal_id : Nat; user_address : Text }]) -> async [{
      proposal_id : Nat;
      user_address : Text;
      vote : ?{ #Yes; #No; #Abstain };
    }];
    icrc149_get_user_vote : query (Nat, Text) -> async ?{ #Yes; #No; #Abstain };
    icrc149_has_user_voted : query (Nat, Text) -> async Bool;
    icrc149_get_proposal_with_user_vote : query (Nat, ?Text) -> async ?{
      proposal : Proposal;
      user_vote : ?{ #Yes; #No; #Abstain };
      user_has_voted : Bool;
    };

    // Admin
    icrc149_set_controller : (Principal) -> async Result<(), Text>;
    icrc149_health_check : query () -> async Text;

    // Standard Compliance
    icrc10_supported_standards : query () -> async [{ name : Text; url : Text }];

    // Testing helpers
    test_add_snapshot : (Text, Nat, Text) -> async Result<(), Text>;
    icrc149_calculate_test_storage_key : query (Blob, Nat) -> async Blob;
    test_get_snapshot_info : query (Text) -> async ?{
      block_number : Nat;
      root_hash : Text;
    };

    // ECDSA Address Management
    icrc149_get_ethereum_address : (?Blob) -> async Text;

    // Admin function to set default snapshot contract
    icrc149_set_default_snapshot_contract : (?Text) -> async Result<(), Text>;

    // Admin function to update proposal duration in nanoseconds
    icrc149_update_proposal_duration : (Nat) -> async Result<(), Text>;

    // Test function for parallel RPC calls
    test_parallel_rpc_calls : (Principal) -> async Result<(Nat, Nat, Nat), Text>;

    // Admin function to manually fix stuck proposals
    icrc149_admin_fix_stuck_proposal : (Nat) -> async Result<Text, Text>;

    // Debug function to check queue status
    debug_queue_status : query () -> async {
      queue_size : Nat;
      processed_size : Nat;
      last_processed_sequence : Nat;
      queue_entries : [(Nat, { proposal_id : Nat; status : Text; hash : ?Text })];
      processed_entries : [(Nat, { proposal_id : Nat; status : Text; hash : ?Text })];
    };

    // Sample function
    hello : () -> async Text;
  };

};
