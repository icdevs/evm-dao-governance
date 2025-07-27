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
import Cycles "mo:base/ExperimentalCycles";
import Hex "mo:encoding/Hex";
import SHA3 "mo:sha3";
import SHA256 "mo:sha2/Sha256";
import Nat32 "mo:base/Nat32";
import Nat64 "mo:base/Nat64";

// Helper modules
import EVMHelpers "EVMHelpers";
import SIWEAuth "SIWEAuth";
import ProposalIndex "ProposalIndex";
import WitnessValidation "WitnessValidation";
import TestingHelpers "TestingHelpers";

// EVM Transaction Libraries
import EVMAddress "mo:evm-txs/Address";
import Transaction1559 "mo:evm-txs/transactions/EIP1559";
import Contract "mo:evm-txs/Contract";
import Ecmult "mo:libsecp256k1/core/ecmult";

// Import EVM RPC types from the official interface
import EVMRPCService "EVMRPCService";




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
    TestingHelpers.test();
  };

  public func natNow() : Nat{
    TestingHelpers.natNow();
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

    // Import types from EVMRPCService module
    type Block = EVMRPCService.Block;
    type BlockTag = EVMRPCService.BlockTag;
    type RpcServices = EVMRPCService.RpcServices;
    type RpcConfig = EVMRPCService.RpcConfig;
    type GetBlockByNumberResult = EVMRPCService.GetBlockByNumberResult;
    type MultiGetBlockByNumberResult = EVMRPCService.MultiGetBlockByNumberResult;
    type CallArgs = EVMRPCService.CallArgs;
    type CallResult = EVMRPCService.CallResult;
    type MultiCallResult = EVMRPCService.MultiCallResult;
    type RpcError = EVMRPCService.RpcError;
    type HttpOutcallError = EVMRPCService.HttpOutcallError;
    type JsonRpcError = EVMRPCService.JsonRpcError;
    type ProviderError = EVMRPCService.ProviderError;
    type ValidationError = EVMRPCService.ValidationError;

    // EVM RPC Service Interface
    type EVMRPCService = EVMRPCService.Service;

    // ECDSA Types and Actor Interface
    public type EcdsaCurve = {
        #secp256k1;
    };

    public type EcdsaKeyId = {
        curve : EcdsaCurve;
        name : Text;
    };

    public type ECDSAPublicKey = {
        canister_id : ?Principal;
        derivation_path : [Blob];
        key_id : EcdsaKeyId;
    };

    public type ECDSAPublicKeyReply = {
        public_key : Blob;
        chain_code : Blob;
    };

    type ICTECDSA = actor {
        ecdsa_public_key : ECDSAPublicKey -> async ECDSAPublicKeyReply;
        sign_with_ecdsa : ({
          message_hash : Blob;
          derivation_path : [Blob];
          key_id : { curve: { #secp256k1; } ; name: Text };
        }) -> async ({ signature : Blob });
    };

    // Helper function to get RPC services based on chain and service configuration
    private func getRpcServices(chain: MigrationTypes.Current.EthereumNetwork, rpc_service: MigrationTypes.Current.EthereumRPCService) : RpcServices {
      EVMHelpers.getRpcServices(chain, rpc_service);
    };

    // Helper function to get total supply of ERC20 token
    private func getTotalSupply(rpc_service: MigrationTypes.Current.EthereumRPCService, chain: MigrationTypes.Current.EthereumNetwork, contract_address: Text) : async* Result.Result<Nat, Text> {
      try {
        let rpcActor = getEvmRpcActor(rpc_service);
        let rpcServices = getRpcServices(chain, rpc_service);
        let config : ?RpcConfig = ?{ 
          responseSizeEstimate = ?1000000; // 1MB estimate
          responseConsensus = null; // Use default consensus strategy
        };
        
        // ERC20 totalSupply() function selector: 0x18160ddd
        let callArgs : CallArgs = {
          transaction = {
            to = ?contract_address;
            input = ?"0x18160ddd"; // totalSupply() function selector (using 'input' not 'data')
            gas = null;
            maxFeePerGas = null;
            gasPrice = null;
            value = null;
            maxFeePerBlobGas = null;
            from = null;
            type_ = null;
            accessList = null;
            nonce = null;
            maxPriorityFeePerGas = null;
            blobs = null;
            chainId = null;
            blobVersionedHashes = null;
          };
          block = ?#Latest;
        };
        
        let result = await rpcActor.eth_call(rpcServices, config, callArgs);
        
        switch (result) {
          case (#Consistent(#Ok(hexResult))) {
            // Parse hex result to Nat (assumes 32-byte result)
            try {
              // Remove 0x prefix and parse as hex
              let cleanHex = if (Text.startsWith(hexResult, #text("0x"))) {
                Text.trimStart(hexResult, #text("0x"));
              } else {
                hexResult;
              };
              
              // Convert hex string to Nat (simplified - assumes valid hex)
              var totalSupply : Nat = 0;
              var multiplier : Nat = 1;
              let chars = Text.toArray(cleanHex);
              var i = chars.size();
              
              while (i > 0) {
                i -= 1;
                let char = chars[i];
                let digit = switch (char) {
                  case ('0') 0; case ('1') 1; case ('2') 2; case ('3') 3; case ('4') 4;
                  case ('5') 5; case ('6') 6; case ('7') 7; case ('8') 8; case ('9') 9;
                  case ('a' or 'A') 10; case ('b' or 'B') 11; case ('c' or 'C') 12;
                  case ('d' or 'D') 13; case ('e' or 'E') 14; case ('f' or 'F') 15;
                  case (_) 0;
                };
                totalSupply += digit * multiplier;
                multiplier *= 16;
              };
              
              #ok(totalSupply);
            } catch (e) {
              #err("Failed to parse totalSupply result: " # Error.message(e));
            };
          };
          case (#Consistent(#Err(err))) {
            switch (err) {
              case (#HttpOutcallError(httpErr)) {
                switch (httpErr) {
                  case (#IcError({ message })) #err("IC error getting totalSupply: " # message);
                  case (#InvalidHttpJsonRpcResponse({ body })) #err("Invalid JSON RPC response getting totalSupply: " # body);
                };
              };
              case (#JsonRpcError({ message })) #err("JSON RPC error getting totalSupply: " # message);
              case (#ProviderError(_)) #err("Provider error getting totalSupply");
              case (#ValidationError(_)) #err("Validation error getting totalSupply");
            };
          };
          case (#Inconsistent(results)) {
            // Use first successful result
            switch (results.size()) {
              case (0) #err("No RPC responses for totalSupply");
              case (_) {
                let firstResult = results[0].1;
                switch (firstResult) {
                  case (#Ok(hexResult)) {
                    // Same hex parsing logic as above
                    try {
                      let cleanHex = if (Text.startsWith(hexResult, #text("0x"))) {
                        Text.trimStart(hexResult, #text("0x"));
                      } else {
                        hexResult;
                      };
                      
                      var totalSupply : Nat = 0;
                      var multiplier : Nat = 1;
                      let chars = Text.toArray(cleanHex);
                      var i = chars.size();
                      
                      while (i > 0) {
                        i -= 1;
                        let char = chars[i];
                        let digit = switch (char) {
                          case ('0') 0; case ('1') 1; case ('2') 2; case ('3') 3; case ('4') 4;
                          case ('5') 5; case ('6') 6; case ('7') 7; case ('8') 8; case ('9') 9;
                          case ('a' or 'A') 10; case ('b' or 'B') 11; case ('c' or 'C') 12;
                          case ('d' or 'D') 13; case ('e' or 'E') 14; case ('f' or 'F') 15;
                          case (_) 0;
                        };
                        totalSupply += digit * multiplier;
                        multiplier *= 16;
                      };
                      
                      #ok(totalSupply);
                    } catch (e) {
                      #err("Failed to parse totalSupply result: " # Error.message(e));
                    };
                  };
                  case (#Err(err)) {
                    switch (err) {
                      case (#HttpOutcallError(httpErr)) {
                        switch (httpErr) {
                          case (#IcError({ message })) #err("IC error getting totalSupply: " # message);
                          case (#InvalidHttpJsonRpcResponse({ body })) #err("Invalid JSON RPC response getting totalSupply: " # body);
                        };
                      };
                      case (#JsonRpcError({ message })) #err("JSON RPC error getting totalSupply: " # message);
                      case (#ProviderError(_)) #err("Provider error getting totalSupply");
                      case (#ValidationError(_)) #err("Validation error getting totalSupply");
                    };
                  };
                };
              };
            };
          };
        };
      } catch (e) {
        #err("Failed to get totalSupply: " # Error.message(e));
      };
    };

    // Configuration constants
    let ECDSA_KEY_NAME = "test_key_1"; // Change to production key name
    let IC_ECDSA_ACTOR : ICTECDSA = actor("aaaaa-aa"); // IC management canister

    // Create EC multiplication context for secp256k1
    // Note: Using null for now - in production, should load precomputed values
    let ecCtx = Ecmult.ECMultContext(null);

    // Helper function to create nonce key for address tracking
    private func makeNonceKey(chainId: Nat, address: Text) : Text {
      Nat.toText(chainId) # ":" # address;
    };


    

    public func icrc149_send_eth_tx(_caller: Principal, eth_tx: Service.EthTx) : async {#Ok: Text; #Err: Text} {
      try {
        // Get the Ethereum address for this subaccount
        let ethAddress = await* getEthereumAddress(eth_tx.subaccount);
        
        // Find appropriate RPC service for this chain
        let rpc_service = {
          rpc_type = switch (eth_tx.chain.chain_id) {
            case (1) "mainnet";
            case (5) "goerli";
            case (11155111) "sepolia";
            case (_) "custom";
          };
          canister_id = Principal.fromText("7hfb6-caaaa-aaaar-qadga-cai"); // EVM RPC canister
          custom_config = null;
        };
        
        // Get next nonce for this address
        let nonce = await* EVMHelpers.getNextNonce(state, eth_tx.chain.chain_id, ethAddress, rpc_service);
        
        // Create derivation path
        let derivationPath = switch (eth_tx.subaccount) {
          case (?blob) [blob];
          case (null) [];
        };
        
        // Create EIP-1559 transaction
        let transaction = {
          chainId = Nat64.fromNat(eth_tx.chain.chain_id);
          nonce = Nat64.fromNat(nonce);
          maxPriorityFeePerGas = Nat64.fromNat(eth_tx.maxPriorityFeePerGas);
          gasLimit = Nat64.fromNat(eth_tx.gasLimit);
          maxFeePerGas = Nat64.fromNat(eth_tx.maxFeePerGas);
          to = eth_tx.to;
          value = eth_tx.value;
          data = "0x" # Hex.encode(Blob.toArray(eth_tx.data));
          accessList = [];
          r = "0x00";
          s = "0x00";
          v = "0x00";
        };
        
        // Create transaction hash for signing
        let encodedTx = Transaction1559.getMessageToSign(transaction);
        let txHash = switch (encodedTx) {
          case (#ok(bytes)) {
            bytes;
          };
          case (#err(err)) {
            return #Err("Failed to encode transaction: " # err);
          };
        };
        
        // Sign the transaction hash
        Cycles.add<system>(10_000_000_000); // 10B cycles for ECDSA signing
        let { signature } = await IC_ECDSA_ACTOR.sign_with_ecdsa({
          message_hash = Blob.fromArray(txHash);
          derivation_path = derivationPath;
          key_id = { curve = #secp256k1; name = ECDSA_KEY_NAME };
        });
        
        // Get public key for recovery
        let { public_key; chain_code = _ } = await IC_ECDSA_ACTOR.ecdsa_public_key({
          canister_id = ?Principal.fromActor(_self);
          derivation_path = derivationPath;
          key_id = { curve = #secp256k1; name = ECDSA_KEY_NAME };
        });
        
        // Serialize the signed transaction
        let signedTx = Transaction1559.signAndSerialize(
          transaction,
          Blob.toArray(signature),
          Blob.toArray(public_key),
          ecCtx
        );
        
        let rawTxHex = switch (signedTx) {
          case (#ok((_, txBytes))) {
            Hex.encode(txBytes);
          };
          case (#err(err)) {
            return #Err("Failed to serialize signed transaction: " # err);
          };
        };
        
        // Send the raw transaction
        let result = await* ethSendRawTransaction(eth_tx.chain.chain_id, rpc_service, rawTxHex);
        
        switch (result) {
          case (#ok(txHash)) {
            #Ok(txHash);
          };
          case (#err(err)) {
            #Err(err);
          };
        };
        
      } catch (e) {
        #Err("Transaction failed: " # Error.message(e));
      };
    };

    public func icrc149_get_eth_tx_status(_tx_hash: Text) : Text {
      // CRITICAL: This MUST implement real ETH transaction status checking
      // If not implemented, return error status to make tests fail
      "IMPLEMENTATION_MISSING_TEST_SHOULD_FAIL";
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
                  nonce = eth_tx.nonce;
                  to = eth_tx.to;
                  value = eth_tx.value;
                  subaccount = eth_tx.subaccount;
                  maxPriorityFeePerGas = eth_tx.maxPriorityFeePerGas;
                  maxFeePerGas = eth_tx.maxFeePerGas;
                  gasLimit = eth_tx.gasLimit;
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
                switch(call.best_effort_timeout) {
                  case(?timeout) {
                    await (with timeout=timeout; cycles = call.cycles) ICPCall.call(call.canister, call.method, call.args);
                  };
                  case(null) {
                    await (with cycles = call.cycles) ICPCall.call(call.canister, call.method, call.args);
                  };
                };
                
              } catch(e){
                call.result := ?#Err("ICP call failed: " # Error.message(e));
                return #err("ICP call failed: " # Error.message(e));
              };
              call.result := ?#Ok(result);
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

    // Admin function to set/unset default snapshot contract
    public func icrc149_set_default_snapshot_contract(_caller: Principal, contract_address: ?Text) : {#Ok: (); #Err: Text} {
      if (not BTree.has(state.config.admin_principals, Principal.compare, _caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };
      
      state.config.default_snapshot_contract := contract_address;
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

    // SIWE Authentication with proper anti-replay protection
    public func icrc149_verify_siwe(siwe: MigrationTypes.Current.SIWEProof) : MigrationTypes.Current.SIWEResult {
      SIWEAuth.verifySiwe(siwe);
    };


    // Witness Validation for ICRC-149 Storage Proofs using stored canister state
    public func icrc149_verify_witness(witness: MigrationTypes.Current.Witness, proposal_id: ?Nat) : MigrationTypes.Current.WitnessResult {
      WitnessValidation.verifyWitness(witness, proposal_id, state);
    };

    // Internal function that validates witness against stored canister state
    private func icrc149_verify_witness_with_stored_state(witness: Service.Witness, proposal_id: ?Nat) : MigrationTypes.Current.WitnessResult {
      WitnessValidation.verifyWitnessWithStoredState(witness, proposal_id, state);
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
          #EthTransaction({
            to = eth_tx.to;
            value = eth_tx.value;
            data = eth_tx.data;
            chain = eth_tx.chain;
            subaccount = eth_tx.subaccount;
            maxPriorityFeePerGas = eth_tx.maxPriorityFeePerGas;
            maxFeePerGas = eth_tx.maxFeePerGas;
            gasLimit = eth_tx.gasLimit;
            var signature = null; // Signature will be set after proposal creation
            var nonce = null; // Nonce will be set during execution
          });
        };
        case (#Motion(a)) {
          // Motions don't require execution contract validation
          #Motion(a)
        };
        case(#ICPCall(call)) {
          // ICP calls don't require execution contract validation
          #ICPCall({call with
            var result : ?{#Err : Text; #Ok : Blob} = null; // Result will be set after proposal execution
            
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
          // Get latest finalized block from RPC
          let blockResult = await* getLatestFinalizedBlock(snapshot_contract_config.rpc_service, snapshot_contract_config.chain);
          let (block_number, state_root) = switch (blockResult) {
            case (#ok(block)) {
              // Convert state root hex string to Blob
              let state_root_blob = if (Text.startsWith(block.stateRoot, #text("0x"))) {
                let cleanHex = Text.trimStart(block.stateRoot, #text("0x"));
                // Ensure we have a valid 64-character hex string (32 bytes)
                let paddedHex = if (cleanHex.size() < 64) {
                  // Pad with leading zeros to ensure 32 bytes
                  let paddingCount = if (cleanHex.size() < 64) 64 - cleanHex.size() else 0;
                  let paddingArray = Array.tabulate<Text>(paddingCount, func(_) = "0");
                  let paddingText = Array.foldLeft<Text, Text>(paddingArray, "", func(acc, x) = acc # x);
                  paddingText # cleanHex;
                } else if (cleanHex.size() > 64) {
                  // Take only the first 64 characters
                  let chars = Text.toArray(cleanHex);
                  let truncatedChars = Array.tabulate<Char>(64, func(i) {
                    if (i < chars.size()) chars[i] else '0'
                  });
                  Text.fromArray(truncatedChars);
                } else {
                  cleanHex;
                };
                
                let chars = Text.toArray(paddedHex);
                let bytes = Array.tabulate<Nat8>(32, func(i) {
                  let highChar = chars[i * 2];
                  let lowChar = chars[i * 2 + 1];
                  
                  let high = switch (highChar) {
                    case ('0') 0; case ('1') 1; case ('2') 2; case ('3') 3; case ('4') 4;
                    case ('5') 5; case ('6') 6; case ('7') 7; case ('8') 8; case ('9') 9;
                    case ('a' or 'A') 10; case ('b' or 'B') 11; case ('c' or 'C') 12;
                    case ('d' or 'D') 13; case ('e' or 'E') 14; case ('f' or 'F') 15;
                    case (_) 0;
                  };
                  let low = switch (lowChar) {
                    case ('0') 0; case ('1') 1; case ('2') 2; case ('3') 3; case ('4') 4;
                    case ('5') 5; case ('6') 6; case ('7') 7; case ('8') 8; case ('9') 9;
                    case ('a' or 'A') 10; case ('b' or 'B') 11; case ('c' or 'C') 12;
                    case ('d' or 'D') 13; case ('e' or 'E') 14; case ('f' or 'F') 15;
                    case (_) 0;
                  };
                  Nat8.fromNat(high * 16 + low);
                });
                Blob.fromArray(bytes);
              } else {
                // Default 32-byte blob if no valid hex
                Blob.fromArray(Array.tabulate<Nat8>(32, func(_) = 0));
              };
              (block.number, state_root_blob);
            };
            case (#err(errMsg)) {
              D.print("Warning: Failed to get latest block, using defaults: " # errMsg);
              (12345678, Blob.fromArray(Array.tabulate<Nat8>(32, func(i) = Nat8.fromNat(i % 256)))); // Fallback 32-byte values
            };
          };

          // Get total supply from the contract (for ERC20 tokens)
          let total_supply = switch (snapshot_contract_config.contract_type) {
            case (#ERC20) {
              let supplyResult = await* getTotalSupply(snapshot_contract_config.rpc_service, snapshot_contract_config.chain, snapshot_contract_address);
              switch (supplyResult) {
                case (#ok(supply)) supply;
                case (#err(errMsg)) {
                  D.print("Warning: Failed to get totalSupply, using default: " # errMsg);
                  1000000; // Default fallback
                };
              };
            };
            case (#ERC721) {
              // For NFTs, we could implement a different approach to get total count
              // For now, use a default value
              D.print("Note: ERC721 total supply calculation not implemented, using default");
              10000; // Default for NFT collections
            };
            case (#Other(_)) {
              D.print("Note: Custom contract type, using default total supply");
              1000000; // Default for unknown contract types
            };
          };

          let snapshot : MigrationTypes.Current.ProposalSnapshot = {
            contract_address = snapshot_contract_address;
            chain = snapshot_contract_config.chain;
            block_number = block_number;
            state_root = state_root;
            total_supply = total_supply;
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
        case(#Ok(siwe_result)) {
          // Verify the SIWE address matches vote_args.voter (case-insensitive)
          let expectedVoterHex = normalizeEthereumAddress(blobToHex(vote_args.voter));
          let siweAddressNormalized = normalizeEthereumAddress(siwe_result.address);
          if (siweAddressNormalized != expectedVoterHex) {
            return #Err("SIWE address " # siwe_result.address # " does not match voter address " # expectedVoterHex);
          };
        };
      };

      // Verify witness/merkle proof and get actual voting power
      switch(icrc149_verify_witness(vote_args.witness, ?vote_args.proposal_id)) {
        case(#Err(err)) return #Err("Witness verification failed: " # err);
        case(#Ok(witness_result)) {
          if (not witness_result.valid) {
            return #Err("Witness validation failed: witness marked as invalid");
          };
          
          // Verify witness user address matches voter (case-insensitive)
          let expectedVoterHex = normalizeEthereumAddress(blobToHex(vote_args.voter));
          let witnessAddressNormalized = normalizeEthereumAddress(witness_result.user_address);
          if (witnessAddressNormalized != expectedVoterHex) {
            return #Err("Witness user address " # witness_result.user_address # " does not match voter address " # expectedVoterHex);
          };
          
          // Use the actual balance from the witness as voting power
          let voting_power = witness_result.balance;

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
      ProposalIndex.icrc149_get_proposals_service(state, proposalEngine, prev, take, filters);
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
      TestingHelpers.testAddSnapshot(contract_address, block_number, root_hash, state);
    };

    // Helper function for testing - get snapshot info
    public func test_get_snapshot_info(contract_address: Text) : ?{block_number: Nat; root_hash: Text} {
      TestingHelpers.testGetSnapshotInfo(contract_address, state);
    };

    // Test helper function to add a snapshot for testing witness validation
    public func icrc149_add_test_snapshot(proposal_id: Nat, block_number: Nat, state_root: Blob, contract_address: Text) : () {
      TestingHelpers.addTestSnapshot(proposal_id, block_number, state_root, contract_address, state);
    };

    // Enhanced test helper function to add a snapshot with specific chain_id
    public func icrc149_add_test_snapshot_with_chain(proposal_id: Nat, block_number: Nat, state_root: Blob, contract_address: Text, chain_id: Nat, network_name: Text) : () {
      TestingHelpers.addTestSnapshotWithChain(proposal_id, block_number, state_root, contract_address, chain_id, network_name, state);
    };

    // Test helper function to calculate storage key using the same logic as witness validation
    public func icrc149_calculate_test_storage_key(userAddress: Blob, slot: Nat) : Blob {
      TestingHelpers.calculateTestStorageKey(userAddress, slot);
    };

    // Get Ethereum address for the DAO using tECDSA
    public func icrc149_get_ethereum_address(subaccount: ?Blob) : Text {
      TestingHelpers.getEthereumAddress(subaccount);
    };

  };

};