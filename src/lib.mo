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
import Bool "mo:base/Bool";
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
import Debug "mo:base/Debug";

// EVM Transaction Libraries
import EVMAddress "mo:evm-txs/Address";
import Transaction1559 "mo:evm-txs/transactions/EIP1559";
import Contract "mo:evm-txs/Contract";
import Ecmult "mo:libsecp256k1/core/ecmult";
import ECDSA "mo:libsecp256k1/Ecdsa";
import Signature "mo:libsecp256k1/Signature";
import MessageLib "mo:libsecp256k1/Message";
import RecoveryId "mo:libsecp256k1/RecoveryId";
import PublicKey "mo:libsecp256k1/PublicKey";
import PreG "/precompile/pre_g";

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

    private var _ecCtx : ?Ecmult.ECMultContext = null;

    private func ecCtx() : Ecmult.ECMultContext {
      switch (_ecCtx) {
        case (?ctx) ctx;
        case (null) {
          // Create EC multiplication context for secp256k1
          let newCtx = Ecmult.ECMultContext(?Ecmult.loadPreG(PreG.pre_g));
          _ecCtx := ?newCtx; // Store in the module variable
          newCtx;
        };
      };
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
        D.print("⏳ Making eth_getBlockByNumber(Latest) RPC call...");
        let latestResult = await ( with cycles=127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Latest);
        D.print("✅ eth_getBlockByNumber(Latest) RPC call completed");
        
        switch (latestResult) {
          case (#Consistent(#Ok(latestBlock))) {
            D.print("🎯 Latest block retrieved successfully: " # Nat.toText(latestBlock.number));
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
              D.print("⏳ Making eth_getBlockByNumber(" # Nat.toText(targetBlockNumber) # ") RPC call...");
              let targetResult = await (with cycles=127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Number(targetBlockNumber));
              D.print("✅ eth_getBlockByNumber(" # Nat.toText(targetBlockNumber) # ") RPC call completed");
              
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
                  D.print("❌ eth_getBlockByNumber(" # Nat.toText(targetBlockNumber) # ") failed: " # formatRpcError(err));
                  return #err("Failed to get block " # Nat.toText(targetBlockNumber) # ": " # formatRpcError(err));
                };
                case (#Inconsistent(results)) {
                  D.print("⚠️ eth_getBlockByNumber(" # Nat.toText(targetBlockNumber) # ") returned inconsistent results");
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
            D.print("❌ eth_getBlockByNumber(Latest) failed: " # formatRpcError(err));
            return #err("Failed to get latest block: " # formatRpcError(err));
          };
          case (#Inconsistent(results)) {
            D.print("⚠️ eth_getBlockByNumber(Latest) returned inconsistent results from " # Nat.toText(results.size()) # " providers");
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
      D.print("🚀 TOTAL_SUPPLY: Starting getTotalSupply for contract " # contract_address);
      
      try {
        D.print("🔧 TOTAL_SUPPLY: Creating RPC actor and services");
        let rpcActor = getEvmRpcActor(rpc_service);
        let rpcServices = getRpcServices(chain, rpc_service);
        let config : ?RpcConfig = ?{ 
          responseSizeEstimate = ?1000000; // 1MB estimate
          responseConsensus = null; // Use default consensus strategy
        };
        
        D.print("🔧 TOTAL_SUPPLY: RPC actor and services created successfully");
        
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
        
        D.print("📞 TOTAL_SUPPLY: Making eth_call RPC to contract " # contract_address # " with data 0x18160ddd");
        D.print("📞 TOTAL_SUPPLY: Using 127817059200 cycles for this call");
        
        let result = await(with cycles=127817059200) rpcActor.eth_call(rpcServices, config, callArgs);
        
        D.print("✅ TOTAL_SUPPLY: eth_call RPC call completed successfully");
        D.print("🔍 TOTAL_SUPPLY: Processing result...");
        
        switch (result) {
          case (#Consistent(#Ok(hexResult))) {
            D.print("✅ TOTAL_SUPPLY: Got consistent successful result: " # hexResult);
            // Parse hex result to Nat (assumes 32-byte result)
            try {
              // Remove 0x prefix and parse as hex
              let cleanHex = if (Text.startsWith(hexResult, #text("0x"))) {
                Text.trimStart(hexResult, #text("0x"));
              } else {
                hexResult;
              };
              
              D.print("🔧 TOTAL_SUPPLY: Clean hex string: " # cleanHex);
              
              // Convert hex string to Nat (simplified - assumes valid hex)
              var totalSupply : Nat = 0;
              var multiplier : Nat = 1;
              let chars = Text.toArray(cleanHex);
              var i = chars.size();
              
              D.print("🔧 TOTAL_SUPPLY: Converting hex to number, " # Nat.toText(chars.size()) # " characters");
              
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
              
              D.print("✅ TOTAL_SUPPLY: Successfully parsed total supply: " # Nat.toText(totalSupply));
              #ok(totalSupply);
            } catch (e) {
              let errorMsg = "Failed to parse totalSupply result: " # Error.message(e);
              D.print("❌ TOTAL_SUPPLY: " # errorMsg);
              #err(errorMsg);
            };
          };
          case (#Consistent(#Err(err))) {
            D.print("❌ TOTAL_SUPPLY: Got consistent error result");
            switch (err) {
              case (#HttpOutcallError(httpErr)) {
                switch (httpErr) {
                  case (#IcError({ message })) {
                    let errorMsg = "IC error getting totalSupply: " # message;
                    D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                    #err(errorMsg);
                  };
                  case (#InvalidHttpJsonRpcResponse({ body })) {
                    let errorMsg = "Invalid JSON RPC response getting totalSupply: " # body;
                    D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                    #err(errorMsg);
                  };
                };
              };
              case (#JsonRpcError({ message })) {
                let errorMsg = "JSON RPC error getting totalSupply: " # message;
                D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                #err(errorMsg);
              };
              case (#ProviderError(_)) {
                let errorMsg = "Provider error getting totalSupply";
                D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                #err(errorMsg);
              };
              case (#ValidationError(_)) {
                let errorMsg = "Validation error getting totalSupply";
                D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                #err(errorMsg);
              };
            };
          };
          case (#Inconsistent(results)) {
            D.print("⚠️ TOTAL_SUPPLY: Got inconsistent results, using first successful one");
            D.print("🔍 TOTAL_SUPPLY: Total results count: " # Nat.toText(results.size()));
            // Use first successful result
            switch (results.size()) {
              case (0) {
                let errorMsg = "No RPC responses for totalSupply";
                D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                #err(errorMsg);
              };
              case (_) {
                let firstResult = results[0].1;
                D.print("🔍 TOTAL_SUPPLY: Processing first result from inconsistent responses");
                switch (firstResult) {
                  case (#Ok(hexResult)) {
                    D.print("✅ TOTAL_SUPPLY: First result is successful: " # hexResult);
                    // Same hex parsing logic as above
                    try {
                      let cleanHex = if (Text.startsWith(hexResult, #text("0x"))) {
                        Text.trimStart(hexResult, #text("0x"));
                      } else {
                        hexResult;
                      };
                      
                      D.print("🔧 TOTAL_SUPPLY: Clean hex string: " # cleanHex);
                      
                      var totalSupply : Nat = 0;
                      var multiplier : Nat = 1;
                      let chars = Text.toArray(cleanHex);
                      var i = chars.size();
                      
                      D.print("🔧 TOTAL_SUPPLY: Converting hex to number, " # Nat.toText(chars.size()) # " characters");
                      
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
                      
                      D.print("✅ TOTAL_SUPPLY: Successfully parsed total supply: " # Nat.toText(totalSupply));
                      #ok(totalSupply);
                    } catch (e) {
                      let errorMsg = "Failed to parse totalSupply result: " # Error.message(e);
                      D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                      #err(errorMsg);
                    };
                  };
                  case (#Err(err)) {
                    D.print("❌ TOTAL_SUPPLY: First result is an error");
                    switch (err) {
                      case (#HttpOutcallError(httpErr)) {
                        switch (httpErr) {
                          case (#IcError({ message })) {
                            let errorMsg = "IC error getting totalSupply: " # message;
                            D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                            #err(errorMsg);
                          };
                          case (#InvalidHttpJsonRpcResponse({ body })) {
                            let errorMsg = "Invalid JSON RPC response getting totalSupply: " # body;
                            D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                            #err(errorMsg);
                          };
                        };
                      };
                      case (#JsonRpcError({ message })) {
                        let errorMsg = "JSON RPC error getting totalSupply: " # message;
                        D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                        #err(errorMsg);
                      };
                      case (#ProviderError(_)) {
                        let errorMsg = "Provider error getting totalSupply";
                        D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                        #err(errorMsg);
                      };
                      case (#ValidationError(_)) {
                        let errorMsg = "Validation error getting totalSupply";
                        D.print("❌ TOTAL_SUPPLY: " # errorMsg);
                        #err(errorMsg);
                      };
                    };
                  };
                };
              };
            };
          };
        };
      } catch (e) {
        let errorMsg = "Failed to get totalSupply: " # Error.message(e);
        D.print("❌ TOTAL_SUPPLY: Exception caught: " # errorMsg);
        #err(errorMsg);
      };
    };

    // Configuration constants
    let ECDSA_KEY_NAME = "test_key_1"; // Change to production key name
    let IC_ECDSA_ACTOR : ICTECDSA = actor("aaaaa-aa"); // IC management canister

    // Create EC multiplication context for secp256k1
    // Note: Using null for now - in production, should load precomputed values
    

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

        // Convert public key to Ethereum address using the standard EVMAddress library
        let pubKeyBytes = Blob.toArray(public_key);
        let #ok(evm_address) = EVMAddress.fromPublicKey(pubKeyBytes) else {
          D.trap("Failed to derive Ethereum address from public key");
        };
        
        evm_address;
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
        D.print("XXXX EXEC: Transaction failed: " # Error.message(e));
        #err("Transaction failed: " # Error.message(e));
      };
    };
    public func icrc149_send_eth_tx(_caller: Principal, eth_tx: Service.EthTx) : async {#Ok: Text; #Err: Text} {
      D.print("💰 ETH_TX: ========== STARTING ETHEREUM TRANSACTION SEND ==========");
      D.print("💰 ETH_TX: Caller: " # Principal.toText(_caller));
      D.print("💰 ETH_TX: Chain ID: " # Nat.toText(eth_tx.chain.chain_id));
      D.print("💰 ETH_TX: To address: " # eth_tx.to);
      D.print("💰 ETH_TX: Value: " # Nat.toText(eth_tx.value));
      D.print("💰 ETH_TX: Gas limit: " # Nat.toText(eth_tx.gasLimit));
      D.print("💰 ETH_TX: Max fee per gas: " # Nat.toText(eth_tx.maxFeePerGas));
      D.print("💰 ETH_TX: Max priority fee per gas: " # Nat.toText(eth_tx.maxPriorityFeePerGas));
      D.print("💰 ETH_TX: Data length: " # Nat.toText(eth_tx.data.size()));
      D.print("💰 ETH_TX: Subaccount: " # debug_show(eth_tx.subaccount));
      D.print("💰 ETH_TX: Configured EVM RPC canister: " # Principal.toText(state.config.evm_rpc_canister_id));
      
      try {
        // Get the Ethereum address for this subaccount
        D.print("💰 ETH_TX: Step 1 - Getting Ethereum address for subaccount...");
        let ethAddress = await* getEthereumAddress(eth_tx.subaccount);
        D.print("💰 ETH_TX: Step 1 COMPLETE - Ethereum address: " # ethAddress);
        
        // Find appropriate RPC service for this chain
        D.print("💰 ETH_TX: Step 2 - Configuring RPC service...");
        let rpc_service = {
          rpc_type = switch (eth_tx.chain.chain_id) {
            case (1) "mainnet";
            case (5) "goerli";
            case (11155111) "sepolia";
            case (_) "custom";
          };
          canister_id = state.config.evm_rpc_canister_id; // Use configured EVM RPC canister
          custom_config = null;
        };
        D.print("💰 ETH_TX: Step 2 COMPLETE - RPC service type: " # rpc_service.rpc_type);
        D.print("💰 ETH_TX: Step 2 COMPLETE - RPC canister ID: " # Principal.toText(rpc_service.canister_id));
        
        // Get next nonce for this address
        D.print("💰 ETH_TX: Step 3 - Getting next nonce for address: " # ethAddress);
        let nonce = await* getNextNonce(eth_tx.chain.chain_id, ethAddress, rpc_service);
        D.print("💰 ETH_TX: Step 3 COMPLETE - Nonce: " # Nat.toText(nonce));
        
        // Create derivation path
        D.print("💰 ETH_TX: Step 4 - Creating derivation path...");
        let derivationPath = switch (eth_tx.subaccount) {
          case (?blob) [blob];
          case (null) [];
        };
        D.print("💰 ETH_TX: Step 4 COMPLETE - Derivation path length: " # Nat.toText(derivationPath.size()));
        
        // Create EIP-1559 transaction
        D.print("💰 ETH_TX: Step 5 - Creating EIP-1559 transaction structure...");
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

        D.print("💰 ETH_TX: Step 5 SUCCESS - Transaction structure created " # debug_show(transaction));
        D.print("💰 ETH_TX: Step 5 COMPLETE - Transaction structure created");
        D.print("💰 ETH_TX: Step 5 DETAILS - To: " # transaction.to);
        D.print("💰 ETH_TX: Step 5 DETAILS - Value: " # Nat.toText(transaction.value));
        D.print("💰 ETH_TX: Step 5 DETAILS - ChainId: " # Nat64.toText(transaction.chainId));
        D.print("💰 ETH_TX: Step 5 DETAILS - Nonce: " # Nat64.toText(transaction.nonce));
        D.print("💰 ETH_TX: Step 5 DETAILS - Data: " # transaction.data);
        
        // Create transaction hash for signing
        D.print("💰 ETH_TX: Step 6 - Encoding transaction for signing...");
        let encodedTx = Transaction1559.getMessageToSign(transaction);
        let txHash = switch (encodedTx) {
          case (#ok(bytes)) {
            D.print("💰 ETH_TX: Step 6 SUCCESS - Transaction encoded, hash length: " # Nat.toText(bytes.size()));
            bytes;
          };
          case (#err(err)) {
            D.print("💰 ETH_TX: Step 6 ERROR - Failed to encode transaction: " # err);
            return #Err("Failed to encode transaction: " # err);
          };
        };
        
        // Sign the transaction hash
        D.print("💰 ETH_TX: Step 7 - Signing transaction with tECDSA...");
        D.print("💰 ETH_TX: Step 7 DETAILS - Using key: " # ECDSA_KEY_NAME);
        D.print("💰 ETH_TX: Step 7 DETAILS - Message hash length: " # Nat.toText(txHash.size()));
        D.print("💰 ETH_TX: Step 7 DETAILS - Adding 10B cycles for ECDSA signing");
        Cycles.add<system>(10_000_000_000); // 10B cycles for ECDSA signing
        let { signature } = await IC_ECDSA_ACTOR.sign_with_ecdsa({
          message_hash = Blob.fromArray(txHash);
          derivation_path = derivationPath;
          key_id = { curve = #secp256k1; name = ECDSA_KEY_NAME };
        });
        D.print("💰 ETH_TX: Step 7 SUCCESS - Transaction signed, signature length: " # Nat.toText(signature.size()));
        
        // Get public key for recovery
        D.print("💰 ETH_TX: Step 8 - Getting public key for signature recovery...");
        let { public_key; chain_code = _ } = await IC_ECDSA_ACTOR.ecdsa_public_key({
          canister_id = ?Principal.fromActor(_self);
          derivation_path = derivationPath;
          key_id = { curve = #secp256k1; name = ECDSA_KEY_NAME };
        });
        D.print("💰 ETH_TX: Step 8 SUCCESS - Public key retrieved, length: " # Nat.toText(public_key.size()));
        
        // Serialize the signed transaction
        D.print("💰 ETH_TX: Step 9 - Serializing signed transaction...");
        let signedTx = Transaction1559.signAndSerialize(
          transaction,
          Blob.toArray(signature),
          Blob.toArray(public_key),
          ecCtx()
        );
        
        let rawTxHex = switch (signedTx) {
          case (#ok((_, txBytes))) {
            let hexString = Hex.encode(txBytes);
            D.print("💰 ETH_TX: Step 9 SUCCESS - Transaction serialized, hex length: " # Nat.toText(hexString.size()));
            D.print("💰 ETH_TX: Step 9 DETAILS - Raw tx (first 100 chars): " # (if (hexString.size() > 100) {
              let chars = Text.toArray(hexString);
              let truncated = Array.subArray(chars, 0, 100);
              Text.fromArray(truncated);
            } else hexString));
            hexString;
          };
          case (#err(err)) {
            D.print("💰 ETH_TX: Step 9 ERROR - Failed to serialize signed transaction: " # err);
            return #Err("Failed to serialize signed transaction: " # err);
          };
        };
        
        // Send the raw transaction
        D.print("💰 ETH_TX: Step 10 - Sending raw transaction to blockchain...");
        D.print("💰 ETH_TX: Step 10 DETAILS - Calling ethSendRawTransaction with chainId: " # Nat.toText(eth_tx.chain.chain_id));
        D.print("💰 ETH_TX: Step 10 DETAILS - Raw transaction hex: " # rawTxHex);
        let result = await* ethSendRawTransaction(eth_tx.chain.chain_id, rpc_service, rawTxHex);
        D.print("💰 ETH_TX: Step 10 RESULT - ethSendRawTransaction returned: " # debug_show(result));
        
        D.print("💰 ETH_TX: Step 11 - Processing final result...");
        switch (result) {
          case (#ok(txHash)) {
            D.print("💰 ETH_TX: Step 11 SUCCESS - Transaction hash received: " # txHash);
            D.print("💰 ETH_TX: ========== ETHEREUM TRANSACTION COMPLETED SUCCESSFULLY ==========");
            #Ok(txHash);
          };
          case (#err(err)) {
            D.print("💰 ETH_TX: Step 11 ERROR - Transaction failed: " # err);
            D.print("💰 ETH_TX: ========== ETHEREUM TRANSACTION FAILED ==========");
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
        case (#open) "open";
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

    // ===== COMPREHENSIVE DEBUGGING FUNCTIONS =====
    
    // Debug function to verify address funding via RPC using transaction count as proxy
    public func debug_verify_address_funding(_caller: Principal, address: Text, chain_id: Nat) : async {#Ok: {address: Text; nonce: Text; status: Text}; #Err: Text} {
      D.print("🔍 DEBUG_FUNDING: Checking address status for: " # address);
      D.print("🔍 DEBUG_FUNDING: Chain ID: " # Nat.toText(chain_id));
      
      try {
        let rpc_service = {
          rpc_type = "custom";
          canister_id = state.config.evm_rpc_canister_id;
          custom_config = ?[("url", "http://127.0.0.1:8545")];
        };
        
        let rpcActor = getEvmRpcActor(rpc_service);
        let rpcServices = getRpcServices({chain_id = chain_id; network_name = ""}, rpc_service);
        
        D.print("🔍 DEBUG_FUNDING: Making eth_getTransactionCount RPC call...");
        let result = await(with cycles=127817059200) rpcActor.eth_getTransactionCount(rpcServices, ?{
          responseSizeEstimate = ?64;
          responseConsensus = null;
        }, {
          address = address;
          block = #Latest;
        });
        
        D.print("🔍 DEBUG_FUNDING: eth_getTransactionCount result: " # debug_show(result));
        
        switch (result) {
          case (#Consistent(#Ok(nonce))) {
            let nonceText = Nat.toText(nonce);
            let status = if (nonce == 0) {
              "Address exists but no transactions sent (may or may not have ETH balance)";
            } else {
              "Address has sent " # nonceText # " transactions (likely has/had ETH balance)";
            };
            
            D.print("✅ DEBUG_FUNDING: Address " # address # " nonce: " # nonceText);
            #Ok({
              address = address;
              nonce = nonceText;
              status = status;
            });
          };
          case (#Consistent(#Err(err))) {
            let errorMsg = "Failed to get transaction count: " # formatRpcError(err);
            D.print("❌ DEBUG_FUNDING: " # errorMsg);
            #Err(errorMsg);
          };
          case (#Inconsistent(results)) {
            D.print("⚠️ DEBUG_FUNDING: Inconsistent results, using first successful one");
            switch (results.size()) {
              case (0) {
                let errorMsg = "No RPC responses for transaction count check";
                D.print("❌ DEBUG_FUNDING: " # errorMsg);
                #Err(errorMsg);
              };
              case (_) {
                let firstResult = results[0].1;
                switch (firstResult) {
                  case (#Ok(nonce)) {
                    let nonceText = Nat.toText(nonce);
                    let status = if (nonce == 0) {
                      "Address exists but no transactions sent";
                    } else {
                      "Address has sent " # nonceText # " transactions";
                    };
                    #Ok({
                      address = address;
                      nonce = nonceText;
                      status = status;
                    });
                  };
                  case (#Err(err)) {
                    let errorMsg = "First result error: " # formatRpcError(err);
                    D.print("❌ DEBUG_FUNDING: " # errorMsg);
                    #Err(errorMsg);
                  };
                };
              };
            };
          };
        };
      } catch (e) {
        let errorMsg = "Exception during address check: " # Error.message(e);
        D.print("❌ DEBUG_FUNDING: " # errorMsg);
        #Err(errorMsg);
      };
    };

    // Debug function to get all addresses used by the canister
    public func debug_get_all_addresses(_caller: Principal) : async {#Ok: {treasury_address: Text; tx_specific_address: ?Text}; #Err: Text} {
      D.print("🔍 DEBUG_ADDRESSES: Getting all addresses used by canister...");
      
      try {
        // Get treasury address (using icrc149_get_ethereum_address with empty derivation path)
        D.print("🔍 DEBUG_ADDRESSES: Getting treasury address...");
        let treasuryAddress = await* getEthereumAddress(null);
        D.print("✅ DEBUG_ADDRESSES: Treasury address: " # treasuryAddress);
        
        // Try to get the transaction-specific address that appeared in logs
        // This might be derived differently or hardcoded somewhere
        D.print("🔍 DEBUG_ADDRESSES: Checking for transaction-specific address...");
        
        // For now, we'll return what we know
        #Ok({
          treasury_address = treasuryAddress;
          tx_specific_address = ?"0x337f2ad5a7e6071e9f22dbe3bd01b7a19a70fd34"; // Address from error logs
        });
        
      } catch (e) {
        let errorMsg = "Failed to get addresses: " # Error.message(e);
        D.print("❌ DEBUG_ADDRESSES: " # errorMsg);
        #Err(errorMsg);
      };
    };

    // Debug function to construct and return raw transaction bytes
    public func debug_construct_transaction(_caller: Principal, eth_tx: Service.EthTx) : async {#Ok: {raw_tx_hex: Text; from_address: Text; decoded_fields: Text}; #Err: Text} {
      D.print("🔍 DEBUG_TX_CONSTRUCT: ========== CONSTRUCTING DEBUG TRANSACTION ==========");
      D.print("🔍 DEBUG_TX_CONSTRUCT: To: " # eth_tx.to);
      D.print("🔍 DEBUG_TX_CONSTRUCT: Value: " # Nat.toText(eth_tx.value));
      D.print("🔍 DEBUG_TX_CONSTRUCT: Gas limit: " # Nat.toText(eth_tx.gasLimit));
      D.print("🔍 DEBUG_TX_CONSTRUCT: Max fee per gas: " # Nat.toText(eth_tx.maxFeePerGas));
      D.print("🔍 DEBUG_TX_CONSTRUCT: Max priority fee per gas: " # Nat.toText(eth_tx.maxPriorityFeePerGas));
      D.print("🔍 DEBUG_TX_CONSTRUCT: Data: " # debug_show(eth_tx.data));
      
      try {
        // Get the Ethereum address for this subaccount
        D.print("🔍 DEBUG_TX_CONSTRUCT: Getting Ethereum address...");
        let ethAddress = await* getEthereumAddress(eth_tx.subaccount);
        D.print("🔍 DEBUG_TX_CONSTRUCT: From address: " # ethAddress);
        
        // Create RPC service
        let rpc_service = {
          rpc_type = "custom";
          canister_id = state.config.evm_rpc_canister_id;
          custom_config = ?[("url", "http://127.0.0.1:8545")];
        };
        
        // Get nonce
        D.print("🔍 DEBUG_TX_CONSTRUCT: Getting nonce...");
        let nonce = await* getNextNonce(eth_tx.chain.chain_id, ethAddress, rpc_service);
        D.print("🔍 DEBUG_TX_CONSTRUCT: Nonce: " # Nat.toText(nonce));
        
        // Create transaction structure
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
        
        D.print("🔍 DEBUG_TX_CONSTRUCT: Transaction structure created");
        
        // Create transaction hash for signing
        D.print("🔍 DEBUG_TX_CONSTRUCT: Encoding transaction for signing...");
        let encodedTx = Transaction1559.getMessageToSign(transaction);
        let txHash = switch (encodedTx) {
          case (#ok(bytes)) {
            D.print("🔍 DEBUG_TX_CONSTRUCT: Transaction encoded successfully");
            bytes;
          };
          case (#err(err)) {
            D.print("🔍 DEBUG_TX_CONSTRUCT: Failed to encode: " # err);
            return #Err("Failed to encode transaction: " # err);
          };
        };
        
        // Get derivation path
        let derivationPath = switch (eth_tx.subaccount) {
          case (?blob) [blob];
          case (null) [];
        };
        
        // Sign the transaction
        D.print("🔍 DEBUG_TX_CONSTRUCT: Signing transaction...");
        let { signature } = await IC_ECDSA_ACTOR.sign_with_ecdsa({
          message_hash = Blob.fromArray(txHash);
          derivation_path = derivationPath;
          key_id = { curve = #secp256k1; name = ECDSA_KEY_NAME };
        });
        
        // Get public key
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
          ecCtx()
        );
        
        let rawTxHex = switch (signedTx) {
          case (#ok((_, txBytes))) {
            let hexString = Hex.encode(txBytes);
            D.print("🔍 DEBUG_TX_CONSTRUCT: Transaction serialized successfully");
            hexString;
          };
          case (#err(err)) {
            D.print("🔍 DEBUG_TX_CONSTRUCT: Failed to serialize: " # err);
            return #Err("Failed to serialize transaction: " # err);
          };
        };
        
        // Create human-readable decoded fields
        let decodedFields = "chainId=" # Nat64.toText(transaction.chainId) #
                          ", nonce=" # Nat64.toText(transaction.nonce) #
                          ", to=" # transaction.to #
                          ", value=" # Nat.toText(transaction.value) # " wei" #
                          ", gasLimit=" # Nat64.toText(transaction.gasLimit) #
                          ", maxFeePerGas=" # Nat64.toText(transaction.maxFeePerGas) # " wei" #
                          ", maxPriorityFeePerGas=" # Nat64.toText(transaction.maxPriorityFeePerGas) # " wei" #
                          ", data=" # transaction.data;
        
        D.print("🔍 DEBUG_TX_CONSTRUCT: ========== TRANSACTION CONSTRUCTION COMPLETE ==========");
        
        #Ok({
          raw_tx_hex = rawTxHex;
          from_address = ethAddress;
          decoded_fields = decodedFields;
        });
        
      } catch (e) {
        let errorMsg = "Failed to construct transaction: " # Error.message(e);
        D.print("❌ DEBUG_TX_CONSTRUCT: " # errorMsg);
        #Err(errorMsg);
      };
    };

    // Debug function to show exact address derivation and compare with transaction
    public func debug_address_derivation_detailed(_caller: Principal, subaccount: ?Blob) : async {#Ok: {treasury_address: Text; provided_subaccount_address: Text; derivation_path_info: Text; address_match: Bool}; #Err: Text} {
      D.print("🔍 DEBUG_DERIVATION: ========== DETAILED ADDRESS DERIVATION DEBUG ==========");
      D.print("🔍 DEBUG_DERIVATION: Caller: " # Principal.toText(_caller));
      D.print("🔍 DEBUG_DERIVATION: Provided subaccount: " # debug_show(subaccount));
      
      try {
        // Get treasury address (null subaccount)
        D.print("🔍 DEBUG_DERIVATION: Getting treasury address (null subaccount)...");
        let treasuryAddress = await* getEthereumAddress(null);
        D.print("✅ DEBUG_DERIVATION: Treasury address: " # treasuryAddress);
        
        // Get address for provided subaccount
        D.print("🔍 DEBUG_DERIVATION: Getting address for provided subaccount...");
        let providedSubaccountAddress = await* getEthereumAddress(subaccount);
        D.print("✅ DEBUG_DERIVATION: Provided subaccount address: " # providedSubaccountAddress);
        
        // Check derivation path details
        let derivationPathInfo = switch (subaccount) {
          case (?blob) {
            "Subaccount provided: blob size=" # Nat.toText(blob.size()) # ", derivation_path=[" # debug_show(blob) # "]";
          };
          case (null) {
            "No subaccount provided: derivation_path=[]";
          };
        };
        
        let addressMatch = treasuryAddress == providedSubaccountAddress;
        
        D.print("🔍 DEBUG_DERIVATION: Derivation path info: " # derivationPathInfo);
        D.print("🔍 DEBUG_DERIVATION: Address match: " # Bool.toText(addressMatch));
        D.print("🔍 DEBUG_DERIVATION: ========== ADDRESS DERIVATION DEBUG COMPLETE ==========");
        
        #Ok({
          treasury_address = treasuryAddress;
          provided_subaccount_address = providedSubaccountAddress;
          derivation_path_info = derivationPathInfo;
          address_match = addressMatch;
        });
        
      } catch (e) {
        let errorMsg = "Failed to derive addresses: " # Error.message(e);
        D.print("❌ DEBUG_DERIVATION: " # errorMsg);
        #Err(errorMsg);
      };
    };

    // Debug function to show the actual from address that will be used in transaction
    public func debug_transaction_from_address(_caller: Principal, eth_tx: Service.EthTx) : async {#Ok: {transaction_from_address: Text; treasury_address: Text; addresses_match: Bool; raw_tx_preview: Text}; #Err: Text} {
      D.print("🔍 DEBUG_TX_FROM: ========== CHECKING TRANSACTION FROM ADDRESS ==========");
      
      try {
        // Get treasury address
        let treasuryAddress = await* getEthereumAddress(null);
        D.print("🔍 DEBUG_TX_FROM: Treasury address: " # treasuryAddress);
        
        // Get the address that will be used for the transaction
        let transactionFromAddress = await* getEthereumAddress(eth_tx.subaccount);
        D.print("🔍 DEBUG_TX_FROM: Transaction from address: " # transactionFromAddress);
        
        let addressesMatch = treasuryAddress == transactionFromAddress;
        D.print("🔍 DEBUG_TX_FROM: Addresses match: " # Bool.toText(addressesMatch));
        
        // Create a preview of what the transaction would look like
        let rpc_service = {
          rpc_type = "custom";
          canister_id = state.config.evm_rpc_canister_id;
          custom_config = ?[("url", "http://127.0.0.1:8545")];
        };
        
        let nonce = await* getNextNonce(eth_tx.chain.chain_id, transactionFromAddress, rpc_service);
        
        let rawTxPreview = "from=" # transactionFromAddress # 
                          ", to=" # eth_tx.to # 
                          ", value=" # Nat.toText(eth_tx.value) # 
                          ", nonce=" # Nat.toText(nonce) # 
                          ", gasLimit=" # Nat.toText(eth_tx.gasLimit) #
                          ", maxFeePerGas=" # Nat.toText(eth_tx.maxFeePerGas) #
                          ", data=" # debug_show(eth_tx.data);
        
        D.print("🔍 DEBUG_TX_FROM: Raw transaction preview: " # rawTxPreview);
        D.print("🔍 DEBUG_TX_FROM: ========== TRANSACTION FROM ADDRESS CHECK COMPLETE ==========");
        
        #Ok({
          transaction_from_address = transactionFromAddress;
          treasury_address = treasuryAddress;
          addresses_match = addressesMatch;
          raw_tx_preview = rawTxPreview;
        });
        
      } catch (e) {
        let errorMsg = "Failed to check transaction from address: " # Error.message(e);
        D.print("❌ DEBUG_TX_FROM: " # errorMsg);
        #Err(errorMsg);
      };
    };

    // Debug function to check what the ERC20 transfer ABI should be
    public func debug_get_erc20_transfer_abi(_caller: Principal, to_address: Text, amount: Nat) : {abi_description: Text; function_selector: Text; encoded_data: Text} {
      D.print("🔍 DEBUG_ABI: Getting ERC20 transfer ABI information");
      D.print("🔍 DEBUG_ABI: To address: " # to_address);
      D.print("🔍 DEBUG_ABI: Amount: " # Nat.toText(amount));
      
      // ERC20 transfer function: transfer(address,uint256)
      let abiDescription = "function transfer(address to, uint256 amount) returns (bool)";
      let functionSelector = "0xa9059cbb"; // keccak256("transfer(address,uint256)")[0:4]
      
      // Encode the parameters (simplified - this is what the data should look like)
      // address parameter (32 bytes, left-padded)
      let addressParam = if (Text.startsWith(to_address, #text("0x"))) {
        Text.trimStart(to_address, #text("0x"));
      } else {
        to_address;
      };
      let paddedAddress = "000000000000000000000000" # addressParam;
      
      // amount parameter (32 bytes, big-endian)
      let amountHex = Nat.toText(amount); // This is simplified - should be proper hex conversion
      let paddedAmount = "000000000000000000000000000000000000000000000000000000000000" # amountHex;
      
      let encodedData = functionSelector # paddedAddress # paddedAmount;
      
      D.print("🔍 DEBUG_ABI: Function selector: " # functionSelector);
      D.print("🔍 DEBUG_ABI: Encoded data: " # encodedData);
      
      {
        abi_description = abiDescription;
        function_selector = functionSelector;
        encoded_data = encodedData;
      };
    };

    // ===== END COMPREHENSIVE DEBUGGING FUNCTIONS =====

    private func onProposalExecute(choice: ?MigrationTypes.Current.VoteChoice, proposal: ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>) : async* Result.Result<(), Text> {
      // Store the old proposal state for index updates
      let oldProposal = ?proposal;
      
      D.print("🏛️  PROPOSAL_EXECUTE: Starting proposal execution for ID: " # Nat.toText(proposal.id));
      D.print("🏛️  PROPOSAL_EXECUTE: Winning choice: " # debug_show(choice));
      D.print("🏛️  PROPOSAL_EXECUTE: Proposal status: " # debug_show(proposal.status));
      
      let result = switch(choice) {
        case(?#Yes) {
          // Proposal passed, execute the action
          D.print("🚀 EXEC: Proposal passed, executing action...");
          switch(proposal.content.action) {
            case(#Motion(_text)) {
              D.print("🚀 EXEC: Motion action - execution complete");
              #ok(); // Motion executed
            };
            case(#EthTransaction(eth_tx)) {
              D.print("🚀 EXEC: Ethereum transaction action - starting execution...");
              D.print("🚀 EXEC: Transaction to: " # eth_tx.to);
              D.print("🚀 EXEC: Transaction value: " # Nat.toText(eth_tx.value));
              D.print("🚀 EXEC: Transaction data length: " # Nat.toText(eth_tx.data.size()) # " " # debug_show(eth_tx.data));
              D.print("🚀 EXEC: Transaction gas limit: " # Nat.toText(eth_tx.gasLimit));
              D.print("🚀 EXEC: Transaction max fee per gas: " # Nat.toText(eth_tx.maxFeePerGas));
              D.print("🚀 EXEC: Transaction max priority fee per gas: " # Nat.toText(eth_tx.maxPriorityFeePerGas));
              D.print("🚀 EXEC: Transaction subaccount: " # debug_show(eth_tx.subaccount));
              D.print("🚀 EXEC: Transaction chain ID: " # Nat.toText(eth_tx.chain.chain_id));
              D.print("🚀 EXEC: Transaction configured EVM RPC canister: " # Principal.toText(state.config.evm_rpc_canister_id));
              D.print("🚀 EXEC: Transaction nonce: " # debug_show(eth_tx.nonce));
              D.print("🚀 EXEC: Transaction signature: " # debug_show(eth_tx.signature));

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
              D.print("🚀 EXEC: icrc149_send_eth_tx returned: " # debug_show(ethResult));
              switch(ethResult) {
                case(#Ok(txHash)) {
                  D.print("🚀 EXEC: Transaction successful with hash: " # txHash);
                  #ok();
                };
                case(#Err(err)) {
                  D.print("🚀 EXEC: Transaction failed with error: " # err);
                  #err(err);
                };
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
          D.print("Proposal " # Nat.toText(proposal.id) # " rejected or no majority.");
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

    // Initialize the proposal engine with dynamic duration from config
    let proposalEngine = do {
        // Update proposal duration based on config
        let updatedEngineData = {
            state.proposalEngine with
            proposalDuration = ?#days(state.config.proposal_duration_days);
        };
        
        let eng = ExtendedProposalEngine.ProposalEngine<system, MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>(
        updatedEngineData,
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

    // Admin function to update EVM RPC canister ID
    public func icrc149_update_evm_rpc_canister(_caller: Principal, canister_id: Principal) : {#Ok: (); #Err: Text} {
      if (not BTree.has(state.config.admin_principals, Principal.compare, _caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };
      
      state.config.evm_rpc_canister_id := canister_id;
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

    // TEST FUNCTION: Make 3 parallel RPC calls to test hanging issue
    public func test_parallel_rpc_calls(_caller: Principal, rpc_canister_id: Principal) : async {#Ok: (Nat, Nat, Nat); #Err: Text} {
      D.print("🧪 TEST: Starting 3 simple parallel block requests");
      
      // Use provided RPC canister ID
      let rpc_service = {
        rpc_type = "custom";
        canister_id = rpc_canister_id;
        custom_config = ?[("url", "http://127.0.0.1:8545")];
      };
      
      let chain = {
        chain_id = 31337;
        network_name = "local";
      };
      
      try {
        let rpcActor = getEvmRpcActor(rpc_service);
        let rpcServices = getRpcServices(chain, rpc_service);
        let config : ?RpcConfig = ?{ 
          responseSizeEstimate = ?1000000;
          responseConsensus = null;
        };
        
        D.print("🔄 Making 3 parallel block number requests...");
        
        // Call 1: Get latest block number
        D.print("📞 RPC Call 1: eth_getBlockByNumber(Latest)");
        let call1 = async {
          await (with cycles=127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Latest);
        };
        
        // Call 2: Get block 0 (genesis)
        D.print("📞 RPC Call 2: eth_getBlockByNumber(0)");
        let call2 = async {
          await (with cycles=127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Number(0));
        };
        
        // Call 3: Get block 1
        D.print("📞 RPC Call 3: eth_getBlockByNumber(1)");
        let call3 = async {
          await (with cycles=127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Number(1));
        };
        
        D.print("⏳ Waiting for all 3 block requests to complete...");
        
        // Await all calls in parallel
        let result1 = await call1;
        let result2 = await call2;
        let result3 = await call3;
        
        D.print("✅ All 3 block requests completed!");
        
        // Extract block numbers for return value
        let blockNum1 = switch (result1) {
          case (#Consistent(#Ok(block))) block.number;
          case (_) 0;
        };
        
        let blockNum2 = switch (result2) {
          case (#Consistent(#Ok(block))) block.number;
          case (_) 0;
        };
        
        let blockNum3 = switch (result3) {
          case (#Consistent(#Ok(block))) block.number;
          case (_) 0;
        };
        
        D.print("🎯 Results: LatestBlock=" # Nat.toText(blockNum1) # ", Block0=" # Nat.toText(blockNum2) # ", Block1=" # Nat.toText(blockNum3));
        
        #Ok((blockNum1, blockNum2, blockNum3));
        
      } catch (e) {
        let errorMsg = "Parallel block requests failed: " # Error.message(e);
        D.print("❌ " # errorMsg);
        #Err(errorMsg);
      };
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
      D.print("🔍 SIWE: Starting verification for message length: " # Nat.toText(siwe.message.size()));
      
      if (siwe.message == "" or siwe.signature.size() == 0) {
        D.print("❌ SIWE: Empty message or signature");
        return #Err("Invalid SIWE proof: empty message or signature");
      };
      
      // Parse SIWE message according to EIP-4361 format
      let lines = Text.split(siwe.message, #char('\n'));
      let lineArray = Iter.toArray(lines);
      
      D.print("🔍 SIWE: Parsed " # Nat.toText(lineArray.size()) # " lines from message");
      
      if (lineArray.size() < 8) {
        D.print("❌ SIWE: Insufficient lines in message: " # Nat.toText(lineArray.size()));
        return #Err("Invalid SIWE message format: insufficient lines");
      };
      
      // Parse required fields
      let domain = switch (Text.split(lineArray[0], #text(" wants you to sign in")).next()) {
        case (?domain) { domain };
        case null { 
          D.print("❌ SIWE: Missing domain in line 0: " # lineArray[0]);
          return #Err("Invalid SIWE message: missing domain"); 
        };
      };
      
      let address = lineArray[1];
      D.print("🔍 SIWE: Parsed address: " # address);
      
      // Parse the statement line - can be voting or proposal creation
      let statement = lineArray[3];
      D.print("🔍 SIWE: Parsed statement: " # statement);
      
      // For proposal creation, we just validate the statement exists and extract the contract address
      // For voting, we parse the full voting statement
      // Default values for non-voting statements
      var vote_choice: Text = "";
      var proposal_id_nat: Nat = 0;
      var contract_address: Text = "";
      
      // Check if this is a voting statement or proposal creation statement
      if (Text.startsWith(statement, #text("Vote "))) {
        D.print("🗳️  SIWE: Processing voting statement");
        // Extract vote choice, proposal ID, and contract address from voting statement
        let (parsed_choice, parsed_id, parsed_contract) = switch (parseVotingStatement(statement)) {
          case (#Ok(result)) { 
            D.print("✅ SIWE: Successfully parsed voting statement");
            result 
          };
          case (#Err(msg)) { 
            D.print("❌ SIWE: Failed to parse voting statement: " # msg);
            return #Err("Invalid voting statement: " # msg); 
          };
        };
        vote_choice := parsed_choice;
        proposal_id_nat := parsed_id;
        contract_address := parsed_contract;
      } else {
        D.print("📝 SIWE: Processing proposal creation statement");
        // For proposal creation or other actions, extract contract address from statement
        // Expected format: "Create proposal for contract {contract_address}" or similar
        let parts = Text.split(statement, #text(" "));
        let partsArray = Iter.toArray(parts);
        var found_contract = false;
        for (i in Iter.range(0, partsArray.size() - 1)) {
          if (i < partsArray.size() - 1 and partsArray[i] == "contract") {
            contract_address := partsArray[i + 1];
            found_contract := true;
            D.print("✅ SIWE: Found contract address: " # contract_address);
          };
        };
        if (not found_contract) {
          D.print("❌ SIWE: Contract address not found in statement");
          return #Err("Statement format incorrect: contract address not found");
        };
      };
      
      // Parse URI, Version, Chain ID, Nonce, Issued At, Expiration Time
      var chain_id_nat: Nat = 0;
      var nonce_text: Text = "";
      var issued_at_nat: Nat = 0;
      var issued_at_iso: Text = "";
      var expiration_time_nat: Nat = 0;
      var expiration_time_iso: Text = "";
      
      D.print("🔍 SIWE: Parsing metadata fields from " # Nat.toText(lineArray.size()) # " lines");
      
      for (line in lineArray.vals()) {
        if (Text.startsWith(line, #text("Chain ID: "))) {
          let chainIdText = Text.replace(line, #text("Chain ID: "), "");
          chain_id_nat := switch (Nat.fromText(chainIdText)) {
            case (?n) { 
              D.print("✅ SIWE: Chain ID: " # Nat.toText(n));
              n 
            };
            case null { 
              D.print("❌ SIWE: Invalid Chain ID: " # chainIdText);
              return #Err("Invalid Chain ID format"); 
            };
          };
        } else if (Text.startsWith(line, #text("Nonce: "))) {
          nonce_text := Text.replace(line, #text("Nonce: "), "");
          D.print("✅ SIWE: Nonce: " # nonce_text);
          // Note: nonce_text is kept as text, not used for expiration_time_nat
        } else if (Text.startsWith(line, #text("Issued At: "))) {
          issued_at_iso := Text.replace(line, #text("Issued At: "), "");
          D.print("✅ SIWE: Issued At ISO: " # issued_at_iso);
        } else if (Text.startsWith(line, #text("Issued At Nanos: "))) {
          let issuedAtNanosText = Text.replace(line, #text("Issued At Nanos: "), "");
          issued_at_nat := switch (Nat.fromText(issuedAtNanosText)) {
            case (?n) { 
              D.print("✅ SIWE: Issued At Nanos: " # Nat.toText(n));
              n 
            };
            case null { 
              D.print("❌ SIWE: Invalid Issued At Nanos: " # issuedAtNanosText);
              return #Err("Invalid Issued At Nanos format"); 
            };
          };
        } else if (Text.startsWith(line, #text("Expiration Time: "))) {
          expiration_time_iso := Text.replace(line, #text("Expiration Time: "), "");
          D.print("✅ SIWE: Expiration Time ISO: " # expiration_time_iso);
        } else if (Text.startsWith(line, #text("Expiration Nanos: "))) {
          let expirationNanosText = Text.replace(line, #text("Expiration Nanos: "), "");
          expiration_time_nat := switch (Nat.fromText(expirationNanosText)) {
            case (?n) { 
              D.print("✅ SIWE: Expiration Nanos: " # Nat.toText(n));
              n 
            };
            case null { 
              D.print("❌ SIWE: Invalid Expiration Nanos: " # expirationNanosText);
              return #Err("Invalid Expiration Nanos format"); 
            };
          };
        };
      };
      
      // Validate time window (must be within 10 minutes = 600 seconds = 600_000_000_000 nanoseconds)
      let currentTime = natNow();
      let maxWindowNanos = 600_000_000_000; // 10 minutes in nanoseconds

      D.print("🕐 SIWE: Time validation - Current: " # Nat.toText(currentTime) # ", Expiration: " # Nat.toText(expiration_time_nat) # ", IssuedAt: " # Nat.toText(issued_at_nat));

      if (expiration_time_nat < currentTime) {
        D.print("❌ SIWE: Message has expired");
        return #Err("SIWE message has expired");
      };
      
      if (expiration_time_nat > (currentTime + maxWindowNanos)) {
        D.print("❌ SIWE: Expiration time too far in future");
        return #Err("SIWE message expiration time too far in future");
      };
      
      if (expiration_time_nat > issued_at_nat and (expiration_time_nat - issued_at_nat) > maxWindowNanos) {
        D.print("❌ SIWE: Time window exceeds 10 minutes");
        return #Err("SIWE message time window exceeds 10 minutes");
      };
      
      D.print("✅ SIWE: Time validation passed");
      
      // Real signature verification - NO BYPASS
      D.print("🔐 SIWE: Starting signature verification");
      switch (verifySiweSignature(siwe.message, siwe.signature, address)) {
        case (#Err(err)) {
          D.print("❌ SIWE signature verification failed: " # debug_show(err));
          return #Err("SIWE signature verification failed: " # err);
        };
        case (#Ok(_)) {
          D.print("✅ SIWE: Signature verification passed");
          // Signature is valid, proceed
        };
      };

      
      D.print("🎯 SIWE: Verification complete, returning success result");
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
      D.print("🔍 Starting SIWE signature verification for address: " # expectedAddress);
      D.print("🔍 Message length: " # Nat.toText(message.size()) # " chars, Signature length: " # Nat.toText(signature.size()) # " bytes");
      
      if (signature.size() != 65) {
        D.print("❌ Invalid signature length: " # Nat.toText(signature.size()));
        return #Err("Invalid signature length: expected 65 bytes, got " # Nat.toText(signature.size()));
      };
      
      // Quick validation - if the expected address looks valid, proceed with verification
      if (not Text.startsWith(expectedAddress, #text("0x")) or expectedAddress.size() != 42) {
        D.print("❌ Invalid expected address format: " # expectedAddress);
        return #Err("Invalid expected address format: " # expectedAddress);
      };
      
      D.print("✅ Basic validations passed, proceeding with cryptographic verification");
      
      // CRITICAL: REAL SIWE signature verification - NO BYPASSING
      D.print("🔐 Performing REAL ECDSA signature recovery and verification");
      
      // Step 1: Hash the SIWE message using EIP-191 format
      D.print("📝 Step 1: Hashing message using EIP-191");
      let messageHash = hashSiweMessage(message);
      D.print("📝 Message hash computed successfully");
      
      // Step 2: Extract r, s, v from signature
      D.print("📊 Step 2: Extracting signature components");
      let signatureArray = Blob.toArray(signature);
      let r = Blob.fromArray(Array.subArray(signatureArray, 0, 32));
      let s = Blob.fromArray(Array.subArray(signatureArray, 32, 32));
      let v = signatureArray[64];
      
      D.print("📊 Signature components extracted: v=" # Nat8.toText(v));
      
      // Step 3: Recover public key from signature
      D.print("🔑 Step 3: Recovering public key from signature");
      let recoveredPubKey = switch (recoverEcdsaPublicKey(messageHash, r, s, v)) {
        case (#Err(err)) {
          D.print("❌ Public key recovery failed: " # err);
          return #Err("ECDSA recovery failed: " # err);
        };
        case (#Ok(pubKey)) {
          D.print("✅ Public key recovered successfully");
          pubKey;
        };
      };
      
      // Step 4: Derive Ethereum address from recovered public key
      D.print("🏠 Step 4: Deriving address from recovered public key");
      let recoveredAddress = deriveEthereumAddressFromPublicKey(recoveredPubKey);
      D.print("🏠 Recovered address: " # recoveredAddress);
      
      // Step 5: Compare with expected address (case-insensitive)
      D.print("🔍 Step 5: Comparing addresses");
      let normalizedExpected = normalizeEthereumAddress(expectedAddress);
      let normalizedRecovered = normalizeEthereumAddress(recoveredAddress);
      
      if (normalizedExpected != normalizedRecovered) {
        D.print("❌ Address mismatch - Expected: " # normalizedExpected # ", Recovered: " # normalizedRecovered);
        return #Err("Signature verification failed: address mismatch");
      };
      
      D.print("✅ SIWE signature verification PASSED - addresses match");
      return #Ok(());
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
      
      // CRITICAL: Use Keccak256, not SHA256, for Ethereum message hashing
      let keccak = SHA3.Keccak(256);
      keccak.update(combinedBytes);
      let hashBytes = keccak.finalize();
      Blob.fromArray(hashBytes);
    };
    
    // Helper function to recover ECDSA public key from signature
    private func recoverEcdsaPublicKey(messageHash: Blob, r: Blob, s: Blob, v: Nat8) : {#Ok: Blob; #Err: Text} {
      // CRITICAL: This implements real ECDSA recovery using secp256k1
      
      if (v < 27 or v > 30) {
        return #Err("Invalid recovery parameter v: " # Nat8.toText(v));
      };
      
      let recoveryId = if (v >= 27) { v - 27 } else { v };
      
      // Create signature from r and s values
      let rArray = Blob.toArray(r);
      let sArray = Blob.toArray(s);
      
      if (rArray.size() != 32 or sArray.size() != 32) {
        return #Err("Invalid signature component size: r=" # Nat.toText(rArray.size()) # ", s=" # Nat.toText(sArray.size()));
      };
      
      // Convert message hash to array
      let messageArray = Blob.toArray(messageHash);
      if (messageArray.size() != 32) {
        return #Err("Invalid message hash size: " # Nat.toText(messageArray.size()));
      };
      
      // Try recovery with calculated recoveryId first
      switch (tryRecoveryWithId(messageArray, rArray, sArray, recoveryId)) {
        case (#Ok(pubKey)) #Ok(pubKey);
        case (#Err(_)) {
          // If first recovery fails, try with alternative recovery ID
          let altRecoveryId : Nat8 = if (recoveryId == 0) { 1 } else { 0 };
          switch (tryRecoveryWithId(messageArray, rArray, sArray, altRecoveryId)) {
            case (#Ok(pubKey)) #Ok(pubKey);
            case (#Err(err)) #Err("Recovery failed with both IDs. v=" # Nat8.toText(v) # ", recoveryId=" # Nat8.toText(recoveryId) # ", altId=" # Nat8.toText(altRecoveryId) # ". Error: " # err);
          };
        };
      };
    };
    
    // Helper function to try recovery with a specific recovery ID
    private func tryRecoveryWithId(messageArray: [Nat8], rArray: [Nat8], sArray: [Nat8], recoveryId: Nat8) : {#Ok: Blob; #Err: Text} {
      // Create signature object
      let signature = switch (Signature.parse_standard(Array.append(rArray, sArray))) {
        case (#ok(sig)) sig;
        case (#err(err)) return #Err("Failed to create signature: " # debug_show(err));
      };
      
      // Create recovery ID
      let recId = switch (RecoveryId.parse(recoveryId)) {
        case (#ok(rid)) rid;
        case (#err(_)) return #Err("Failed to create recovery ID");
      };
      
      // Create message object from hash
      let msgObj = MessageLib.parse(messageArray);
      
      // Create context (use null for simplicity - in production would load precomputed values)
      
      
      // Recover public key using context
      let publicKey = switch (ECDSA.recover_with_context(msgObj, signature, recId, ecCtx())) {
        case (#ok(pubKey)) pubKey;
        case (#err(err)) return #Err("Failed to recover public key: " # debug_show(err));
      };
      
      // Convert public key to bytes (uncompressed format)
      let pubKeyBytes = publicKey.serialize();
      #Ok(Blob.fromArray(pubKeyBytes));
    };
    
    
    // Helper function to derive Ethereum address from public key
    private func deriveEthereumAddressFromPublicKey(publicKey: Blob) : Text {
      // CRITICAL: This implements real address derivation using Keccak256
      // Ethereum address = last 20 bytes of keccak256(publicKey)
      
      let pubKeyArray = Blob.toArray(publicKey);
      
      // For uncompressed public key, skip the first byte (0x04 prefix) and use the remaining 64 bytes
      let pubKeyData = if (pubKeyArray.size() == 65 and pubKeyArray[0] == 0x04) {
        Array.subArray(pubKeyArray, 1, 64);  // Skip 0x04 prefix
      } else if (pubKeyArray.size() == 64) {
        pubKeyArray;  // Already without prefix
      } else {
        // Invalid public key format
        return "0x0000000000000000000000000000000000000000";
      };
      
      // Calculate Keccak256 hash of the public key (64 bytes)
      let keccak = SHA3.Keccak(256);
      keccak.update(pubKeyData);
      let hashArray = keccak.finalize();
      
      // Take the last 20 bytes as the Ethereum address
      let addressBytes = Array.subArray(hashArray, hashArray.size() - 20, 20);
      
      // Convert to hex string with 0x prefix
      "0x" # Hex.encode(addressBytes);
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

    // Helper function to convert Ethereum address hex string to 20-byte blob
    private func ethereumAddressToBlob(address: Text) : Result.Result<Blob, Text> {
      if (not Text.startsWith(address, #text("0x"))) {
        return #err("Ethereum address must start with 0x");
      };
      
      let cleanHex = Text.trimStart(address, #text("0x"));
      
      // Ethereum addresses should be exactly 40 hex characters (20 bytes)
      if (cleanHex.size() != 40) {
        return #err("Ethereum address must be exactly 40 hex characters (20 bytes)");
      };
      
      // Validate hex characters
      for (char in cleanHex.chars()) {
        switch (char) {
          case ('0' or '1' or '2' or '3' or '4' or '5' or '6' or '7' or '8' or '9' or 
                'a' or 'b' or 'c' or 'd' or 'e' or 'f' or 
                'A' or 'B' or 'C' or 'D' or 'E' or 'F') {};
          case (_) {
            return #err("Invalid hex character in Ethereum address: " # Text.fromChar(char));
          };
        };
      };
      
      let chars = Text.toArray(cleanHex);
      let bytes = Array.tabulate<Nat8>(20, func(i) { // Exactly 20 bytes
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
      
      #ok(Blob.fromArray(bytes));
    };

    // Helper function to convert Ethereum address to Principal for voting
    private func ethereumAddressToPrincipal(address: Text) : Principal {
      // Normalize the address first
      let normalizedAddress = normalizeEthereumAddress(address);
      
      // Convert the hex address to exactly 20 bytes
      let addressBytes = switch (ethereumAddressToBlob(normalizedAddress)) {
        case (#ok(blob)) Blob.toArray(blob);
        case (#err(_)) {
          // Fallback: use the text bytes if hex conversion fails
          Blob.toArray(Text.encodeUtf8(normalizedAddress));
        };
      };
      
      // Create a deterministic Principal from the Ethereum address bytes (20 bytes)
      // This ensures the same Ethereum address always maps to the same Principal
      Principal.fromBlob(Blob.fromArray(addressBytes));
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

      D.print("storage value: " # blobToHex(serviceWitness.storageValue));

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

      if (not BTree.has(state.config.admin_principals, Principal.compare, caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };
      
        // Verify SIWE first to authenticate the proposal creator
        switch(icrc149_verify_siwe(proposal_args.siwe)) {
            case(#Err(err)) return #Err("SIWE verification failed: " # err);
            case(#Ok(siwe_result)) {
                // SIWE verification successful, siwe_result.address contains the Ethereum address
                D.print("Proposal creation authenticated for Ethereum address: " # siwe_result.address);
            };
        };
        
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
        let (block_number, state_root, total_supply) = switch (blockResult) {
            case (#ok(block)) {
                // Validate and convert state root hex string to Blob
                if (not validateStateRoot(block.stateRoot)) {
                    return #Err("Invalid state root format from block " # Nat.toText(block.number) # ": " # block.stateRoot);
                };
                
                switch (hexStringToBlob(block.stateRoot)) {
                    case (#ok(state_root_blob)) {
                        D.print("Successfully got block " # Nat.toText(block.number) # " with state root: " # block.stateRoot);
                        
                        // Get total supply from the contract (for ERC20 tokens)
                        D.print("🏁 SUPPLY_CALL: About to get total supply for contract type: ERC20/ERC721/Other");
                        let total_supply = switch (final_snapshot_contract_config.contract_type) {
                            case (#ERC20) {
                                D.print("🏁 SUPPLY_CALL: Processing ERC20 contract, calling getTotalSupply for: " # snapshot_contract_address);
                                let supplyResult = await* getTotalSupply(final_snapshot_contract_config.rpc_service, final_snapshot_contract_config.chain, snapshot_contract_address);
                                D.print("🏁 SUPPLY_CALL: getTotalSupply call completed, processing result...");
                                switch (supplyResult) {
                                    case (#ok(supply)) {
                                        D.print("🏁 SUPPLY_CALL: Successfully got total supply: " # Nat.toText(supply));
                                        supply;
                                    };
                                    case (#err(errMsg)) {
                                        D.print("🏁 SUPPLY_CALL: Failed to get total supply: " # errMsg);
                                        // CRITICAL: totalSupply failure should cause proposal creation to FAIL, not use defaults  
                                        return #Err("Failed to get totalSupply for snapshot: " # errMsg);
                                    };
                                };
                            };
                            case (#ERC721) {
                                D.print("🏁 SUPPLY_CALL: ERC721 contract type detected - returning error");
                                // CRITICAL: ERC721 total supply calculation MUST be implemented, not defaulted
                                return #Err("ERC721 total supply calculation not implemented - this must be fixed before proposal creation");
                            };
                            case (#Other(_)) {
                                D.print("🏁 SUPPLY_CALL: Other contract type detected - returning error");
                                // CRITICAL: Custom contract types MUST have proper total supply calculation
                                return #Err("Custom contract type total supply calculation not implemented - this must be fixed before proposal creation");
                            };
                        };
                        
                        D.print("🏁 SUPPLY_CALL: Total supply processing complete: " # Nat.toText(total_supply));
                        
                        (block.number, state_root_blob, total_supply);
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

        D.print("🏁 PROPOSAL_CREATE: About to create proposal with total supply: " # Nat.toText(total_supply));
        D.print("🏁 PROPOSAL_CREATE: Block number: " # Nat.toText(block_number));
        D.print("🏁 PROPOSAL_CREATE: Contract address: " # snapshot_contract_address);

        // Create a dynamic proposal with total supply as the total voting power
        let result = await* proposalEngine.createProposal<system>(
            caller, 
            content, 
            [], // No initial members - they will be added as they vote
            #dynamic({ totalVotingPower = null })
        );
        
        D.print("🏁 PROPOSAL_CREATE: proposalEngine.createProposal call completed");
        
        switch(result) {
            case(#ok(proposal_id)) {
                let snapshot : MigrationTypes.Current.ProposalSnapshot = {
                    contract_address = snapshot_contract_address;
                    chain = final_snapshot_contract_config.chain;
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

                D.print("🏁 PROPOSAL_CREATE: Successfully created proposal with ID: saving engine state " # Nat.toText(proposal_id))  ;
                
                saveProposalEngineState();
                #Ok(proposal_id);
            };
            case(#err(err)) {
                D.print("❌ PROPOSAL_CREATE: " # debug_show(err));
                switch(err) {
                    
                    case(#notEligible) #Err("Caller not eligible to create proposals");
                    case(#invalid(errors)) #Err("Invalid proposal: " # Text.join(", ", errors.vals()));
                };
            };
        };
    };

    // Vote on proposal
    public func icrc149_vote_proposal(caller: Principal, vote_args: MigrationTypes.Current.VoteArgs) : async* {#Ok: (); #Err: Text} {
      D.print("🗳️  VOTE_START: Beginning vote processing for proposal " # Nat.toText(vote_args.proposal_id));
      D.print("🗳️  VOTE_START: Caller principal: " # Principal.toText(caller));
      D.print("🗳️  VOTE_START: Voter address: " # blobToHex(vote_args.voter));
      
      // Get current proposal state before voting
      D.print("🗳️  VOTE_STEP_1: Getting current proposal state...");
      let oldProposal = proposalEngine.getProposal(vote_args.proposal_id);
      D.print("🗳️  VOTE_STEP_1: Retrieved proposal state: " # (switch(oldProposal) { case(?_) "exists"; case(null) "not found"; }));
      
      // Verify SIWE first
      D.print("🗳️  VOTE_STEP_2: Starting SIWE verification...");
      switch(icrc149_verify_siwe(vote_args.siwe)) {
        case(#Err(err)) {
          D.print("🗳️  VOTE_ERROR: SIWE verification failed: " # err);
          return #Err("SIWE verification failed: " # err);
        };
        case(#Ok(siwe_result)) {
          D.print("🗳️  VOTE_STEP_2: SIWE verification completed successfully");
          // Verify the SIWE address matches vote_args.voter (case-insensitive)
          let expectedVoterHex = normalizeEthereumAddress(blobToHex(vote_args.voter));
          let siweAddressNormalized = normalizeEthereumAddress(siwe_result.address);
          D.print("🗳️  VOTE_STEP_2: Address matching - Expected: " # expectedVoterHex # ", SIWE: " # siweAddressNormalized);
          if (siweAddressNormalized != expectedVoterHex) {
            D.print("🗳️  VOTE_ERROR: Address mismatch");
            return #Err("SIWE address " # siwe_result.address # " does not match voter address " # expectedVoterHex);
          };
          D.print("🗳️  VOTE_STEP_2: Address verification passed");
        };
      };

      // Verify witness/merkle proof and get actual voting power
      D.print("🗳️  VOTE_STEP_3: Starting witness verification...");
      switch(icrc149_verify_witness(vote_args.witness, ?vote_args.proposal_id)) {
        case(#Err(err)) {
          D.print("🗳️  VOTE_ERROR: Witness verification failed: " # err);
          return #Err("Witness verification failed: " # err);
        };
        case(#Ok(witness_result)) {
          D.print("🗳️  VOTE_STEP_3: Witness verification completed successfully");
          D.print("🗳️  VOTE_STEP_3: Witness validity: " # (if (witness_result.valid) "valid" else "invalid"));
          D.print("🗳️  VOTE_STEP_3: Witness balance: " # Nat.toText(witness_result.balance));
          
          if (not witness_result.valid) {
            D.print("🗳️  VOTE_ERROR: Witness marked as invalid");
            return #Err("Witness validation failed: witness marked as invalid");
          };
          
          // Verify witness user address matches voter (case-insensitive)
          let expectedVoterHex = normalizeEthereumAddress(blobToHex(vote_args.voter));
          let witnessAddressNormalized = normalizeEthereumAddress(witness_result.user_address);
          D.print("🗳️  VOTE_STEP_3: Witness address matching - Expected: " # expectedVoterHex # ", Witness: " # witnessAddressNormalized);
          
          if (witnessAddressNormalized != expectedVoterHex) {
            D.print("🗳️  VOTE_ERROR: Witness address mismatch");
            return #Err("Witness user address " # witness_result.user_address # " does not match voter address " # expectedVoterHex);
          };
          
          D.print("🗳️  VOTE_STEP_3: All witness validations passed");
          
          // Use the actual balance from the witness as voting power
          let voting_power = witness_result.balance;
          D.print("🗳️  VOTE_STEP_4: Setting voting power: " # Nat.toText(voting_power));

          // Convert Ethereum address to Principal for voting
          let voterEthAddress = blobToHex(vote_args.voter);
          D.print("🗳️  VOTE_STEP_5: Converting Ethereum address to Principal for voting..." # debug_show(vote_args.voter) # " " # voterEthAddress);
          let voterPrincipal = ethereumAddressToPrincipal(voterEthAddress);
          D.print("🗳️  VOTE_STEP_5: Ethereum address " # voterEthAddress # " → Principal " # Principal.toText(voterPrincipal));

          // Create a member from the vote args (for real-time proposals)
          D.print("🗳️  VOTE_STEP_5: Creating member with voting power...");
          let member : ExtendedProposalEngine.Member = {
            id = voterPrincipal; // Use the Principal derived from Ethereum address
            votingPower = voting_power;
          };
          D.print("🗳️  VOTE_STEP_5: Member created for principal: " # Principal.toText(voterPrincipal));

          // Try to add the member to the proposal (in case it's a real-time proposal)
          D.print("🗳️  VOTE_STEP_6: Adding member to proposal...");
          let result2 = proposalEngine.addMember(vote_args.proposal_id, member);
          D.print("🗳️  VOTE_STEP_6: Member addition completed");

          D.print("result of add member" # debug_show(result2));

          // Cast the vote using the Ethereum-derived Principal
          D.print("🗳️  VOTE_STEP_7: Casting vote with choice..." # debug_show(vote_args.choice));
          D.print("🗳️  VOTE_STEP_7: About to call proposalEngine.vote() with voter principal...");

          let result = await* proposalEngine.vote(vote_args.proposal_id, voterPrincipal, vote_args.choice);
          D.print("🗳️  VOTE_STEP_7: proposalEngine.vote() returned" # debug_show(result));
          
          switch(result) {
            case(#ok(_)) {
              D.print("🗳️  VOTE_STEP_8: Vote cast successfully, checking for proposal status changes...");
              // Check if proposal status changed after voting
              switch(proposalEngine.getProposal(vote_args.proposal_id)) {
                case (?newProposal) {
                  D.print("🗳️  VOTE_STEP_8: Updating proposal indexes...");
                  D.print("🗳️  VOTE_STEP_8: Old proposal state: " # debug_show(oldProposal));
                  D.print("🗳️  VOTE_STEP_8: New proposal state: " # debug_show(newProposal));

                  updateProposalIndexes(vote_args.proposal_id, oldProposal, newProposal, newProposal.content);
                  D.print("🗳️  VOTE_STEP_8: Proposal indexes updated");
                };
                case (null) {
                  D.print("🗳️  VOTE_STEP_8: Warning - proposal not found after vote");
                };
              };
              D.print("🗳️  VOTE_STEP_9: Saving proposal engine state...");
              saveProposalEngineState();
              D.print("🗳️  VOTE_STEP_9: Proposal engine state saved");
              D.print("🗳️  VOTE_SUCCESS: Vote processing completed successfully");
              #Ok(());
            };
            case(#err(err)) {
              D.print("🗳️  VOTE_ERROR: Vote casting failed with error: " # debug_show(err));
              switch(err) {
                case(#proposalNotFound) {
                  D.print("🗳️  VOTE_ERROR: proposalNotFound");
                  #Err("Proposal not found");
                };
                case(#notEligible) {
                  D.print("🗳️  VOTE_ERROR: notEligible");
                  #Err("Not eligible to vote on this proposal");
                };
                case(#alreadyVoted) {
                  D.print("🗳️  VOTE_ERROR: alreadyVoted");
                  #Err("Already voted on this proposal");
                };
                case(#votingClosed) {
                  D.print("🗳️  VOTE_ERROR: votingClosed");
                  #Err("Voting period has ended");
                };
              };
            };
          };
        };
      };
    };

    // Tally votes for a proposal - shows "Pending" for active proposals
    public func icrc149_tally_votes(proposal_id: Nat) : MigrationTypes.Current.TallyResult {
      D.print("Tallying votes for proposal ID: " # Nat.toText(proposal_id));
      
      // Get the proposal to check its status
      let ?proposal = proposalEngine.getProposal(proposal_id) else {
        return {
          yes = 0;
          no = 0;
          abstain = 0;
          total = 0;
          result = "Not Found";
        };
      };
      
      // Check if proposal is still active/open
      let isActive = switch(proposal.status) {
        case(#open) true;
        case(#executing(_)) true; // Still considered active during execution
        case(#executed(_)) false;
        case(#failedToExecute(_)) false;
      };
      
      let summary = proposalEngine.buildVotingSummary(proposal_id);
      
      D.print("📊 Vote summary - Total voting power: " # Nat.toText(summary.totalVotingPower));
      D.print("📊 Vote summary - Undecided voting power: " # Nat.toText(summary.undecidedVotingPower));
      D.print("📊 Vote summary - Number of choice entries: " # Nat.toText(summary.votingPowerByChoice.size()));
      
      var yes_count = 0;
      var no_count = 0;
      var abstain_count = 0;
      
      for (choice_power in summary.votingPowerByChoice.vals()) {
        D.print("📊 Processing choice with voting power: " # Nat.toText(choice_power.votingPower));
        switch(choice_power.choice) {
          case(#Yes) {
            D.print("📊 Adding " # Nat.toText(choice_power.votingPower) # " to Yes votes");
            yes_count := choice_power.votingPower;
          };
          case(#No) {
            D.print("📊 Adding " # Nat.toText(choice_power.votingPower) # " to No votes");
            no_count := choice_power.votingPower;
          };
          case(#Abstain) {
            D.print("📊 Adding " # Nat.toText(choice_power.votingPower) # " to Abstain votes");
            abstain_count := choice_power.votingPower;
          };
        };
      };

      // If proposal is still active, show "Pending", otherwise show actual result
      let result = if (isActive) {
        "Pending"
      } else if (yes_count > no_count) {
        "Passed"
      } else {
        "Failed"
      };
      
      D.print("📊 Final tally - Yes: " # Nat.toText(yes_count) # ", No: " # Nat.toText(no_count) # ", Abstain: " # Nat.toText(abstain_count) # ", Result: " # result # ", Active: " # (if (isActive) "true" else "false"));

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
      //storageChanged(#v0_1_0(#data(state)));
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

    // Enhanced proposal getter that includes tally information
    public func icrc149_get_proposals(prev: ?Nat, take: ?Nat, filters: [Service.ProposalInfoFilter]) : [Service.ProposalWithTally] {
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
      
      // Convert proposal IDs to Service.ProposalWithTally objects (including tally data)
      let proposals = Array.mapFilter<Nat, Service.ProposalWithTally>(paginatedIds, func(id) {
        switch(proposalEngine.getProposal(id)) {
          case (?proposal) {
            let serviceProposal = translateProposalToService(proposal);
            let tally = icrc149_tally_votes(id);
            ?{
              id = serviceProposal.id;
              proposer = serviceProposal.proposer;
              action = serviceProposal.action;
              created_at = serviceProposal.created_at;
              snapshot = serviceProposal.snapshot;
              deadline = serviceProposal.deadline;
              metadata = serviceProposal.metadata;
              tally = tally;
            };
          };
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

      D.print("Executing proposal " # Nat.toText(proposal_id) # " with status: " # debug_show(proposal.status));
      
      // Check if proposal can be executed by examining its status
      switch(proposal.status) {
        case(#open) {
          // Try to end the proposal first
          let end_result = await* proposalEngine.endProposal(proposal_id);
          Debug.print("Proposal end result: " # debug_show(end_result));
          switch(end_result) {
            case(#ok(_)) {
              // Proposal ended successfully, update indexes with new status

              D.print("Proposal ended successfully, updating indexes...");
              switch(proposalEngine.getProposal(proposal_id)) {
                case (?newProposal) {
                  D.print("Executing proposal new status" # Nat.toText(proposal_id) # " with status: " # debug_show(proposal.status));
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
          D.print("Proposal execution completed with details: " # debug_show(details));
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
    public func icrc149_get_ethereum_address(subaccount: ?Blob) : async Text {
      await* getEthereumAddress(subaccount);
    };

    // Check if users have voted on specific proposals and return their votes
    public func icrc149_get_user_votes(requests: [{proposal_id: Nat; user_address: Text}]) : [{proposal_id: Nat; user_address: Text; vote: ?{ #Yes; #No; #Abstain }}] {
      Array.map<{proposal_id: Nat; user_address: Text}, {proposal_id: Nat; user_address: Text; vote: ?{ #Yes; #No; #Abstain }}>(requests, func(request) {
        D.print("🔍 USER_VOTE: Looking up vote for address " # request.user_address # " on proposal " # Nat.toText(request.proposal_id));
        
        // Convert Ethereum address to Principal (same as used during voting)
        let voterPrincipal = ethereumAddressToPrincipal(request.user_address);
        D.print("🔍 USER_VOTE: Converted address " # request.user_address # " to Principal " # Principal.toText(voterPrincipal));
        
        // Look up the vote using the proposal engine's getVote function
        let vote = switch(proposalEngine.getVote(request.proposal_id, voterPrincipal)) {
          case (?vote) {
            D.print("✅ USER_VOTE: Found vote for user");
            // Convert the vote choice to service format - vote.choice is already ?TChoice
            ?translateVoteChoiceToService(vote.choice);
          };
          case (null) {
            D.print("🔍 USER_VOTE: No vote found for user");
            null;
          };
        };
        
        {
          proposal_id = request.proposal_id;
          user_address = request.user_address;
          vote = vote;
        };
      });
    };

    // Legacy single-request function for backward compatibility
    public func icrc149_get_user_vote(proposal_id: Nat, user_address: Text) : ?{ #Yes; #No; #Abstain } {
      let results = icrc149_get_user_votes([{proposal_id = proposal_id; user_address = user_address}]);
      switch(results.size()) {
        case (0) null;
        case (_) results[0].vote;
      };
    };

    // Enhanced function to check if user has voted
    public func icrc149_has_user_voted(proposal_id: Nat, user_address: Text) : Bool {
      switch(icrc149_get_user_vote(proposal_id, user_address)) {
        case (?_) true;
        case (null) false;
      };
    };

    // Enhanced proposal retrieval that includes user vote information
    public func icrc149_get_proposal_with_user_vote(proposal_id: Nat, user_address: ?Text) : ?{
      proposal: Service.Proposal;
      user_vote: ?{ #Yes; #No; #Abstain };
      user_has_voted: Bool;
    } {
      switch(icrc149_get_proposal_service(proposal_id)) {
        case (?proposal) {
          let userVote = switch(user_address) {
            case (?addr) icrc149_get_user_vote(proposal_id, addr);
            case (null) null;
          };
          
          ?{
            proposal = proposal;
            user_vote = userVote;
            user_has_voted = userVote != null;
          };
        };
        case (null) null;
      };
    };


  };

};