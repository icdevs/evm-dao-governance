import { expect } from "chai";
import { ethers } from "hardhat";

describe("ERC-20 Token Contracts", function () {
  let owner: any;
  let addr1: any;
  let addr2: any;
  let usdc: any;
  let usdt: any;
  let dai: any;
  let govToken: any;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy(owner.address);

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy(owner.address);

    const MockDAI = await ethers.getContractFactory("MockDAI");
    dai = await MockDAI.deploy(owner.address);

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    govToken = await GovernanceToken.deploy(owner.address);
  });

  describe("Token Deployment", function () {
    it("Should deploy USDC with correct parameters", async function () {
      expect(await usdc.name()).to.equal("USD Coin (Mock)");
      expect(await usdc.symbol()).to.equal("MUSDC");
      expect(await usdc.decimals()).to.equal(6);
      expect(await usdc.totalSupply()).to.equal(1000000n * 10n**6n);
    });

    it("Should deploy USDT with correct parameters", async function () {
      expect(await usdt.name()).to.equal("Tether USD (Mock)");
      expect(await usdt.symbol()).to.equal("MUSDT");
      expect(await usdt.decimals()).to.equal(6);
      expect(await usdt.totalSupply()).to.equal(2000000n * 10n**6n);
    });

    it("Should deploy DAI with correct parameters", async function () {
      expect(await dai.name()).to.equal("Dai Stablecoin (Mock)");
      expect(await dai.symbol()).to.equal("MDAI");
      expect(await dai.decimals()).to.equal(18);
      expect(await dai.totalSupply()).to.equal(ethers.parseEther("1500000"));
    });

    it("Should deploy Governance Token with correct parameters", async function () {
      expect(await govToken.name()).to.equal("DAO Governance Token");
      expect(await govToken.symbol()).to.equal("GOVTOKEN");
      expect(await govToken.decimals()).to.equal(18);
      expect(await govToken.totalSupply()).to.equal(ethers.parseEther("10000000"));
    });
  });

  describe("Snapshot Functionality", function () {
    it("Should create snapshots", async function () {
      // Mint some tokens first
      await usdc.mintTo(addr1.address, 1000n * 10n**6n);
      
      // Create snapshot
      const tx = await usdc.snapshot();
      const receipt = await tx.wait();
      
      // Check snapshot was created
      expect(receipt.logs.length).to.be.greaterThan(0);
    });

    it("Should track balances at snapshot", async function () {
      // Initial balance
      await usdc.mintTo(addr1.address, 1000n * 10n**6n);
      
      // Create snapshot
      await usdc.snapshot();
      
      // Do a small transfer to trigger snapshot recording
      await usdc.connect(addr1).transfer(addr2.address, 1n);
      
      // Add more tokens
      await usdc.mintTo(addr1.address, 500n * 10n**6n);
      const finalBalance = await usdc.balanceOf(addr1.address);
      
      // Check snapshot balance
      const snapshotBalance = await usdc.balanceOfAt(addr1.address, 1);
      
      // The snapshot should record the balance at the time of the transfer
      expect(snapshotBalance).to.equal(1000n * 10n**6n); // Original balance before transfer
      expect(finalBalance).to.equal(1499999999n); // (1000 - 1 + 500) * 10^6
    });
  });

  describe("Governance Token Delegation", function () {
    it("Should allow delegation", async function () {
      // Mint tokens to addr1
      await govToken.mintTo(addr1.address, ethers.parseEther("1000"));
      
      // Delegate to addr2
      await govToken.connect(addr1).delegate(addr2.address);
      
      // Check delegation
      expect(await govToken.delegates(addr1.address)).to.equal(addr2.address);
      expect(await govToken.delegatedVotes(addr2.address)).to.equal(ethers.parseEther("1000"));
      expect(await govToken.getVotingPower(addr2.address)).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("Batch Minting", function () {
    it("Should mint to multiple addresses", async function () {
      const addresses = [addr1.address, addr2.address];
      const amounts = [1000n * 10n**6n, 2000n * 10n**6n];
      
      await usdc.batchMint(addresses, amounts);
      
      expect(await usdc.balanceOf(addr1.address)).to.equal(1000n * 10n**6n);
      expect(await usdc.balanceOf(addr2.address)).to.equal(2000n * 10n**6n);
    });
  });
});
