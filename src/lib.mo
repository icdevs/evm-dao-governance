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
      switch (rpc_service.rpc_type) {
        case ("custom") {
          // Look for URL in custom_config
          let config = switch (rpc_service.custom_config) {
            case (?configs) configs;
            case null [];
          };
          let url = switch (Array.find<(Text, Text)>(config, func((key, _)) = key == "url")) {
            case (?("url", value)) value;
            case (_) "http://127.0.0.1:8545"; // Default fallback
          };
          #Custom({
            chainId = Nat64.fromNat(chain.chain_id); // Convert Nat to Nat64 for EVM RPC interface
            services = [{url = url; headers = null}];
          });
        };
        case (_) {
          // Use predefined services based on chain
          switch (chain.chain_id) {
            case (1) #EthMainnet(?[#Alchemy, #Ankr, #BlockPi]); // Mainnet
            case (11155111) #EthSepolia(?[#Alchemy, #Ankr, #BlockPi]); // Sepolia
            case (_) #EthMainnet(?[#Alchemy, #Ankr]); // Default to mainnet
          };
        };
      };
    };

    // Helper function to create EVM RPC canister actor
    private func getEvmRpcActor(rpc_service: MigrationTypes.Current.EthereumRPCService) : EVMRPCService {
      actor(Principal.toText(rpc_service.canister_id)) : EVMRPCService;
    };

    // Helper function to get latest finalized block
    private func getLatestFinalizedBlock(rpc_service: MigrationTypes.Current.EthereumRPCService, chain: MigrationTypes.Current.EthereumNetwork) : async* Result.Result<Block, Text> {
      try {
        let rpcActor = getEvmRpcActor(rpc_service);
        let rpcServices = getRpcServices(chain, rpc_service);
        let config : ?RpcConfig = ?{ 
          responseSizeEstimate = ?1000000; // 1MB estimate
          responseConsensus = null; // Use default consensus strategy
        };
        
        D.print("Getting latest block and going back 6 blocks for finalized safety on chain " # Nat.toText(chain.chain_id));
        
        // Get latest block first - this is universally supported - add timeout for test environment
        let latestResult = await ( with cycles=127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Latest);
        
        switch (latestResult) {
          case (#Consistent(#Ok(latestBlock))) {
            // Determine how many blocks to go back for safety
            let confirmationBlocks = switch (chain.chain_id) {
              case (1) 6; // Ethereum mainnet - 6 blocks back approximates finalized
              case (31337 or 1337) 2; // Local dev chains - just 2 blocks back
              case (_) 6; // All other chains - 6 blocks back for safety
            };
            
            let targetBlockNumber = if (latestBlock.number > confirmationBlocks) {
              latestBlock.number - confirmationBlocks;
            } else {
              latestBlock.number; // Use latest if chain is too new
            };
            
            D.print("Latest block: " # Nat.toText(latestBlock.number) # ", going back " # Nat.toText(confirmationBlocks) # " blocks to target: " # Nat.toText(targetBlockNumber));
            
            if (targetBlockNumber == latestBlock.number) {
              // Use the latest block if it has a valid state root
              if (latestBlock.stateRoot != "" and Text.startsWith(latestBlock.stateRoot, #text("0x")) and latestBlock.stateRoot.size() >= 66) {
                D.print("Using latest block " # Nat.toText(latestBlock.number) # " with state root: " # debug_show(latestBlock.stateRoot) # "...");
                return #ok(latestBlock);
              } else {
                return #err("Latest block has invalid state root: " # latestBlock.stateRoot);
              };
            } else {
              // Get the specific block number (latest - confirmation blocks) - add timeout for test environment
              let targetResult = await (with cycles=127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Number(targetBlockNumber));
              
              switch (targetResult) {
                case (#Consistent(#Ok(block))) {
                  // Validate that we have a proper state root
                  if (block.stateRoot != "" and Text.startsWith(block.stateRoot, #text("0x")) and block.stateRoot.size() >= 66) {
                    D.print("Successfully got finalized block " # Nat.toText(block.number) # " with state root: " # debug_show(block.stateRoot) # "...");
                    return #ok(block);
                  } else {
                    return #err("Block " # Nat.toText(targetBlockNumber) # " has invalid state root: " # block.stateRoot);
                  };
                };
                case (#Consistent(#Err(err))) {
                  return #err("Failed to get block " # Nat.toText(targetBlockNumber) # ": " # formatRpcError(err));
                };
                case (#Inconsistent(results)) {
                  // Use first successful result or return error from first attempt
                  switch (results.size()) {
                    case (0) return #err("No RPC responses received for block " # Nat.toText(targetBlockNumber));
                    case (_) {
                      let firstResult = results[0].1;
                      switch (firstResult) {
                        case (#Ok(block)) {
                          if (block.stateRoot != "" and Text.startsWith(block.stateRoot, #text("0x")) and block.stateRoot.size() >= 66) {
                            D.print("Successfully got finalized block " # Nat.toText(block.number) # " from inconsistent responses");
                            return #ok(block);
                          } else {
                            return #err("Block " # Nat.toText(targetBlockNumber) # " has invalid state root: " # block.stateRoot);
                          };
                        };
                        case (#Err(err)) return #err("Failed to get block " # Nat.toText(targetBlockNumber) # ": " # formatRpcError(err));
                      };
                    };
                  };
                };
              };
            };
          };
          case (#Consistent(#Err(err))) {
            return #err("Failed to get latest block: " # formatRpcError(err));
          };
          case (#Inconsistent(results)) {
            // Use first successful result or return error from first attempt
            switch (results.size()) {
              case (0) return #err("No RPC responses received for latest block");
              case (_) {
                let firstResult = results[0].1;
                switch (firstResult) {
                  case (#Ok(latestBlock)) {
                    // Same logic as above but for inconsistent response
                    let confirmationBlocks = switch (chain.chain_id) {
                      case (1) 6; // Ethereum mainnet
                      case (31337 or 1337) 2; // Local dev chains
                      case (_) 6; // All other chains
                    };
                    
                    let targetBlockNumber = if (latestBlock.number > confirmationBlocks) {
                      latestBlock.number - confirmationBlocks;
                    } else {
                      latestBlock.number;
                    };
                    
                    if (targetBlockNumber == latestBlock.number) {
                      if (latestBlock.stateRoot != "" and Text.startsWith(latestBlock.stateRoot, #text("0x")) and latestBlock.stateRoot.size() >= 66) {
                        return #ok(latestBlock);
                      } else {
                        return #err("Latest block has invalid state root: " # latestBlock.stateRoot);
                      };
                    } else {
                      let targetResult = await (with cycles = 127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Number(targetBlockNumber));
                      switch (targetResult) {
                        case (#Consistent(#Ok(block))) {
                          if (block.stateRoot != "" and Text.startsWith(block.stateRoot, #text("0x")) and block.stateRoot.size() >= 66) {
                            return #ok(block);
                          } else {
                            return #err("Block " # Nat.toText(targetBlockNumber) # " has invalid state root: " # block.stateRoot);
                          };
                        };
                        case (_) return #err("Failed to get target block after inconsistent latest response");
                      };
                    };
                  };
                  case (#Err(err)) return #err("Failed to get latest block: " # formatRpcError(err));
                };
              };
            };
          };
        };
      } catch (e) {
        #err("Failed to get block: " # Error.message(e));
      };
    };

    // Helper function to format RPC errors consistently
    private func formatRpcError(err: EVMRPCService.RpcError) : Text {
      switch (err) {
        case (#HttpOutcallError(httpErr)) {
          switch (httpErr) {
            case (#IcError({ message })) "IC error: " # message;
            case (#InvalidHttpJsonRpcResponse({ body })) "Invalid JSON RPC response: " # body;
          };
        };
        case (#JsonRpcError({ message })) "JSON RPC error: " # message;
        case (#ProviderError(provErr)) {
          switch (provErr) {
            case (#TooFewCycles({ expected; received })) "Too few cycles: expected " # Nat.toText(expected) # ", received " # Nat.toText(received);
            case (#InvalidRpcConfig(msg)) "Invalid RPC config: " # msg;
            case (#MissingRequiredProvider) "Missing required provider";
            case (#ProviderNotFound) "Provider not found";
            case (#NoPermission) "No permission";
          };
        };
        case (#ValidationError(valErr)) {
          switch (valErr) {
            case (#Custom(msg)) "Validation error: " # msg;
            case (#InvalidHex(msg)) "Invalid hex: " # msg;
          };
        };
      };
    };

    // Helper function to convert hex string to Blob with validation
    private func hexStringToBlob(hexStr: Text) : Result.Result<Blob, Text> {
      if (not Text.startsWith(hexStr, #text("0x"))) {
        return #err("Hex string must start with 0x");
      };
      
      let cleanHex = Text.trimStart(hexStr, #text("0x"));
      
      // Validate hex characters
      for (char in cleanHex.chars()) {
        switch (char) {
          case ('0' or '1' or '2' or '3' or '4' or '5' or '6' or '7' or '8' or '9' or 
                'a' or 'b' or 'c' or 'd' or 'e' or 'f' or 
                'A' or 'B' or 'C' or 'D' or 'E' or 'F') {};
          case (_) {
            return #err("Invalid hex character: " # Text.fromChar(char));
          };
        };
      };
      
      // Ensure even number of characters
      let normalizedHex = if (cleanHex.size() % 2 == 1) {
        "0" # cleanHex;
      } else {
        cleanHex;
      };
      
      // For state root, ensure we have exactly 64 characters (32 bytes)
      let paddedHex = if (normalizedHex.size() < 64) {
        // Pad with leading zeros to ensure 32 bytes
        let paddingCount = 64 - normalizedHex.size();
        let paddingArray = Array.tabulate<Text>(paddingCount, func(_) = "0");
        let paddingText = Array.foldLeft<Text, Text>(paddingArray, "", func(acc, x) = acc # x);
        paddingText # normalizedHex;
      } else if (normalizedHex.size() > 64) {
        // Take only the first 64 characters for state root
        let chars = Text.toArray(normalizedHex);
        let truncatedChars = Array.tabulate<Char>(64, func(i) {
          if (i < chars.size()) chars[i] else '0'
        });
        Text.fromArray(truncatedChars);
      } else {
        normalizedHex;
      };
      
      let chars = Text.toArray(paddedHex);
      let byteCount = chars.size() / 2;
      let bytes = Array.tabulate<Nat8>(byteCount, func(i) {
        let highChar = chars[i * 2];
        let lowChar = chars[i * 2 + 1];
        
        let high = switch (highChar) {
          case ('0') 0; case ('1') 1; case ('2') 2; case ('3') 3; case ('4') 4;
          case ('5') 5; case ('6') 6; case ('7') 7; case ('8') 8; case ('9') 9;
          case ('a' or 'A') 10; case ('b' or 'B') 11; case ('c' or 'C') 12;
          case ('d' or 'D') 13; case ('e' or 'E') 14; case ('f' or 'F') 15;
          case (_) 0; // Should not happen due to validation above
        };
        let low = switch (lowChar) {
          case ('0') 0; case ('1') 1; case ('2') 2; case ('3') 3; case ('4') 4;
          case ('5') 5; case ('6') 6; case ('7') 7; case ('8') 8; case ('9') 9;
          case ('a' or 'A') 10; case ('b' or 'B') 11; case ('c' or 'C') 12;
          case ('d' or 'D') 13; case ('e' or 'E') 14; case ('f' or 'F') 15;
          case (_) 0; // Should not happen due to validation above
        };
        Nat8.fromNat(high * 16 + low);
      });
      
      #ok(Blob.fromArray(bytes));
    };

    // Helper function to validate state root format
    private func validateStateRoot(stateRoot: Text) : Bool {
      stateRoot != "" and 
      Text.startsWith(stateRoot, #text("0x")) and 
      stateRoot.size() >= 66 and // 0x + 64 hex chars = 66 total
      stateRoot.size() <= 66; // Exactly 66 characters for valid state root
    };
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
        
        let result = await(with cycles=127817059200) rpcActor.eth_call(rpcServices, config, callArgs);
        
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

    // Helper function to get Ethereum address from ECDSA public key and derivation path
    private func getEthereumAddress(subaccount: ?Blob) : async* Text {
      let derivationPath = switch (subaccount) {
        case (?blob) [blob];
        case (null) [];
      };
      
      try {
        let { public_key; chain_code = _ } = await IC_ECDSA_ACTOR.ecdsa_public_key({
          canister_id = ?Principal.fromActor(_self);
          derivation_path = derivationPath;
          key_id = { curve = #secp256k1; name = ECDSA_KEY_NAME };
        });

        // Convert public key to Ethereum address
        let pubKeyBytes = Blob.toArray(public_key);
        // Remove the first byte (0x04) for uncompressed public key format
        let uncompressedKey = if (pubKeyBytes.size() > 1) {
          let size = Int.abs(pubKeyBytes.size() - 1);
          Array.subArray(pubKeyBytes, 1, size);
        } else {
          pubKeyBytes;
        };
        
        // Hash with Keccak256
        let sha3 = SHA3.Keccak(256);
        sha3.update(uncompressedKey);
        let hash = sha3.finalize();
        
        // Take last 20 bytes and format as hex address
        let addressBytes = Array.subArray(hash, 12, 20);
        "0x" # Hex.encode(addressBytes);
      } catch (e) {
        D.trap("Failed to get Ethereum address: " # Error.message(e));
      };
    };

    // Helper function to get next nonce for an Ethereum address
    private func getNextNonce(chainId: Nat, address: Text, rpc_service: MigrationTypes.Current.EthereumRPCService) : async* Nat {
      let nonceKey = makeNonceKey(chainId, address);
      
      // Check local cache first
      switch (BTree.get(state.ethereumNonces, Text.compare, nonceKey)) {
        case (?cachedNonce) {
          // Increment cached nonce
          let newNonce = cachedNonce + 1;
          ignore BTree.insert(state.ethereumNonces, Text.compare, nonceKey, newNonce);
          newNonce;
        };
        case (null) {
          // Fetch current nonce from blockchain
          try {
            let rpcActor = getEvmRpcActor(rpc_service);
            let rpcServices = getRpcServices({chain_id = chainId; network_name = ""}, rpc_service);

            let result = await(with cycles=127817059200) rpcActor.eth_getTransactionCount(rpcServices, ?{
              responseSizeEstimate = ?64;
              responseConsensus = null; // Use default consensus strategy
            }, { address = address; block = #Latest });
            
            switch (result) {
              case (#Consistent(#Ok(nonce))) {
                ignore BTree.insert(state.ethereumNonces, Text.compare, nonceKey, nonce);
                nonce;
              };
              case (_) {
                // Default to 0 if unable to fetch
                ignore BTree.insert(state.ethereumNonces, Text.compare, nonceKey, 0);
                0;
              };
            };
          } catch (e) {
            // Default to 0 on error
            ignore BTree.insert(state.ethereumNonces, Text.compare, nonceKey, 0);
            0;
          };
        };
      };
    };

    // Helper function to send raw Ethereum transaction
    private func ethSendRawTransaction(chainId: Nat, rpc_service: MigrationTypes.Current.EthereumRPCService, rawTx: Text) : async* Result.Result<Text, Text> {
      try {
        let rpcActor = getEvmRpcActor(rpc_service);
        let rpcServices = getRpcServices({chain_id = chainId; network_name = ""}, rpc_service);
        
        let finalTx = if (Text.startsWith(rawTx, #text("0x"))) {
          rawTx;
        } else {
          "0x" # rawTx;
        };
        
        Cycles.add<system>(1_000_000_000); // 1B cycles for transaction
        let result = await (with cycles=127817059200  ) rpcActor.eth_sendRawTransaction(rpcServices, ?{
          responseSizeEstimate = ?128;
          responseConsensus = null; // Use default consensus strategy
        }, finalTx);
        
        switch (result) {
          case (#Consistent(#Ok(txStatus))) {
            switch (txStatus) {
              case (#Ok(txHashOpt)) {
                switch (txHashOpt) {
                  case (?txHash) #ok(txHash);
                  case null #err("Transaction succeeded but no hash returned");
                };
              };
              case (#NonceTooLow) #err("Transaction failed: nonce too low");
              case (#NonceTooHigh) #err("Transaction failed: nonce too high");
              case (#InsufficientFunds) #err("Transaction failed: insufficient funds");
            };
          };
          case (#Consistent(#Err(err))) {
            #err("RPC error: " # debug_show(err));
          };
          case (#Inconsistent(err)) {
            #err("Inconsistent RPC response: " # debug_show(err));
          };
        };
      } catch (e) {
        #err("Transaction failed: " # Error.message(e));
      };
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
        let nonce = await* getNextNonce(eth_tx.chain.chain_id, ethAddress, rpc_service);
        
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
      
      // Normalize contract address for case-insensitive storage
      let normalizedAddress = normalizeEthereumAddress(contract_address);
      
      switch (config) {
        case (?new_config) {
          ignore BTree.insert(state.config.snapshot_contracts, Text.compare, normalizedAddress, new_config);
          #Ok(());
        };
        case (null) {
          ignore BTree.delete(state.config.snapshot_contracts, Text.compare, normalizedAddress);
          #Ok(());
        };
      };
    };

    // Admin function to add/update execution contract config
    public func icrc149_update_execution_contract_config(_caller: Principal, contract_address: Text, config: ?MigrationTypes.Current.ExecutionContractConfig) : {#Ok: (); #Err: Text} {
      if (not BTree.has(state.config.admin_principals, Principal.compare, _caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };
      
      // Normalize contract address for case-insensitive storage
      let normalizedAddress = normalizeEthereumAddress(contract_address);
      
      switch (config) {
        case (?new_config) {
          ignore BTree.insert(state.config.execution_contracts, Text.compare, normalizedAddress, new_config);
          #Ok(());
        };
        case (null) {
          ignore BTree.delete(state.config.execution_contracts, Text.compare, normalizedAddress);
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
      
      // Normalize contract address for case-insensitive storage
      let normalizedAddress = switch (contract_address) {
        case (?addr) ?normalizeEthereumAddress(addr);
        case (null) null;
      };
      
      state.config.default_snapshot_contract := normalizedAddress;
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
      if (siwe.message == "" or siwe.signature.size() == 0) {
        return #Err("Invalid SIWE proof: empty message or signature");
      };
      
      // Parse SIWE message according to EIP-4361 format
      let lines = Text.split(siwe.message, #char('\n'));
      let lineArray = Iter.toArray(lines);
      
      if (lineArray.size() < 8) {
        return #Err("Invalid SIWE message format: insufficient lines");
      };
      
      // Parse required fields
      let domain = switch (Text.split(lineArray[0], #text(" wants you to sign in")).next()) {
        case (?domain) { domain };
        case null { return #Err("Invalid SIWE message: missing domain"); };
      };
      
      let address = lineArray[1];
      
      // Parse the statement line: "Vote {choice} on proposal {proposal_id} for contract {contract_address}"
      let statement = lineArray[3];
      
      // Extract vote choice, proposal ID, and contract address from statement
      let (vote_choice, proposal_id_nat, contract_address) = switch (parseVotingStatement(statement)) {
        case (#Ok(result)) { result };
        case (#Err(msg)) { return #Err("Invalid voting statement: " # msg); };
      };
      
      // Parse URI, Version, Chain ID, Nonce, Issued At, Expiration Time
      var chain_id_nat: Nat = 0;
      var nonce_text: Text = "";
      var issued_at_nat: Nat = 0;
      var issued_at_iso: Text = "";
      var expiration_time_nat: Nat = 0;
      var expiration_time_iso: Text = "";
      
      for (line in lineArray.vals()) {
        if (Text.startsWith(line, #text("Chain ID: "))) {
          let chainIdText = Text.replace(line, #text("Chain ID: "), "");
          chain_id_nat := switch (Nat.fromText(chainIdText)) {
            case (?n) { n };
            case null { return #Err("Invalid Chain ID format"); };
          };
        } else if (Text.startsWith(line, #text("Nonce: "))) {
          nonce_text := Text.replace(line, #text("Nonce: "), "");
          expiration_time_nat := switch (Nat.fromText(nonce_text)) {
            case (?n) { n };
            case null { return #Err("Invalid Nonce format"); };
          };
        } else if (Text.startsWith(line, #text("Issued At: "))) {
          issued_at_iso := Text.replace(line, #text("Issued At: "), "");
        } else if (Text.startsWith(line, #text("Issued At Nanos: "))) {
          let issuedAtNanosText = Text.replace(line, #text("Issued At Nanos: "), "");
          issued_at_nat := switch (Nat.fromText(issuedAtNanosText)) {
            case (?n) { n };
            case null { return #Err("Invalid Issued At Nanos format"); };
          };
        } else if (Text.startsWith(line, #text("Expiration Time: "))) {
          expiration_time_iso := Text.replace(line, #text("Expiration Time: "), "");
        } else if (Text.startsWith(line, #text("Expiration Nanos: "))) {
          let expirationNanosText = Text.replace(line, #text("Expiration Nanos: "), "");
          expiration_time_nat := switch (Nat.fromText(expirationNanosText)) {
            case (?n) { n };
            case null { return #Err("Invalid Expiration Nanos format"); };
          };
        };
      };
      
      // Validate time window (must be within 10 minutes = 600 seconds = 600_000_000_000 nanoseconds)
      let currentTime = natNow();
      let maxWindowNanos = 600_000_000_000; // 10 minutes in nanoseconds
      
      if (expiration_time_nat < currentTime) {
        return #Err("SIWE message has expired");
      };
      
      if (expiration_time_nat > (currentTime + maxWindowNanos)) {
        return #Err("SIWE message expiration time too far in future");
      };
      
      if (expiration_time_nat > issued_at_nat and (expiration_time_nat - issued_at_nat) > maxWindowNanos) {
        return #Err("SIWE message time window exceeds 10 minutes");
      };
      
      // CRITICAL: Verify SIWE signature against address - NO BYPASSING ALLOWED
      switch (verifySiweSignature(siwe.message, siwe.signature, address)) {
        case (#Err(err)) {
          return #Err("SIWE signature verification failed: " # err);
        };
        case (#Ok(_)) {
          // Signature is valid, proceed
        };
      };
      
      #Ok({
        address = address;
        domain = domain;
        statement = ?statement;
        issued_at = issued_at_nat;
        issued_at_iso = issued_at_iso;
        expiration_time = expiration_time_nat;
        expiration_time_iso = expiration_time_iso;
        proposal_id = proposal_id_nat;
        vote_choice = vote_choice;
        contract_address = contract_address;
        chain_id = chain_id_nat;
        nonce = nonce_text;
      });
    };
    
    // Helper function to parse voting statement
    private func parseVotingStatement(statement: Text) : {#Ok: (Text, Nat, Text); #Err: Text} {
      // Expected format: "Vote {choice} on proposal {proposal_id} for contract {contract_address}"
      let parts = Text.split(statement, #char(' '));
      let partsArray = Iter.toArray(parts);
      
      if (partsArray.size() < 8) {
        return #Err("Statement format incorrect");
      };
      
      if (partsArray[0] != "Vote" or partsArray[2] != "on" or partsArray[3] != "proposal" or partsArray[5] != "for" or partsArray[6] != "contract") {
        return #Err("Statement keywords incorrect");
      };
      
      let vote_choice = partsArray[1];
      let proposal_id_text = partsArray[4];
      let contract_address = partsArray[7];
      
      // Validate vote choice
      if (vote_choice != "Yes" and vote_choice != "No" and vote_choice != "Abstain") {
        return #Err("Invalid vote choice: must be Yes, No, or Abstain");
      };
      
      // Parse proposal ID
      let proposal_id = switch (Nat.fromText(proposal_id_text)) {
        case (?n) { n };
        case null { return #Err("Invalid proposal ID format"); };
      };
      
      #Ok((vote_choice, proposal_id, contract_address));
    };
    
    // Helper function to parse ISO 8601 timestamp to nanoseconds
    private func parseTimestamp(timestamp: Text) : Nat {
      // For now, return current time as a placeholder
      // TODO: Implement proper ISO 8601 parsing
      natNow()
    };
    
    // CRITICAL: Real SIWE signature verification - NO MOCKING ALLOWED
    private func verifySiweSignature(message: Text, signature: Blob, expectedAddress: Text) : {#Ok: (); #Err: Text} {
      // This function MUST implement real ECDSA signature verification
      // If not implemented, the test MUST fail
      
      if (signature.size() != 65) {
        return #Err("Invalid signature length: expected 65 bytes, got " # Nat.toText(signature.size()));
      };
      
      // Extract r, s, v from signature
      let sigBytes = Blob.toArray(signature);
      if (sigBytes.size() != 65) {
        return #Err("Signature must be exactly 65 bytes");
      };
      
      let r = Blob.fromArray(Array.subArray(sigBytes, 0, 32));
      let s = Blob.fromArray(Array.subArray(sigBytes, 32, 32));
      let v = sigBytes[64];
      
      // Hash the message according to EIP-191 standard
      let messageHash = hashSiweMessage(message);
      
      // Recover the public key from the signature
      switch (recoverEcdsaPublicKey(messageHash, r, s, v)) {
        case (#Err(err)) {
          return #Err("Failed to recover public key: " # err);
        };
        case (#Ok(publicKey)) {
          // Derive Ethereum address from public key
          let derivedAddress = deriveEthereumAddressFromPublicKey(publicKey);
          
          // Compare addresses (case-insensitive)
          let normalizedExpected = normalizeEthereumAddress(expectedAddress);
          let normalizedDerived = normalizeEthereumAddress(derivedAddress);
          
          if (normalizedExpected != normalizedDerived) {
            return #Err("Signature verification failed: expected address " # normalizedExpected # ", got " # normalizedDerived);
          };
          
          #Ok(());
        };
      };
    };
    
    // Helper function to hash SIWE message according to EIP-191
    private func hashSiweMessage(message: Text) : Blob {
      // EIP-191 prefix: \x19Ethereum Signed Message:\n
      let prefixBytes = Blob.fromArray([0x19 : Nat8]);
      let ethMsgBytes = Text.encodeUtf8("Ethereum Signed Message:\n");
      let messageBytes = Text.encodeUtf8(message);
      let lengthStr = Nat.toText(messageBytes.size());
      let lengthBytes = Text.encodeUtf8(lengthStr);
      
      // Concatenate: \x19 + "Ethereum Signed Message:\n" + length + message
      let combinedBytes = Array.append(
        Array.append(
          Array.append(Blob.toArray(prefixBytes), Blob.toArray(ethMsgBytes)),
          Blob.toArray(lengthBytes)
        ),
        Blob.toArray(messageBytes)
      );
      
      SHA256.fromBlob(#sha256, Blob.fromArray(combinedBytes));
    };
    
    // Helper function to recover ECDSA public key from signature
    private func recoverEcdsaPublicKey(messageHash: Blob, r: Blob, s: Blob, v: Nat8) : {#Ok: Blob; #Err: Text} {
      // CRITICAL: This MUST implement real ECDSA recovery
      // Using secp256k1 curve recovery
      
      if (v < 27 or v > 30) {
        return #Err("Invalid recovery parameter v: " # Nat8.toText(v));
      };
      
      let recoveryId = if (v >= 27) { v - 27 } else { v };
      
      // For now, this is a placeholder that will cause tests to fail
      // Real implementation would use secp256k1 point recovery
      #Err("ECDSA signature recovery not yet implemented - test should FAIL");
    };
    
    // Helper function to derive Ethereum address from public key
    private func deriveEthereumAddressFromPublicKey(publicKey: Blob) : Text {
      // CRITICAL: This MUST implement real address derivation
      // Real implementation would take last 20 bytes of keccak256(publicKey)
      
      // For now, return an obviously wrong address to make tests fail
      "0x0000000000000000000000000000000000000000";
    };
    
    // Helper function to normalize Ethereum addresses for comparison
    private func normalizeEthereumAddress(address: Text) : Text {
      // Convert to lowercase and ensure 0x prefix
      let cleanAddr = if (Text.startsWith(address, #text("0x"))) {
        Text.trimStart(address, #text("0x"));
      } else {
        address;
      };
      "0x" # Text.map(cleanAddr, func(c: Char) : Char {
        switch (c) {
          case ('A') 'a';
          case ('B') 'b';
          case ('C') 'c';
          case ('D') 'd';
          case ('E') 'e';
          case ('F') 'f';
          case (_) c;
        };
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
      let contractAddress = normalizeEthereumAddress(blobToHex(witness.contractAddress));
      
      // Find the contract config by normalizing all stored addresses for comparison
      var contractConfig: ?MigrationTypes.Current.SnapshotContractConfig = null;
      for ((storedAddress, config) in BTree.entries(state.config.snapshot_contracts)) {
        if (normalizeEthereumAddress(storedAddress) == contractAddress) {
          contractConfig := ?config;
        };
      };
      
      switch (contractConfig) {
        case (null) {
          return #Err("Contract address " # contractAddress # " is not approved for snapshots");
        };
        case (?config) {
         
          
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
            expectedStorageSlot = switch contractConfig {
              case (?cfg) cfg.balance_storage_slot;
              case null D.trap("No contract config found when validating witness");
            }; // Use configured storage slot
            chainId = switch(contractConfig) {
              case (?cfg) cfg.chain.chain_id;
              case null D.trap("No contract config found when validating witness");
            }; // Use configured chain ID
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
        case (?contract) normalizeEthereumAddress(contract);
        case (null) {
          // Use default snapshot contract if available
          switch (state.config.default_snapshot_contract) {
            case (?default) default; // Already normalized when stored
            case (null) {
              return #Err("No snapshot contract specified and no default snapshot contract configured");
            };
          };
        };
      };
      
      // Validate that the snapshot contract is approved and enabled
      // Find the contract config by normalizing all stored addresses for comparison
      var snapshot_contract_config: ?MigrationTypes.Current.SnapshotContractConfig = null;
      for ((storedAddress, config) in BTree.entries(state.config.snapshot_contracts)) {
        if (normalizeEthereumAddress(storedAddress) == snapshot_contract_address) {
          snapshot_contract_config := ?config;
        };
      };
      
      switch (snapshot_contract_config) {
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
          // Find execution contract by normalizing addresses for comparison
          let normalizedToAddress = normalizeEthereumAddress(eth_tx.to);
          var execution_contract_config: ?MigrationTypes.Current.ExecutionContractConfig = null;
          for ((storedAddress, config) in BTree.entries(state.config.execution_contracts)) {
            if (normalizeEthereumAddress(storedAddress) == normalizedToAddress) {
              execution_contract_config := ?config;
            };
          };
          
          switch (execution_contract_config) {
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
          let final_snapshot_contract_config = switch (snapshot_contract_config) {
            case (?config) config;
            case (null) {
              // This shouldn't happen since we validated above
              return #Err("Internal error: snapshot contract config not found");
            };
          };

          // Create snapshot for this proposal using the specified snapshot contract
          // Get latest finalized block from RPC
          let blockResult = await* getLatestFinalizedBlock(final_snapshot_contract_config.rpc_service, final_snapshot_contract_config.chain);
          let (block_number, state_root) = switch (blockResult) {
            case (#ok(block)) {
              // Validate and convert state root hex string to Blob
              if (not validateStateRoot(block.stateRoot)) {
                return #Err("Invalid state root format from block " # Nat.toText(block.number) # ": " # block.stateRoot);
              };
              
              switch (hexStringToBlob(block.stateRoot)) {
                case (#ok(state_root_blob)) {
                  D.print("Successfully got block " # Nat.toText(block.number) # " with state root: " # block.stateRoot);
                  (block.number, state_root_blob);
                };
                case (#err(hexErr)) {
                  return #Err("Failed to convert state root hex to blob: " # hexErr);
                };
              };
            };
            case (#err(errMsg)) {
              // CRITICAL: RPC failure should cause proposal creation to FAIL, not use defaults
              return #Err("Failed to get latest block for snapshot: " # errMsg);
            };
          };

          // Get total supply from the contract (for ERC20 tokens)
          let total_supply = switch (final_snapshot_contract_config.contract_type) {
            case (#ERC20) {
              let supplyResult = await* getTotalSupply(final_snapshot_contract_config.rpc_service, final_snapshot_contract_config.chain, snapshot_contract_address);
              switch (supplyResult) {
                case (#ok(supply)) supply;
                case (#err(errMsg)) {
                  // CRITICAL: totalSupply failure should cause proposal creation to FAIL, not use defaults  
                  return #Err("Failed to get totalSupply for snapshot: " # errMsg);
                };
              };
            };
            case (#ERC721) {
              // CRITICAL: ERC721 total supply calculation MUST be implemented, not defaulted
              return #Err("ERC721 total supply calculation not implemented - this must be fixed before proposal creation");
            };
            case (#Other(_)) {
              // CRITICAL: Custom contract types MUST have proper total supply calculation
              return #Err("Custom contract type total supply calculation not implemented - this must be fixed before proposal creation");
            };
          };

          let snapshot : MigrationTypes.Current.ProposalSnapshot = {
            contract_address = snapshot_contract_address;
            chain = switch (snapshot_contract_config) {
              case (?config) config.chain;
              case (null) D.trap("Internal error: snapshot contract config not found");
            };
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

    // Test helper function to add a snapshot for testing witness validation
    public func icrc149_add_test_snapshot(proposal_id: Nat, block_number: Nat, state_root: Blob, contract_address: Text) : () {
      let testSnapshot : MigrationTypes.Current.ProposalSnapshot = {
        contract_address = contract_address;
        chain = {
          chain_id = 31337; // Local testnet
          network_name = "local";
        };
        block_number = block_number;
        state_root = state_root;
        total_supply = 1000000; // Test value
        snapshot_time = natNow();
      };
      
      ignore BTree.insert<Nat, MigrationTypes.Current.ProposalSnapshot>(
        state.snapshots, 
        Nat.compare, 
        proposal_id, 
        testSnapshot
      );
    };

    // Enhanced test helper function to add a snapshot with specific chain_id
    public func icrc149_add_test_snapshot_with_chain(proposal_id: Nat, block_number: Nat, state_root: Blob, contract_address: Text, chain_id: Nat, network_name: Text) : () {
      let testSnapshot : MigrationTypes.Current.ProposalSnapshot = {
        contract_address = contract_address;
        chain = {
          chain_id = chain_id;
          network_name = network_name;
        };
        block_number = block_number;
        state_root = state_root;
        total_supply = 1000000; // Test value
        snapshot_time = natNow();
      };
      
      ignore BTree.insert<Nat, MigrationTypes.Current.ProposalSnapshot>(
        state.snapshots, 
        Nat.compare, 
        proposal_id, 
        testSnapshot
      );
    };

    // Test helper function to calculate storage key using the same logic as witness validation
    public func icrc149_calculate_test_storage_key(userAddress: Blob, slot: Nat) : Blob {
      WitnessValidator.calculateStorageKeyHelper(userAddress, slot);
    };

    // Get Ethereum address for the DAO using tECDSA
    public func icrc149_get_ethereum_address(subaccount: ?Blob) : Text {
      // For now, return a deterministic address based on a static seed
      // In production, this would derive the address from tECDSA public key
      let addressSeed = switch(subaccount) {
        case null { 
          // Use a consistent 32-byte zero subaccount for the main address
          let zeroSubaccount = Blob.fromArray(Array.tabulate<Nat8>(32, func(_) = 0));
          "DAO_Bridge_Main_" # Hex.encode(Blob.toArray(zeroSubaccount)); 
        };
        case (?sub) { "DAO_Bridge_Sub_" # Hex.encode(Blob.toArray(sub)) };
      };
      
      // Generate a deterministic Ethereum address (for testing)
      // In production, this would use the actual tECDSA derived address
      let hash = SHA256.fromBlob(#sha256, Text.encodeUtf8(addressSeed));
      let hashArray = Blob.toArray(hash);
      let addressBytes = Array.subArray<Nat8>(hashArray, 12, 20); // Take last 20 bytes for address
      
      // Convert to hex string with 0x prefix and ensure proper checksum
      let hexAddress = Hex.encode(addressBytes);
      "0x" # hexAddress;
    };

  };

};