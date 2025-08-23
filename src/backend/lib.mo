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
import Timer "mo:base/Timer";
import Principal "mo:base/Principal";
import Blob "mo:base/Blob";
import Bool "mo:base/Bool";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat8";
import BTree "mo:stableheapbtreemap/BTree";
import Text "mo:base/Text";
import ExtendedProposalEngine "mo:dao-proposal-engine/ExtendedProposalEngine";
import Result "mo:base/Result";
import Iter "mo:base/Iter";
import Array "mo:base/Array";
import ICPCall "mo:base/ExperimentalInternetComputer";
import Error "mo:base/Error";
import Cycles "mo:base/ExperimentalCycles";
import SHA3 "mo:sha3";
import Nat64 "mo:base/Nat64";
import Debug "mo:base/Debug";
import Utils "Utils";
import BaseX "mo:base-x-encoder";
import Order "mo:base/Order";
import DateTime "mo:datetime/DateTime";

// EVM Transaction Libraries
import EVMAddress "mo:evm-txs/Address";
import Transaction1559 "mo:evm-txs/transactions/EIP1559";
import Ecmult "mo:libsecp256k1/core/ecmult";
import ECDSA "mo:libsecp256k1/Ecdsa";
import Signature "mo:libsecp256k1/Signature";
import MessageLib "mo:libsecp256k1/Message";
import RecoveryId "mo:libsecp256k1/RecoveryId";
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

  public func initialState() : State { #v0_0_0(#data) };
  public let currentStateVersion = #v0_1_0(#id);

  public func test() : Nat {
    1;
  };

  public func natNow() : Nat {
    Int.abs(Time.now());
  };

  public let ICRC85_Timer_Namespace = "icrc85:ovs:shareaction:evmdaobridge";
  public let ICRC85_Payment_Namespace = "com.evmdaobridge-org.libraries.evmdaobridge";

  // Centralized RPC service configuration helper
  private func createRpcService(chain_id : Nat, canister_id : Principal) : MigrationTypes.Current.EthereumRPCService {
    {
      rpc_type = switch (chain_id) {
        case (1) "mainnet";
        case (5) "goerli";
        case (11155111) "sepolia";
        case (_) "custom";
      };
      canister_id = canister_id;
      custom_config = switch (chain_id) {
        case (31337 or 1337 or 1338) ?[("url", "http://127.0.0.1:8545")];
        case (_) null;
      };
    };
  };

  // Enhanced helper with debug logging
  private func createRpcServiceWithLogging(chain_id : Nat, canister_id : Principal, context : Text) : MigrationTypes.Current.EthereumRPCService {
    let service = createRpcService(chain_id, canister_id);

    D.print("🔧 RPC_SERVICE_" # context # ": Chain ID: " # Nat.toText(chain_id));
    D.print("🔧 RPC_SERVICE_" # context # ": RPC Type: " # service.rpc_type);
    D.print("🔧 RPC_SERVICE_" # context # ": Canister ID: " # Principal.toText(service.canister_id));
    D.print("🔧 RPC_SERVICE_" # context # ": Custom Config: " # debug_show (service.custom_config));

    service;
  };

  public func Init<system>(
    config : {
      manager : ClassPlusLib.ClassPlusInitializationManager;
      initialState : State;
      args : ?InitArgs;
      pullEnvironment : ?(() -> Environment);
      onInitialize : ?(EvmDaoBridge -> async* ());
      onStorageChange : ((State) -> ());
    }
  ) : <system>() -> EvmDaoBridge {

    let instance = ClassPlusLib.ClassPlusSystem<system, EvmDaoBridge, State, InitArgs, Environment>({
      config with constructor = EvmDaoBridge
    }).get;

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

  public class EvmDaoBridge<system>(stored : ?State, instantiator : Principal, canister : Principal, _args : ?InitArgs, environment_passed : ?Environment, storageChanged : (State) -> ()) {

    public let debug_channel = {
      var announce = true;
    };

    public let environment = switch (environment_passed) {
      case (?val) val;
      case (null) {
        D.trap("Environment is required");
      };
    };

    let _d = environment.log.log_debug;

    public var state : CurrentState = switch (stored) {
      case (null) {
        switch (init(initialState(), currentStateVersion, null, instantiator, canister)) {
          case (#v0_1_0(#data(foundState))) foundState;
          case (_) D.trap("Failed to initialize state");
        };
      };
      case (?val) {
        switch (init(val, currentStateVersion, null, instantiator, canister)) {
          case (#v0_1_0(#data(foundState))) foundState;
          case (_) D.trap("Failed to migrate state");
        };
      };
    };

    storageChanged(#v0_1_0(#data(state)));

    let _self : Service.Service = actor (Principal.toText(canister));

    // Execution lock to prevent concurrent proposal execution attempts
    // Maps proposal_id -> Bool (true if currently executing)
    private var executingProposals = BTree.init<Nat, Bool>(?16);

    // Transaction queue for Ethereum transactions
    // Each entry contains: proposal_id, eth_tx, timestamp, and processing status
    public type QueuedTransaction = {
      proposal_id : Nat;
      eth_tx : MigrationTypes.Current.EthTx;
      queued_at : Int;
      var status : TransactionStatus;
      var processing_attempts : Nat;
      var last_attempt_at : ?Int;
      var error_message : ?Text;
      var transaction_hash : ?Text;
    };

    public type TransactionStatus = {
      #pending; // Waiting to be processed
      #processing; // Currently being processed
      #completed; // Successfully sent to blockchain
      #failed; // Failed after attempts
    };

    private var transactionQueue = BTree.init<Nat, QueuedTransaction>(?16); // Queue indexed by sequence number
    private var queueSequence : Nat = 0; // Auto-incrementing sequence for queue order
    private var isProcessingQueue : Bool = false; // Simple flag to prevent concurrent queue processing

    // Processed transactions storage - keeps completed/failed transactions for lookup
    private var processedTransactions = BTree.init<Nat, QueuedTransaction>(?16); // Indexed by sequence number

    // Queue processing engine variables
    private var queueProcessingTimer : ?Nat = null; // Timer ID for single queue processing
    private var lastProcessedSequence : Nat = 0; // Track last processed transaction for restart recovery
    private let QUEUE_PROCESSING_DELAY_SECONDS : Nat = 10; // Wait 10 seconds before processing next item

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
        key_id : { curve : { #secp256k1 }; name : Text };
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
    private func getRpcServices(
      chain : MigrationTypes.Current.EthereumNetwork,
      rpc_service : MigrationTypes.Current.EthereumRPCService,
    ) : RpcServices {
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

          D.print("🔧 GET_RPC_SERVICES: Using custom RPC with URL: " # url);
          D.print("🔧 GET_RPC_SERVICES: Chain ID for custom: " # Nat.toText(chain.chain_id));

          #Custom({
            chainId = Nat64.fromNat(chain.chain_id); // Convert Nat to Nat64 for EVM RPC interface
            services = [{ url = url; headers = null }];
          });
        };
        case (_) {
          D.print("🔧 GET_RPC_SERVICES: Using predefined services for chain " # Nat.toText(chain.chain_id));
          // Use predefined services based on chain
          switch (chain.chain_id) {
            case (1) {
              D.print("🔧 GET_RPC_SERVICES: Mainnet providers selected");
              #EthMainnet(?[#Alchemy, #Ankr, #BlockPi]);
            };
            case (11155111) {
              D.print("🔧 GET_RPC_SERVICES: Sepolia providers selected");
              #EthSepolia(?[#Alchemy, #Ankr, #BlockPi]);
            };
            case (_) {
              D.print("🔧 GET_RPC_SERVICES: Default mainnet providers for chain " # Nat.toText(chain.chain_id));
              #EthMainnet(?[#Alchemy, #Ankr]);
            };
          };
        };
      };
    };

    // Helper function to create EVM RPC canister actor
    private func getEvmRpcActor(rpc_service : MigrationTypes.Current.EthereumRPCService) : EVMRPCService {
      actor (Principal.toText(rpc_service.canister_id)) : EVMRPCService;
    };

    // Helper function to get latest finalized block
    private func getLatestFinalizedBlock(rpc_service : MigrationTypes.Current.EthereumRPCService, chain : MigrationTypes.Current.EthereumNetwork) : async* Result.Result<Block, Text> {
      try {
        D.print("🔧 FINALIZED_BLOCK: ========== DEBUG CHAIN CONFIGURATION ==========");
        D.print("🔧 FINALIZED_BLOCK: Chain ID received: " # Nat.toText(chain.chain_id));
        D.print("🔧 FINALIZED_BLOCK: Chain network name: " # chain.network_name);
        D.print("🔧 FINALIZED_BLOCK: RPC service type: " # rpc_service.rpc_type);
        D.print("🔧 FINALIZED_BLOCK: RPC canister ID: " # Principal.toText(rpc_service.canister_id));
        D.print("🔧 FINALIZED_BLOCK: Custom config: " # debug_show (rpc_service.custom_config));

        let rpcActor = getEvmRpcActor(rpc_service);
        let rpcServices = getRpcServices(chain, rpc_service);
        let config : ?RpcConfig = ?{
          responseSizeEstimate = ?1000000; // 1MB estimate
          responseConsensus = null; // Use default consensus strategy
        };

        D.print("Getting latest block and going back 6 blocks for finalized safety on chain " # Nat.toText(chain.chain_id));

        // Get latest block first - this is universally supported - add timeout for test environment
        D.print("⏳ Making eth_getBlockByNumber(Latest) RPC call...");
        let latestResult = await (with cycles = 127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Latest);
        D.print("✅ eth_getBlockByNumber(Latest) RPC call completed");

        switch (latestResult) {
          case (#Consistent(#Ok(latestBlock))) {
            D.print("🎯 Latest block retrieved successfully: " # Nat.toText(latestBlock.number));
            // Determine how many blocks to go back for safety
            let confirmationBlocks = switch (chain.chain_id) {
              case (1) 6; // Ethereum mainnet - 6 blocks back approximates finalized
              case (31337 or 1337) 0; // Local dev chains - use latest block for tests
              case (_) 6; // All other chains - 6 blocks back for safety
            };

            let targetBlockNumber : Nat = if (latestBlock.number > confirmationBlocks) {
              latestBlock.number - confirmationBlocks;
            } else {
              latestBlock.number; // Use latest if chain is too new
            };

            D.print("Latest block: " # Nat.toText(latestBlock.number) # ", going back " # Nat.toText(confirmationBlocks) # " blocks to target: " # Nat.toText(targetBlockNumber));

            if (targetBlockNumber == latestBlock.number) {
              // Use the latest block if it has a valid state root
              if (latestBlock.stateRoot != "" and Text.startsWith(latestBlock.stateRoot, #text("0x")) and latestBlock.stateRoot.size() >= 66) {
                D.print("Using latest block " # Nat.toText(latestBlock.number) # " with state root: " # debug_show (latestBlock.stateRoot) # "...");
                return #ok(latestBlock);
              } else {
                return #err("Latest block has invalid state root: " # latestBlock.stateRoot);
              };
            } else {
              // Get the specific block number (latest - confirmation blocks) - add timeout for test environment
              D.print("⏳ Making eth_getBlockByNumber(" # Nat.toText(targetBlockNumber) # ") RPC call...");
              let targetResult = await (with cycles = 127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Number(targetBlockNumber));
              D.print("✅ eth_getBlockByNumber(" # Nat.toText(targetBlockNumber) # ") RPC call completed");

              switch (targetResult) {
                case (#Consistent(#Ok(block))) {
                  // Validate that we have a proper state root
                  if (block.stateRoot != "" and Text.startsWith(block.stateRoot, #text("0x")) and block.stateRoot.size() >= 66) {
                    D.print("Successfully got finalized block " # Nat.toText(block.number) # " with state root: " # debug_show (block.stateRoot) # "...");
                    return #ok(block);
                  } else {
                    return #err("Block " # Nat.toText(targetBlockNumber) # " has invalid state root: " # block.stateRoot);
                  };
                };
                case (#Consistent(#Err(err))) {
                  D.print("❌ eth_getBlockByNumber(" # Nat.toText(targetBlockNumber) # ") failed: " # Utils.formatRpcError(err));
                  return #err("Failed to get block " # Nat.toText(targetBlockNumber) # ": " # Utils.formatRpcError(err));
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
                        case (#Err(err)) return #err("Failed to get block " # Nat.toText(targetBlockNumber) # ": " # Utils.formatRpcError(err));
                      };
                    };
                  };
                };
              };
            };
          };
          case (#Consistent(#Err(err))) {
            D.print("❌ eth_getBlockByNumber(Latest) failed: " # Utils.formatRpcError(err));
            return #err("Failed to get latest block: " # Utils.formatRpcError(err));
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
                      case (31337 or 1337) 0; // Local dev chains - use latest block for tests
                      case (_) 6; // All other chains
                    };

                    let targetBlockNumber : Nat = if (latestBlock.number > confirmationBlocks) {
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
                  case (#Err(err)) return #err("Failed to get latest block: " # Utils.formatRpcError(err));
                };
              };
            };
          };
        };
      } catch (e) {
        #err("Failed to get block: " # Error.message(e));
      };
    };

    // Helper function to validate state root format
    private func validateStateRoot(stateRoot : Text) : Bool {
      stateRoot != "" and Text.startsWith(stateRoot, #text("0x")) and stateRoot.size() >= 66 and // 0x + 64 hex chars = 66 total
      stateRoot.size() <= 66; // Exactly 66 characters for valid state root
    };

    private func getTotalSupply(rpc_service : MigrationTypes.Current.EthereumRPCService, chain : MigrationTypes.Current.EthereumNetwork, contract_address : Text) : async* Result.Result<Nat, Text> {
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

        let result = await (with cycles = 127817059200) rpcActor.eth_call(rpcServices, config, callArgs);

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

              // Convert hex string to Nat (optimized for large hex strings)
              D.print("🔧 TOTAL_SUPPLY: Converting hex to number, " # Nat.toText(cleanHex.size()) # " characters");

              // Remove leading zeros to reduce processing time
              let trimmedHex = Text.trimStart(cleanHex, #char('0'));
              let finalHex = if (trimmedHex.size() == 0) "0" else trimmedHex;

              D.print("🔧 TOTAL_SUPPLY: Trimmed hex string: " # finalHex # " (removed leading zeros)");

              var totalSupply : Nat = 0;
              let chars = Text.toArray(finalHex);

              D.print("🔧 TOTAL_SUPPLY: Starting hex conversion loop, processing " # Nat.toText(chars.size()) # " characters");

              // Process hex digits from left to right (more efficient for large numbers)
              var charIndex = 0;
              for (char in chars.vals()) {
                D.print("🔧 TOTAL_SUPPLY: Processing character " # Nat.toText(charIndex) # "/" # Nat.toText(chars.size()) # ": " # Text.fromChar(char));
                let digit = switch (char) {
                  case ('0') 0;
                  case ('1') 1;
                  case ('2') 2;
                  case ('3') 3;
                  case ('4') 4;
                  case ('5') 5;
                  case ('6') 6;
                  case ('7') 7;
                  case ('8') 8;
                  case ('9') 9;
                  case ('a' or 'A') 10;
                  case ('b' or 'B') 11;
                  case ('c' or 'C') 12;
                  case ('d' or 'D') 13;
                  case ('e' or 'E') 14;
                  case ('f' or 'F') 15;
                  case (_) 0;
                };
                totalSupply := totalSupply * 16 + digit;
                charIndex += 1;
                D.print("🔧 TOTAL_SUPPLY: After character " # Nat.toText(charIndex) # ", totalSupply = " # Nat.toText(totalSupply));
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

                      // Convert hex string to Nat (optimized for large hex strings)
                      D.print("🔧 TOTAL_SUPPLY: Converting hex to number, " # Nat.toText(cleanHex.size()) # " characters");

                      // Remove leading zeros to reduce processing time
                      let trimmedHex = Text.trimStart(cleanHex, #char('0'));
                      let finalHex = if (trimmedHex.size() == 0) "0" else trimmedHex;

                      D.print("🔧 TOTAL_SUPPLY: Trimmed hex string: " # finalHex # " (removed leading zeros)");

                      var totalSupply : Nat = 0;
                      let chars = Text.toArray(cleanHex);
                      var i = chars.size();

                      D.print("🔧 TOTAL_SUPPLY: Converting hex to number, " # Nat.toText(chars.size()) # " characters");

                      while (i > 0) {
                        i -= 1;
                        let char = chars[i];
                        let digit = switch (char) {
                          case ('0') 0;
                          case ('1') 1;
                          case ('2') 2;
                          case ('3') 3;
                          case ('4') 4;
                          case ('5') 5;
                          case ('6') 6;
                          case ('7') 7;
                          case ('8') 8;
                          case ('9') 9;
                          case ('a' or 'A') 10;
                          case ('b' or 'B') 11;
                          case ('c' or 'C') 12;
                          case ('d' or 'D') 13;
                          case ('e' or 'E') 14;
                          case ('f' or 'F') 15;
                          case (_) 0;
                        };
                        totalSupply := totalSupply * 16 + digit;
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
    let IC_ECDSA_ACTOR : ICTECDSA = actor ("aaaaa-aa"); // IC management canister

    // Create EC multiplication context for secp256k1
    // Note: Using null for now - in production, should load precomputed values

    // Helper function to get Ethereum address from ECDSA public key and derivation path
    private func getEthereumAddress(subaccount : ?Blob) : async* Text {
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

    // Helper function to fetch nonce directly from blockchain
    private func fetchNonceFromBlockchain(chainId : Nat, address : Text, rpc_service : MigrationTypes.Current.EthereumRPCService) : async* Nat {
      try {
        let rpcActor = getEvmRpcActor(rpc_service);
        let rpcServices = getRpcServices({ chain_id = chainId; network_name = "" }, rpc_service);

        D.print("🔍 NONCE: Fetching nonce from blockchain for address: " # address);
        let result = await (with cycles = 127817059200) rpcActor.eth_getTransactionCount(
          rpcServices,
          ?{
            responseSizeEstimate = ?256;
            responseConsensus = null; // Use default consensus strategy
          },
          { address = address; block = #Latest },
        );

        switch (result) {
          case (#Consistent(#Ok(nonce))) {
            D.print("✅ NONCE: Fetched nonce from blockchain: " # Nat.toText(nonce));
            nonce;
          };
          case (#Consistent(#Err(err))) {
            D.print("❌ NONCE: RPC error fetching nonce: " # debug_show (err));
            0; // Default to 0 if unable to fetch
          };
          case (#Inconsistent(err)) {
            D.print("❌ NONCE: Inconsistent response fetching nonce: " # debug_show (err));
            0; // Default to 0 if unable to fetch
          };
        };
      } catch (e) {
        D.print("❌ NONCE: Exception fetching nonce: " # Error.message(e));
        0; // Default to 0 on error
      };
    };

    // Helper function to recover nonce when "nonce too low" error occurs
    // Helper function to add transaction to queue
    private func addTransactionToQueue<system>(proposal_id : Nat, eth_tx : MigrationTypes.Current.EthTx) : Nat {
      let queueEntry = {
        proposal_id = proposal_id;
        eth_tx = eth_tx;
        queued_at = Time.now();
        var status = #pending : TransactionStatus;
        var processing_attempts = 0;
        var last_attempt_at = null : ?Int;
        var error_message = null : ?Text;
        var transaction_hash = null : ?Text;
      };

      let sequenceId = queueSequence;
      queueSequence += 1;

      ignore BTree.insert(transactionQueue, Nat.compare, sequenceId, queueEntry);

      D.print("� QUEUE: Added transaction for proposal " # Nat.toText(proposal_id) # " to queue at position " # Nat.toText(sequenceId));
      D.print("📊 QUEUE: Queue size is now: " # Nat.toText(BTree.size(transactionQueue)));

      // Start queue processing timer if not already running
      startQueueProcessingTimer<system>();

      sequenceId;
    };

    // Start queue processing with delay (single-shot timer)
    private func startQueueProcessingTimer<system>() : () {
      switch (queueProcessingTimer) {
        case (?_) {
          // Timer already scheduled
          D.print("⏰ QUEUE_TIMER: Processing already scheduled");
        };
        case (null) {
          D.print("⏰ QUEUE_TIMER: Scheduling queue processing in " # Nat.toText(QUEUE_PROCESSING_DELAY_SECONDS) # " seconds");
          let timerId = Timer.setTimer<system>(
            #seconds(QUEUE_PROCESSING_DELAY_SECONDS),
            processQueueTimerCallback,
          );
          queueProcessingTimer := ?timerId;
        };
      };
    };

    // Schedule next queue processing after current item completes
    private func scheduleNextQueueProcessing<system>() : () {
      // Clear current timer
      queueProcessingTimer := null;

      // Check if there are more pending items
      switch (getNextQueuedTransaction()) {
        case (null) {
          D.print("⏰ QUEUE_SCHEDULE: No more pending transactions, stopping scheduler");
        };
        case (?_) {
          D.print("⏰ QUEUE_SCHEDULE: More transactions pending, scheduling next processing");
          startQueueProcessingTimer<system>();
        };
      };
    };

    // Timer callback for queue processing (single execution)
    private func processQueueTimerCallback() : async () {
      D.print("⏰ QUEUE_TIMER: Timer fired, processing next transaction...");

      // Clear the timer reference since this is a one-shot
      queueProcessingTimer := null;

      try {
        let result = await* processNextQueuedTransaction();
        D.print("⏰ QUEUE_TIMER: Processing completed with result: " # debug_show (result));

        // Schedule next processing if there are more items
        scheduleNextQueueProcessing<system>();
      } catch (e) {
        D.print("❌ QUEUE_TIMER: Error processing queue: " # Error.message(e));

        // Even on error, schedule next processing to handle remaining items
        scheduleNextQueueProcessing<system>();
      };
    };

    // Helper function to get next pending transaction from queue (ordered by sequence)
    private func getNextQueuedTransaction() : ?(Nat, QueuedTransaction) {
      // Get the first (lowest sequence number) pending transaction
      for ((seqId, queueEntry) in BTree.entries(transactionQueue)) {
        if (queueEntry.status == #pending) {
          return ?(seqId, queueEntry);
        };
      };
      null;
    };

    // Main queue processing function - processes one transaction at a time
    private func processNextQueuedTransaction() : async* Result.Result<Text, Text> {
      D.print("🔄 QUEUE_PROCESS: Starting queue processing...");

      // Check if we have any pending transactions
      switch (getNextQueuedTransaction()) {
        case (null) {
          D.print("🔄 QUEUE_PROCESS: No pending transactions in queue");
          return #err("No pending transactions");
        };
        case (?(sequenceId, queueEntry)) {
          D.print("🔄 QUEUE_PROCESS: Found pending transaction at sequence " # Nat.toText(sequenceId));
          D.print("🔄 QUEUE_PROCESS: Proposal ID: " # Nat.toText(queueEntry.proposal_id));
          D.print("🔄 QUEUE_PROCESS: Queued at: " # Int.toText(queueEntry.queued_at));
          D.print("🔄 QUEUE_PROCESS: Processing attempts: " # Nat.toText(queueEntry.processing_attempts));

          // Mark as processing
          queueEntry.status := #processing;
          queueEntry.processing_attempts += 1;
          queueEntry.last_attempt_at := ?Time.now();

          D.print("🔄 QUEUE_PROCESS: Marked transaction as processing, attempt #" # Nat.toText(queueEntry.processing_attempts));

          try {
            // Get the Ethereum address for this subaccount
            D.print("🔄 QUEUE_PROCESS: Getting Ethereum address for subaccount...");
            let ethAddress = await* getEthereumAddress(queueEntry.eth_tx.subaccount);
            D.print("🔄 QUEUE_PROCESS: Ethereum address: " # ethAddress);

            // Configure RPC service using centralized function
            let rpc_service = createRpcServiceWithLogging(queueEntry.eth_tx.chain.chain_id, state.config.evm_rpc_canister_id, "QUEUE_PROCESS");

            // Create derivation path
            let derivationPath = switch (queueEntry.eth_tx.subaccount) {
              case (?blob) [blob];
              case (null) [];
            };

            // Execute the transaction
            D.print("🔄 QUEUE_PROCESS: Executing Ethereum transaction...");
            let result = await* executeEthereumTransaction(
              queueEntry.eth_tx,
              rpc_service,
              ethAddress,
              derivationPath,
            );

            switch (result) {
              case (#Ok(txHash)) {
                D.print("✅ QUEUE_PROCESS: Transaction successful! Hash: " # txHash);

                // Mark as completed and record the transaction hash
                queueEntry.status := #completed;
                queueEntry.transaction_hash := ?txHash;
                queueEntry.error_message := null;

                // Move to processed transactions storage
                ignore BTree.insert(processedTransactions, Nat.compare, sequenceId, queueEntry);
                D.print("✅ QUEUE_PROCESS: Moved completed transaction to processed storage");

                // Remove from active queue
                let removed = removeTransactionFromQueue(sequenceId);
                D.print("✅ QUEUE_PROCESS: Removed from active queue: " # debug_show (removed));

                // Update last processed sequence for restart recovery
                lastProcessedSequence := sequenceId;

                D.print("✅ QUEUE_PROCESS: Updated last processed sequence to: " # Nat.toText(lastProcessedSequence));

                #ok(txHash);
              };
              case (#Err(errorMsg)) {
                D.print("❌ QUEUE_PROCESS: Transaction failed: " # errorMsg);

                // Mark as failed since we only try once
                queueEntry.status := #failed;
                queueEntry.error_message := ?errorMsg;
                queueEntry.transaction_hash := null;

                // Move to processed transactions storage
                ignore BTree.insert(processedTransactions, Nat.compare, sequenceId, queueEntry);
                D.print("❌ QUEUE_PROCESS: Moved failed transaction to processed storage");

                // Remove from active queue
                let removed = removeTransactionFromQueue(sequenceId);
                D.print("❌ QUEUE_PROCESS: Removed from active queue: " # debug_show (removed));

                // Update last processed sequence for restart recovery
                lastProcessedSequence := sequenceId;

                D.print("❌ QUEUE_PROCESS: Marked transaction as failed, updated last processed sequence to: " # Nat.toText(lastProcessedSequence));

                #err(errorMsg);
              };
            };
          } catch (e) {
            let errorMsg = "Queue processing exception: " # Error.message(e);
            D.print("❌ QUEUE_PROCESS: Exception: " # errorMsg);

            // Mark as failed
            queueEntry.status := #failed;
            queueEntry.error_message := ?errorMsg;
            queueEntry.transaction_hash := null;

            // Move to processed transactions storage
            ignore BTree.insert(processedTransactions, Nat.compare, sequenceId, queueEntry);
            D.print("❌ QUEUE_PROCESS: Moved exception-failed transaction to processed storage");

            // Remove from active queue
            let removed = removeTransactionFromQueue(sequenceId);
            D.print("❌ QUEUE_PROCESS: Removed from active queue: " # debug_show (removed));

            // Update last processed sequence for restart recovery
            lastProcessedSequence := sequenceId;

            D.print("❌ QUEUE_PROCESS: Marked transaction as failed due to exception, updated last processed sequence to: " # Nat.toText(lastProcessedSequence));

            #err(errorMsg);
          };
        };
      };
    };

    // Helper function to remove transaction from queue
    private func removeTransactionFromQueue(sequenceId : Nat) : Bool {
      switch (BTree.delete(transactionQueue, Nat.compare, sequenceId)) {
        case (?_) {
          D.print("📤 QUEUE: Removed transaction at sequence " # Nat.toText(sequenceId) # " from queue");
          D.print("� QUEUE: Queue size is now: " # Nat.toText(BTree.size(transactionQueue)));
          true;
        };
        case (null) false;
      };
    };

    // Simple Ethereum transaction executor (no mutex, no retries - just one attempt)
    private func executeEthereumTransaction(
      eth_tx : MigrationTypes.Current.EthTx,
      rpc_service : MigrationTypes.Current.EthereumRPCService,
      ethAddress : Text,
      derivationPath : [Blob],
    ) : async* { #Ok : Text; #Err : Text } {

      D.print("🎯 ETH_TX_EXECUTE: STARTING SIMPLE ETHEREUM TRANSACTION EXECUTION");
      D.print("🎯 ETH_TX_EXECUTE: To: " # eth_tx.to);
      D.print("🎯 ETH_TX_EXECUTE: From: " # ethAddress);
      D.print("🎯 ETH_TX_EXECUTE: Value: " # Nat.toText(eth_tx.value));

      try {
        // Step 1: Get current nonce from blockchain
        D.print("🎯 ETH_TX_EXECUTE: Step 1 - Getting nonce from blockchain...");
        let nonce = await* fetchNonceFromBlockchain(eth_tx.chain.chain_id, ethAddress, rpc_service);
        D.print("🎯 ETH_TX_EXECUTE: Using nonce: " # Nat.toText(nonce));

        // Step 2: Create transaction structure
        D.print("🎯 ETH_TX_EXECUTE: Step 2 - Creating transaction structure...");
        let transaction = {
          chainId = Nat64.fromNat(eth_tx.chain.chain_id);
          nonce = Nat64.fromNat(nonce);
          maxPriorityFeePerGas = Nat64.fromNat(eth_tx.maxPriorityFeePerGas);
          gasLimit = Nat64.fromNat(eth_tx.gasLimit);
          maxFeePerGas = Nat64.fromNat(eth_tx.maxFeePerGas);
          to = eth_tx.to;
          value = eth_tx.value;
          data = BaseX.toHex(eth_tx.data.vals(), { isUpper = true; prefix = #single("0x") });
          accessList = [] : [(Text, [Text])];
          r = "0x00";
          s = "0x00";
          v = "0x00";
        };

        // Step 3: Encode and sign
        D.print("🎯 ETH_TX_EXECUTE: Step 3 - Encoding and signing...");
        let encodedTx = Transaction1559.getMessageToSign(transaction);
        let txHash = switch (encodedTx) {
          case (#ok(bytes)) bytes;
          case (#err(err)) return #Err("Failed to encode transaction: " # err);
        };

        Cycles.add<system>(126_153_846_153);
        let { signature } = await IC_ECDSA_ACTOR.sign_with_ecdsa({
          message_hash = Blob.fromArray(txHash);
          derivation_path = derivationPath;
          key_id = { curve = #secp256k1; name = ECDSA_KEY_NAME };
        });

        let { public_key; chain_code = _ } = await IC_ECDSA_ACTOR.ecdsa_public_key({
          canister_id = ?Principal.fromActor(_self);
          derivation_path = derivationPath;
          key_id = { curve = #secp256k1; name = ECDSA_KEY_NAME };
        });

        // Step 4: Serialize and send
        D.print("🎯 ETH_TX_EXECUTE: Step 4 - Serializing and sending...");
        let signedTx = Transaction1559.signAndSerialize(
          transaction,
          Blob.toArray(signature),
          Blob.toArray(public_key),
          ecCtx(),
        );

        let rawTxHex = switch (signedTx) {
          case (#ok((_, txBytes))) BaseX.toHex(txBytes.vals(), { isUpper = true; prefix = #none });
          case (#err(err)) return #Err("Failed to serialize transaction: " # err);
        };

        let result = await* ethSendRawTransaction(eth_tx.chain.chain_id, rpc_service, rawTxHex);
        switch (result) {
          case (#ok(txHash)) {
            D.print("🎯 ETH_TX_EXECUTE: SUCCESS - Transaction hash: " # txHash);
            #Ok(txHash);
          };
          case (#err(err)) {
            D.print("🎯 ETH_TX_EXECUTE: FAILED - Error: " # err);
            #Err(err);
          };
        };

      } catch (e) {
        let errorMsg = "Transaction execution exception: " # Error.message(e);
        D.print("🎯 ETH_TX_EXECUTE: EXCEPTION - " # errorMsg);
        #Err(errorMsg);
      };
    };

    // Helper function to send raw Ethereum transaction
    private func ethSendRawTransaction(chainId : Nat, rpc_service : MigrationTypes.Current.EthereumRPCService, rawTx : Text) : async* Result.Result<Text, Text> {
      try {
        let rpcActor = getEvmRpcActor(rpc_service);
        let rpcServices = getRpcServices({ chain_id = chainId; network_name = "" }, rpc_service);

        let finalTx = if (Text.startsWith(rawTx, #text("0x"))) {
          rawTx;
        } else {
          "0x" # rawTx;
        };

        Cycles.add<system>(1_000_000_000); // 1B cycles for transaction
        let result = await (with cycles = 127817059200) rpcActor.eth_sendRawTransaction(
          rpcServices,
          ?{
            responseSizeEstimate = ?1024;
            responseConsensus = null; // Use default consensus strategy
          },
          finalTx,
        );

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
            #err("RPC error: " # debug_show (err));
          };
          case (#Inconsistent(err)) {
            #err("Inconsistent RPC response: " # debug_show (err));
          };
        };
      } catch (e) {
        D.print("XXXX EXEC: Transaction failed: " # Error.message(e));
        #err("Transaction failed: " # Error.message(e));
      };
    };

    public func icrc149_send_eth_tx(_caller : Principal, eth_tx : MigrationTypes.Current.EthTx) : async {
      #Ok : Text;
      #Err : Text;
    } {
      D.print("💰 ETH_TX: ========== STARTING ETHEREUM TRANSACTION SEND ==========");
      D.print("💰 ETH_TX: Caller: " # Principal.toText(_caller));
      D.print("💰 ETH_TX: Chain ID: " # Nat.toText(eth_tx.chain.chain_id));
      D.print("💰 ETH_TX: To address: " # eth_tx.to);
      D.print("💰 ETH_TX: Value: " # Nat.toText(eth_tx.value));
      D.print("💰 ETH_TX: Gas limit: " # Nat.toText(eth_tx.gasLimit));
      D.print("💰 ETH_TX: Max fee per gas: " # Nat.toText(eth_tx.maxFeePerGas));
      D.print("💰 ETH_TX: Max priority fee per gas: " # Nat.toText(eth_tx.maxPriorityFeePerGas));
      D.print("💰 ETH_TX: Data length: " # Nat.toText(eth_tx.data.size()));
      D.print("💰 ETH_TX: Subaccount: " # debug_show (eth_tx.subaccount));
      D.print("💰 ETH_TX: Configured EVM RPC canister: " # Principal.toText(state.config.evm_rpc_canister_id));

      try {
        // Get the Ethereum address for this subaccount
        D.print("💰 ETH_TX: Step 1 - Getting Ethereum address for subaccount...");
        let ethAddress = await* getEthereumAddress(eth_tx.subaccount);
        D.print("💰 ETH_TX: Step 1 COMPLETE - Ethereum address: " # ethAddress);

        // Find appropriate RPC service for this chain
        D.print("💰 ETH_TX: Step 2 - Configuring RPC service...");
        let rpc_service = createRpcServiceWithLogging(eth_tx.chain.chain_id, state.config.evm_rpc_canister_id, "ETH_TX");
        D.print("💰 ETH_TX: Step 2 COMPLETE - RPC service type: " # rpc_service.rpc_type);
        D.print("💰 ETH_TX: Step 2 COMPLETE - RPC canister ID: " # Principal.toText(rpc_service.canister_id));

        // Create derivation path
        D.print("💰 ETH_TX: Step 3 - Creating derivation path...");
        let derivationPath = switch (eth_tx.subaccount) {
          case (?blob) [blob];
          case (null) [];
        };
        D.print("💰 ETH_TX: Step 3 COMPLETE - Derivation path length: " # Nat.toText(derivationPath.size()));

        // Use simple transaction execution
        D.print("💰 ETH_TX: Step 4 - Using simple transaction execution...");
        let result = await* executeEthereumTransaction(eth_tx, rpc_service, ethAddress, derivationPath);
        D.print("💰 ETH_TX: Step 4 RESULT - Simple transaction execution returned: " # debug_show (result));

        switch (result) {
          case (#Ok(txHash)) {
            D.print("💰 ETH_TX: ========== ETHEREUM TRANSACTION COMPLETED SUCCESSFULLY ==========");
            D.print("💰 ETH_TX: Final transaction hash: " # txHash);
            #Ok(txHash);
          };
          case (#Err(err)) {
            D.print("💰 ETH_TX: ========== ETHEREUM TRANSACTION FAILED ==========");
            D.print("💰 ETH_TX: Final error: " # err);
            #Err(err);
          };
        };

      } catch (e) {
        D.print("💰 ETH_TX: ========== ETHEREUM TRANSACTION EXCEPTION ==========");
        D.print("💰 ETH_TX: Exception: " # Error.message(e));
        #Err("Transaction failed: " # Error.message(e));
      };
    };

    private func compareVoteChoice(a : MigrationTypes.Current.VoteChoice, b : MigrationTypes.Current.VoteChoice) : Order.Order {
      func toNat(a : MigrationTypes.Current.VoteChoice) : Nat {
        switch (a) {
          case (#Yes) 1;
          case (#No) 2;
          case (#Abstain) 3;
        };
      };
      Nat.compare(toNat(a), toNat(b));
    };

    // ===== INDEX MANAGEMENT FUNCTIONS =====

    // Helper function to get the status of a proposal as a string
    private func getProposalStatus(proposal : ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>) : Text {
      switch (proposal.status) {
        case (#open) "open";
        case (#executing(_)) "pending";
        case (#executed(_)) "executed";
        case (#failedToExecute(_)) "rejected";
      };
    };

    // Helper function to get the action type as a string
    private func getActionType(content : MigrationTypes.Current.ProposalContent) : Text {
      switch (content.action) {
        case (#Motion(_)) "motion";
        case (#EthTransaction(_)) "eth_transaction";
        case (#ICPCall(_)) "icp_call";
      };
    };

    // Add proposal to all relevant indexes
    private func addProposalToIndexes(proposalId : Nat, proposal : ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>, content : MigrationTypes.Current.ProposalContent) {
      // Add to proposer index
      switch (BTree.get(state.proposalsByProposer, Principal.compare, proposal.proposerId)) {
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
      switch (BTree.get(state.proposalsByStatus, Text.compare, status)) {
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
      switch (BTree.get(state.proposalsByActionType, Text.compare, actionType)) {
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
    private func updateProposalIndexes(proposalId : Nat, oldProposal : ?ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>, newProposal : ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>, _content : MigrationTypes.Current.ProposalContent) {
      switch (oldProposal) {
        case (?old) {
          // Remove from old status index
          let oldStatus = getProposalStatus(old);
          switch (BTree.get(state.proposalsByStatus, Text.compare, oldStatus)) {
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
      switch (BTree.get(state.proposalsByStatus, Text.compare, newStatus)) {
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
      let allProposals = getProposalEngine().getProposals(10000, 0); // Get a large batch
      for (proposal in allProposals.data.vals()) {
        // Check if proposal exists in status index
        let currentStatus = getProposalStatus(proposal);
        switch (BTree.get(state.proposalsByStatus, Text.compare, currentStatus)) {
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

    // Debug function to get all addresses used by the canister
    public func debug_get_all_addresses(_caller : Principal) : async {
      #Ok : { treasury_address : Text; tx_specific_address : ?Text };
      #Err : Text;
    } {
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

    // ===== END COMPREHENSIVE DEBUGGING FUNCTIONS =====

    private func onProposalExecute(choice : ?MigrationTypes.Current.VoteChoice, proposal : ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>) : async* Result.Result<(), Text> {
      // Store the old proposal state for index updates
      let oldProposal = ?proposal;

      D.print("🏛️  PROPOSAL_EXECUTE: ========== STARTING PROPOSAL EXECUTION ==========");
      D.print("🏛️  PROPOSAL_EXECUTE: Proposal ID: " # Nat.toText(proposal.id));
      D.print("🏛️  PROPOSAL_EXECUTE: Winning choice: " # debug_show (choice));
      D.print("🏛️  PROPOSAL_EXECUTE: Proposal status: " # debug_show (proposal.status));
      D.print("🏛️  PROPOSAL_EXECUTE: Proposal content: " # debug_show (proposal.content));

      // Check if this proposal is already being executed
      switch (BTree.get(executingProposals, Nat.compare, proposal.id)) {
        case (?true) {
          D.print("🔒 PROPOSAL_EXECUTE: ERROR - Proposal " # Nat.toText(proposal.id) # " is already being executed, blocking concurrent attempt");
          return #err("Proposal is already being executed");
        };
        case (_) {
          // Mark this proposal as executing
          ignore BTree.insert(executingProposals, Nat.compare, proposal.id, true);
          D.print("🔒 PROPOSAL_EXECUTE: SUCCESS - Marked proposal " # Nat.toText(proposal.id) # " as executing");
        };
      };

      // Execute with try/catch to ensure lock cleanup on error
      D.print("🚀 PROPOSAL_EXECUTE: Starting execution logic...");
      let result = try {
        switch (choice) {
          case (?#Yes) {
            // Proposal passed, execute the action
            D.print("🚀 EXEC: Proposal passed with YES vote, executing action...");
            switch (proposal.content.action) {
              case (#Motion(_text)) {
                D.print("🚀 EXEC: Motion action - execution complete");
                #ok(); // Motion executed
              };
              case (#EthTransaction(eth_tx)) {
                D.print("🚀 EXEC: Ethereum transaction action - starting execution...");
                D.print("🚀 EXEC: Transaction to: " # eth_tx.to);
                D.print("🚀 EXEC: Transaction value: " # Nat.toText(eth_tx.value));
                D.print("🚀 EXEC: Transaction data length: " # Nat.toText(eth_tx.data.size()) # " " # debug_show (eth_tx.data));
                D.print("🚀 EXEC: Transaction gas limit: " # Nat.toText(eth_tx.gasLimit));
                D.print("🚀 EXEC: Transaction max fee per gas: " # Nat.toText(eth_tx.maxFeePerGas));
                D.print("🚀 EXEC: Transaction max priority fee per gas: " # Nat.toText(eth_tx.maxPriorityFeePerGas));
                D.print("🚀 EXEC: Transaction subaccount: " # debug_show (eth_tx.subaccount));
                D.print("🚀 EXEC: Transaction chain ID: " # Nat.toText(eth_tx.chain.chain_id));
                D.print("🚀 EXEC: Transaction configured EVM RPC canister: " # Principal.toText(state.config.evm_rpc_canister_id));
                D.print("🚀 EXEC: Transaction nonce: " # debug_show (eth_tx.nonce));
                D.print("🚀 EXEC: Transaction signature: " # debug_show (eth_tx.signature));

                D.print("🚀 EXEC: Adding Ethereum transaction to queue...");
                ignore addTransactionToQueue<system>(proposal.id, eth_tx);
                D.print("🚀 EXEC: ✅ Transaction added to queue successfully");

                // CRITICAL: End proposal immediately after queuing
                // This prevents duplicate execution on canister restart
                D.print("🚀 EXEC: Ending proposal " # Nat.toText(proposal.id) # " to prevent duplicates");
                let endResult = await* getProposalEngine().endProposal(proposal.id);
                D.print("🚀 EXEC: Proposal end result: " # debug_show (endResult));

                // CRITICAL: Save the updated proposal state to stable storage
                // This ensures the proposal status persists across canister restarts
                saveProposalEngineState();
                D.print("🚀 EXEC: Saved proposal engine state to stable storage");

                #ok();
              };
              case (#ICPCall(call)) {
                D.print("🚀 EXEC: ICP call action - starting execution...");
                D.print("🚀 EXEC: ICP call canister: " # Principal.toText(call.canister));
                D.print("🚀 EXEC: ICP call method: " # call.method);
                D.print("🚀 EXEC: ICP call cycles: " # Nat.toText(call.cycles));

                // Call the ICP canister method
                let icpResult = try {
                  switch (call.best_effort_timeout) {
                    case (?timeout) {
                      await (with timeout = timeout; cycles = call.cycles) ICPCall.call(call.canister, call.method, call.args);
                    };
                    case (null) {
                      await (with cycles = call.cycles) ICPCall.call(call.canister, call.method, call.args);
                    };
                  };

                } catch (e) {
                  let errorMsg = "ICP call failed: " # Error.message(e);
                  D.print("❌ EXEC: " # errorMsg);
                  call.result := ?#Err(errorMsg);
                  // Still need to end the proposal even on failure
                  D.print("🚀 EXEC: Ending proposal " # Nat.toText(proposal.id) # " after ICP call failure");
                  let endResult = await* getProposalEngine().endProposal(proposal.id);
                  D.print("🚀 EXEC: Proposal end result: " # debug_show (endResult));
                  saveProposalEngineState();
                  return #err(errorMsg);
                };

                call.result := ?#Ok(icpResult);
                D.print("✅ EXEC: ICP call completed successfully");

                // CRITICAL: End proposal after successful ICP call
                // This prevents duplicate execution on canister restart
                D.print("🚀 EXEC: Ending proposal " # Nat.toText(proposal.id) # " after successful ICP call");
                let endResult = await* getProposalEngine().endProposal(proposal.id);
                D.print("🚀 EXEC: Proposal end result: " # debug_show (endResult));

                // CRITICAL: Save the updated proposal state to stable storage
                // This ensures the proposal status persists across canister restarts
                saveProposalEngineState();
                D.print("🚀 EXEC: Saved proposal engine state to stable storage");

                #ok();
              };
            };
          };
          case (?#No or ?#Abstain or null) {
            D.print("🚀 EXEC: Proposal " # Nat.toText(proposal.id) # " rejected, abstained, or no majority - marking as complete");
            // Proposal rejected or no majority
            #ok();
          };
        };
      } catch (e) {
        // Clean up execution lock on error
        let deleteResult = BTree.delete(executingProposals, Nat.compare, proposal.id);
        D.print("🔓 PROPOSAL_EXECUTE: ❌ EXCEPTION CAUGHT - Removed execution lock for proposal " # Nat.toText(proposal.id) # " due to error: " # Error.message(e));
        D.print("🔓 PROPOSAL_EXECUTE: Lock deletion result: " # debug_show (deleteResult));
        return #err("Proposal execution failed: " # Error.message(e));
      };

      D.print("🚀 PROPOSAL_EXECUTE: Execution completed, result: " # debug_show (result));

      // Update indexes after execution status change
      D.print("🏛️  PROPOSAL_EXECUTE: Updating proposal indexes...");
      // Update indexes with the new proposal state
      updateProposalIndexes(proposal.id, oldProposal, proposal, proposal.content);
      D.print("🏛️  PROPOSAL_EXECUTE: ✅ Proposal indexes updated successfully");

      // Remove execution lock now that execution is complete
      D.print("🔓 PROPOSAL_EXECUTE: Removing execution lock for proposal " # Nat.toText(proposal.id) # "...");
      let deleteResult = BTree.delete(executingProposals, Nat.compare, proposal.id);
      D.print("🔓 PROPOSAL_EXECUTE: ✅ Execution lock removed - deletion result: " # debug_show (deleteResult));

      D.print("🏛️  PROPOSAL_EXECUTE: ========== PROPOSAL EXECUTION COMPLETE ==========");
      D.print("🏛️  PROPOSAL_EXECUTE: Final result: " # debug_show (result));

      result;
    };

    private func onProposalValidate(content : MigrationTypes.Current.ProposalContent) : async* Result.Result<(), [Text]> {
      // Validate proposal content
      switch (content.action) {
        case (#Motion(text)) {
          if (text == "") {
            #err(["Motion text cannot be empty"]);
          } else {
            #ok();
          };
        };
        case (#EthTransaction(eth_tx)) {
          if (eth_tx.to == "") {
            #err(["Transaction 'to' address cannot be empty"]);
          } else {
            #ok();
          };
        };
        case (#ICPCall(call)) {
          if (call.canister == Principal.fromText("aaaaa-aa")) {
            #err(["Invalid ICP canister ID"]);
          } else if (call.method == "") {
            #err(["ICP method cannot be empty"]);
          } else {
            #ok();
          };
        };
      };
    };

    private var engineRef : ?ExtendedProposalEngine.ProposalEngine<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice> = null;

    // Proposal engine will be initialized after function definitions
    private var proposalEngine : ?ExtendedProposalEngine.ProposalEngine<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice> = null;

    // Helper function to get the proposal engine safely
    private func getProposalEngine() : ExtendedProposalEngine.ProposalEngine<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice> {
      switch (proposalEngine) {
        case (?engine) engine;
        case (null) D.trap("Proposal engine not initialized");
      };
    };

    // Helper function to reinitialize proposal engine with new duration
    private func reinitializeProposalEngine<system>() {
      // Update proposal duration based on config
      let updatedEngineData = {
        state.proposalEngine with
        proposalDuration = ?#nanoseconds(state.config.proposal_duration_days);
      };

      let eng = ExtendedProposalEngine.ProposalEngine<system, MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>(
        updatedEngineData,
        onProposalExecute,
        onProposalValidate,
        compareVoteChoice,
      );
      engineRef := ?eng;
      proposalEngine := ?eng;
    };

    ///////////
    // ICRC-149 Implementation
    //////////

    // Translation functions between ExtendedProposalEngine types and Service types
    private func translateProposalStatusToService(engineStatus : ExtendedProposalEngine.ProposalStatus<MigrationTypes.Current.VoteChoice>) : {
      #open;
      #executing;
      #executed;
      #failed;
    } {
      switch (engineStatus) {
        case (#open) #open;
        case (#executing(_)) #executing;
        case (#executed(_)) #executed;
        case (#failedToExecute(_)) #failed;
      };
    };

    private func translateProposalToService(engineProposal : ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>) : Service.Proposal {
      {
        id = engineProposal.id;
        proposer = engineProposal.proposerId;
        action = shareProposalAction(engineProposal.content.action);
        created_at = Int.abs(engineProposal.timeStart);
        snapshot = BTree.get(state.snapshots, Nat.compare, engineProposal.id); // Look up actual snapshot data
        deadline = switch (engineProposal.timeEnd) {
          case (?endTime) Int.abs(endTime);
          case (null) Int.abs(engineProposal.timeStart) + (7 * 24 * 60 * 60 * 1_000_000_000); // Default 7 days
        };
        metadata = engineProposal.content.metadata;
        status = translateProposalStatusToService(engineProposal.status);
      };
    };

    // Convert ExtendedProposalEngine vote choice to Service vote choice
    private func translateVoteChoiceToService(choice : ?MigrationTypes.Current.VoteChoice) : {
      #Yes;
      #No;
      #Abstain;
    } {
      switch (choice) {
        case (?#Yes) #Yes;
        case (?#No) #No;
        case (?#Abstain or null) #Abstain;
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
    public func icrc149_update_snapshot_contract_config(_caller : Principal, contract_address : Text, config : ?MigrationTypes.Current.SnapshotContractConfig) : {
      #Ok : ();
      #Err : Text;
    } {
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
    public func icrc149_update_execution_contract_config(_caller : Principal, contract_address : Text, config : ?MigrationTypes.Current.ExecutionContractConfig) : {
      #Ok : ();
      #Err : Text;
    } {
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
    public func icrc149_update_icp_method_config(_caller : Principal, canister : Principal, method : Text, config : ?MigrationTypes.Current.ICPMethodConfig) : {
      #Ok : ();
      #Err : Text;
    } {
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
    public func icrc149_update_admin_principal(_caller : Principal, principal : Principal, is_admin : Bool) : {
      #Ok : ();
      #Err : Text;
    } {
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
    public func icrc149_update_evm_rpc_canister(_caller : Principal, canister_id : Principal) : {
      #Ok : ();
      #Err : Text;
    } {
      if (not BTree.has(state.config.admin_principals, Principal.compare, _caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };

      state.config.evm_rpc_canister_id := canister_id;
      #Ok(());
    };

    // Admin function to set/unset default snapshot contract
    public func icrc149_set_default_snapshot_contract(_caller : Principal, contract_address : ?Text) : {
      #Ok : ();
      #Err : Text;
    } {
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

    // Admin function to update proposal duration in nanoseconds
    public func icrc149_update_proposal_duration<system>(_caller : Principal, duration_nanoseconds : Nat) : {
      #Ok : ();
      #Err : Text;
    } {
      if (not BTree.has(state.config.admin_principals, Principal.compare, _caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };

      // Validate duration (must be positive and reasonable)
      if (duration_nanoseconds == 0) {
        return #Err("Duration must be positive");
      };

      // Check maximum duration (365 days in nanoseconds)
      let nanoseconds_per_day : Nat = 86_400_000_000_000;
      let max_duration_nanoseconds : Nat = 365 * nanoseconds_per_day;
      if (duration_nanoseconds > max_duration_nanoseconds) {
        return #Err("Duration cannot exceed 365 days");
      };

      // Store nanoseconds directly for precision
      state.config.proposal_duration_days := duration_nanoseconds;

      // Update the stored proposal engine data for next restart
      state.proposalEngine := {
        state.proposalEngine with
        proposalDuration = ?#nanoseconds(duration_nanoseconds);
      };

      // Reinitialize the proposal engine immediately with the new duration
      reinitializeProposalEngine<system>();

      let duration_days_display = duration_nanoseconds / nanoseconds_per_day;
      D.print("📅 ADMIN: Updated proposal duration to " # Nat.toText(duration_nanoseconds) # " nanoseconds (" # Nat.toText(duration_days_display) # " days)");
      D.print("✅ New duration is now active for all future proposals");

      #Ok(());
    };

    // TEST FUNCTION: Make 3 parallel RPC calls to test hanging issue
    public func test_parallel_rpc_calls(_caller : Principal, rpc_canister_id : Principal) : async {
      #Ok : (Nat, Nat, Nat);
      #Err : Text;
    } {
      D.print("🧪 TEST: Starting 3 simple parallel block requests");

      // Use centralized RPC service creation for testing
      let rpc_service = createRpcServiceWithLogging(31337, rpc_canister_id, "TEST");

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
          await (with cycles = 127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Latest);
        };

        // Call 2: Get block 0 (genesis)
        D.print("📞 RPC Call 2: eth_getBlockByNumber(0)");
        let call2 = async {
          await (with cycles = 127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Number(0));
        };

        // Call 3: Get block 1
        D.print("📞 RPC Call 3: eth_getBlockByNumber(1)");
        let call3 = async {
          await (with cycles = 127817059200) rpcActor.eth_getBlockByNumber(rpcServices, config, #Number(1));
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
    public func icrc149_proposal_snapshot(proposal_id : Nat) : MigrationTypes.Current.ProposalSnapshot {
      switch (BTree.get(state.snapshots, Nat.compare, proposal_id)) {
        case (?snapshot) snapshot;
        case (null) {
          D.trap("Proposal snapshot not found for proposal " # Nat.toText(proposal_id));
        };
      };
    };

    // SIWE Authentication with proper anti-replay protection
    public func icrc149_verify_siwe(siwe : MigrationTypes.Current.SIWEProof) : MigrationTypes.Current.SIWEResult {
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
      var vote_choice : Text = "";
      var proposal_id_nat : Nat = 0;
      var contract_address : Text = "";

      // Check if this is a voting statement or proposal creation statement
      if (Text.startsWith(statement, #text("Vote "))) {
        D.print("🗳️  SIWE: Processing voting statement");
        // Extract vote choice, proposal ID, and contract address from voting statement
        let (parsed_choice, parsed_id, parsed_contract) = switch (parseVotingStatement(statement)) {
          case (#Ok(result)) {
            D.print("✅ SIWE: Successfully parsed voting statement");
            result;
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
        let lastIndex : Nat = partsArray.size() - 1;
        for (i in Iter.range(0, lastIndex)) {
          if (i < lastIndex and partsArray[i] == "contract") {
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
      var chain_id_nat : Nat = 0;
      var nonce_text : Text = "";
      var issued_at_nat : Nat = 0;
      var issued_at_iso : Text = "";
      var expiration_time_nat : Nat = 0;
      var expiration_time_iso : Text = "";

      D.print("🔍 SIWE: Parsing metadata fields from " # Nat.toText(lineArray.size()) # " lines");

      for (line in lineArray.vals()) {
        if (Text.startsWith(line, #text("Chain ID: "))) {
          let chainIdText = Text.replace(line, #text("Chain ID: "), "");
          chain_id_nat := switch (Nat.fromText(chainIdText)) {
            case (?n) {
              D.print("✅ SIWE: Chain ID: " # Nat.toText(n));
              n;
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
              n;
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
              n;
            };
            case null {
              D.print("❌ SIWE: Invalid Expiration Nanos: " # expirationNanosText);
              return #Err("Invalid Expiration Nanos format");
            };
          };
        };
      };
      let isoFormat = "YYYY-MM-DDTHH:mm:ss.sssZ";
      let expiration = if (expiration_time_nat < 1) {
        let ?expiration = DateTime.fromText(expiration_time_iso, isoFormat) else return #Err("Invalid Expiration Time ISO format: " # expiration_time_iso);
        expiration;
      } else DateTime.DateTime(expiration_time_nat);

      let issuedAt = if (issued_at_nat < 1) {
        let ?issuedAt = DateTime.fromText(issued_at_iso, isoFormat) else return #Err("Invalid Issued At ISO format: " # issued_at_iso);
        issuedAt;
      } else DateTime.DateTime(issued_at_nat);

      // Validate time window (must be within 10 minutes = 600 seconds = 600_000_000_000 nanoseconds)
      let currentTime = DateTime.now();
      let maxWindowNanos = 600_000_000_000; // 10 minutes in nanoseconds
      let maxExpiration = currentTime.add(#nanoseconds(maxWindowNanos));

      D.print("🕐 SIWE: Time validation - Current: " # currentTime.toText() # ", Expiration: " # expiration.toText() # ", IssuedAt: " # issuedAt.toText());

      if (issuedAt.compare(currentTime) == #greater) {
        D.print("❌ SIWE: Message has been issued in the future");
        return #Err("SIWE message has been issued in the future");
      };

      if (expiration.compare(currentTime) == #less) {
        D.print("❌ SIWE: Message has expired");
        return #Err("SIWE message has expired");
      };

      if (expiration.compare(maxExpiration) == #greater) {
        D.print("❌ SIWE: Expiration time too far in future");
        return #Err("SIWE message expiration time too far in future");
      };

      if (expiration.compare(issuedAt) == #greater and (expiration.toTime() - issuedAt.toTime()) > maxWindowNanos) {
        D.print("❌ SIWE: Time window exceeds 10 minutes");
        return #Err("SIWE message time window exceeds 10 minutes");
      };

      D.print("✅ SIWE: Time validation passed");

      // Real signature verification - NO BYPASS
      D.print("🔐 SIWE: Starting signature verification");
      switch (verifySiweSignature(siwe.message, siwe.signature, address)) {
        case (#Err(err)) {
          D.print("❌ SIWE signature verification failed: " # debug_show (err));
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
    private func parseVotingStatement(statement : Text) : {
      #Ok : (Text, Nat, Text);
      #Err : Text;
    } {
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
        case null { return #Err("Invalid proposal ID format") };
      };

      #Ok((vote_choice, proposal_id, contract_address));
    };

    // CRITICAL: Real SIWE signature verification - NO MOCKING ALLOWED
    private func verifySiweSignature(message : Text, signature : Blob, expectedAddress : Text) : {
      #Ok : ();
      #Err : Text;
    } {
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
    private func hashSiweMessage(message : Text) : Blob {
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
          Blob.toArray(lengthBytes),
        ),
        Blob.toArray(messageBytes),
      );

      // CRITICAL: Use Keccak256, not SHA256, for Ethereum message hashing
      let keccak = SHA3.Keccak(256);
      keccak.update(combinedBytes);
      let hashBytes = keccak.finalize();
      Blob.fromArray(hashBytes);
    };

    // Helper function to recover ECDSA public key from signature
    private func recoverEcdsaPublicKey(messageHash : Blob, r : Blob, s : Blob, v : Nat8) : {
      #Ok : Blob;
      #Err : Text;
    } {
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
    private func tryRecoveryWithId(messageArray : [Nat8], rArray : [Nat8], sArray : [Nat8], recoveryId : Nat8) : {
      #Ok : Blob;
      #Err : Text;
    } {
      // Create signature object
      let signature = switch (Signature.parse_standard(Array.append(rArray, sArray))) {
        case (#ok(sig)) sig;
        case (#err(err)) return #Err("Failed to create signature: " # debug_show (err));
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
        case (#err(err)) return #Err("Failed to recover public key: " # debug_show (err));
      };

      // Convert public key to bytes (uncompressed format)
      let pubKeyBytes = publicKey.serialize();
      #Ok(Blob.fromArray(pubKeyBytes));
    };

    // Helper function to derive Ethereum address from public key
    private func deriveEthereumAddressFromPublicKey(publicKey : Blob) : Text {
      // CRITICAL: This implements real address derivation using Keccak256
      // Ethereum address = last 20 bytes of keccak256(publicKey)

      let pubKeyArray = Blob.toArray(publicKey);

      // For uncompressed public key, skip the first byte (0x04 prefix) and use the remaining 64 bytes
      let pubKeyData = if (pubKeyArray.size() == 65 and pubKeyArray[0] == 0x04) {
        Array.subArray(pubKeyArray, 1, 64); // Skip 0x04 prefix
      } else if (pubKeyArray.size() == 64) {
        pubKeyArray; // Already without prefix
      } else {
        // Invalid public key format
        return "0x0000000000000000000000000000000000000000";
      };

      // Calculate Keccak256 hash of the public key (64 bytes)
      let keccak = SHA3.Keccak(256);
      keccak.update(pubKeyData);
      let hashArray = keccak.finalize();

      // Take the last 20 bytes as the Ethereum address
      let startIndex : Nat = hashArray.size() - 20;
      let addressBytes = Array.subArray(hashArray, startIndex, 20);

      // Convert to hex string with 0x prefix
      BaseX.toHex(addressBytes.vals(), { isUpper = true; prefix = #single("0x") });
    };

    // Helper function to normalize Ethereum addresses for comparison
    private func normalizeEthereumAddress(address : Text) : Text {
      // Convert to lowercase and ensure 0x prefix
      let cleanAddr = if (Text.startsWith(address, #text("0x"))) {
        Text.trimStart(address, #text("0x"));
      } else {
        address;
      };
      "0x" # Text.map(
        cleanAddr,
        func(c : Char) : Char {
          switch (c) {
            case ('A') 'a';
            case ('B') 'b';
            case ('C') 'c';
            case ('D') 'd';
            case ('E') 'e';
            case ('F') 'f';
            case (_) c;
          };
        },
      );
    };

    // Helper function to convert Ethereum address hex string to 20-byte blob
    private func ethereumAddressToBlob(address : Text) : Result.Result<Blob, Text> {
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
          case (
            '0' or '1' or '2' or '3' or '4' or '5' or '6' or '7' or '8' or '9' or
            'a' or 'b' or 'c' or 'd' or 'e' or 'f' or
            'A' or 'B' or 'C' or 'D' or 'E' or 'F'
          ) {};
          case (_) {
            return #err("Invalid hex character in Ethereum address: " # Text.fromChar(char));
          };
        };
      };

      let chars = Text.toArray(cleanHex);
      let bytes = Array.tabulate<Nat8>(
        20,
        func(i) {
          // Exactly 20 bytes
          let highChar = chars[i * 2];
          let lowChar = chars[i * 2 + 1];

          let high = switch (highChar) {
            case ('0') 0;
            case ('1') 1;
            case ('2') 2;
            case ('3') 3;
            case ('4') 4;
            case ('5') 5;
            case ('6') 6;
            case ('7') 7;
            case ('8') 8;
            case ('9') 9;
            case ('a' or 'A') 10;
            case ('b' or 'B') 11;
            case ('c' or 'C') 12;
            case ('d' or 'D') 13;
            case ('e' or 'E') 14;
            case ('f' or 'F') 15;
            case (_) 0;
          };
          let low = switch (lowChar) {
            case ('0') 0;
            case ('1') 1;
            case ('2') 2;
            case ('3') 3;
            case ('4') 4;
            case ('5') 5;
            case ('6') 6;
            case ('7') 7;
            case ('8') 8;
            case ('9') 9;
            case ('a' or 'A') 10;
            case ('b' or 'B') 11;
            case ('c' or 'C') 12;
            case ('d' or 'D') 13;
            case ('e' or 'E') 14;
            case ('f' or 'F') 15;
            case (_) 0;
          };
          Nat8.fromNat(high * 16 + low);
        },
      );

      #ok(Blob.fromArray(bytes));
    };

    // Helper function to convert Ethereum address to Principal for voting
    private func ethereumAddressToPrincipal(address : Text) : Principal {
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
    public func icrc149_verify_witness(witness : MigrationTypes.Current.Witness, proposal_id : ?Nat) : MigrationTypes.Current.WitnessResult {
      // Convert witness to format expected by WitnessValidator
      let serviceWitness : Service.Witness = {
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
    private func icrc149_verify_witness_with_stored_state(witness : Service.Witness, proposal_id : ?Nat) : MigrationTypes.Current.WitnessResult {
      // 1. Verify contract is approved by looking up stored configuration
      let contractAddress = normalizeEthereumAddress(blobToHex(witness.contractAddress));

      // Find the contract config by normalizing all stored addresses for comparison
      var contractConfig : ?MigrationTypes.Current.SnapshotContractConfig = null;
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
              let matchingSnapshot = Array.find<(Nat, MigrationTypes.Current.ProposalSnapshot)>(
                snapshots,
                func((pid, snapshot)) {
                  snapshot.block_number == witness.blockNumber;
                },
              );
              switch (matchingSnapshot) {
                case (null) {
                  return #Err("No stored snapshot found for block number " # Nat.toText(witness.blockNumber));
                };
                case (?(_, snapshot)) { snapshot.state_root };
              };
            };
          };

          // 3. Build validation configuration using stored trusted data
          let config : WitnessValidator.ProofValidationConfig = {
            expectedStateRoot = stateRoot; // Use stored trusted state root
            expectedContractAddress = witness.contractAddress; // Contract address can be from witness (verified above)
            expectedUserAddress = witness.userAddress; // User address is what we're validating
            expectedStorageSlot = switch contractConfig {
              case (?cfg) cfg.balance_storage_slot;
              case null D.trap("No contract config found when validating witness");
            }; // Use configured storage slot
            chainId = switch (contractConfig) {
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
    private func blobToHex(blob : Blob) : Text {
      let bytes = Blob.toArray(blob);
      var hex = "0x";
      for (byte in bytes.vals()) {
        hex := hex # natToHex(Nat8.toNat(byte), 2);
      };
      hex;
    };

    // Helper function to convert Nat to hex string with padding
    private func natToHex(n : Nat, minDigits : Nat) : Text {
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
      result;
    };

    // Create proposal (using real-time proposal for Ethereum DAO)
    public func icrc149_create_proposal(caller : Principal, proposal_args : Service.CreateProposalRequest) : async* {
      #Ok : Nat;
      #Err : Text;
    } {

      if (not BTree.has(state.config.admin_principals, Principal.compare, caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };

      // Verify SIWE first to authenticate the proposal creator
      switch (icrc149_verify_siwe(proposal_args.siwe)) {
        case (#Err(err)) return #Err("SIWE verification failed: " # err);
        case (#Ok(siwe_result)) {
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
      var snapshot_contract_config : ?MigrationTypes.Current.SnapshotContractConfig = null;
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

      // Validate EthTransaction actions against approved execution contracts
      let actionItem : ProposalAction = switch (proposal_args.action) {
        case (#EthTransaction(eth_tx)) {
          // Find execution contract by normalizing addresses for comparison
          let normalizedToAddress = normalizeEthereumAddress(eth_tx.to);
          var execution_contract_config : ?MigrationTypes.Current.ExecutionContractConfig = null;
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
          #Motion(a);
        };
        case (#ICPCall(call)) {
          // ICP calls don't require execution contract validation
          #ICPCall({
            call with
            var result : ?{
              #Err : Text;
              #Ok : Blob;
            } = null; // Result will be set after proposal execution
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

      // DEBUG: Log the snapshot contract configuration being used
      D.print("🎯 PROPOSAL_CREATE: ========== SNAPSHOT CONFIG DEBUG ==========");
      D.print("🎯 PROPOSAL_CREATE: Contract address: " # final_snapshot_contract_config.contract_address);
      D.print("🎯 PROPOSAL_CREATE: Chain ID: " # Nat.toText(final_snapshot_contract_config.chain.chain_id));
      D.print("🎯 PROPOSAL_CREATE: Chain network name: " # final_snapshot_contract_config.chain.network_name);
      D.print("🎯 PROPOSAL_CREATE: RPC service type: " # final_snapshot_contract_config.rpc_service.rpc_type);
      D.print("🎯 PROPOSAL_CREATE: RPC canister ID: " # Principal.toText(final_snapshot_contract_config.rpc_service.canister_id));
      D.print("🎯 PROPOSAL_CREATE: Custom config: " # debug_show (final_snapshot_contract_config.rpc_service.custom_config));

      // Create snapshot for this proposal using the specified snapshot contract
      // Get latest finalized block from RPC
      let blockResult = await* getLatestFinalizedBlock(final_snapshot_contract_config.rpc_service, final_snapshot_contract_config.chain);
      let (block_number, state_root, total_supply) = switch (blockResult) {
        case (#ok(block)) {
          // Validate and convert state root hex string to Blob
          if (not validateStateRoot(block.stateRoot)) {
            return #Err("Invalid state root format from block " # Nat.toText(block.number) # ": " # block.stateRoot);
          };

          switch (Utils.hexStringToBlob(block.stateRoot)) {
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
      let result = await* getProposalEngine().createProposal<system>(
        caller,
        content,
        [], // No initial members - they will be added as they vote
        #dynamic({ totalVotingPower = null }),
      );

      D.print("🏁 PROPOSAL_CREATE: getProposalEngine().createProposal call completed");

      switch (result) {
        case (#ok(proposal_id)) {
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
          switch (getProposalEngine().getProposal(proposal_id)) {
            case (?proposal) {
              addProposalToIndexes(proposal_id, proposal, content);
            };
            case (null) {
              // This shouldn't happen since we just created the proposal
              D.print("Warning: Could not find proposal " # Nat.toText(proposal_id) # " for indexing");
            };
          };

          D.print("🏁 PROPOSAL_CREATE: Successfully created proposal with ID: saving engine state " # Nat.toText(proposal_id));

          saveProposalEngineState();
          #Ok(proposal_id);
        };
        case (#err(err)) {
          D.print("❌ PROPOSAL_CREATE: " # debug_show (err));
          switch (err) {

            case (#notEligible) #Err("Caller not eligible to create proposals");
            case (#invalid(errors)) #Err("Invalid proposal: " # Text.join(", ", errors.vals()));
          };
        };
      };
    };

    // Vote on proposal
    public func icrc149_vote_proposal(caller : Principal, vote_args : MigrationTypes.Current.VoteArgs) : async* {
      #Ok : ();
      #Err : Text;
    } {
      D.print("🗳️  VOTE_START: Beginning vote processing for proposal " # Nat.toText(vote_args.proposal_id));
      D.print("🗳️  VOTE_START: Caller principal: " # Principal.toText(caller));
      D.print("🗳️  VOTE_START: Voter address: " # blobToHex(vote_args.voter));

      // Get current proposal state before voting
      D.print("🗳️  VOTE_STEP_1: Getting current proposal state...");
      let oldProposal = getProposalEngine().getProposal(vote_args.proposal_id);
      D.print("🗳️  VOTE_STEP_1: Retrieved proposal state: " # (switch (oldProposal) { case (?_) "exists"; case (null) "not found" }));

      // Verify SIWE first
      D.print("🗳️  VOTE_STEP_2: Starting SIWE verification...");
      switch (icrc149_verify_siwe(vote_args.siwe)) {
        case (#Err(err)) {
          D.print("🗳️  VOTE_ERROR: SIWE verification failed: " # err);
          return #Err("SIWE verification failed: " # err);
        };
        case (#Ok(siwe_result)) {
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
      switch (icrc149_verify_witness(vote_args.witness, ?vote_args.proposal_id)) {
        case (#Err(err)) {
          D.print("🗳️  VOTE_ERROR: Witness verification failed: " # err);
          return #Err("Witness verification failed: " # err);
        };
        case (#Ok(witness_result)) {
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
          D.print("🗳️  VOTE_STEP_5: Converting Ethereum address to Principal for voting..." # debug_show (vote_args.voter) # " " # voterEthAddress);
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
          let result2 = getProposalEngine().addMember(vote_args.proposal_id, member);
          D.print("🗳️  VOTE_STEP_6: Member addition completed");

          D.print("result of add member" # debug_show (result2));

          // Cast the vote using the Ethereum-derived Principal
          D.print("🗳️  VOTE_STEP_7: Casting vote with choice..." # debug_show (vote_args.choice));
          D.print("🗳️  VOTE_STEP_7: About to call getProposalEngine().vote() with voter principal...");

          let result = await* getProposalEngine().vote(vote_args.proposal_id, voterPrincipal, vote_args.choice);
          D.print("🗳️  VOTE_STEP_7: getProposalEngine().vote() returned" # debug_show (result));

          switch (result) {
            case (#ok(_)) {
              D.print("🗳️  VOTE_STEP_8: Vote cast successfully, checking for proposal status changes...");
              // Check if proposal status changed after voting
              switch (getProposalEngine().getProposal(vote_args.proposal_id)) {
                case (?newProposal) {
                  D.print("🗳️  VOTE_STEP_8: Updating proposal indexes...");
                  D.print("🗳️  VOTE_STEP_8: Old proposal state: " # debug_show (oldProposal));
                  D.print("🗳️  VOTE_STEP_8: New proposal state: " # debug_show (newProposal));

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
            case (#err(err)) {
              D.print("🗳️  VOTE_ERROR: Vote casting failed with error: " # debug_show (err));
              switch (err) {
                case (#proposalNotFound) {
                  D.print("🗳️  VOTE_ERROR: proposalNotFound");
                  #Err("Proposal not found");
                };
                case (#notEligible) {
                  D.print("🗳️  VOTE_ERROR: notEligible");
                  #Err("Not eligible to vote on this proposal");
                };
                case (#alreadyVoted) {
                  D.print("🗳️  VOTE_ERROR: alreadyVoted");
                  #Err("Already voted on this proposal");
                };
                case (#votingClosed) {
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
    public func icrc149_tally_votes(proposal_id : Nat) : MigrationTypes.Current.TallyResult {
      D.print("Tallying votes for proposal ID: " # Nat.toText(proposal_id));

      // Get the proposal to check its status
      let ?proposal = getProposalEngine().getProposal(proposal_id) else {
        return {
          yes = 0;
          no = 0;
          abstain = 0;
          total = 0;
          result = "Not Found";
        };
      };

      // Check if proposal is still active/open
      let isActive = switch (proposal.status) {
        case (#open) true;
        case (#executing(_)) true; // Still considered active during execution
        case (#executed(_)) false;
        case (#failedToExecute(_)) false;
      };

      let summary = getProposalEngine().buildVotingSummary(proposal_id);

      D.print("📊 Vote summary - Total voting power: " # Nat.toText(summary.totalVotingPower));
      D.print("📊 Vote summary - Undecided voting power: " # Nat.toText(summary.undecidedVotingPower));
      D.print("📊 Vote summary - Number of choice entries: " # Nat.toText(summary.votingPowerByChoice.size()));

      var yes_count = 0;
      var no_count = 0;
      var abstain_count = 0;

      for (choice_power in summary.votingPowerByChoice.vals()) {
        D.print("📊 Processing choice with voting power: " # Nat.toText(choice_power.votingPower));
        switch (choice_power.choice) {
          case (#Yes) {
            D.print("📊 Adding " # Nat.toText(choice_power.votingPower) # " to Yes votes");
            yes_count := choice_power.votingPower;
          };
          case (#No) {
            D.print("📊 Adding " # Nat.toText(choice_power.votingPower) # " to No votes");
            no_count := choice_power.votingPower;
          };
          case (#Abstain) {
            D.print("📊 Adding " # Nat.toText(choice_power.votingPower) # " to Abstain votes");
            abstain_count := choice_power.votingPower;
          };
        };
      };

      // If proposal is still active, show "Pending", otherwise show actual result
      let result = if (isActive) {
        "Pending";
      } else if (yes_count > no_count) {
        "Passed";
      } else {
        "Failed";
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
      switch (proposalEngine) {
        case (?engine) {
          state.proposalEngine := engine.toStableData();
          //storageChanged(#v0_1_0(#data(state)));
        };
        case (null) {
          D.print("⚠️  SAVE: Proposal engine not initialized, cannot save state");
        };
      };
    };

    // Initialize the proposal engine after all function definitions
    proposalEngine := do {
      // Update proposal duration based on config
      let updatedEngineData = {
        state.proposalEngine with
        proposalDuration = ?#nanoseconds(state.config.proposal_duration_days);
      };

      let eng = ExtendedProposalEngine.ProposalEngine<system, MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>(
        updatedEngineData,
        onProposalExecute,
        onProposalValidate,
        compareVoteChoice,
      );
      engineRef := ?eng;
      ?eng;
    };

    // Service-compatible helper functions that translate types
    public func icrc149_get_proposal_service(id : Nat) : ?Service.Proposal {
      switch (getProposalEngine().getProposal(id)) {
        case (?proposal) {
          ?translateProposalToService(proposal);
        };
        case (null) null;
      };
    };

    // Enhanced proposal getter that includes tally information
    public func icrc149_get_proposals(prev : ?Nat, take : ?Nat, filters : [Service.ProposalInfoFilter]) : [Service.ProposalWithTally] {
      // Sync indexes to ensure they're up to date
      syncProposalIndexes();

      let limit = switch (take) { case (?t) t; case (null) 10 };

      // Get candidate proposal IDs based on filters
      var candidateIds : [Nat] = [];

      if (filters.size() == 0) {
        // No filters - get all proposals chronologically
        let chronEntries = BTree.entries(state.proposalsChronological);
        candidateIds := Array.map<(Nat, Nat), Nat>(Iter.toArray(chronEntries), func((timestamp, id)) = id);
      } else {
        // Apply filters and get intersection of results
        var filteredSets : [BTree.BTree<Nat, Bool>] = [];

        label statusFilterLoop for (filter in filters.vals()) {
          switch (filter) {
            case (#by_id(id)) {
              // For by_id filter, create a single-item set
              let singleSet = BTree.init<Nat, Bool>(?8);
              ignore BTree.insert(singleSet, Nat.compare, id, true);
              filteredSets := Array.append(filteredSets, [singleSet]);
            };
            case (#by_proposer(proposer)) {
              switch (BTree.get(state.proposalsByProposer, Principal.compare, proposer)) {
                case (?proposerSet) filteredSets := Array.append(filteredSets, [proposerSet]);
                case (null) {
                  // No proposals from this proposer - return empty
                  return [];
                };
              };
            };
            case (#by_status(statusFilter)) {
              let statusString = switch (statusFilter) {
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
              switch (BTree.get(state.proposalsByStatus, Text.compare, statusString)) {
                case (?statusSet) filteredSets := Array.append(filteredSets, [statusSet]);
                case (null) {
                  // No proposals with this status - return empty
                  return [];
                };
              };
            };
            case (#by_action_type(actionFilter)) {
              let actionString = switch (actionFilter) {
                case (#motion) "motion";
                case (#eth_transaction) "eth_transaction";
                case (#any) {
                  // Skip this filter for #any
                  continue statusFilterLoop;
                };
              };
              switch (BTree.get(state.proposalsByActionType, Text.compare, actionString)) {
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
      let startIndex = switch (prev) {
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
      let proposals = Array.mapFilter<Nat, Service.ProposalWithTally>(
        paginatedIds,
        func(id) {
          switch (getProposalEngine().getProposal(id)) {
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
                status = serviceProposal.status;
                tally = tally;
              };
            };
            case (null) null;
          };
        },
      );

      proposals;
    };

    // Helper function to intersect multiple proposal sets
    private func intersectProposalSets(sets : [BTree.BTree<Nat, Bool>]) : [Nat] {
      if (sets.size() == 0) return [];
      if (sets.size() == 1) {
        let entries = BTree.entries(sets[0]);
        return Array.map<(Nat, Bool), Nat>(Iter.toArray(entries), func((id, _)) = id);
      };

      // Start with first set
      var result : [Nat] = [];
      let firstEntries = BTree.entries(sets[0]);

      for ((id, _) in firstEntries) {
        // Check if this ID exists in all other sets
        var existsInAll = true;
        label checkAllSetsLoop for (i in Iter.range(1, sets.size() - 1)) {
          switch (BTree.get(sets[i], Nat.compare, id)) {
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

      result;
    };

    // Legacy function (for backward compatibility)
    public func icrc149_get_proposals_service_legacy(start : ?Nat, limit : ?Nat) : [Service.Proposal] {
      let offset = switch (start) { case (?s) s; case (null) 0 };
      let count = switch (limit) { case (?l) l; case (null) 10 };

      let result = getProposalEngine().getProposals(count, offset);
      Array.map<ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>, Service.Proposal>(result.data, translateProposalToService);
    }; // Raw helper functions (for debugging/advanced use)
    public func icrc149_get_proposal_raw(proposal_id : Nat) : ?ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice> {
      getProposalEngine().getProposal(proposal_id);
    };

    public func icrc149_get_proposals_raw(count : Nat, offset : Nat) : ExtendedProposalEngine.PagedResult<ExtendedProposalEngine.Proposal<MigrationTypes.Current.ProposalContent, MigrationTypes.Current.VoteChoice>> {
      getProposalEngine().getProposals(count, offset);
    };

    // Execute proposal
    public func icrc149_execute_proposal(_caller : Principal, proposal_id : Nat) : async {
      #Ok : Text;
      #Err : Text;
    } {
      let ?proposal = getProposalEngine().getProposal(proposal_id) else return #Err("Proposal not found");
      let oldProposal = ?proposal;

      D.print("Executing proposal " # Nat.toText(proposal_id) # " with status: " # debug_show (proposal.status));

      // Check if proposal can be executed by examining its status
      switch (proposal.status) {
        case (#open) {
          // Try to end the proposal first
          let end_result = await* getProposalEngine().endProposal(proposal_id);
          Debug.print("Proposal end result: " # debug_show (end_result));
          switch (end_result) {
            case (#ok(_)) {
              // Proposal ended successfully, update indexes with new status

              D.print("Proposal ended successfully, updating indexes...");
              switch (getProposalEngine().getProposal(proposal_id)) {
                case (?newProposal) {
                  D.print("Executing proposal new status" # Nat.toText(proposal_id) # " with status: " # debug_show (proposal.status));
                  updateProposalIndexes(proposal_id, oldProposal, newProposal, newProposal.content);
                  saveProposalEngineState();
                };
                case (null) {};
              };
              #Ok("Proposal executed successfully");
            };
            case (#err(#alreadyEnded)) {
              #Err("Proposal voting period has already ended");
            };
          };
        };
        case (#executing(_)) #Err("Proposal is currently being executed");
        case (#executed(details)) {
          D.print("Proposal execution completed with details: " # debug_show (details));
          switch (details.choice) {
            case (?#Yes) #Ok("Proposal was already executed successfully");
            case (_) #Err("Proposal was rejected or failed to pass");
          };
        };
        case (#failedToExecute(details)) #Err("Proposal execution failed: " # details.error);
      };
    };

    // Admin
    public func icrc149_set_controller(_caller : Principal, _new_controller : Principal) : {
      #Ok : ();
      #Err : Text;
    } {
      // TODO: Implement proper access control
      // For now, allow anyone to set controller (not secure)
      #Ok(());
    };

    // Admin function to manually fix stuck proposals
    public func icrc149_admin_fix_stuck_proposal(_caller : Principal, proposal_id : Nat) : async {
      #Ok : Text;
      #Err : Text;
    } {
      if (not BTree.has(state.config.admin_principals, Principal.compare, _caller)) {
        return #Err("Unauthorized: caller is not an admin");
      };

      D.print("🔧 ADMIN_FIX: Attempting to fix stuck proposal " # Nat.toText(proposal_id));

      let ?proposal = getProposalEngine().getProposal(proposal_id) else {
        return #Err("Proposal not found");
      };

      D.print("🔧 ADMIN_FIX: Current proposal status: " # debug_show (proposal.status));

      // Check if proposal is stuck in executing state
      switch (proposal.status) {
        case (#executing(_)) {
          D.print("🔧 ADMIN_FIX: Proposal is stuck in executing state, attempting to force end...");

          // Check if transaction was already processed
          var transactionCompleted = false;
          for ((seq, processedTx) in BTree.entries(processedTransactions)) {
            if (processedTx.proposal_id == proposal_id) {
              D.print("🔧 ADMIN_FIX: Found completed transaction for proposal: " # debug_show (processedTx.status) # ", Hash: " # debug_show (processedTx.transaction_hash));
              transactionCompleted := true;
            };
          };

          if (transactionCompleted) {
            D.print("🔧 ADMIN_FIX: Transaction completed, forcing proposal to executed state...");
            // Try to force end the proposal
            let endResult = await* getProposalEngine().endProposal(proposal_id);
            D.print("🔧 ADMIN_FIX: Force-end result: " # debug_show (endResult));

            // Clean up any execution locks
            ignore BTree.delete(executingProposals, Nat.compare, proposal_id);
            D.print("🔧 ADMIN_FIX: Cleaned up execution lock");

            // Save state
            saveProposalEngineState();
            D.print("🔧 ADMIN_FIX: Saved proposal engine state");

            #Ok("Proposal " # Nat.toText(proposal_id) # " has been fixed - transaction was completed and proposal marked as executed");
          } else {
            #Err("Proposal is executing but no completed transaction found. Manual intervention required.");
          };
        };
        case (#executed(_)) {
          #Ok("Proposal " # Nat.toText(proposal_id) # " is already in executed state - no fix needed");
        };
        case (#open) {
          #Err("Proposal " # Nat.toText(proposal_id) # " is still open, not stuck");
        };
        case (#failedToExecute(_)) {
          #Err("Proposal " # Nat.toText(proposal_id) # " failed to execute, not stuck in executing state");
        };
      };
    };

    public func icrc149_health_check() : Text {
      let proposal_count = getProposalEngine().getProposals(1000, 0).totalCount;
      let snapshot_contracts_count = BTree.size(state.config.snapshot_contracts);
      let execution_contracts_count = BTree.size(state.config.execution_contracts);
      "EvmDaoBridge is healthy - Proposals: " # Nat.toText(proposal_count) #
      ", Snapshot Contracts: " # Nat.toText(snapshot_contracts_count) #
      ", Execution Contracts: " # Nat.toText(execution_contracts_count);
    };

    // Standard Compliance
    public func icrc10_supported_standards() : [{ name : Text; url : Text }] {
      [
        {
          name = "ICRC-10";
          url = "https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-10";
        },
        {
          name = "ICRC-149";
          url = "https://github.com/dfinity/ICRC/issues/149";
        },
      ];
    };

    ///////////
    // ICRC85 ovs
    //////////

    public func handleIcrc85Action<system>(id : TT.ActionId, action : TT.Action) : async* Star.Star<TT.ActionId, TT.Error> {
      if (action.actionType == ICRC85_Timer_Namespace) {
        await* ovsfixed.standardShareCycles({
          icrc_85_state = state.icrc85;
          icrc_85_environment = do ? { environment.advanced!.icrc85! };
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
    public func test_add_snapshot(contract_address : Text, block_number : Nat, root_hash : Text) : {
      #Ok : ();
      #Err : Text;
    } {
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
    public func test_get_snapshot_info(contract_address : Text) : ?{
      block_number : Nat;
      root_hash : Text;
    } {
      D.print("Getting snapshot info for contract: " # contract_address);
      let snapshots = BTree.toArray<Nat, ProposalSnapshot>(state.snapshots);

      // Find latest snapshot for this contract
      for ((block_num, snapshot) in snapshots.vals()) {
        if (snapshot.contract_address == contract_address) {
          let root_hash = switch (Text.decodeUtf8(snapshot.state_root)) {
            case (?text) { text };
            case null { "0x" };
          };
          return ?{
            block_number = snapshot.block_number;
            root_hash = root_hash;
          };
        };
      };
      null;
    };

    // Test helper function to add a snapshot for testing witness validation
    public func icrc149_add_test_snapshot(proposal_id : Nat, block_number : Nat, state_root : Blob, contract_address : Text) : () {
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
        testSnapshot,
      );
    };

    // Enhanced test helper function to add a snapshot with specific chain_id
    public func icrc149_add_test_snapshot_with_chain(proposal_id : Nat, block_number : Nat, state_root : Blob, contract_address : Text, chain_id : Nat, network_name : Text) : () {
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
        testSnapshot,
      );
    };

    // Test helper function to calculate storage key using the same logic as witness validation
    public func icrc149_calculate_test_storage_key(userAddress : Blob, slot : Nat) : Blob {
      WitnessValidator.calculateStorageKeyHelper(userAddress, slot);
    };

    // Get Ethereum address for the DAO using tECDSA
    public func icrc149_get_ethereum_address(subaccount : ?Blob) : async Text {
      await* getEthereumAddress(subaccount);
    };

    // Check if users have voted on specific proposals and return their votes
    public func icrc149_get_user_votes(requests : [{ proposal_id : Nat; user_address : Text }]) : [{
      proposal_id : Nat;
      user_address : Text;
      vote : ?{ #Yes; #No; #Abstain };
    }] {
      Array.map<{ proposal_id : Nat; user_address : Text }, { proposal_id : Nat; user_address : Text; vote : ?{ #Yes; #No; #Abstain } }>(
        requests,
        func(request) {
          D.print("🔍 USER_VOTE: Looking up vote for address " # request.user_address # " on proposal " # Nat.toText(request.proposal_id));

          // Convert Ethereum address to Principal (same as used during voting)
          let voterPrincipal = ethereumAddressToPrincipal(request.user_address);
          D.print("🔍 USER_VOTE: Converted address " # request.user_address # " to Principal " # Principal.toText(voterPrincipal));

          // Look up the vote using the proposal engine's getVote function
          let vote = switch (getProposalEngine().getVote(request.proposal_id, voterPrincipal)) {
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
        },
      );
    };

    // Legacy single-request function for backward compatibility
    public func icrc149_get_user_vote(proposal_id : Nat, user_address : Text) : ?{
      #Yes;
      #No;
      #Abstain;
    } {
      let results = icrc149_get_user_votes([{
        proposal_id = proposal_id;
        user_address = user_address;
      }]);
      switch (results.size()) {
        case (0) null;
        case (_) results[0].vote;
      };
    };

    // Enhanced function to check if user has voted
    public func icrc149_has_user_voted(proposal_id : Nat, user_address : Text) : Bool {
      switch (icrc149_get_user_vote(proposal_id, user_address)) {
        case (?_) true;
        case (null) false;
      };
    };

    // Enhanced proposal retrieval that includes user vote information
    public func icrc149_get_proposal_with_user_vote(proposal_id : Nat, user_address : ?Text) : ?{
      proposal : Service.Proposal;
      user_vote : ?{ #Yes; #No; #Abstain };
      user_has_voted : Bool;
    } {
      switch (icrc149_get_proposal_service(proposal_id)) {
        case (?proposal) {
          let userVote = switch (user_address) {
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

    // Process next transaction in the queue (one at a time)
    public func processTransactionQueue() : async { #Ok : Text; #Err : Text } {
      D.print("🚀 QUEUE_PROCESSOR: Starting queue processing...");

      // Check if already processing (simple flag check)
      if (isProcessingQueue) {
        D.print("🚀 QUEUE_PROCESSOR: Already processing queue, skipping");
        return #Err("Queue processor already running");
      };

      // Set processing flag
      isProcessingQueue := true;
      D.print("🚀 QUEUE_PROCESSOR: Set processing flag to true");

      try {
        // Get next queued transaction
        switch (getNextQueuedTransaction()) {
          case (null) {
            D.print("🚀 QUEUE_PROCESSOR: No transactions in queue");
            isProcessingQueue := false;
            #Err("No transactions in queue");
          };
          case (?(sequenceId, queuedTransaction)) {
            D.print("🚀 QUEUE_PROCESSOR: Found transaction at sequence " # Nat.toText(sequenceId));
            D.print("🚀 QUEUE_PROCESSOR: Proposal ID: " # Nat.toText(queuedTransaction.proposal_id));
            D.print("🚀 QUEUE_PROCESSOR: Queued at: " # Int.toText(queuedTransaction.queued_at));

            // Process the transaction directly (similar to icrc149_send_eth_tx logic)
            try {
              // Get the Ethereum address for this subaccount
              D.print("🚀 QUEUE_PROCESSOR: Getting Ethereum address for subaccount...");
              let ethAddress = await* getEthereumAddress(queuedTransaction.eth_tx.subaccount);
              D.print("🚀 QUEUE_PROCESSOR: Ethereum address: " # ethAddress);

              // Configure RPC service using centralized function
              let rpc_service = createRpcServiceWithLogging(queuedTransaction.eth_tx.chain.chain_id, state.config.evm_rpc_canister_id, "QUEUE_PROCESSOR");

              // Create derivation path
              let derivationPath = switch (queuedTransaction.eth_tx.subaccount) {
                case (?blob) [blob];
                case (null) [];
              };

              // Execute the transaction
              let result = await* executeEthereumTransaction(
                queuedTransaction.eth_tx,
                rpc_service,
                ethAddress,
                derivationPath,
              );

              D.print("🚀 QUEUE_PROCESSOR: Transaction execution result: " # debug_show (result));

              // Remove from queue regardless of success/failure
              let removed = removeTransactionFromQueue(sequenceId);
              D.print("🚀 QUEUE_PROCESSOR: Removed from queue: " # debug_show (removed));

              // Clear processing flag
              isProcessingQueue := false;
              D.print("🚀 QUEUE_PROCESSOR: Cleared processing flag");

              result;
            } catch (e) {
              D.print("🚀 QUEUE_PROCESSOR: Transaction execution failed: " # Error.message(e));
              // Remove from queue even on failure
              let removed = removeTransactionFromQueue(sequenceId);
              D.print("🚀 QUEUE_PROCESSOR: Removed failed transaction from queue: " # debug_show (removed));

              // Clear processing flag
              isProcessingQueue := false;
              #Err("Transaction execution failed: " # Error.message(e));
            };
          };
        };
      } catch (e) {
        D.print("🚀 QUEUE_PROCESSOR: Exception during processing: " # Error.message(e));
        isProcessingQueue := false;
        #Err("Queue processing failed: " # Error.message(e));
      };
    };

    // Get queue status for debugging and monitoring
    public func getQueueStatus() : {
      queueSize : Nat;
      processedSize : Nat;
      isProcessing : Bool;
      nextSequenceId : Nat;
      lastProcessedSequence : Nat;
      pendingTransactions : Nat;
      processingTransactions : Nat;
      completedTransactions : Nat;
      failedTransactions : Nat;
      timerRunning : Bool;
    } {
      var pending = 0;
      var processing = 0;
      var completed = 0;
      var failed = 0;

      // Count active queue transactions
      for ((_, queueEntry) in BTree.entries(transactionQueue)) {
        switch (queueEntry.status) {
          case (#pending) pending += 1;
          case (#processing) processing += 1;
          case (#completed) completed += 1;
          case (#failed) failed += 1;
        };
      };

      // Count processed transactions
      for ((_, queueEntry) in BTree.entries(processedTransactions)) {
        switch (queueEntry.status) {
          case (#completed) completed += 1;
          case (#failed) failed += 1;
          case (_) {}; // Ignore other statuses in processed
        };
      };

      {
        queueSize = BTree.size(transactionQueue);
        processedSize = BTree.size(processedTransactions);
        isProcessing = isProcessingQueue;
        nextSequenceId = queueSequence;
        lastProcessedSequence = lastProcessedSequence;
        pendingTransactions = pending;
        processingTransactions = processing;
        completedTransactions = completed;
        failedTransactions = failed;
        timerRunning = switch (queueProcessingTimer) {
          case (?_) true;
          case (null) false;
        };
      };
    };

    // Public function to manually process next queued transaction (for testing/debugging)
    public func processNextTransaction() : async { #Ok : Text; #Err : Text } {
      try {
        let result = await* processNextQueuedTransaction();
        switch (result) {
          case (#ok(txHash)) #Ok(txHash);
          case (#err(errorMsg)) #Err(errorMsg);
        };
      } catch (e) {
        #Err("Failed to process transaction: " # Error.message(e));
      };
    };

    // Get detailed information about queue transactions
    public func getQueueTransactions(limit : ?Nat) : [{
      sequenceId : Nat;
      proposalId : Nat;
      status : { #pending; #processing; #completed; #failed };
      processingAttempts : Nat;
      queuedAt : Int;
      lastAttemptAt : ?Int;
      errorMessage : ?Text;
      transactionHash : ?Text;
    }] {
      let maxLimit = switch (limit) {
        case (?l) l;
        case (null) 100; // Default limit
      };

      var results : [{
        sequenceId : Nat;
        proposalId : Nat;
        status : { #pending; #processing; #completed; #failed };
        processingAttempts : Nat;
        queuedAt : Int;
        lastAttemptAt : ?Int;
        errorMessage : ?Text;
        transactionHash : ?Text;
      }] = [];

      var count = 0;
      for ((seqId, queueEntry) in BTree.entries(transactionQueue)) {
        if (count >= maxLimit) {
          return results;
        };

        let status = switch (queueEntry.status) {
          case (#pending) #pending;
          case (#processing) #processing;
          case (#completed) #completed;
          case (#failed) #failed;
        };

        results := Array.append(results, [{ sequenceId = seqId; proposalId = queueEntry.proposal_id; status = status; processingAttempts = queueEntry.processing_attempts; queuedAt = queueEntry.queued_at; lastAttemptAt = queueEntry.last_attempt_at; errorMessage = queueEntry.error_message; transactionHash = queueEntry.transaction_hash }]);

        count += 1;
      };

      results;
    };

    // Get processed transactions (completed/failed)
    public func getProcessedTransactions(limit : ?Nat) : [{
      sequenceId : Nat;
      proposalId : Nat;
      status : { #completed; #failed };
      processingAttempts : Nat;
      queuedAt : Int;
      lastAttemptAt : ?Int;
      errorMessage : ?Text;
      transactionHash : ?Text;
    }] {
      let maxLimit = switch (limit) {
        case (?l) l;
        case (null) 100; // Default limit
      };

      var results : [{
        sequenceId : Nat;
        proposalId : Nat;
        status : { #completed; #failed };
        processingAttempts : Nat;
        queuedAt : Int;
        lastAttemptAt : ?Int;
        errorMessage : ?Text;
        transactionHash : ?Text;
      }] = [];

      var count = 0;
      for ((seqId, queueEntry) in BTree.entries(processedTransactions)) {
        if (count >= maxLimit) {
          return results;
        };

        let status = switch (queueEntry.status) {
          case (#completed) #completed;
          case (#failed) #failed;
          case (_) #failed; // Default fallback, shouldn't happen in processed
        };

        results := Array.append(results, [{ sequenceId = seqId; proposalId = queueEntry.proposal_id; status = status; processingAttempts = queueEntry.processing_attempts; queuedAt = queueEntry.queued_at; lastAttemptAt = queueEntry.last_attempt_at; errorMessage = queueEntry.error_message; transactionHash = queueEntry.transaction_hash }]);

        count += 1;
      };

      results;
    };

    // Look up a specific transaction by sequence ID (checks both queue and processed)
    public func getTransactionBySequenceId(sequenceId : Nat) : ?{
      sequenceId : Nat;
      proposalId : Nat;
      status : { #pending; #processing; #completed; #failed };
      processingAttempts : Nat;
      queuedAt : Int;
      lastAttemptAt : ?Int;
      errorMessage : ?Text;
      transactionHash : ?Text;
      location : { #queue; #processed };
    } {
      // First check active queue
      switch (BTree.get(transactionQueue, Nat.compare, sequenceId)) {
        case (?queueEntry) {
          let status = switch (queueEntry.status) {
            case (#pending) #pending;
            case (#processing) #processing;
            case (#completed) #completed;
            case (#failed) #failed;
          };

          ?{
            sequenceId = sequenceId;
            proposalId = queueEntry.proposal_id;
            status = status;
            processingAttempts = queueEntry.processing_attempts;
            queuedAt = queueEntry.queued_at;
            lastAttemptAt = queueEntry.last_attempt_at;
            errorMessage = queueEntry.error_message;
            transactionHash = queueEntry.transaction_hash;
            location = #queue;
          };
        };
        case (null) {
          // Check processed transactions
          switch (BTree.get(processedTransactions, Nat.compare, sequenceId)) {
            case (?queueEntry) {
              let status = switch (queueEntry.status) {
                case (#completed) #completed;
                case (#failed) #failed;
                case (_) #failed; // Default fallback
              };

              ?{
                sequenceId = sequenceId;
                proposalId = queueEntry.proposal_id;
                status = status;
                processingAttempts = queueEntry.processing_attempts;
                queuedAt = queueEntry.queued_at;
                lastAttemptAt = queueEntry.last_attempt_at;
                errorMessage = queueEntry.error_message;
                transactionHash = queueEntry.transaction_hash;
                location = #processed;
              };
            };
            case (null) null;
          };
        };
      };
    };

    // Look up transactions by proposal ID (checks both queue and processed)
    public func getTransactionsByProposalId(proposalId : Nat) : [{
      sequenceId : Nat;
      proposalId : Nat;
      status : { #pending; #processing; #completed; #failed };
      processingAttempts : Nat;
      queuedAt : Int;
      lastAttemptAt : ?Int;
      errorMessage : ?Text;
      transactionHash : ?Text;
      location : { #queue; #processed };
    }] {
      var results : [{
        sequenceId : Nat;
        proposalId : Nat;
        status : { #pending; #processing; #completed; #failed };
        processingAttempts : Nat;
        queuedAt : Int;
        lastAttemptAt : ?Int;
        errorMessage : ?Text;
        transactionHash : ?Text;
        location : { #queue; #processed };
      }] = [];

      // Check active queue
      for ((seqId, queueEntry) in BTree.entries(transactionQueue)) {
        if (queueEntry.proposal_id == proposalId) {
          let status = switch (queueEntry.status) {
            case (#pending) #pending;
            case (#processing) #processing;
            case (#completed) #completed;
            case (#failed) #failed;
          };

          results := Array.append(results, [{ sequenceId = seqId; proposalId = queueEntry.proposal_id; status = status; processingAttempts = queueEntry.processing_attempts; queuedAt = queueEntry.queued_at; lastAttemptAt = queueEntry.last_attempt_at; errorMessage = queueEntry.error_message; transactionHash = queueEntry.transaction_hash; location = #queue }]);
        };
      };

      // Check processed transactions
      for ((seqId, queueEntry) in BTree.entries(processedTransactions)) {
        if (queueEntry.proposal_id == proposalId) {
          let status = switch (queueEntry.status) {
            case (#completed) #completed;
            case (#failed) #failed;
            case (_) #failed; // Default fallback
          };

          results := Array.append(results, [{ sequenceId = seqId; proposalId = queueEntry.proposal_id; status = status; processingAttempts = queueEntry.processing_attempts; queuedAt = queueEntry.queued_at; lastAttemptAt = queueEntry.last_attempt_at; errorMessage = queueEntry.error_message; transactionHash = queueEntry.transaction_hash; location = #processed }]);
        };
      };

      results;
    };

    // Public function to manually trigger queue processing
    public func processQueue() : async { #Ok : Text; #Err : Text } {
      D.print("🔄 MANUAL_QUEUE: Manual queue processing triggered");

      switch (getNextQueuedTransaction()) {
        case (null) {
          D.print("🔄 MANUAL_QUEUE: No pending transactions");
          #Ok("No pending transactions in queue");
        };
        case (?_) {
          try {
            let result = await* processNextQueuedTransaction();
            switch (result) {
              case (#ok(txHash)) {
                D.print("🔄 MANUAL_QUEUE: Processing successful: " # txHash);
                // Schedule next processing if there are more items
                scheduleNextQueueProcessing<system>();
                #Ok("Transaction processed successfully: " # txHash);
              };
              case (#err(error)) {
                D.print("🔄 MANUAL_QUEUE: Processing failed: " # error);
                // Schedule next processing even on failure
                scheduleNextQueueProcessing<system>();
                #Err("Transaction processing failed: " # error);
              };
            };
          } catch (e) {
            let errorMsg = "Manual queue processing exception: " # Error.message(e);
            D.print("❌ MANUAL_QUEUE: " # errorMsg);
            // Schedule next processing even on exception
            scheduleNextQueueProcessing<system>();
            #Err(errorMsg);
          };
        };
      };
    };

    // Initialize queue processing on canister restart
    // This checks for any pending transactions and starts the timer if needed
    private func initializeQueueProcessing<system>() : () {
      D.print("🔄 QUEUE_INIT: Initializing queue processing on canister start...");

      var pendingCount = 0;
      var processingCount = 0;

      // Check for transactions that were left in "processing" state due to restart
      // Convert them back to "pending" so they can be retried
      for ((seqId, queueEntry) in BTree.entries(transactionQueue)) {
        switch (queueEntry.status) {
          case (#pending) {
            pendingCount += 1;
          };
          case (#processing) {
            D.print("🔄 QUEUE_INIT: Found transaction stuck in processing state (seq: " # Nat.toText(seqId) # "), resetting to pending");
            queueEntry.status := #pending;
            queueEntry.last_attempt_at := null;
            pendingCount += 1;
            processingCount += 1;
          };
          case (#completed or #failed) {
            // These are fine, keep them as-is
          };
        };
      };

      D.print("🔄 QUEUE_INIT: Found " # Nat.toText(pendingCount) # " pending transactions");
      D.print("🔄 QUEUE_INIT: Reset " # Nat.toText(processingCount) # " stuck processing transactions to pending");
      D.print("🔄 QUEUE_INIT: Last processed sequence: " # Nat.toText(lastProcessedSequence));

      if (pendingCount > 0) {
        D.print("🔄 QUEUE_INIT: Starting queue processing for " # Nat.toText(pendingCount) # " pending transactions");
        startQueueProcessingTimer<system>();
      } else {
        D.print("🔄 QUEUE_INIT: No pending transactions, queue processing not started");
      };
    };

    // Initialize queue processing after startup
    initializeQueueProcessing<system>();

    // Debug function to check queue and processed transactions status
    public func debug_queue_status() : {
      queue_size : Nat;
      processed_size : Nat;
      last_processed_sequence : Nat;
      queue_entries : [(Nat, { proposal_id : Nat; status : Text; hash : ?Text })];
      processed_entries : [(Nat, { proposal_id : Nat; status : Text; hash : ?Text })];
    } {
      let queueEntries = Array.map<(Nat, QueuedTransaction), (Nat, { proposal_id : Nat; status : Text; hash : ?Text })>(
        BTree.toArray(transactionQueue),
        func((seq, entry)) = (
          seq,
          {
            proposal_id = entry.proposal_id;
            status = switch (entry.status) {
              case (#pending) "pending";
              case (#processing) "processing";
              case (#completed) "completed";
              case (#failed) "failed";
            };
            hash = entry.transaction_hash;
          },
        ),
      );

      let processedEntries = Array.map<(Nat, QueuedTransaction), (Nat, { proposal_id : Nat; status : Text; hash : ?Text })>(
        BTree.toArray(processedTransactions),
        func((seq, entry)) = (
          seq,
          {
            proposal_id = entry.proposal_id;
            status = switch (entry.status) {
              case (#pending) "pending";
              case (#processing) "processing";
              case (#completed) "completed";
              case (#failed) "failed";
            };
            hash = entry.transaction_hash;
          },
        ),
      );

      {
        queue_size = BTree.size(transactionQueue);
        processed_size = BTree.size(processedTransactions);
        last_processed_sequence = lastProcessedSequence;
        queue_entries = queueEntries;
        processed_entries = processedEntries;
      };
    };

    // Debug function to show current RPC configuration
    public func debug_rpc_configuration(chain_id : Nat) : {
      rpc_type : Text;
      canister_id : Text;
      custom_config : ?[(Text, Text)];
      resolved_rpc_services : Text;
    } {
      let service = createRpcService(chain_id, state.config.evm_rpc_canister_id);
      let chain = { chain_id = chain_id; network_name = "debug" };
      let rpcServices = getRpcServices(chain, service);

      {
        rpc_type = service.rpc_type;
        canister_id = Principal.toText(service.canister_id);
        custom_config = service.custom_config;
        resolved_rpc_services = debug_show (rpcServices);
      };
    };

  };

};
