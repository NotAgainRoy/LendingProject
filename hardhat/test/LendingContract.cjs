const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("LendingPoolSimple Contract", function () {
  async function deployLendingPoolFixture() {
    const [owner, user1, user2, liquidator] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const lendingToken = await MockERC20.deploy("Lending Token", "LT", 18);
    const collateralToken = await MockERC20.deploy("Collateral Token", "CT", 18);

    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const priceFeed = await MockPriceFeed.deploy(ethers.parseEther("1.0"));

    const interestRate = ethers.parseEther("0.001");
    const LendingPoolSimple = await ethers.getContractFactory("LendingPoolSimple");
    const lendingPool = await LendingPoolSimple.deploy(
      await lendingToken.getAddress(),
      await collateralToken.getAddress(),
      interestRate,
      await priceFeed.getAddress()
    );

    const initialBalance = ethers.parseEther("1000");
    await lendingToken.mint(owner.address, initialBalance);
    await lendingToken.mint(user1.address, initialBalance);
    await lendingToken.mint(user2.address, initialBalance);
    await lendingToken.mint(liquidator.address, initialBalance);
    
    await collateralToken.mint(owner.address, initialBalance);
    await collateralToken.mint(user1.address, initialBalance);
    await collateralToken.mint(user2.address, initialBalance);
    await collateralToken.mint(liquidator.address, initialBalance);

    await lendingToken.connect(owner).approve(await lendingPool.getAddress(), ethers.MaxUint256);
    await lendingToken.connect(user1).approve(await lendingPool.getAddress(), ethers.MaxUint256);
    await lendingToken.connect(user2).approve(await lendingPool.getAddress(), ethers.MaxUint256);
    await lendingToken.connect(liquidator).approve(await lendingPool.getAddress(), ethers.MaxUint256);
    
    await collateralToken.connect(owner).approve(await lendingPool.getAddress(), ethers.MaxUint256);
    await collateralToken.connect(user1).approve(await lendingPool.getAddress(), ethers.MaxUint256);
    await collateralToken.connect(user2).approve(await lendingPool.getAddress(), ethers.MaxUint256);
    await collateralToken.connect(liquidator).approve(await lendingPool.getAddress(), ethers.MaxUint256);

    return { lendingPool, lendingToken, collateralToken, priceFeed, owner, user1, user2, liquidator };
  }

  describe("Deployment", function () {
    it("Should set the correct tokens and interest rate", async function () {
      const { lendingPool, lendingToken, collateralToken, priceFeed } = await loadFixture(deployLendingPoolFixture);
      
      expect(await lendingPool.lendingToken()).to.equal(await lendingToken.getAddress());
      expect(await lendingPool.collateralToken()).to.equal(await collateralToken.getAddress());
      expect(await lendingPool.interestRatePerBlock()).to.equal(ethers.parseEther("0.001"));
      expect(await lendingPool.priceFeed()).to.equal(await priceFeed.getAddress());
    });
  });

  describe("Deposit", function () {
    it("Should allow deposits and track interest", async function () {
      const { lendingPool, lendingToken, user1 } = await loadFixture(deployLendingPoolFixture);
      
      const depositAmount = ethers.parseEther("100");
      await lendingPool.connect(user1).deposit(depositAmount);
      
      const deposit = await lendingPool.deposits(user1.address);
      expect(deposit[0]).to.equal(depositAmount);
      
      await mine(5);
      
      const interest = await lendingPool.getTotalInterest(user1.address);
      expect(interest).to.be.gt(0);
    });

    it("Should reject deposits of 0", async function () {
      const { lendingPool, user1 } = await loadFixture(deployLendingPoolFixture);
      
      await expect(lendingPool.connect(user1).deposit(0))
        .to.be.revertedWith("Invalid amount");
    });
  });

  describe("Withdraw", function () {
    it("Should allow withdrawals", async function () {
      const { lendingPool, lendingToken, user1 } = await loadFixture(deployLendingPoolFixture);
      
      const depositAmount = ethers.parseEther("100");
      await lendingPool.connect(user1).deposit(depositAmount);
      
      const beforeBalance = await lendingToken.balanceOf(user1.address);
      await lendingPool.connect(user1).withdraw();
      const afterBalance = await lendingToken.balanceOf(user1.address);
      
      expect(afterBalance).to.be.gt(beforeBalance);
    });

    it("Should not allow withdrawals with insufficient collateral", async function () {
      const { lendingPool, user1 } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(user1).deposit(ethers.parseEther("100"));
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      await lendingPool.connect(user1).borrow(ethers.parseEther("15"));
      
      await expect(lendingPool.connect(user1).withdraw())
        .to.be.revertedWith("Cannot withdraw: undercollateralized");
    });
  });

  describe("Collateral and Borrowing", function () {
    it("Should allow adding collateral", async function () {
      const { lendingPool, user1 } = await loadFixture(deployLendingPoolFixture);
      
      const collateralAmount = ethers.parseEther("50");
      await lendingPool.connect(user1).addCollateral(collateralAmount);
      
      const borrowInfo = await lendingPool.getBorrowInfo(user1.address);
      expect(borrowInfo[1]).to.equal(collateralAmount);
    });

    it("Should correctly calculate max borrowable", async function () {
      const { lendingPool, user1 } = await loadFixture(deployLendingPoolFixture);
      
      const collateralAmount = ethers.parseEther("30");
      await lendingPool.connect(user1).addCollateral(collateralAmount);
      
      const maxBorrowable = await lendingPool.getMaxBorrowable(user1.address);
      expect(maxBorrowable).to.equal(ethers.parseEther("20"));
    });

    it("Should allow borrowing up to max limit", async function () {
      const { lendingPool, user1, owner } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(owner).deposit(ethers.parseEther("100"));
      
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      await lendingPool.connect(user1).borrow(ethers.parseEther("20"));
      
      const borrowInfo = await lendingPool.getBorrowInfo(user1.address);
      expect(borrowInfo[0]).to.equal(ethers.parseEther("20"));
    });

    it("Should not allow borrowing beyond collateral ratio", async function () {
      const { lendingPool, user1, owner } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(owner).deposit(ethers.parseEther("100"));
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      
      await expect(lendingPool.connect(user1).borrow(ethers.parseEther("21")))
        .to.be.revertedWith("Insufficient collateral");
    });
  });

  describe("Repayment", function () {
    it("Should allow repaying loans", async function () {
      const { lendingPool, user1, owner } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(owner).deposit(ethers.parseEther("100"));
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      await lendingPool.connect(user1).borrow(ethers.parseEther("15"));
      
      await lendingPool.connect(user1).repay(ethers.parseEther("5"));
      
      const borrowInfo = await lendingPool.getBorrowInfo(user1.address);
      expect(borrowInfo[0]).to.equal(ethers.parseEther("10"));
    });

    it("Should cap repayment at borrowed amount", async function () {
      const { lendingPool, user1, owner } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(owner).deposit(ethers.parseEther("100"));
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      await lendingPool.connect(user1).borrow(ethers.parseEther("15"));
      
      await lendingPool.connect(user1).repay(ethers.parseEther("20"));
      
      const borrowInfo = await lendingPool.getBorrowInfo(user1.address);
      expect(borrowInfo[0]).to.equal(0);
    });
  });

  describe("Collateral Removal", function () {
    it("Should allow removing excess collateral", async function () {
      const { lendingPool, collateralToken, user1, owner } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(owner).deposit(ethers.parseEther("100"));
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      await lendingPool.connect(user1).borrow(ethers.parseEther("10"));
      
      const beforeBalance = await collateralToken.balanceOf(user1.address);
      await lendingPool.connect(user1).removeCollateral(ethers.parseEther("10"));
      const afterBalance = await collateralToken.balanceOf(user1.address);
      
      expect(afterBalance - beforeBalance).to.equal(ethers.parseEther("10"));
    });

    it("Should not allow removing too much collateral", async function () {
      const { lendingPool, user1, owner } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(owner).deposit(ethers.parseEther("100"));
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      await lendingPool.connect(user1).borrow(ethers.parseEther("15"));
      
      await expect(lendingPool.connect(user1).removeCollateral(ethers.parseEther("15")))
        .to.be.revertedWith("Would violate collateral ratio");
    });
  });

  describe("Liquidation", function () {
    it("Should allow liquidation when undercollateralized", async function () {
      const { lendingPool, collateralToken, priceFeed, user1, liquidator, owner } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(owner).deposit(ethers.parseEther("100"));
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      await lendingPool.connect(user1).borrow(ethers.parseEther("15"));
      
      await priceFeed.setPrice(ethers.parseEther("0.7"));
      
      const beforeCollateral = await collateralToken.balanceOf(liquidator.address);
      await lendingPool.connect(liquidator).liquidate(user1.address, ethers.parseEther("5"));
      const afterCollateral = await collateralToken.balanceOf(liquidator.address);
      
      expect(afterCollateral).to.be.gt(beforeCollateral);
    });

    it("Should not allow liquidation when sufficiently collateralized", async function () {
      const { lendingPool, user1, liquidator, owner } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(owner).deposit(ethers.parseEther("100"));
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      await lendingPool.connect(user1).borrow(ethers.parseEther("10"));
      
      await expect(lendingPool.connect(liquidator).liquidate(user1.address, ethers.parseEther("5")))
        .to.be.revertedWith("Not eligible for liquidation");
    });

    it("Should not allow self-liquidation", async function () {
      const { lendingPool, priceFeed, user1, owner } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(owner).deposit(ethers.parseEther("100"));
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      await lendingPool.connect(user1).borrow(ethers.parseEther("15"));
      
      await priceFeed.setPrice(ethers.parseEther("0.7"));
      
      await expect(lendingPool.connect(user1).liquidate(user1.address, ethers.parseEther("5")))
        .to.be.revertedWith("Self-liquidation not allowed");
    });
  });

  describe("Health Factor", function () {
    it("Should correctly calculate health factor", async function () {
      const { lendingPool, priceFeed, user1, owner } = await loadFixture(deployLendingPoolFixture);
      
      await lendingPool.connect(owner).deposit(ethers.parseEther("100"));
      await lendingPool.connect(user1).addCollateral(ethers.parseEther("30"));
      await lendingPool.connect(user1).borrow(ethers.parseEther("15"));
      
      const healthFactor = await lendingPool.getHealthFactor(user1.address);
      expect(healthFactor).to.equal(200);
      
      await priceFeed.setPrice(ethers.parseEther("0.5"));
      const newHealthFactor = await lendingPool.getHealthFactor(user1.address);
      expect(newHealthFactor).to.equal(100);
    });
  });
});

async function mine(blocks) {
  for (let i = 0; i < blocks; i++) {
    await ethers.provider.send("evm_mine");
  }
}
