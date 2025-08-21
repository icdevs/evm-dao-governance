import Blob "mo:base/Blob";
import Array "mo:base/Array";
import Text "mo:base/Text";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat8";
import Iter "mo:base/Iter";
import Result "mo:base/Result";
import _Debug "mo:base/Debug";
import Buffer "mo:base/Buffer";

import _RLP "mo:rlp-motoko";
import Sha3 "mo:sha3";
import _EvmVerifier "mo:evm-proof-verifier/Verifier";
import _EvmTypes "mo:evm-proof-verifier/types";

import Service "service";

module {

  public type WitnessValidationResult = {
    #Valid : {
      userAddress : Blob;
      contractAddress : Blob;
      storageValue : Nat;
      blockNumber : Nat;
    };
    #Invalid : Text;
  };

  public type ProofValidationConfig = {
    expectedStateRoot : Blob;
    expectedContractAddress : Blob;
    expectedUserAddress : Blob;
    expectedStorageSlot : Nat;
    chainId : Nat;
  };

  // Convert Blob to Nat (big-endian)
  private func blobToNat(blob : Blob) : Nat {
    let bytes = Blob.toArray(blob);
    var result : Nat = 0;
    for (byte in bytes.vals()) {
      result := result * 256 + Nat8.toNat(byte);
    };
    result;
  };

  // Convert Nat to 32-byte Blob (big-endian, padded)
  private func natToBlob32(n : Nat) : Blob {
    let bytes = Buffer.Buffer<Nat8>(32);
    var value = n;

    // Fill with zeros first
    for (i in Iter.range(0, 31)) {
      bytes.add(0);
    };

    // Fill from the end with the actual value
    var i = 31;
    while (value > 0 and i >= 0) {
      bytes.put(i, Nat8.fromNat(value % 256));
      value := value / 256;
      i -= 1;
    };

    Blob.fromArray(Buffer.toArray(bytes));
  };

  // Keccak256 hash function using the sha3 library
  private func keccak256(data : [Nat8]) : [Nat8] {
    let hasher = Sha3.Keccak(256);
    hasher.update(data);
    hasher.finalize();
  };

  // Calculate storage key for ERC20 balance mapping
  // Key = keccak256(abi.encode(userAddress, slot)) - addresses are LEFT-PADDED to 32 bytes
  private func calculateStorageKey(userAddress : Blob, slot : Nat) : Blob {
    let userBytes = Blob.toArray(userAddress);
    let slotBytes = Blob.toArray(natToBlob32(slot));

    // Pad user address to 32 bytes (left-padded with zeros for abi.encode semantics)
    var paddedUserBytes = Array.init<Nat8>(32, 0);
    if (userBytes.size() <= 32) {
      let startIndex = 32 - userBytes.size();
      for (i in Iter.range(0, userBytes.size() - 1)) {
        paddedUserBytes[startIndex + i] := userBytes[i];
      };
    };

    // Concatenate padded user address (32 bytes) + slot (32 bytes)
    let combined = Array.append(Array.freeze(paddedUserBytes), slotBytes);

    // Hash with Keccak256
    let hashBytes = keccak256(combined);
    Blob.fromArray(hashBytes);
  };

  // Validate account proof using RLP decoding and verification
  private func validateAccountProof(
    accountProof : [Blob],
    account : Blob,
    stateRoot : Blob,
  ) : Bool {
    // Basic validation checks
    if (accountProof.size() == 0) {
      return false;
    };

    if (Blob.toArray(account).size() != 20) {
      // Ethereum address is 20 bytes
      return false;
    };

    if (Blob.toArray(stateRoot).size() != 32) {
      // State root is 32 bytes
      return false;
    };

    // TODO: Implement full account proof verification
    // This would include:
    // 1. Keccak256 hash of the account address
    // 2. Merkle Patricia Trie proof verification
    // 3. RLP decoding of account state

    true // Simplified validation for now
  };

  // Validate storage proof using Merkle Patricia Trie verification
  private func validateStorageProof(
    storageProof : [Blob],
    storageKey : Blob,
    _ : Blob, // storageValue parameter (unused in simplified validation)
    storageRoot : Blob,
  ) : Bool {
    // For now, we'll do a simplified validation since the EVM proof verifier
    // has complex type requirements. In a production system, you would
    // properly convert to the required types and use the full verification.

    // Basic validation: check that we have non-empty proofs and valid data
    if (storageProof.size() == 0) {
      return false;
    };

    if (Blob.toArray(storageKey).size() != 32) {
      return false;
    };

    if (Blob.toArray(storageRoot).size() != 32) {
      return false;
    };

    // TODO: Implement full Merkle Patricia Trie verification
    // This would require proper conversion to Key.Key and Hash.Hash types
    // and handling of the complex proof structure

    true // Simplified validation for now
  };

  // Main witness validation function
  public func validateWitness(
    witness : Service.Witness,
    config : ProofValidationConfig,
  ) : WitnessValidationResult {

    // 1. Validate basic requirements
    if (Blob.toArray(witness.userAddress).size() != 20) {
      return #Invalid("User address must be 20 bytes");
    };

    if (Blob.toArray(witness.contractAddress).size() != 20) {
      return #Invalid("Contract address must be 20 bytes");
    };

    if (Blob.toArray(witness.storageKey).size() != 32) {
      return #Invalid("Storage key must be 32 bytes");
    };

    // 2. Validate addresses match expected values
    if (not Blob.equal(witness.contractAddress, config.expectedContractAddress)) {
      return #Invalid("Contract address mismatch");
    };

    if (not Blob.equal(witness.userAddress, config.expectedUserAddress)) {
      return #Invalid("User address mismatch");
    };

    // 3. Validate storage key corresponds to the expected slot and user
    let expectedStorageKey = calculateStorageKey(witness.userAddress, config.expectedStorageSlot);
    if (not Blob.equal(witness.storageKey, expectedStorageKey)) {
      return #Invalid("Storage key mismatch - key doesn't match user address and slot");
    };

    // 4. Validate storage value format and extract balance
    let balance = blobToNat(witness.storageValue);

    // 5. Validate account proof structure (basic validation)
    if (not validateAccountProof(witness.accountProof, witness.userAddress, config.expectedStateRoot)) {
      return #Invalid("Account proof validation failed");
    };

    // 6. Validate storage proof structure (basic validation)
    // Note: The witness already contains the storageKey that was used in eth_getProof
    // We don't need to extract it - we just validate the proof structure
    if (not validateStorageProof(witness.storageProof, witness.storageKey, witness.storageValue, witness.blockHash)) {
      return #Invalid("Storage proof validation failed");
    };

    // 7. All validations passed
    #Valid({
      userAddress = witness.userAddress;
      contractAddress = witness.contractAddress;
      storageValue = balance;
      blockNumber = witness.blockNumber;
    });
  };

  // Validate witness against proposal snapshot
  public func validateWitnessForProposal(
    witness : Service.Witness,
    snapshot : Service.ProposalSnapshot,
    userAddress : Blob,
    storageSlot : Nat,
  ) : WitnessValidationResult {

    // Check block number matches snapshot
    if (witness.blockNumber != snapshot.block_number) {
      return #Invalid("Block number mismatch: witness block " # Nat.toText(witness.blockNumber) # " != snapshot block " # Nat.toText(snapshot.block_number));
    };

    // Convert contract address from Text to Blob (assuming it's hex format)
    let contractAddressBlob = switch (hexTextToBlob(snapshot.contract_address)) {
      case (#ok(blob)) { blob };
      case (#err(msg)) {
        return #Invalid("Invalid contract address format: " # msg);
      };
    };

    let config : ProofValidationConfig = {
      expectedStateRoot = snapshot.state_root;
      expectedContractAddress = contractAddressBlob;
      expectedUserAddress = userAddress;
      expectedStorageSlot = storageSlot;
      chainId = snapshot.chain.chain_id;
    };

    validateWitness(witness, config);
  };

  // Helper function to convert hex text to blob
  private func hexTextToBlob(hex : Text) : Result.Result<Blob, Text> {
    let cleanHex = if (Text.startsWith(hex, #text("0x"))) {
      Text.trimStart(hex, #text("0x"));
    } else {
      hex;
    };

    if (cleanHex.size() % 2 != 0) {
      return #err("Hex string must have even length");
    };

    let bytes = Buffer.Buffer<Nat8>(cleanHex.size() / 2);
    var i = 0;
    let chars = cleanHex.chars();

    label hexLoop while (i < cleanHex.size()) {
      let char1 = switch (chars.next()) {
        case (?c) { c };
        case null { break hexLoop };
      };
      let char2 = switch (chars.next()) {
        case (?c) { c };
        case null { return #err("Incomplete hex pair") };
      };

      let byte1 = switch (charToHexDigit(char1)) {
        case (?d) { d };
        case null { return #err("Invalid hex character") };
      };
      let byte2 = switch (charToHexDigit(char2)) {
        case (?d) { d };
        case null { return #err("Invalid hex character") };
      };

      bytes.add(byte1 * 16 + byte2);
      i += 2;
    };

    #ok(Blob.fromArray(Buffer.toArray(bytes)));
  };

  private func charToHexDigit(c : Char) : ?Nat8 {
    switch (c) {
      case ('0') { ?0 };
      case ('1') { ?1 };
      case ('2') { ?2 };
      case ('3') { ?3 };
      case ('4') { ?4 };
      case ('5') { ?5 };
      case ('6') { ?6 };
      case ('7') { ?7 };
      case ('8') { ?8 };
      case ('9') { ?9 };
      case ('a' or 'A') { ?10 };
      case ('b' or 'B') { ?11 };
      case ('c' or 'C') { ?12 };
      case ('d' or 'D') { ?13 };
      case ('e' or 'E') { ?14 };
      case ('f' or 'F') { ?15 };
      case (_) { null };
    };
  };

  // Helper function to get voting power from validated witness
  public func getVotingPowerFromWitness(validationResult : WitnessValidationResult) : Nat {
    switch (validationResult) {
      case (#Valid(result)) {
        // Convert storage value to voting power
        // For ERC20 tokens, this might involve decimal conversion
        result.storageValue;
      };
      case (#Invalid(_)) { 0 };
    };
  };

  // Utility function to verify witness format without cryptographic validation
  public func verifyWitnessFormat(witness : Service.Witness) : Result.Result<(), Text> {
    // Check required field sizes
    if (Blob.toArray(witness.userAddress).size() != 20) {
      return #err("User address must be 20 bytes");
    };

    if (Blob.toArray(witness.contractAddress).size() != 20) {
      return #err("Contract address must be 20 bytes");
    };

    if (Blob.toArray(witness.storageKey).size() != 32) {
      return #err("Storage key must be 32 bytes");
    };

    if (Blob.toArray(witness.blockHash).size() != 32) {
      return #err("Block hash must be 32 bytes");
    };

    if (witness.accountProof.size() == 0) {
      return #err("Missing account proof");
    };

    if (witness.storageProof.size() == 0) {
      return #err("Missing storage proof");
    };

    #ok(());
  };

  // Convert hex text (from JSON) to Blob for use with the library
  public func convertJsonWitnessToBlob(
    blockHash : Text,
    blockNumber : Nat,
    userAddress : Text,
    contractAddress : Text,
    storageKey : Text,
    storageValue : Text,
    accountProof : [Text],
    storageProof : [Text],
  ) : Result.Result<Service.Witness, Text> {

    // Convert all hex strings to blobs
    let blockHashBlob = switch (hexTextToBlob(blockHash)) {
      case (#ok(blob)) { blob };
      case (#err(msg)) { return #err("Invalid block hash: " # msg) };
    };

    let userAddressBlob = switch (hexTextToBlob(userAddress)) {
      case (#ok(blob)) { blob };
      case (#err(msg)) { return #err("Invalid user address: " # msg) };
    };

    let contractAddressBlob = switch (hexTextToBlob(contractAddress)) {
      case (#ok(blob)) { blob };
      case (#err(msg)) { return #err("Invalid contract address: " # msg) };
    };

    let storageKeyBlob = switch (hexTextToBlob(storageKey)) {
      case (#ok(blob)) { blob };
      case (#err(msg)) { return #err("Invalid storage key: " # msg) };
    };

    let storageValueBlob = switch (hexTextToBlob(storageValue)) {
      case (#ok(blob)) { blob };
      case (#err(msg)) { return #err("Invalid storage value: " # msg) };
    };

    // Convert proof arrays
    let accountProofBlobs = Buffer.Buffer<Blob>(accountProof.size());
    for (proof in accountProof.vals()) {
      switch (hexTextToBlob(proof)) {
        case (#ok(blob)) { accountProofBlobs.add(blob) };
        case (#err(msg)) {
          return #err("Invalid account proof element: " # msg);
        };
      };
    };

    let storageProofBlobs = Buffer.Buffer<Blob>(storageProof.size());
    for (proof in storageProof.vals()) {
      switch (hexTextToBlob(proof)) {
        case (#ok(blob)) { storageProofBlobs.add(blob) };
        case (#err(msg)) {
          return #err("Invalid storage proof element: " # msg);
        };
      };
    };

    #ok({
      blockHash = blockHashBlob;
      blockNumber = blockNumber;
      userAddress = userAddressBlob;
      contractAddress = contractAddressBlob;
      storageKey = storageKeyBlob;
      storageValue = storageValueBlob;
      accountProof = Buffer.toArray(accountProofBlobs);
      storageProof = Buffer.toArray(storageProofBlobs);
    });
  };

  // Public helper function for tests to calculate storage key using the same logic
  public func calculateStorageKeyHelper(userAddress : Blob, slot : Nat) : Blob {
    calculateStorageKey(userAddress, slot);
  };

};
