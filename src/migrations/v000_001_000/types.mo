// do not remove comments from this file
import _Time "mo:base/Time";
import Principal "mo:base/Principal";
import Array "mo:base/Array";
import OVSFixed "mo:ovs-fixed";
import TimerToolLib "mo:timer-tool";
import LogLib "mo:stable-local-log";


import BTree "mo:stableheapbtreemap/BTree";
import ProposalEngine "../../../../../../../../../../ICDevs/projects/motoko_proposal_engine/src/ExtendedProposalEngine";

// please do not import any types from your project outside migrations folder here
// it can lead to bugs when you change those types later, because migration types should not be changed
// you should also avoid importing these types anywhere in your project directly from here
// use MigrationTypes.Current property instead


module {

  // do not remove the timer tool as it is essential for icrc85
  public let TimerTool = TimerToolLib;
  public let Log = LogLib;

  ////////////////////////////////////////////
  // Types for EvmDaoBridge State v0.1.0
  ////////////////////////////////////////////

  public type InitArgs = {
    snapshot_contracts: [SnapshotContractConfig];
    execution_contracts: [ExecutionContractConfig];
    approved_icp_methods: [ICPMethodConfig];
    admin_principals: [Principal];
    proposal_duration_days: ?Nat;
  };

  // Configuration for approved snapshot contracts (ERC-20/721 tokens for voter eligibility)
  public type SnapshotContractConfig = {
    contract_address: Text;
    chain: EthereumNetwork;
    rpc_service: EthereumRPCService;
    contract_type: {#ERC20; #ERC721; #Other: Text}; // Type of token contract
    balance_storage_slot: Nat; // Storage slot number for balance mapping (security requirement)
    enabled: Bool;
  };

  // Configuration for approved execution contracts (targets for ETH transactions)
  public type ExecutionContractConfig = {
    contract_address: Text;
    chain: EthereumNetwork;
    description: ?Text; // Human readable description of what this contract does
    enabled: Bool;
  };

  // Configuration for approved ICP method calls
  public type ICPMethodConfig = {
    canister: Principal;
    method: Text;
    enabled: Bool;
  };

  // RPC Service configuration for Ethereum networks
  // Note: This defines the structure but uses simplified RPC types for migration safety
  public type EthereumRPCService = {
    rpc_type: Text; // "mainnet", "sepolia", "custom", etc.
    canister_id: Principal;
    custom_config: ?[(Text, Text)]; // For custom RPC configurations
  };

  // Do not remove ICRC85 as it is essential for funding open source projects
  public type ICRC85Options = OVSFixed.ICRC85Environment;

  public type Environment = {
    tt: TimerToolLib.TimerTool;
    advanced : ?{
      icrc85 : ICRC85Options;
    };
    log: Log.Local_log;
  };

  public type Stats = {
    proposals: Nat;
    votes: Nat;
    config: GovernanceConfigShared;
    icrc85: {
      nextCycleActionId: ?Nat;
      lastActionReported: ?Nat;
      activeActions: Nat;
    };
    log: [Text];
  };

  // On-chain, core configuration of the bridge - now supports multiple contracts
  public type GovernanceConfig = {
    var snapshot_contracts: BTree.BTree<Text, SnapshotContractConfig>; // contract_address -> config
    var execution_contracts: BTree.BTree<Text, ExecutionContractConfig>; // contract_address -> config
    var approved_icp_methods: BTree.BTree<Text, ICPMethodConfig>; // "canister_id:method" -> config
    var admin_principals: BTree.BTree<Principal, Bool>; // admin principals set
    var default_snapshot_contract: ?Text; // default snapshot contract address
    var proposal_duration_days: Nat; // Default proposal duration in days (default: 4)
    var evm_rpc_canister_id: Principal; // Configurable EVM RPC canister ID (defaults to mainnet)
  };
  
  public type GovernanceConfigShared = {
    snapshot_contracts: [(Text, SnapshotContractConfig)];
    execution_contracts: [(Text, ExecutionContractConfig)];
    approved_icp_methods: [(Text, ICPMethodConfig)];
    admin_principals: [Principal];
    default_snapshot_contract: ?Text;
    proposal_duration_days: Nat;
    evm_rpc_canister_id: Principal;
  };

  public func shareGovernanceConfig(config: GovernanceConfig) : GovernanceConfigShared {
    {
      snapshot_contracts = BTree.toArray(config.snapshot_contracts);
      execution_contracts = BTree.toArray(config.execution_contracts);
      approved_icp_methods = BTree.toArray(config.approved_icp_methods);
      admin_principals = BTree.toArray(config.admin_principals) |> Array.map(_, func((item :(Principal,Bool))) : Principal { item.0 });
      default_snapshot_contract = config.default_snapshot_contract;
      proposal_duration_days = config.proposal_duration_days;
      evm_rpc_canister_id = config.evm_rpc_canister_id;
    }
  };

  // Proposal snapshot, as associated with each proposal
  public type ProposalSnapshot = {
    contract_address: Text;
    chain: EthereumNetwork;
    block_number: Nat;
    state_root: Blob;
    total_supply: Nat;
    snapshot_time: Nat;
  };
  public type ProposalSnapshotShared = ProposalSnapshot;

  public type EthereumNetwork = {
    chain_id: Nat;
    network_name: Text;
  };

  public type ICPCall = {
    canister: Principal; // ICP canister ID
    method: Text; // Method to call
    args: Blob; // Arguments for the method
    cycles: Nat;
     best_effort_timeout: ?Nat32; 
    var result: ?{#Ok: Blob; #Err: Text};
  };

  public type ICPCallShared = {
    canister: Principal; // ICP canister ID
    method: Text; // Method to call
    args: Blob; // Arguments for the method
    cycles: Nat;
    best_effort_timeout: ?Nat32; 
    result: ?{#Ok: Blob; #Err: Text};
  };

  public func shareICPCall(call: ICPCall) : ICPCallShared {
    {
      call with
      result = call.result;
    }
  };

  public type ProposalAction = {
    #Motion: Text; // Motion text
    #EthTransaction: EthTx; // Ethereum transaction
    #ICPCall: ICPCall; // ICP canister call
  };
  public type ProposalActionShared = {
    #Motion: Text;
    #EthTransaction: EthTxShared;
    #ICPCall: ICPCallShared;
  };

  public func shareProposalAction(action: ProposalAction) : ProposalActionShared {
    switch (action) {
      case (#Motion(text)) { #Motion(text) };
      case (#EthTransaction(tx)) { #EthTransaction(shareEthTx(tx)) };
      case (#ICPCall(call)) { #ICPCall(shareICPCall(call)) };
    };
  };

  // DAO proposal content specific to EVM bridge
  public type ProposalContent = {
    action: {
      #Motion: Text;
      #EthTransaction: EthTx;
      #ICPCall: ICPCall;
    };
    snapshot: ?Nat;
    metadata: ?Text;
  };

  public type ProposalContentShared = ProposalContent;

  // Vote choice for EVM DAO Bridge
  public type VoteChoice = { #Yes; #No; #Abstain };
  public type VoteChoiceShared = VoteChoice;

  // Using ProposalEngine types (Boolean voting)
  public type Proposal = ProposalEngine.Proposal<ProposalContent, VoteChoice>;
  public type ProposalShared = Proposal;

  public type Member = {
    id: Principal;
    votingPower: Nat;
  };
  public type MemberShared = Member;

  public type ProposalEngineData = ProposalEngine.StableData<ProposalContent, VoteChoice>;
  public type ProposalEngineDataShared = ProposalEngineData;

  public type EthTx = {
    to: Text;
    value: Nat;
    data: Blob;
    chain: EthereumNetwork;
    subaccount: ?Blob; // Subaccount for derivation path in ECDSA signing
    maxPriorityFeePerGas: Nat; // Gas parameters for EIP-1559 transactions
    maxFeePerGas: Nat;
    gasLimit: Nat;
    var signature: ?Blob; // Optional signature for the transaction
    var nonce: ?Nat; // Transaction nonce, set during execution
  };
  public type EthTxShared = {
    to: Text;
    value: Nat;
    data: Blob;
    chain: EthereumNetwork;
    subaccount: ?Blob; // Subaccount for derivation path in ECDSA signing
    maxPriorityFeePerGas: Nat; // Gas parameters for EIP-1559 transactions
    maxFeePerGas: Nat;
    gasLimit: Nat;
    signature: ?Blob; // Optional signature for the transaction
    nonce: ?Nat; // Transaction nonce, set during execution
  };

  public func shareEthTx(tx: EthTx) : EthTxShared {
    {
      to = tx.to;
      value = tx.value;
      data = tx.data;
      chain = tx.chain;
      subaccount = tx.subaccount;
      maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
      maxFeePerGas = tx.maxFeePerGas;
      gasLimit = tx.gasLimit;
      signature = tx.signature;
      nonce = tx.nonce;
    }
  };

  public type Witness = {
    blockHash: Blob;
    blockNumber: Nat;
    userAddress: Blob; // 20 bytes
    contractAddress: Blob; // 20 bytes  
    storageKey: Blob; // 32 bytes
    storageValue: Blob; // Variable length, typically 32 bytes
    accountProof: [Blob]; // Array of RLP-encoded proof nodes
    storageProof: [Blob]; // Array of RLP-encoded proof nodes
  };
  public type WitnessShared = Witness;

  public type SIWEProof = {
    message: Text;
    signature: Blob;
  };
  public type SIWEProofShared = SIWEProof;

  
public type SIWEResult = {
    #Ok: {
      address: Text;
      domain: Text;
      statement: ?Text;
      issued_at: Nat;           // Nanoseconds timestamp
      issued_at_iso: Text;      // ISO 8601 format for human readability  
      expiration_time: Nat;     // Nanoseconds timestamp, must be within 10 minutes of issued_at
      expiration_time_iso: Text; // ISO 8601 format for human readability
      proposal_id: Nat;         // Extracted from message
      vote_choice: Text;        // Extracted from message ("Yes", "No", "Abstain")
      contract_address: Text;   // Extracted from message
      chain_id: Nat;           // Extracted from message
      nonce: Text;             // Should match expiration_time nanoseconds
    };
    #Err: Text;
  };
  public type SIWEResultShared = SIWEResult;

  public type WitnessResult = {
    #Ok: {
      valid: Bool;
      user_address: Text;
      contract_address: Text;
      balance: Nat;
      block_number: Nat;
      state_root_verified: Bool;
    };
    #Err: Text;
  };
  public type WitnessResultShared = WitnessResult;

  public type VoteArgs = {
    proposal_id: Nat;
    voter: Blob; // 20 bytes - Ethereum address
    choice: VoteChoice;
    siwe: SIWEProof;
    witness: Witness;
  };
  public type VoteArgsShared = VoteArgs;

  public type TallyResult = {
    yes: Nat;
    no: Nat;
    abstain: Nat;
    total: Nat;
    result: Text;
  };
  public type TallyResultShared = TallyResult;

  // =============== State Collections ==================

  // Full Governance State / root stable record
  public type State = {
    var config: GovernanceConfig;
    snapshots: BTree.BTree<Nat, ProposalSnapshot>;
    var proposalEngine: ProposalEngineData;
    
    // Indexes for efficient proposal filtering
    proposalsByProposer: BTree.BTree<Principal, BTree.BTree<Nat, Bool>>; // Principal -> Set of proposal IDs
    proposalsByStatus: BTree.BTree<Text, BTree.BTree<Nat, Bool>>; // Status -> Set of proposal IDs  
    proposalsByActionType: BTree.BTree<Text, BTree.BTree<Nat, Bool>>; // ActionType -> Set of proposal IDs
    proposalsChronological: BTree.BTree<Nat, Nat>; // created_at timestamp -> proposal ID for time-based ordering
    
    // Ethereum account nonce tracking (chain_id:address -> nonce)
    ethereumNonces: BTree.BTree<Text, Nat>;
    
    icrc85: {
      var nextCycleActionId: ?Nat;
      var lastActionReported: ?Nat;
      var activeActions: Nat;
    };
  };



  public type VoteRecord = {
    choice: VoteChoice;
    weight: Nat;
    siwe: SIWEProof;
    witness: Witness;
    cast_at: Nat;
  };
  public type VoteRecordShared = VoteRecord;

  // Utility types for Value/Other Storage
  public type Value = {
    #Nat: Nat;
    #Nat8: Nat8;
    #Int: Int;
    #Text: Text;
    #Blob: Blob;
    #Bool: Bool;
    #Array: [Value];
    #Map: [(Text, Value)];
  };
  public type Network = {
    #Ethereum: EthereumNetwork;
    #ICP: Text;
    #Other: { key: Text; value: Value };
  };

  // Everything the actor uses for non-mutation purposes should use the XShared
  // versions of state objects (upgrade safe, no var fields)
  // Use shareX(x: X) : XShared helpers where needed (define as needed)
};
