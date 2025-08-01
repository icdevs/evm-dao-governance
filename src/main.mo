// This file is an example canister that uses the library for this project. It is an example of how to expose the functionality of the class module to the outside world.
// It is not a complete canister and should not be used as such. It is only an example of how to use the library for this project.

import D "mo:base/Debug";
import Nat "mo:base/Nat";
import Principal "mo:base/Principal";
import ClassPlus "mo:class-plus";
import TT "mo:timer-tool";
import ICRC10 "mo:icrc10-mo";
import Log "mo:stable-local-log";

import EvmDaoBridge ".";
import Service "./service";

// ICRC-149 EVM DAO Bridge Canister exposing the full public API contract
 shared (deployer) persistent actor class EvmDaoBridgeCanister<system>(
    args:?{
        evmdaobridgeArgs: ?EvmDaoBridge.InitArgs;
        ttArgs: ?TT.InitArgList;
    }
) = this {
    transient let thisPrincipal = Principal.fromActor(this);
    stable var _owner = deployer.caller;

    transient let initManager = ClassPlus.ClassPlusInitializationManager(_owner, thisPrincipal, true);
    transient let evmdaobridgeInitArgs = do ? { args!.evmdaobridgeArgs! };
    transient let ttInitArgs : ?TT.InitArgList = do ? { args!.ttArgs! };

    stable var icrc10 = ICRC10.initCollection();

    private func reportTTExecution(execInfo: TT.ExecutionReport): Bool {
        D.print("CANISTER: TimerTool Execution: " # debug_show(execInfo));
        false
    };

    private func reportTTError(errInfo: TT.ErrorReport) : ?Nat {
        D.print("CANISTER: TimerTool Error: " # debug_show(errInfo));
        null
    };

    stable var tt_migration_state: TT.State = TT.Migration.migration.initialState;

    transient let tt = TT.Init<system>({
        manager = initManager;
        initialState = tt_migration_state;
        args = ttInitArgs;
        pullEnvironment = ?(func() : TT.Environment {
            D.print("Pulling TimerTool environment");
            {
                advanced = null;
                reportExecution = ?reportTTExecution;
                reportError = ?reportTTError;
                syncUnsafe = null;
                reportBatch = null;
            };
        });
        onInitialize = ?(func (newClass: TT.TimerTool) : async* () {
            D.print("Initializing TimerTool");
            newClass.initialize<system>();
        });
        onStorageChange = func(state: TT.State) { tt_migration_state := state; }
    });

    stable var localLog_migration_state: Log.State = Log.initialState();
    transient let localLog = Log.Init<system>({
        args = ?{
            min_level = ?#Debug;
            bufferSize = ?5000;
        };
        manager = initManager;
        initialState = Log.initialState();
        pullEnvironment = ?(func() : Log.Environment {
            {
                tt = tt();
                advanced = null; // Add any advanced options if needed
                onEvict = null;
            };
        });
        onInitialize = null;
        onStorageChange = func(state: Log.State) {
            localLog_migration_state := state;
        };
    });

    transient let _d = localLog().log_debug;

    stable var evmdaobridge_migration_state: EvmDaoBridge.State = EvmDaoBridge.initialState();

    transient let evmdaobridge = EvmDaoBridge.Init<system>({
        manager = initManager;
        initialState = evmdaobridge_migration_state;
        args = evmdaobridgeInitArgs;
        pullEnvironment = ?(func() : EvmDaoBridge.Environment {
          D.print("Pulling EvmDaoBridge environment");
            {
                tt = tt();
                advanced = null;
                log = localLog();
            };
        });
        onInitialize = ?(func (newClass: EvmDaoBridge.EvmDaoBridge) : async* () {
            D.print("Initializing EvmDaoBridge Class");
        });
        onStorageChange = func(state: EvmDaoBridge.State) {
            evmdaobridge_migration_state := state;
        }
    })<system>();

    //------------------- ICRC-149 API IMPLEMENTATION -------------------//

    // Governance Config - Updated for multiple contracts
    public query func icrc149_governance_config() : async EvmDaoBridge.GovernanceConfigShared {
        D.print("Getting governance config");
        evmdaobridge.icrc149_governance_config();
    };

    // Get approved snapshot contracts
    public query func icrc149_get_snapshot_contracts() : async [(Text, EvmDaoBridge.SnapshotContractConfig)] {
        D.print("Getting snapshot contracts");
        evmdaobridge.icrc149_get_snapshot_contracts();
    };

    // Get approved execution contracts
    public query func icrc149_get_execution_contracts() : async [(Text, EvmDaoBridge.ExecutionContractConfig)] {
        D.print("Getting execution contracts");
        evmdaobridge.icrc149_get_execution_contracts();
    };

    // Get approved ICP methods 
    public query func icrc149_get_approved_icp_methods() : async [(Text, EvmDaoBridge.ICPMethodConfig)] {
        D.print("Getting approved ICP methods");
        evmdaobridge.icrc149_get_approved_icp_methods();
    };

    // Admin function to add/update snapshot contract config
    public shared(msg) func icrc149_update_snapshot_contract_config(contract_address: Text, config: ?EvmDaoBridge.SnapshotContractConfig) : async {#Ok: (); #Err: Text} {
        D.print("Updating snapshot contract config for " # contract_address);
        evmdaobridge.icrc149_update_snapshot_contract_config(msg.caller, contract_address, config);
    };

    // Admin function to add/update execution contract config
    public shared(msg) func icrc149_update_execution_contract_config(contract_address: Text, config: ?EvmDaoBridge.ExecutionContractConfig) : async {#Ok: (); #Err: Text} {
        D.print("Updating execution contract config for " # contract_address);
        evmdaobridge.icrc149_update_execution_contract_config(msg.caller, contract_address, config);
    };

    // Admin function to add/update ICP method config
    public shared(msg) func icrc149_update_icp_method_config(canister: Principal, method: Text, config: ?EvmDaoBridge.ICPMethodConfig) : async {#Ok: (); #Err: Text} {
        D.print("Updating ICP method config for " # Principal.toText(canister) # ":" # method);
        evmdaobridge.icrc149_update_icp_method_config(msg.caller, canister, method, config);
    };

    // Admin function to add/remove admin principals
    public shared(msg) func icrc149_update_admin_principal(principal: Principal, is_admin: Bool) : async {#Ok: (); #Err: Text} {
        D.print("Updating admin principal: " );
        evmdaobridge.icrc149_update_admin_principal(msg.caller, principal, is_admin);
    };

    // Admin function to update EVM RPC canister ID
    public shared(msg) func icrc149_update_evm_rpc_canister(canister_id: Principal) : async {#Ok: (); #Err: Text} {
        D.print("Updating EVM RPC canister ID to: " # Principal.toText(canister_id));
        evmdaobridge.icrc149_update_evm_rpc_canister(msg.caller, canister_id);
    };

    // Return snapshot config for a proposal
    public query func icrc149_proposal_snapshot(proposal_id: Nat) : async EvmDaoBridge.ProposalSnapshot {
        D.print("Getting proposal snapshot for ID: " # Nat.toText(proposal_id));
        evmdaobridge.icrc149_proposal_snapshot(proposal_id);
    };

    // SIWE Authentication
    public shared func icrc149_verify_siwe(siwe: EvmDaoBridge.SIWEProof) : async EvmDaoBridge.SIWEResult {
        D.print("Verifying SIWE proof");
        evmdaobridge.icrc149_verify_siwe(siwe);
    };

    // Witness Verification for Storage Proofs
    public shared func icrc149_verify_witness(witness: EvmDaoBridge.Witness, proposal_id: ?Nat) : async EvmDaoBridge.WitnessResult {
        D.print("Verifying storage proof witness with stored canister state");
        evmdaobridge.icrc149_verify_witness(witness, proposal_id);
    };

    // Test helper function to add snapshots for testing with chain_id
    public shared(msg) func icrc149_add_test_snapshot(proposal_id: Nat, block_number: Nat, state_root: Blob, contract_address: Text, chain_id: Nat, network_name: Text) : async () {
        D.print("Adding test snapshot for validation testing with chain_id: " # Nat.toText(chain_id));
        evmdaobridge.icrc149_add_test_snapshot_with_chain(proposal_id, block_number, state_root, contract_address, chain_id, network_name);
    };

    // Proposal Management
    public shared(msg) func icrc149_create_proposal(proposal_args: Service.CreateProposalRequest) : async {#Ok: Nat; #Err: Text} {
        D.print("Creating proposal");
        await* evmdaobridge.icrc149_create_proposal(msg.caller, proposal_args);
    };

    public shared(msg) func icrc149_vote_proposal(vote_args: EvmDaoBridge.VoteArgs) : async {#Ok: (); #Err: Text} {
        D.print("Voting on proposal"); 
        await* evmdaobridge.icrc149_vote_proposal(msg.caller, vote_args);
    };

    // Deprecated: Tally data is now included in icrc149_get_proposals
    /*
    public query func icrc149_tally_votes(proposal_id: Nat) : async EvmDaoBridge.TallyResult {
        D.print("Tallying votes for proposal ID: " # Nat.toText(proposal_id));
        evmdaobridge.icrc149_tally_votes(proposal_id);
    };
    */

    public shared(msg) func icrc149_execute_proposal(proposal_id: Nat) : async {#Ok: Text; #Err: Text} {
        D.print("Executing proposal ID: " # Nat.toText(proposal_id));
        await evmdaobridge.icrc149_execute_proposal(msg.caller, proposal_id);
    };

        // Helper functions for getting proposals
    public func icrc149_get_proposal(id : Nat) : async ?Service.Proposal {
        D.print("Getting proposal with ID: " # Nat.toText(id));
        // Call the service to get the proposal
       
      evmdaobridge.icrc149_get_proposal_service(id);
    };

    public query func icrc149_get_proposals(prev : ?Nat, take : ?Nat, filters : [Service.ProposalInfoFilter]) : async [Service.ProposalWithTally] {
      // Use the new function that includes tally data
      evmdaobridge.icrc149_get_proposals(prev, take, filters);
    };

    // User Vote Queries
    public query func icrc149_get_user_votes(requests: [{proposal_id: Nat; user_address: Text}]) : async [{proposal_id: Nat; user_address: Text; vote: ?{ #Yes; #No; #Abstain }}] {
      D.print("Getting user votes for " # Nat.toText(requests.size()) # " requests");
      evmdaobridge.icrc149_get_user_votes(requests);
    };

    public query func icrc149_get_user_vote(proposal_id: Nat, user_address: Text) : async ?{ #Yes; #No; #Abstain } {
      D.print("Getting user vote for address " # user_address # " on proposal " # Nat.toText(proposal_id));
      evmdaobridge.icrc149_get_user_vote(proposal_id, user_address);
    };

    public query func icrc149_has_user_voted(proposal_id: Nat, user_address: Text) : async Bool {
      D.print("Checking if user " # user_address # " has voted on proposal " # Nat.toText(proposal_id));
      evmdaobridge.icrc149_has_user_voted(proposal_id, user_address);
    };

    public query func icrc149_get_proposal_with_user_vote(proposal_id: Nat, user_address: ?Text) : async ?{
      proposal: Service.Proposal;
      user_vote: ?{ #Yes; #No; #Abstain };
      user_has_voted: Bool;
    } {
      D.print("Getting proposal " # Nat.toText(proposal_id) # " with user vote info");
      evmdaobridge.icrc149_get_proposal_with_user_vote(proposal_id, user_address);
    };



    // Admin
    public shared(msg) func icrc149_set_controller(new_controller: Principal) : async {#Ok: (); #Err: Text} {
        D.print("Setting new controller: " # Principal.toText(new_controller));
        evmdaobridge.icrc149_set_controller(msg.caller, new_controller);
    };

    public query func icrc149_health_check() : async Text {
        D.print("Performing health check");
        evmdaobridge.icrc149_health_check();
    };

    // Standard Compliance
    public query func icrc10_supported_standards() : async [{name: Text; url: Text}] {
        D.print("Getting supported standards");
        evmdaobridge.icrc10_supported_standards();
    };

    //------------------- TESTING HELPERS -------------------//

    // Helper function for testing - allows manually adding snapshots
    public shared func test_add_snapshot(contract_address: Text, block_number: Nat, root_hash: Text) : async {#Ok: (); #Err: Text} {
        D.print("Test helper: Adding snapshot for " # contract_address # " at block " # Nat.toText(block_number));
        evmdaobridge.test_add_snapshot(contract_address, block_number, root_hash);
    };

    // Test helper function to calculate storage key using the same logic as witness validation
    public query func icrc149_calculate_test_storage_key(userAddress: Blob, slot: Nat) : async Blob {
        D.print("Test helper: Calculating storage key for slot " # Nat.toText(slot));
        evmdaobridge.icrc149_calculate_test_storage_key(userAddress, slot);
    };

    // Helper function for testing - get snapshot info
    public query func test_get_snapshot_info(contract_address: Text) : async ?{block_number: Nat; root_hash: Text} {
        D.print("Test helper: Getting snapshot info for " # contract_address);
        evmdaobridge.test_get_snapshot_info(contract_address);
    };

    // Get Ethereum address for the DAO using tECDSA
    public shared func icrc149_get_ethereum_address(subaccount: ?Blob) : async Text {
        D.print("Getting Ethereum address for DAO");
        await evmdaobridge.icrc149_get_ethereum_address(subaccount);
    };

    // Admin function to set default snapshot contract
    public shared(msg) func icrc149_set_default_snapshot_contract(contract_address: ?Text) : async {#Ok: (); #Err: Text} {
        evmdaobridge.icrc149_set_default_snapshot_contract(msg.caller, contract_address);
    };

    // Admin function to update proposal duration in nanoseconds
    public shared(msg) func icrc149_update_proposal_duration(duration_nanoseconds: Nat) : async {#Ok: (); #Err: Text} {
        D.print("Admin: Updating proposal duration to " # Nat.toText(duration_nanoseconds) # " nanoseconds");
        evmdaobridge.icrc149_update_proposal_duration<system>(msg.caller, duration_nanoseconds);
    };

    // Test function for parallel RPC calls
    public shared(msg) func test_parallel_rpc_calls(rpc_canister_id: Principal) : async {#Ok: (Nat, Nat, Nat); #Err: Text} {
        D.print("Test: Starting parallel RPC calls test");
        await evmdaobridge.test_parallel_rpc_calls(msg.caller, rpc_canister_id);
    };

    // Admin function to manually fix stuck proposals
    public shared(msg) func icrc149_admin_fix_stuck_proposal(proposal_id: Nat) : async {#Ok: Text; #Err: Text} {
        D.print("Admin: Attempting to fix stuck proposal " # Nat.toText(proposal_id));
        await evmdaobridge.icrc149_admin_fix_stuck_proposal(msg.caller, proposal_id);
    };

    // Debug function to check queue status
    public query func debug_queue_status() : async {
      queue_size: Nat;
      processed_size: Nat;
      last_processed_sequence: Nat;
      queue_entries: [(Nat, {proposal_id: Nat; status: Text; hash: ?Text})];
      processed_entries: [(Nat, {proposal_id: Nat; status: Text; hash: ?Text})];
    } {
        D.print("Debug: Getting queue status");
        evmdaobridge.debug_queue_status();
    };

    //------------------- SAMPLE FUNCTION -------------------//

    public shared func hello(): async Text {
        D.print("Hello called");
        "world from EvmDaoBridge!"
    };

};


