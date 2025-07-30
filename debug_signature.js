import { ethers } from 'ethers';
import crypto from 'crypto';

// Use the exact same message from the test logs
const message = `example.com wants you to sign in with your Ethereum account:
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

Create proposal for contract 0x5FbDB2315678afecb367f032d93F642f64180aa3

URI: https://example.com
Version: 1
Chain ID: 31337
Nonce: 1620329231000000000
Issued At Nanos: 1620328631000000000
Issued At: 2021-05-06T19:17:11.000Z
Expiration Nanos: 1620329231000000000
Expiration Time: 2021-05-06T19:27:11.000Z`;

// Admin wallet private key
const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const wallet = new ethers.Wallet(privateKey);

console.log("Admin wallet address:", wallet.address);
console.log("Message length:", message.length);
console.log("Message bytes length:", Buffer.from(message, 'utf8').length);

// Create the EIP-191 hash manually (what ethers.js does internally)
function createEIP191Hash(message) {
  const messageBytes = Buffer.from(message, 'utf8');
  const prefix = Buffer.from("\x19Ethereum Signed Message:\n", 'utf8');
  const lengthBytes = Buffer.from(messageBytes.length.toString(), 'utf8');
  
  const combined = Buffer.concat([prefix, lengthBytes, messageBytes]);
  return crypto.createHash('sha256').update(combined).digest();
}

// Create the EIP-191 hash with Keccak256 (correct for Ethereum)
function createEIP191HashKeccak(message) {
  const messageBytes = Buffer.from(message, 'utf8');
  const prefix = Buffer.from("\x19Ethereum Signed Message:\n", 'utf8');
  const lengthBytes = Buffer.from(messageBytes.length.toString(), 'utf8');
  
  const combined = Buffer.concat([prefix, lengthBytes, messageBytes]);
  
  // Use ethers.js keccak256 function
  return ethers.keccak256(combined);
}

async function debugSignature() {
  // Sign the message
  const signature = await wallet.signMessage(message);
  console.log("Signature:", signature);
  
  // Parse signature
  const sigBytes = ethers.getBytes(signature);
  console.log("Signature bytes length:", sigBytes.length);
  
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  const v = sigBytes[64];
  
  console.log("r (hex):", ethers.hexlify(r));
  console.log("s (hex):", ethers.hexlify(s));
  console.log("v:", v);
  
  // Create the hash manually
  const manualHash = createEIP191Hash(message);
  console.log("Manual EIP-191 hash with SHA256 (hex):", manualHash.toString('hex'));
  
  const manualHashKeccak = createEIP191HashKeccak(message);
  console.log("Manual EIP-191 hash with Keccak256 (hex):", manualHashKeccak);
  
  // Verify signature recovery
  const recovered = ethers.verifyMessage(message, signature);
  console.log("Recovered address:", recovered);
  console.log("Expected address:", wallet.address);
  console.log("Recovery matches:", recovered.toLowerCase() === wallet.address.toLowerCase());
  
  // Check if our manual keccak hash matches ethers hashMessage
  const messageHash = ethers.hashMessage(message);
  console.log("ethers.hashMessage result:", messageHash);
  console.log("Our Keccak hash matches ethers:", manualHashKeccak === messageHash);
  
  // Try recovering with v and v^1 (flip last bit)
  for (let testV of [v, v ^ 1]) {
    try {
      const testSig = ethers.Signature.from({
        r: ethers.hexlify(r),
        s: ethers.hexlify(s),
        v: testV
      });
      
      const testRecovered = testSig.recoverPublicKey(messageHash);
      const testAddress = ethers.computeAddress(testRecovered);
      console.log(`v=${testV}: recovered address = ${testAddress}`);
    } catch (e) {
      console.log(`v=${testV}: recovery failed - ${e.message}`);
    }
  }
}

debugSignature().catch(console.error);
