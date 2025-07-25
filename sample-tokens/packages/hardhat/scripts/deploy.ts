import { ethers } from "hardhat";

interface DeployedContracts {
  usdc: any;
  usdt: any;
  dai: any;
  govToken: any;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy mock tokens
  console.log("\n=== Deploying Mock Tokens ===");
  
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(deployer.address);
  await usdc.waitForDeployment();
  console.log("MockUSDC deployed to:", await usdc.getAddress());

  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy(deployer.address);
  await usdt.waitForDeployment();
  console.log("MockUSDT deployed to:", await usdt.getAddress());

  const MockDAI = await ethers.getContractFactory("MockDAI");
  const dai = await MockDAI.deploy(deployer.address);
  await dai.waitForDeployment();
  console.log("MockDAI deployed to:", await dai.getAddress());

  const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
  const govToken = await GovernanceToken.deploy(deployer.address);
  await govToken.waitForDeployment();
  console.log("GovernanceToken deployed to:", await govToken.getAddress());

  const contracts: DeployedContracts = { usdc, usdt, dai, govToken };

  // Setup realistic distributions
  await setupRealisticDistributions(contracts, deployer);

  // Create snapshots for testing
  await createTestSnapshots(contracts);

  console.log("\n=== Deployment Summary ===");
  console.log(`MockUSDC: ${await usdc.getAddress()}`);
  console.log(`MockUSDT: ${await usdt.getAddress()}`);
  console.log(`MockDAI: ${await dai.getAddress()}`);
  console.log(`GovernanceToken: ${await govToken.getAddress()}`);
  
  console.log("\n=== Contract Addresses for Integration ===");
  console.log(`Copy these addresses to your integration tests:`);
  console.log(`USDC_ADDRESS = "${await usdc.getAddress()}"`);
  console.log(`USDT_ADDRESS = "${await usdt.getAddress()}"`);
  console.log(`DAI_ADDRESS = "${await dai.getAddress()}"`);
  console.log(`GOV_TOKEN_ADDRESS = "${await govToken.getAddress()}"`);
}

async function setupRealisticDistributions(contracts: DeployedContracts, deployer: any) {
  console.log("\n=== Setting up Realistic Token Distributions ===");
  
  const signers = await ethers.getSigners();
  
  // Create whale holders (top 10 addresses get significant amounts)
  const whales = signers.slice(1, 11);
  
  // Create medium holders (next 40 addresses get medium amounts) 
  const mediumHolders = signers.slice(11, 51);
  
  // Create small holders (remaining addresses get small amounts)
  const smallHolders = signers.slice(51, 100);

  // USDC Distribution (6 decimals)
  console.log("Distributing USDC...");
  for (const [i, whale] of whales.entries()) {
    const amount = (100000 - i * 8000) * 10**6; // 100k to 28k USDC
    await contracts.usdc.mintTo(whale.address, amount);
  }
  for (const holder of mediumHolders) {
    const amount = Math.floor(Math.random() * 10000 + 1000) * 10**6; // 1k-11k USDC
    await contracts.usdc.mintTo(holder.address, amount);
  }
  for (const holder of smallHolders) {
    const amount = Math.floor(Math.random() * 1000 + 10) * 10**6; // 10-1010 USDC
    await contracts.usdc.mintTo(holder.address, amount);
  }

  // USDT Distribution (6 decimals)
  console.log("Distributing USDT...");
  for (const [i, whale] of whales.entries()) {
    const amount = (150000 - i * 12000) * 10**6; // 150k to 42k USDT
    await contracts.usdt.mintTo(whale.address, amount);
  }
  for (const holder of mediumHolders) {
    const amount = Math.floor(Math.random() * 15000 + 2000) * 10**6; // 2k-17k USDT
    await contracts.usdt.mintTo(holder.address, amount);
  }

  // DAI Distribution (18 decimals)
  console.log("Distributing DAI...");
  for (const [i, whale] of whales.entries()) {
    const amount = ethers.parseEther((80000 - i * 6000).toString()); // 80k to 26k DAI
    await contracts.dai.mintTo(whale.address, amount);
  }
  for (const holder of mediumHolders) {
    const amount = ethers.parseEther(Math.floor(Math.random() * 8000 + 500).toString()); // 500-8500 DAI
    await contracts.dai.mintTo(holder.address, amount);
  }

  // Governance Token Distribution (18 decimals) - More concentrated for DAO scenarios
  console.log("Distributing Governance Tokens...");
  for (const [i, whale] of whales.entries()) {
    const amount = ethers.parseEther((500000 - i * 40000).toString()); // 500k to 140k GOV
    await contracts.govToken.mintTo(whale.address, amount);
  }
  for (const holder of mediumHolders.slice(0, 20)) { // Only first 20 get medium amounts
    const amount = ethers.parseEther(Math.floor(Math.random() * 50000 + 5000).toString()); // 5k-55k GOV
    await contracts.govToken.mintTo(holder.address, amount);
  }
  for (const holder of smallHolders.slice(0, 30)) { // Only first 30 get small amounts
    const amount = ethers.parseEther(Math.floor(Math.random() * 5000 + 100).toString()); // 100-5100 GOV
    await contracts.govToken.mintTo(holder.address, amount);
  }

  console.log("Token distributions completed!");
}

async function createTestSnapshots(contracts: DeployedContracts) {
  console.log("\n=== Creating Test Snapshots ===");
  
  // Create initial snapshots for all tokens
  const usdcSnapshot = await contracts.usdc.snapshot();
  console.log(`USDC Snapshot #${usdcSnapshot} created`);
  
  const usdtSnapshot = await contracts.usdt.snapshot();
  console.log(`USDT Snapshot #${usdtSnapshot} created`);
  
  const daiSnapshot = await contracts.dai.snapshot();
  console.log(`DAI Snapshot #${daiSnapshot} created`);
  
  const govSnapshot = await contracts.govToken.snapshot();
  console.log(`Governance Token Snapshot #${govSnapshot} created`);
  
  // Print some sample balances for verification
  const signers = await ethers.getSigners();
  const sampleAddresses = signers.slice(1, 4);
  
  console.log("\n=== Sample Balances (for verification) ===");
  for (const signer of sampleAddresses) {
    const usdcBalance = await contracts.usdc.balanceOf(signer.address);
    const usdtBalance = await contracts.usdt.balanceOf(signer.address);
    const daiBalance = await contracts.dai.balanceOf(signer.address);
    const govBalance = await contracts.govToken.balanceOf(signer.address);
    
    console.log(`Address ${signer.address}:`);
    console.log(`  USDC: ${ethers.formatUnits(usdcBalance, 6)}`);
    console.log(`  USDT: ${ethers.formatUnits(usdtBalance, 6)}`);
    console.log(`  DAI: ${ethers.formatEther(daiBalance)}`);
    console.log(`  GOV: ${ethers.formatEther(govBalance)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
