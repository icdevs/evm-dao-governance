import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { PocketIc, createIdentity } from '@dfinity/pic';
import type { Actor, CanisterFixture } from '@dfinity/pic';
import { IDL } from '@dfinity/candid';

// Runtime import: include the .js extension
import { idlFactory as mainIDLFactory, init as mainInit } from "../../src/declarations/main/main.did.js";

// Type-only import: import types from the candid interface without the extension
import type { _SERVICE as mainService } from "../../src/declarations/main/main.did.js";

const MAIN_WASM_PATH = `${process.cwd()}/.dfx/local/canisters/main/main.wasm`;

// Helper function to create SIWE message with proper anti-replay protection
function createSIWEMessage(address: string, proposalId: number, choice: string, contractAddress: string, chainId: number = 31337, currentTimeNanos?: bigint): string {
  const issuedAtNanos = currentTimeNanos || (BigInt(Date.now()) * 1_000_000n); // Convert milliseconds to nanoseconds
  const expirationTimeNanos = issuedAtNanos + 600_000_000_000n; // 10 minutes from now in nanoseconds
  
  const currentTimeISO = new Date(Number(issuedAtNanos / 1_000_000n)).toISOString();
  const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
  
  return `example.com wants you to sign in with your Ethereum account:
${address}

Vote ${choice} on proposal ${proposalId} for contract ${contractAddress}

URI: https://example.com
Version: 1
Chain ID: ${chainId}
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${issuedAtNanos}
Issued At: ${currentTimeISO}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTimeISO}`;
}

describe("SIWE Anti-Replay Protection", () => {
  let pic: PocketIc;
  let evmDAOBridge_fixture: CanisterFixture<mainService>;
  let admin = createIdentity('admin');

  beforeAll(async () => {
    pic = await PocketIc.create(process.env.PIC_URL);
    
    // Setup main canister
    evmDAOBridge_fixture = await pic.setupCanister<mainService>({
      sender: admin.getPrincipal(),
      idlFactory: mainIDLFactory,
      wasm: MAIN_WASM_PATH,
      arg: IDL.encode(mainInit({IDL}), [[]]),
    });
    
    evmDAOBridge_fixture.actor.setIdentity(admin);
    await pic.tick(2);
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("should parse SIWE message correctly", async () => {
    console.log("\n🔍 Testing SIWE message parsing...");
    
    const testAddress = "0x742d35cc6234c5a5c10b1c4f62e1fb4c5d0b94b9";
    const testProposalId = 1;
    const testChoice = "Yes";
    const testContractAddress = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
    const testChainId = 31337;
    
    // Get the canister's current time in nanoseconds to ensure timestamp alignment
    const canisterTimeNanos = BigInt(await pic.getTime()) * 1_000_000n; // PocketIC time is in microseconds, convert to nanoseconds
    
    const siweMessage = createSIWEMessage(testAddress, testProposalId, testChoice, testContractAddress, testChainId, canisterTimeNanos);
    console.log("Generated SIWE message:", siweMessage);
    
    const siweProof = {
      message: siweMessage,
      signature: new Array(65).fill(0x00) // Mock signature
    };
    
    const result = await evmDAOBridge_fixture.actor.icrc149_verify_siwe(siweProof);
    console.log("SIWE verification result:", result);
    
    if ("Ok" in result) {
      expect(result.Ok.address).toBe(testAddress);
      expect(result.Ok.proposal_id).toBe(BigInt(testProposalId));
      expect(result.Ok.vote_choice).toBe(testChoice);
      expect(result.Ok.contract_address).toBe(testContractAddress);
      expect(result.Ok.chain_id).toBe(BigInt(testChainId));
      expect(result.Ok.domain).toBe("example.com");
      
      console.log("✅ All SIWE fields parsed correctly!");
      console.log(`   Address: ${result.Ok.address}`);
      console.log(`   Proposal ID: ${result.Ok.proposal_id}`);
      console.log(`   Vote Choice: ${result.Ok.vote_choice}`);
      console.log(`   Contract: ${result.Ok.contract_address}`);
      console.log(`   Chain ID: ${result.Ok.chain_id}`);
    } else {
      console.log("❌ SIWE verification failed:", result.Err);
      expect(result).toHaveProperty("Ok");
    }
  });

  it("should reject expired SIWE messages", async () => {
    console.log("\n⏱️  Testing SIWE expiration...");
    
    const testAddress = "0x742d35cc6234c5a5c10b1c4f62e1fb4c5d0b94b9";
    
    // Get canister time and create a message that's already expired
    const canisterTimeNanos = BigInt(await pic.getTime()) * 1_000_000n; // PocketIC time is in microseconds
    const expiredTimeNanos = canisterTimeNanos - 3600_000_000_000n; // 1 hour ago in nanoseconds
    
    const expiredTimeISO = new Date(Number(expiredTimeNanos / 1_000_000n)).toISOString();
    
    const expiredMessage = `example.com wants you to sign in with your Ethereum account:
${testAddress}

Vote Yes on proposal 1 for contract 0x5fbdb2315678afecb367f032d93f642f64180aa3

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: ${expiredTimeNanos}
Issued At Nanos: ${expiredTimeNanos}
Issued At: ${expiredTimeISO}
Expiration Nanos: ${expiredTimeNanos}
Expiration Time: ${expiredTimeISO}`;
    
    const siweProof = {
      message: expiredMessage,
      signature: new Array(65).fill(0x00)
    };
    
    const result = await evmDAOBridge_fixture.actor.icrc149_verify_siwe(siweProof);
    console.log("Expired SIWE result:", result);
    
    expect("Err" in result).toBeTruthy();
    if ("Err" in result) {
      expect(result.Err).toContain("expired");
      console.log("✅ Correctly rejected expired message");
    }
  });

  it("should reject invalid vote choices", async () => {
    console.log("\n🚫 Testing invalid vote choice...");
    
    const testAddress = "0x742d35cc6234c5a5c10b1c4f62e1fb4c5d0b94b9";
    
    // Get canister time to ensure valid timestamps for this test
    const canisterTimeNanos = BigInt(await pic.getTime()) * 1_000_000n;
    const expirationTimeNanos = canisterTimeNanos + 600_000_000_000n; // 10 minutes from now
    
    const currentTimeISO = new Date(Number(canisterTimeNanos / 1_000_000n)).toISOString();
    const expirationTimeISO = new Date(Number(expirationTimeNanos / 1_000_000n)).toISOString();
    
    const invalidMessage = `example.com wants you to sign in with your Ethereum account:
${testAddress}

Vote Maybe on proposal 1 for contract 0x5fbdb2315678afecb367f032d93f642f64180aa3

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: ${expirationTimeNanos}
Issued At Nanos: ${canisterTimeNanos}
Issued At: ${currentTimeISO}
Expiration Nanos: ${expirationTimeNanos}
Expiration Time: ${expirationTimeISO}`;
    
    const siweProof = {
      message: invalidMessage,
      signature: new Array(65).fill(0x00)
    };
    
    const result = await evmDAOBridge_fixture.actor.icrc149_verify_siwe(siweProof);
    console.log("Invalid choice result:", result);
    
    expect("Err" in result).toBeTruthy();
    if ("Err" in result) {
      expect(result.Err).toContain("Invalid vote choice");
      console.log("✅ Correctly rejected invalid vote choice");
    }
  });
});
