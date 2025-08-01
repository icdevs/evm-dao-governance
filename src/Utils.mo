import EVMRPCService "EVMRPCService";
import Result "mo:base/Result";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat8";
import Blob "mo:base/Blob";
import Text "mo:base/Text"; 
import Array "mo:base/Array";

module {

  // Helper function to format RPC errors consistently
    public func formatRpcError(err: EVMRPCService.RpcError) : Text {
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
    public func hexStringToBlob(hexStr: Text) : Result.Result<Blob, Text> {
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

}