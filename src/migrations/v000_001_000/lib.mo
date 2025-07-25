// do not remove comments from this file
import MigrationTypes "../types";
import Time "mo:base/Time";
import Principal "mo:base/Principal";
import Iter "mo:base/Iter";
import v0_1_0 "types";
import D "mo:base/Debug";
import BTree "mo:stableheapbtreemap/BTree";
import Nat "mo:base/Nat";
import Text "mo:base/Text";

module {

  //do not change the signature of this function or class-plus migrations will not work.
  public func upgrade(_prevmigration_state: MigrationTypes.State, args: MigrationTypes.Args, _caller: Principal, _canister: Principal): MigrationTypes.State {

    /*
    todo: implement init args
    let (previousEventIDs,
      pendingEvents) = switch (args) {
      case (?args) {
        switch(args.restore){
          case(?restore){
            let existingPrevIds = BTree.
            (restore.)
          }
        }
      };
      case (_) {("nobody")};
    };
    */

    // You must output the same type that is defined in the types.mo file in this directory.


    
    let state : v0_1_0.State = {
      var config = switch(args) {
        case(?{snapshot_contracts; execution_contracts; approved_icp_methods; admin_principals}) {
          let snapshotTree = BTree.init<Text, v0_1_0.SnapshotContractConfig>(null);
          for (contract in snapshot_contracts.vals()) {
            ignore BTree.insert(snapshotTree, Text.compare, contract.contract_address, contract);
          };
          
          let executionTree = BTree.init<Text, v0_1_0.ExecutionContractConfig>(null);
          for (contract in execution_contracts.vals()) {
            ignore BTree.insert(executionTree, Text.compare, contract.contract_address, contract);
          };
          
          let icpMethodsTree = BTree.init<Text, v0_1_0.ICPMethodConfig>(null);
          for (method in approved_icp_methods.vals()) {
            let key = Principal.toText(method.canister) # ":" # method.method;
            ignore BTree.insert(icpMethodsTree, Text.compare, key, method);
          };

          let adminTree = BTree.init<Principal, Bool>(null);
          for (admin in admin_principals.vals()) {
            ignore BTree.insert(adminTree, Principal.compare, admin, true);
          };
          
          {
            var snapshot_contracts = snapshotTree;
            var execution_contracts = executionTree;
            var approved_icp_methods = icpMethodsTree;
            var admin_principals = adminTree;
            var default_snapshot_contract = if (BTree.size(snapshotTree) > 0) { 
              switch (BTree.entries(snapshotTree) |> _.next()) {
                case (?(key, _)) { ?key };
                case (null) { null };
              }
            } else { null };
          };
        };
        case(null) {
          let snapshotTree = BTree.init<Text, v0_1_0.SnapshotContractConfig>(null);
          let executionTree = BTree.init<Text, v0_1_0.ExecutionContractConfig>(null);
          let icpMethodsTree = BTree.init<Text, v0_1_0.ICPMethodConfig>(null);
          let adminTree = BTree.init<Principal, Bool>(null);
          
          // Add a default snapshot contract for backward compatibility
          let defaultSnapshotContract : v0_1_0.SnapshotContractConfig = {
            contract_address = "0x0000000000000000000000000000000000000000";
            chain = {
              chain_id = 1;
              network_name = "mainnet";
            };
            rpc_service = {
              rpc_type = "mainnet";
              canister_id = Principal.fromText("7hfb6-caaaa-aaaar-qadga-cai"); // EVM RPC canister
              custom_config = null;
            };
            balance_storage_slot = 1; // Default slot for ERC20 balance mapping (most common)
            contract_type = #ERC20;
            enabled = true;
          };
          ignore BTree.insert(snapshotTree, Text.compare, defaultSnapshotContract.contract_address, defaultSnapshotContract);
          
          {
            var snapshot_contracts = snapshotTree;
            var execution_contracts = executionTree;
            var approved_icp_methods = icpMethodsTree;
            var admin_principals = adminTree;
            var default_snapshot_contract = ?defaultSnapshotContract.contract_address;
          };
        };
      };
      
      snapshots = BTree.init<Nat, v0_1_0.ProposalSnapshot>(?32);
      var proposalEngine = {
        proposals = [];
        proposalDuration = ?#days(7); // 7 day voting period
        votingThreshold = #percent({
          percent = 50; // 50% threshold
          quorum = ?25; // 25% quorum
        });
        allowVoteChange = false;
      };
      
      // Initialize indexes for efficient proposal filtering
      proposalsByProposer = BTree.init<Principal, BTree.BTree<Nat, Bool>>(?32);
      proposalsByStatus = BTree.init<Text, BTree.BTree<Nat, Bool>>(?32);
      proposalsByActionType = BTree.init<Text, BTree.BTree<Nat, Bool>>(?32);
      proposalsChronological = BTree.init<Nat, Nat>(?32);
      
      icrc85 = {
        var nextCycleActionId: ?Nat = null; // Initialize to null or a specific value if needed
        var lastActionReported: ?Nat = null; // Initialize to null or a specific value if needed
        var activeActions: Nat = 0; // Initialize to 0 or a specific value if needed
      };
    };

    return #v0_1_0(#data(state));
  };
};
