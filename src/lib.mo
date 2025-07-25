import MigrationTypes "migrations/types";
import MigrationLib "migrations";
import ClassPlusLib "mo:class-plus";
import Service "service";
import WitnessValidator "WitnessValidator";
import D "mo:base/Debug";
import Star "mo:star/star";
import ovsfixed "mo:ovs-fixed";
import Int "mo:base/Int";
import Time "mo:base/Time";
import Principal "mo:base/Principal";
import Blob "mo:base/Blob";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat8";
import BTree "mo:stableheapbtreemap/BTree";
import Text "mo:base/Text";
import ExtendedProposalEngine "../../../../../../../../ICDevs/projects/motoko_proposal_engine/src/ExtendedProposalEngine";
import Result "mo:base/Result";
import Iter "mo:base/Iter";
import Array "mo:base/Array";
import ICPCall "mo:base/ExperimentalInternetComputer";
import Error "mo:base/Error";




module {

  public let Migration = MigrationLib;
  public let TT = MigrationLib.TimerTool;
  public type State = MigrationTypes.State;
  public type CurrentState = MigrationTypes.Current.State;
  public type Environment = MigrationTypes.Current.Environment;
  public type Stats = MigrationTypes.Current.Stats;
  public type InitArgs = MigrationTypes.Current.InitArgs;
  
  // Export specific types for external use
  public type EthereumNetwork = MigrationTypes.Current.EthereumNetwork;
  public type ProposalSnapshot = MigrationTypes.Current.ProposalSnapshot;
  public type SIWEProof = MigrationTypes.Current.SIWEProof;
  public type SIWEResult = MigrationTypes.Current.SIWEResult;
  public type Witness = MigrationTypes.Current.Witness;
  public type WitnessResult = MigrationTypes.Current.WitnessResult;
  public type Proposal = MigrationTypes.Current.Proposal;
  public type VoteArgs = MigrationTypes.Current.VoteArgs;
  public type TallyResult = MigrationTypes.Current.TallyResult;
  public type EthTx = MigrationTypes.Current.EthTx;
  
  // New governance types
  public type SnapshotContractConfig = MigrationTypes.Current.SnapshotContractConfig;
  public type ExecutionContractConfig = MigrationTypes.Current.ExecutionContractConfig;
  public type ICPMethodConfig = MigrationTypes.Current.ICPMethodConfig;
  public type EthereumRPCService = MigrationTypes.Current.EthereumRPCService;
  public type GovernanceConfig = MigrationTypes.Current.GovernanceConfig;
  public type GovernanceConfigShared = MigrationTypes.Current.GovernanceConfigShared;
  public type ProposalAction = MigrationTypes.Current.ProposalAction;

  public let shareProposalAction = MigrationTypes.Current.shareProposalAction;

  public let init = Migration.migrate;

  public func initialState() : State {#v0_0_0(#data)};
  public let currentStateVersion = #v0_1_0(#id);


  public func test() : Nat{
    1;
  };

  public func natNow() : Nat{
    Int.abs(Time.now());
  };

  public let ICRC85_Timer_Namespace = "icrc85:ovs:shareaction:evmdaobridge";
  public let ICRC85_Payment_Namespace = "com.evmdaobridge-org.libraries.evmdaobridge";

  public func Init<system>(config : {
    manager: ClassPlusLib.ClassPlusInitializationManager;
    initialState: State;
    args : ?InitArgs;
    pullEnvironment : ?(() -> Environment);
    onInitialize: ?(EvmDaoBridge -> async*());
    onStorageChange : ((State) ->())
  }) : <system>() -> EvmDaoBridge {

    let instance = ClassPlusLib.ClassPlusSystem<system,
      EvmDaoBridge, 
      State,
      InitArgs,
      Environment>({config with constructor = EvmDaoBridge}).get;
    
    ovsfixed.initialize_cycleShare<system>({
      namespace = ICRC85_Timer_Namespace;
      icrc_85_state = instance<system>().state.icrc85;
      wait = null;
      registerExecutionListenerAsync = instance<system>().environment.tt.registerExecutionListenerAsync;
      setActionSync = instance<system>().environment.tt.setActionSync;  
      existingIndex = instance<system>().environment.tt.getState().actionIdIndex;
      handler = instance<system>().handleIcrc85Action;
    });

    instance;
  };

  public class EvmDaoBridge<system>(stored: ?State, instantiator: Principal, canister: Principal, _args: ?InitArgs, environment_passed: ?Environment, storageChanged: (State) -> ()){

    public let debug_channel = {
      var announce = true;
    };

    public let environment = switch(environment_passed){
      case(?val) val;
      case(null) {
        D.trap("Environment is required");
      };
    };

    let _d = environment.log.log_debug;

    public var state : CurrentState = switch(stored){
      case(null) {
        switch(init(initialState(),currentStateVersion, null, instantiator, canister)) {
          case(#v0_1_0(#data(foundState))) foundState;
          case(_) D.trap("Failed to initialize state");
        };
      };
      case(?val) {
        switch(init(val, currentStateVersion, null, instantiator, canister)) {
          case(#v0_1_0(#data(foundState))) foundState;
          case(_) D.trap("Failed to migrate state");
        };
      };
    };

    storageChanged(#v0_1_0(#data(state)));

    let _self : Service.Service = actor(Principal.toText(canister));


    // ETH Integration
    public func icrc149_send_eth_tx(_caller: Principal, _eth_tx: Service.EthTx) : async {#Ok: Text; #Err: Text} {
      // TODO: Implement actual ETH transaction via ChainFusion/ETHRPC
      // For now, return a mock transaction hash
      #Ok("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
    };

    public func icrc149_get_eth_tx_status(_tx_hash: Text) : Text {
      // TODO: Check actual ETH transaction status
      // For now, return mock status
      "confirmed";
    };

    private func equalVoteChoice(a: MigrationTypes.Current.VoteChoice, b: MigrationTypes.Current.VoteChoice) : Bool {
      switch(a, b) {
        case(#Yes, #Yes) true;
        case(#No, #No) true;
        case(#Abstain, #Abstain) true;
        case(_, _) false;
      };
    };

    private func hashVoteChoice(choice: MigrationTypes.Current.VoteChoice) : Nat32 {
      switch(choice) {
        case(#Yes) 1;
        case(#No) 2;
        case(#Abstain) 3;
      };
    };

    // ===== INDEX MANAGEMENT FUNCTIONS =====
    
    // Helper function to get the status of a proposal as a string
    private func getProposalStatus(proposal: ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>) : Text {
      switch(proposal.status) {
        case (#open) "active";
        case (#executing(_)) "pending";
        case (#executed(_)) "executed";
        case (#failedToExecute(_)) "rejected";
      };
    };

    // Helper function to get the action type as a string
    private func getActionType(content: MigrationTypes.Current.ProposalContent) : Text {
      switch(content.action) {
        case (#Motion(_)) "motion";
        case (#EthTransaction(_)) "eth_transaction";
        case (#ICPCall(_)) "icp_call";
      };
    };

    // Add proposal to all relevant indexes
    private func addProposalToIndexes(proposalId: Nat, proposal: ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>, content: MigrationTypes.Current.ProposalContent) {
      // Add to proposer index
      switch(BTree.get(state.proposalsByProposer, Principal.compare, proposal.proposerId)) {
        case (?proposerSet) {
          ignore BTree.insert(proposerSet, Nat.compare, proposalId, true);
        };
        case (null) {
          let newSet = BTree.init<Nat, Bool>(?16);
          ignore BTree.insert(newSet, Nat.compare, proposalId, true);
          ignore BTree.insert(state.proposalsByProposer, Principal.compare, proposal.proposerId, newSet);
        };
      };

      // Add to status index
      let status = getProposalStatus(proposal);
      switch(BTree.get(state.proposalsByStatus, Text.compare, status)) {
        case (?statusSet) {
          ignore BTree.insert(statusSet, Nat.compare, proposalId, true);
        };
        case (null) {
          let newSet = BTree.init<Nat, Bool>(?16);
          ignore BTree.insert(newSet, Nat.compare, proposalId, true);
          ignore BTree.insert(state.proposalsByStatus, Text.compare, status, newSet);
        };
      };

      // Add to action type index
      let actionType = getActionType(content);
      switch(BTree.get(state.proposalsByActionType, Text.compare, actionType)) {
        case (?actionSet) {
          ignore BTree.insert(actionSet, Nat.compare, proposalId, true);
        };
        case (null) {
          let newSet = BTree.init<Nat, Bool>(?16);
          ignore BTree.insert(newSet, Nat.compare, proposalId, true);
          ignore BTree.insert(state.proposalsByActionType, Text.compare, actionType, newSet);
        };
      };

      // Add to chronological index (using created time)
      ignore BTree.insert(state.proposalsChronological, Nat.compare, Int.abs(proposal.timeStart), proposalId);
    };

    // Update proposal in indexes when status changes
    private func updateProposalIndexes(proposalId: Nat, oldProposal: ?ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>, newProposal: ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>, _content: MigrationTypes.Current.ProposalContent) {
      switch(oldProposal) {
        case (?old) {
          // Remove from old status index
          let oldStatus = getProposalStatus(old);
          switch(BTree.get(state.proposalsByStatus, Text.compare, oldStatus)) {
            case (?statusSet) {
              ignore BTree.delete(statusSet, Nat.compare, proposalId);
            };
            case (null) {};
          };
        };
        case (null) {};
      };

      // Add to new status index
      let newStatus = getProposalStatus(newProposal);
      switch(BTree.get(state.proposalsByStatus, Text.compare, newStatus)) {
        case (?statusSet) {
          ignore BTree.insert(statusSet, Nat.compare, proposalId, true);
        };
        case (null) {
          let newSet = BTree.init<Nat, Bool>(?16);
          ignore BTree.insert(newSet, Nat.compare, proposalId, true);
          ignore BTree.insert(state.proposalsByStatus, Text.compare, newStatus, newSet);
        };
      };
    };

    // Sync all proposal indexes - useful for ensuring indexes are up to date
    private func syncProposalIndexes() {
      // Get all proposals and ensure their current status is properly indexed
      let allProposals = proposalEngine.getProposals(10000, 0); // Get a large batch
      for (proposal in allProposals.data.vals()) {
        // Check if proposal exists in status index
        let currentStatus = getProposalStatus(proposal);
        switch(BTree.get(state.proposalsByStatus, Text.compare, currentStatus)) {
          case (?statusSet) {
            // Ensure this proposal is in the correct status set
            ignore BTree.insert(statusSet, Nat.compare, proposal.id, true);
          };
          case (null) {
            // Status index doesn't exist, create it and add this proposal
            let newSet = BTree.init<Nat, Bool>(?16);
            ignore BTree.insert(newSet, Nat.compare, proposal.id, true);
            ignore BTree.insert(state.proposalsByStatus, Text.compare, currentStatus, newSet);
          };
        };
      };
    };

    // ===== END INDEX SYNC =====

    private func onProposalExecute(choice: ?MigrationTypes.Current.VoteChoice, proposal: ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>) : async* Result.Result<(), Text> {
      // Store the old proposal state for index updates
      let oldProposal = ?proposal;
      
      let result = switch(choice) {
        case(?#Yes) {
          // Proposal passed, execute the action
          switch(proposal.content.action) {
            case(#Motion(_text)) {
              #ok(); // Motion executed
            };
            case(#EthTransaction(eth_tx)) {
              let ethResult = await icrc149_send_eth_tx(
                proposal.proposerId,
                {
                  chain = eth_tx.chain;
                  data = eth_tx.data;
                  signature = eth_tx.signature;
                  to = eth_tx.to;
                  value = eth_tx.value;
                }
              );
              switch(ethResult) {
                case(#Ok(_)) #ok();
                case(#Err(err)) #err(err);
              };
            };
            case(#ICPCall(call)) {
              // Call the ICP canister method
              let result = try{
                await (with cycles = call.cycles) ICPCall.call(call.canister, call.method, call.args);
              } catch(e){
                return #err("ICP call failed: " # Error.message(e));
              };
              call.result := ?result; 
              return #ok();
            };
          };
        };
        case(?#No or ?#Abstain or null) {
          // Proposal rejected or no majority
          #ok();
        };
      };
      
      // Update indexes after execution status change
      switch(engineRef){
        case(?engine) {
          // Update indexes with the new proposal state
          updateProposalIndexes(proposal.id, oldProposal, proposal, proposal.content);
        };
        case(null) {
          D.trap("Proposal engine not initialized");
        };
      };
      
      result;
    };

    private func onProposalValidate(content: MigrationTypes.Current.ProposalContent) : async* Result.Result<(), [Text]> {
      // Validate proposal content
      switch(content.action) {
        case(#Motion(text)) {
          if(text == "") {
            #err(["Motion text cannot be empty"]);
          } else {
            #ok();
          };
        };
        case(#EthTransaction(eth_tx)) {
          if(eth_tx.to == "") {
            #err(["Transaction 'to' address cannot be empty"]);
          } else {
            #ok();
          };
        };
        case(#ICPCall(call)) {
          if(call.canister == Principal.fromText("aaaaa-aa")) {
            #err(["Invalid ICP canister ID"]);
          } else if(call.method == "") {
            #err(["ICP method cannot be empty"]);
          } else {
            #ok();
          };
        };
      };
    };

    private var engineRef : ?ExtendedProposalEngine.ProposalEngine<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice> = null;

    // Initialize the proposal engine
    let proposalEngine = do {
        let eng = ExtendedProposalEngine.ProposalEngine<system, MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>(
        state.proposalEngine,
        onProposalExecute,
        onProposalValidate,
        equalVoteChoice,
        hashVoteChoice,
      );
      engineRef := ?eng;
      eng;
    };

    ///////////
    // ICRC-149 Implementation
    //////////

    // Translation functions between ExtendedProposalEngine types and Service types
    private func translateProposalToService(engineProposal: ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>) : Service.Proposal {
      {
        id = engineProposal.id;
        proposer = engineProposal.proposerId;
        action = shareProposalAction(engineProposal.content.action);
        created_at = Int.abs(engineProposal.timeStart);
        snapshot = BTree.get(state.snapshots, Nat.compare, engineProposal.id);  // Look up actual snapshot data
        deadline = switch(engineProposal.timeEnd) {
          case(?endTime) Int.abs(endTime);
          case(null) Int.abs(engineProposal.timeStart) + (7 * 24 * 60 * 60 * 1_000_000_000); // Default 7 days
        };
        metadata = engineProposal.content.metadata;
      };
    };

    // Convert ExtendedProposalEngine vote choice to Service vote choice
    private func translateVoteChoiceToService(choice: ?MigrationTypes.Current.VoteChoice) : { #Yes; #No; #Abstain } {
      switch(choice) {
        case(?#Yes) #Yes;
        case(?#No) #No;
        case(?#Abstain or null) #Abstain;
      };
    };

    // Convert Service vote choice to ExtendedProposalEngine vote choice
    private func translateVoteChoiceFromService(choice: { #Yes; #No; #Abstain }) : MigrationTypes.Current.VoteChoice {
      switch(choice) {
        case(#Yes) #Yes;
        case(#No) #No;
        case(#Abstain) #Abstain;
      };
    };

    // Governance Config - Updated to support multiple contracts
    public func icrc149_governance_config() : MigrationTypes.Current.GovernanceConfigShared {
      MigrationTypes.Current.shareGovernanceConfig(state.config);
    };

    // Get approved snapshot contracts
    public func icrc149_get_snapshot_contracts() : [(Text, MigrationTypes.Current.SnapshotContractConfig)] {
      BTree.toArray(state.config.snapshot_contracts);
    };

    // Get approved execution contracts
    public func icrc149_get_execution_contracts() : [(Text, MigrationTypes.Current.ExecutionContractConfig)] {
      BTree.toArray(state.config.execution_contracts);
    };

    // Get approved ICP methods 
    public func icrc149_get_approved_icp_methods() : [(Text, MigrationTypes.Current.ICPMethodConfig)] {
      BTree.toArray(state.config.approved_icp_methods);
    };

    // Admin function to add/update snapshot contract config
    public func icrc149_update_snapshot_contract_config(_caller: Principal, contract_address: Text, config: ?MigrationTypes.Current.SnapshotContractConfig) : {#Ok: (); #Err: Text} {
      if (not BTree.has(state.config.admin_principals, Principal.compare, _caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };
      
      switch (config) {
        case (?new_config) {
          ignore BTree.insert(state.config.snapshot_contracts, Text.compare, contract_address, new_config);
          #Ok(());
        };
        case (null) {
          ignore BTree.delete(state.config.snapshot_contracts, Text.compare, contract_address);
          #Ok(());
        };
      };
    };

    // Admin function to add/update execution contract config
    public func icrc149_update_execution_contract_config(_caller: Principal, contract_address: Text, config: ?MigrationTypes.Current.ExecutionContractConfig) : {#Ok: (); #Err: Text} {
      if (not BTree.has(state.config.admin_principals, Principal.compare, _caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };
      
      switch (config) {
        case (?new_config) {
          ignore BTree.insert(state.config.execution_contracts, Text.compare, contract_address, new_config);
          #Ok(());
        };
        case (null) {
          ignore BTree.delete(state.config.execution_contracts, Text.compare, contract_address);
          #Ok(());
        };
      };
    };

    // Admin function to add/update ICP method config
    public func icrc149_update_icp_method_config(_caller: Principal, canister: Principal, method: Text, config: ?MigrationTypes.Current.ICPMethodConfig) : {#Ok: (); #Err: Text} {
      if (not BTree.has(state.config.admin_principals, Principal.compare, _caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };
      
      let key = Principal.toText(canister) # ":" # method;
      switch (config) {
        case (?new_config) {
          ignore BTree.insert(state.config.approved_icp_methods, Text.compare, key, new_config);
          #Ok(());
        };
        case (null) {
          ignore BTree.delete(state.config.approved_icp_methods, Text.compare, key);
          #Ok(());
        };
      };
    };

    // Admin function to add/remove admin principals
    public func icrc149_update_admin_principal(_caller: Principal, principal: Principal, is_admin: Bool) : {#Ok: (); #Err: Text} {
      if (not BTree.has(state.config.admin_principals, Principal.compare, _caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };
      
      if (is_admin) {
        ignore BTree.insert(state.config.admin_principals, Principal.compare, principal, true);
      } else {
        ignore BTree.delete(state.config.admin_principals, Principal.compare, principal);
      };
      #Ok(());
    };

    // Return snapshot config for a proposal
    public func icrc149_proposal_snapshot(proposal_id: Nat) : MigrationTypes.Current.ProposalSnapshot {
      switch(BTree.get(state.snapshots, Nat.compare, proposal_id)) {
        case(?snapshot) snapshot;
        case(null) {
          D.trap("Proposal snapshot not found for proposal " # Nat.toText(proposal_id));
        };
      };
    };

    // SIWE Authentication (simplified implementation)
    public func icrc149_verify_siwe(siwe: MigrationTypes.Current.SIWEProof) : MigrationTypes.Current.SIWEResult {
      // TODO: Implement proper SIWE verification
      // For now, return a basic validation
      if (siwe.message == "" or siwe.signature.size() == 0) {
        return #Err("Invalid SIWE proof: empty message or signature");
      };
      
      // Extract basic info from SIWE message (simplified)
      #Ok({
        address = "0x0000000000000000000000000000000000000000"; // TODO: Parse from message
        domain = "example.com"; // TODO: Parse from message
        statement = ?"Voting on proposal"; // TODO: Parse from message
        issued_at = natNow();
        proposal_id = null; // TODO: Parse from message
        nonce = ?"nonce123"; // TODO: Parse from message
      });
    };

    // Witness Validation for ICRC-149 Storage Proofs using stored canister state
    public func icrc149_verify_witness(witness: MigrationTypes.Current.Witness, proposal_id: ?Nat) : MigrationTypes.Current.WitnessResult {
      // Convert witness to format expected by WitnessValidator
      let serviceWitness: Service.Witness = {
        blockHash = witness.blockHash;
        blockNumber = witness.blockNumber;
        userAddress = witness.userAddress;
        contractAddress = witness.contractAddress;
        storageKey = witness.storageKey;
        storageValue = witness.storageValue;
        accountProof = witness.accountProof;
        storageProof = witness.storageProof;
      };

      // Get trusted state from stored canister configuration
      icrc149_verify_witness_with_stored_state(serviceWitness, proposal_id);
    };

    // Internal function that validates witness against stored canister state
    private func icrc149_verify_witness_with_stored_state(witness: Service.Witness, proposal_id: ?Nat) : MigrationTypes.Current.WitnessResult {
      // 1. Verify contract is approved by looking up stored configuration
      let contractAddress = blobToHex(witness.contractAddress);
      switch (BTree.get<Text, MigrationTypes.Current.SnapshotContractConfig>(state.config.snapshot_contracts, Text.compare, contractAddress)) {
        case (null) {
          return #Err("Contract address " # contractAddress # " is not approved for snapshots");
        };
        case (?contractConfig) {
          if (not contractConfig.enabled) {
            return #Err("Contract " # contractAddress # " is disabled");
          };
          
          // 2. Get trusted state root from stored proposal snapshot
          let stateRoot = switch (proposal_id) {
            case (?pid) {
              // Look up state root from specific proposal snapshot
              switch (BTree.get<Nat, MigrationTypes.Current.ProposalSnapshot>(state.snapshots, Nat.compare, pid)) {
                case (null) {
                  return #Err("No snapshot found for proposal " # Nat.toText(pid));
                };
                case (?snapshot) { snapshot.state_root };
              };
            };
            case (null) {
              // Look up state root by block number from any stored snapshot
              let snapshots = BTree.toArray<Nat, MigrationTypes.Current.ProposalSnapshot>(state.snapshots);
              let matchingSnapshot = Array.find<(Nat, MigrationTypes.Current.ProposalSnapshot)>(snapshots, func((pid, snapshot)) {
                snapshot.block_number == witness.blockNumber
              });
              switch (matchingSnapshot) {
                case (null) {
                  return #Err("No stored snapshot found for block number " # Nat.toText(witness.blockNumber));
                };
                case (?(pid, snapshot)) { snapshot.state_root };
              };
            };
          };

          // 3. Build validation configuration using stored trusted data
          let config: WitnessValidator.ProofValidationConfig = {
            expectedStateRoot = stateRoot; // Use stored trusted state root
            expectedContractAddress = witness.contractAddress; // Contract address can be from witness (verified above)
            expectedUserAddress = witness.userAddress; // User address is what we're validating
            expectedStorageSlot = contractConfig.balance_storage_slot; // Use configured storage slot
            chainId = contractConfig.chain.chain_id; // Use configured chain ID
          };

          // 4. Validate the witness using WitnessValidator
          switch (WitnessValidator.validateWitness(witness, config)) {
            case (#Valid(result)) {
              #Ok({
                valid = true;
                user_address = blobToHex(result.userAddress);
                contract_address = blobToHex(result.contractAddress);
                balance = result.storageValue;
                block_number = result.blockNumber;
                state_root_verified = true;
              });
            };
            case (#Invalid(error)) {
              #Err("Witness validation failed: " # error);
            };
          };
        };
      };
    };

    // Helper function to convert Blob to hex string
    private func blobToHex(blob: Blob) : Text {
      let bytes = Blob.toArray(blob);
      var hex = "0x";
      for (byte in bytes.vals()) {
        hex := hex # natToHex(Nat8.toNat(byte), 2);
      };
      hex
    };

    // Helper function to convert Nat to hex string with padding
    private func natToHex(n: Nat, minDigits: Nat) : Text {
      let chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
      if (n == 0) {
        var result = "0";
        var i = 1;
        while (i < minDigits) {
          result := "0" # result;
          i += 1;
        };
        return result;
      };
      
      var num = n;
      var result = "";
      while (num > 0) {
        let digit = num % 16;
        result := Text.fromChar(chars[digit]) # result;
        num := num / 16;
      };
      
      // Pad with zeros if needed
      while (result.size() < minDigits) {
        result := "0" # result;
      };
      result
    };



        // Create proposal (using real-time proposal for Ethereum DAO)
    public func icrc149_create_proposal(caller: Principal, proposal_args: Service.CreateProposalRequest) : async* {#Ok: Nat; #Err: Text} {
      
        // Determine which contract to use for snapshot
      let snapshot_contract_address = switch (proposal_args.snapshot_contract) {
        case (?contract) contract;
        case (null) {
          // Use default snapshot contract if available
          switch (state.config.default_snapshot_contract) {
            case (?default) default;
            case (null) {
              return #Err("No snapshot contract specified and no default snapshot contract configured");
            };
          };
        };
      };
      
      // Validate that the snapshot contract is approved and enabled
      switch (BTree.get(state.config.snapshot_contracts, Text.compare, snapshot_contract_address)) {
        case (?contract_config) {
          if (not contract_config.enabled) {
            return #Err("Snapshot contract is not enabled: " # snapshot_contract_address);
          };
        };
        case (null) {
          return #Err("Snapshot contract is not approved: " # snapshot_contract_address);
        };
      };
      
      // Validate EthTransaction actions against approved execution contracts
      let actionItem : ProposalAction = switch (proposal_args.action) {
        case (#EthTransaction(eth_tx)) {
          switch (BTree.get(state.config.execution_contracts, Text.compare, eth_tx.to)) {
            case (?contract_config) {
              if (not contract_config.enabled) {
                return #Err("Target execution contract is not enabled: " # eth_tx.to);
              };
            };
            case (null) {
              return #Err("Target execution contract is not approved: " # eth_tx.to);
            };
          };
          #EthTransaction({ eth_tx with
            var signature : ?Blob = null; // Signature will be set after proposal creation
          });
        };
        case (#Motion(a)) {
          // Motions don't require execution contract validation
          #Motion(a)
        };
        case(#ICPCall(call)) {
          // ICP calls don't require execution contract validation
          #ICPCall({call with
            var result : ?Blob = null; // Result will be set after proposal execution
            var error  : ?Text = null; // Error will be set after proposal execution
          });
        };
      };

      let content : MigrationTypes.Current.ProposalContent = {
        action = actionItem;
        snapshot = null; // Will be set after creation
        metadata = proposal_args.metadata;
      };

      // Calculate total voting power from members
      var total_voting_power = 0;
      for (member in proposal_args.members.vals()) {
        total_voting_power += member.votingPower;
      };

      // Create a real-time proposal for Ethereum DAO governance
      let result = await* proposalEngine.createRealTimeProposal<system>(caller, content, total_voting_power);
      switch(result) {
        case(#ok(proposal_id)) {
          // Add initial members to the real-time proposal
          for (member in proposal_args.members.vals()) {
            let _ = proposalEngine.addMember(proposal_id, member);
          };

          // Get the snapshot contract config for creating the snapshot
          let snapshot_contract_config = switch (BTree.get(state.config.snapshot_contracts, Text.compare, snapshot_contract_address)) {
            case (?config) config;
            case (null) {
              // This shouldn't happen since we validated above
              return #Err("Internal error: snapshot contract config not found");
            };
          };

          // Create snapshot for this proposal using the specified snapshot contract
          let snapshot : MigrationTypes.Current.ProposalSnapshot = {
            contract_address = snapshot_contract_address;
            chain = snapshot_contract_config.chain;
            block_number = 12345678; // TODO: Get latest finalized block using snapshot_contract_config.rpc_service
            state_root = Blob.fromArray([1,2,3,4]); // TODO: Get actual state root via RPC
            total_supply = 1000000; // TODO: Get actual total supply via RPC call to snapshot contract
            snapshot_time = natNow();
          };

          ignore BTree.insert(state.snapshots, Nat.compare, proposal_id, snapshot);
          
          // Add proposal to indexes for efficient filtering
          switch(proposalEngine.getProposal(proposal_id)) {
            case (?proposal) {
              addProposalToIndexes(proposal_id, proposal, content);
            };
            case (null) {
              // This shouldn't happen since we just created the proposal
              D.print("Warning: Could not find proposal " # Nat.toText(proposal_id) # " for indexing");
            };
          };
          
          saveProposalEngineState();
          #Ok(proposal_id);
        };
        case(#err(err)) {
          switch(err) {
            case(#notEligible) #Err("Caller not eligible to create proposals");
            case(#invalid(errors)) #Err("Invalid proposal: " # Text.join(", ", errors.vals()));
          };
        };
      };
    };

    // Vote on proposal
    public func icrc149_vote_proposal(caller: Principal, vote_args: MigrationTypes.Current.VoteArgs) : async* {#Ok: (); #Err: Text} {
      // Get current proposal state before voting
      let oldProposal = proposalEngine.getProposal(vote_args.proposal_id);
      
      // Verify SIWE first
      switch(icrc149_verify_siwe(vote_args.siwe)) {
        case(#Err(err)) return #Err("SIWE verification failed: " # err);
        case(#Ok(_siwe_result)) {
          // TODO: Verify the SIWE address matches vote_args.voter
          // For now, we'll use the caller Principal and convert the Ethereum address to voting weight
        };
      };

      // TODO: Verify witness/merkle proof and get voting power
      // For now, assume valid proof with weight 1
      let voting_power = 1;

      // Create a member from the vote args (for real-time proposals)
      let member : ExtendedProposalEngine.Member = {
        id = caller; // Use the IC Principal for now, should map from Ethereum address
        votingPower = voting_power;
      };

      // Try to add the member to the proposal (in case it's a real-time proposal)
      let _ = proposalEngine.addMember(vote_args.proposal_id, member);

      // Cast the vote
      let result = await* proposalEngine.vote(vote_args.proposal_id, caller, vote_args.choice);
      switch(result) {
        case(#ok(_)) {
          // Check if proposal status changed after voting
          switch(proposalEngine.getProposal(vote_args.proposal_id)) {
            case (?newProposal) {
              updateProposalIndexes(vote_args.proposal_id, oldProposal, newProposal, newProposal.content);
            };
            case (null) {};
          };
          saveProposalEngineState();
          #Ok(());
        };
        case(#err(err)) {
          switch(err) {
            case(#proposalNotFound) #Err("Proposal not found");
            case(#notEligible) #Err("Not eligible to vote on this proposal");
            case(#alreadyVoted) #Err("Already voted on this proposal");
            case(#votingClosed) #Err("Voting period has ended");
          };
        };
      };
    };

    // Tally votes for a proposal
    public func icrc149_tally_votes(proposal_id: Nat) : MigrationTypes.Current.TallyResult {
      let summary = proposalEngine.buildVotingSummary(proposal_id);
      
      var yes_count = 0;
      var no_count = 0;
      var abstain_count = 0;
      
      for (choice_power in summary.votingPowerByChoice.vals()) {
        switch(choice_power.choice) {
          case(#Yes) yes_count := choice_power.votingPower;
          case(#No) no_count := choice_power.votingPower;
          case(#Abstain) abstain_count := choice_power.votingPower;
        };
      };

      let result = if (yes_count > no_count) "Passed" else "Failed";

      {
        yes = yes_count;
        no = no_count;
        abstain = abstain_count;
        total = summary.totalVotingPower;
        result = result;
      };
    };

    private func saveProposalEngineState() {
      state.proposalEngine := proposalEngine.toStableData();
      storageChanged(#v0_1_0(#data(state)));
    };

    // Service-compatible helper functions that translate types
    public func icrc149_get_proposal_service(id: Nat) : ?Service.Proposal {
      switch(proposalEngine.getProposal(id)) {
        case (?proposal) {
          ?translateProposalToService(proposal)
        };
        case (null) null;
      };
    };

    // New filtered and paginated proposal getter that matches the service interface
    public func icrc149_get_proposals_service(prev: ?Nat, take: ?Nat, filters: [Service.ProposalInfoFilter]) : [Service.Proposal] {
      // Sync indexes to ensure they're up to date
      syncProposalIndexes();
      
      let limit = switch(take) { case (?t) t; case (null) 10; };
      
      // Get candidate proposal IDs based on filters
      var candidateIds: [Nat] = [];
      
      if (filters.size() == 0) {
        // No filters - get all proposals chronologically
        let chronEntries = BTree.entries(state.proposalsChronological);
        candidateIds := Array.map<(Nat, Nat), Nat>(Iter.toArray(chronEntries), func((timestamp, id)) = id);
      } else {
        // Apply filters and get intersection of results
        var filteredSets: [BTree.BTree<Nat, Bool>] = [];
        
        label statusFilterLoop for (filter in filters.vals()) {
          switch(filter) {
            case (#by_id(id)) {
              // For by_id filter, create a single-item set
              let singleSet = BTree.init<Nat, Bool>(?8);
              ignore BTree.insert(singleSet, Nat.compare, id, true);
              filteredSets := Array.append(filteredSets, [singleSet]);
            };
            case (#by_proposer(proposer)) {
              switch(BTree.get(state.proposalsByProposer, Principal.compare, proposer)) {
                case (?proposerSet) filteredSets := Array.append(filteredSets, [proposerSet]);
                case (null) {
                  // No proposals from this proposer - return empty
                  return [];
                };
              };
            };
            case (#by_status(statusFilter)) {
              let statusString = switch(statusFilter) {
                case (#pending) "pending";
                case (#active) "active";
                case (#executed) "executed";
                case (#rejected) "rejected";
                case (#expired) "expired";
                case (#any) {
                  // Skip this filter for #any
                  continue statusFilterLoop;
                };
              };
              switch(BTree.get(state.proposalsByStatus, Text.compare, statusString)) {
                case (?statusSet) filteredSets := Array.append(filteredSets, [statusSet]);
                case (null) {
                  // No proposals with this status - return empty
                  return [];
                };
              };
            };
            case (#by_action_type(actionFilter)) {
              let actionString = switch(actionFilter) {
                case (#motion) "motion";
                case (#eth_transaction) "eth_transaction";
                case (#any) {
                  // Skip this filter for #any
                  continue statusFilterLoop;
                };
              };
              switch(BTree.get(state.proposalsByActionType, Text.compare, actionString)) {
                case (?actionSet) filteredSets := Array.append(filteredSets, [actionSet]);
                case (null) {
                  // No proposals with this action type - return empty
                  return [];
                };
              };
            };
          };
        };
        
        // Get intersection of all filtered sets
        if (filteredSets.size() > 0) {
          candidateIds := intersectProposalSets(filteredSets);
        };
      };
      
      // Apply pagination
      let startIndex = switch(prev) {
        case (?prevId) {
          // Find the index of the previous ID and start after it
          var index = 0;
          label findPrev for (id in candidateIds.vals()) {
            if (id == prevId) {
              index += 1;
              break findPrev;
            };
            index += 1;
          };
          index;
        };
        case (null) 0;
      };
      
      let endIndex = Nat.min(startIndex + limit, candidateIds.size());
      let paginatedIds = Array.tabulate<Nat>(endIndex - startIndex, func(i) = candidateIds[startIndex + i]);
      
      // Convert proposal IDs to Service.Proposal objects
      let proposals = Array.mapFilter<Nat, Service.Proposal>(paginatedIds, func(id) {
        switch(proposalEngine.getProposal(id)) {
          case (?proposal) ?translateProposalToService(proposal);
          case (null) null;
        };
      });
      
      proposals
    };

    // Helper function to intersect multiple proposal sets
    private func intersectProposalSets(sets: [BTree.BTree<Nat, Bool>]) : [Nat] {
      if (sets.size() == 0) return [];
      if (sets.size() == 1) {
        let entries = BTree.entries(sets[0]);
        return Array.map<(Nat, Bool), Nat>(Iter.toArray(entries), func((id, _)) = id);
      };
      
      // Start with first set
      var result: [Nat] = [];
      let firstEntries = BTree.entries(sets[0]);
      
      for ((id, _) in firstEntries) {
        // Check if this ID exists in all other sets
        var existsInAll = true;
        label checkAllSetsLoop for (i in Iter.range(1, sets.size() - 1)) {
          switch(BTree.get(sets[i], Nat.compare, id)) {
            case (?_) {}; // exists
            case (null) {
              existsInAll := false;
              break checkAllSetsLoop;
            };
          };
        };
        
        if (existsInAll) {
          result := Array.append(result, [id]);
        };
      };
      
      result
    };

    // Legacy function (for backward compatibility)
    public func icrc149_get_proposals_service_legacy(start: ?Nat, limit: ?Nat) : [Service.Proposal] {
      let offset = switch(start) { case (?s) s; case (null) 0; };
      let count = switch(limit) { case (?l) l; case (null) 10; };
      
      let result = proposalEngine.getProposals(count, offset);
      Array.map<ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>, Service.Proposal>(result.data, translateProposalToService)
    };    // Raw helper functions (for debugging/advanced use)
    public func icrc149_get_proposal_raw(proposal_id: Nat) : ?ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice> {
      proposalEngine.getProposal(proposal_id);
    };

    public func icrc149_get_proposals_raw(count: Nat, offset: Nat) : ExtendedProposalEngine.PagedResult<ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>> {
      proposalEngine.getProposals(count, offset);
    };

    // Execute proposal
    public func icrc149_execute_proposal(_caller: Principal, proposal_id: Nat) : async {#Ok: Text; #Err: Text} {
      let ?proposal = proposalEngine.getProposal(proposal_id) else return #Err("Proposal not found");
      let oldProposal = ?proposal;
      
      // Check if proposal can be executed by examining its status
      switch(proposal.status) {
        case(#open) {
          // Try to end the proposal first
          let end_result = await* proposalEngine.endProposal(proposal_id);
          switch(end_result) {
            case(#ok(_)) {
              // Proposal ended successfully, update indexes with new status
              switch(proposalEngine.getProposal(proposal_id)) {
                case (?newProposal) {
                  updateProposalIndexes(proposal_id, oldProposal, newProposal, newProposal.content);
                  saveProposalEngineState();
                };
                case (null) {};
              };
              #Ok("Proposal executed successfully");
            };
            case(#err(#alreadyEnded)) {
              #Err("Proposal voting period has already ended");
            };
          };
        };
        case(#executing(_)) #Err("Proposal is currently being executed");
        case(#executed(details)) {
          switch(details.choice) {
            case(?#Yes) #Ok("Proposal was already executed successfully");
            case(_) #Err("Proposal was rejected or failed to pass");
          };
        };
        case(#failedToExecute(details)) #Err("Proposal execution failed: " # details.error);
      };
    };

    

    // Admin
    public func icrc149_set_controller(_caller: Principal, _new_controller: Principal) : {#Ok: (); #Err: Text} {
      // TODO: Implement proper access control
      // For now, allow anyone to set controller (not secure)
      #Ok(());
    };

    public func icrc149_health_check() : Text {
      let proposal_count = proposalEngine.getProposals(1000, 0).totalCount;
      let snapshot_contracts_count = BTree.size(state.config.snapshot_contracts);
      let execution_contracts_count = BTree.size(state.config.execution_contracts);
      "EvmDaoBridge is healthy - Proposals: " # Nat.toText(proposal_count) # 
      ", Snapshot Contracts: " # Nat.toText(snapshot_contracts_count) #
      ", Execution Contracts: " # Nat.toText(execution_contracts_count);
    };

    // Standard Compliance
    public func icrc10_supported_standards() : [{name: Text; url: Text}] {
      [
        {name = "ICRC-10"; url = "https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-10"},
        {name = "ICRC-149"; url = "https://github.com/dfinity/ICRC/issues/149"}
      ];
    };

    ///////////
    // ICRC85 ovs
    //////////

    public func handleIcrc85Action<system>(id: TT.ActionId, action: TT.Action) : async* Star.Star<TT.ActionId, TT.Error> {
      if (action.actionType == ICRC85_Timer_Namespace) {
        await* ovsfixed.standardShareCycles({
          icrc_85_state = state.icrc85;
          icrc_85_environment = do?{environment.advanced!.icrc85!};
          setActionSync = environment.tt.setActionSync;
          timerNamespace = ICRC85_Timer_Namespace;
          paymentNamespace = ICRC85_Payment_Namespace;
          baseCycles = 1_000_000_000_000; // 1 XDR
          maxCycles = 100_000_000_000_000; // 1 XDR
          actionDivisor = 10000;
          actionMultiplier = 200_000_000_000; // .2 XDR
        });
        #awaited(id);
      } else {
        #trappable(id);
      };
    };

    //------------------- TESTING HELPERS -------------------//

    // Helper function for testing - allows manually adding snapshots
    public func test_add_snapshot(contract_address: Text, block_number: Nat, root_hash: Text) : {#Ok: (); #Err: Text} {
      D.print("Adding test snapshot for contract: " # contract_address # " at block: " # Nat.toText(block_number));
      
      // Add snapshot to the snapshots map using block number as key
      let newSnapshot : ProposalSnapshot = {
        block_number = block_number;
        contract_address = contract_address;
        state_root = Text.encodeUtf8(root_hash);
        snapshot_time = Int.abs(Time.now());
        total_supply = 1000000; // Default for testing
        chain = { chain_id = 1; network_name = "ethereum" };
      };
      ignore BTree.insert<Nat, ProposalSnapshot>(state.snapshots, Nat.compare, block_number, newSnapshot);
      #Ok();
    };

    // Helper function for testing - get snapshot info
    public func test_get_snapshot_info(contract_address: Text) : ?{block_number: Nat; root_hash: Text} {
      D.print("Getting snapshot info for contract: " # contract_address);
      let snapshots = BTree.toArray<Nat, ProposalSnapshot>(state.snapshots);
      
      // Find latest snapshot for this contract
      for ((block_num, snapshot) in snapshots.vals()) {
        if (snapshot.contract_address == contract_address) {
          let root_hash = switch (Text.decodeUtf8(snapshot.state_root)) {
            case (?text) { text };
            case null { "0x" };
          };
          return ?{block_number = snapshot.block_number; root_hash = root_hash};
        };
      };
      null;
    };

  };

};