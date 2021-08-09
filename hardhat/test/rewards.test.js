const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { MockProvider, solidity, loadFixture, deployContract } = require("ethereum-waffle");
const { utils } = require("ethers");

use(solidity);

describe("Testing BlocksRewardsManager", function() {

  const BLS_5_PER_BLOCK = 5;
  let blsContract;
  let rewardsManagerContract;
  let blocksStaking;
  let blocksSpaceContract;
  let owner;
  
  async function setup() {
    await setupWithBlsDoposit(0);
    await blsContract.transfer(rewardsManagerContract.address, 1000);
  }

  async function setupWithBlsDoposit(amountOfBls, blsPerBlock = BLS_5_PER_BLOCK) {
    [owner] = await ethers.getSigners();
    const contractObject = await ethers.getContractFactory("BLSToken");
    blsContract = await contractObject.deploy();
    const blocksStakingObject = await ethers.getContractFactory("BlocksStaking");
    blocksStaking = await blocksStakingObject.deploy(blsContract.address);
    const contractObject2 = await ethers.getContractFactory("BlocksRewardsManager");
    rewardsManagerContract = await contractObject2.deploy(blsContract.address, blocksStaking.address, owner.address);
    const contractObject3 = await ethers.getContractFactory("BlocksSpace");
    blocksSpaceContract = await contractObject3.deploy(rewardsManagerContract.address, 0);
    await rewardsManagerContract.addSpace(blocksSpaceContract.address, blsPerBlock);
    await blsContract.transfer(rewardsManagerContract.address, amountOfBls);
  }

  async function mineBlocks(numberOfBlocks){
    for(let i = 0; i < numberOfBlocks; i++){       
      await ethers.provider.send('evm_mine');
    }
  }
  
  async function mineBlockAndMoveTimestamp(plusSeconds){    
    let block = await ethers.provider.getBlock(); 
    await ethers.provider.send('evm_setNextBlockTimestamp', [block.timestamp + plusSeconds]);
    await ethers.provider.send('evm_mine');
  }

  describe("Scenario: BLS Rewards distribution", function() {

    it("Create wallets (signers)", async function() {
      [owner, walletA, walletB] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    it("Purchase 1 block.area", async function() {
      await setup();
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 1});
      await mineBlocks(4);
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens).to.equal(BLS_5_PER_BLOCK * 4);
      await mineBlocks(6);
      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens).to.equal(BLS_5_PER_BLOCK * 10);
    });

    it("Rewards of 2 purchases of non overlapping block.areas", async function() {
      await setup();
      // purchase 1 block.area
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 1});
      // 1 transaction
      await mineBlocks(1);
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens).to.equal(BLS_5_PER_BLOCK * 1);

      // 1 transaction // purchase 9 block.area
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1212", "1414", "imagehash2", {value: 10});
      
      // // 3 transactions
      await mineBlocks(3);
      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens).to.equal(BLS_5_PER_BLOCK * 5); 
      
      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens).to.equal(BLS_5_PER_BLOCK * 3 * 9); // 3 x 8 x 5 bls rewards 
    });

    it("Rewards of complete take over of blockareas (second user buys all from first user)", async function() {
      await setup();
      // Owner purchases 9 block.areas
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("1212", "1414", "imagehash1", {value: 10});
      // 2 transactions
      await mineBlocks(2);
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "Owner needs to have 2 blocks x BLS_PER_BLOCK * 9 blocks rewards").to.equal(BLS_5_PER_BLOCK * 2 * 9);

      // 1 transaction // Wallet A purchases all owners block.areas for higher price
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1212", "1414", "imagehash2", {value: 200});
      
      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "Owners rewards are now finalized after 3 transactions.").to.equal(BLS_5_PER_BLOCK * 3 * 9);

      // mine 3 additional transactions
      await mineBlocks(3);

      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "Owners rewards need to stay same as above, because he has 0 block.areas").to.equal(BLS_5_PER_BLOCK * 3 * 9);
      
      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "WalletA need to have bpb * 3 transaction * 9 blocks rewards").to.equal(BLS_5_PER_BLOCK * 3 * 9);
    });

    it("Rewards when user 2 partially takes over blockareas of user 1", async function() {
      await setup();
      // Owner purchases 10 block.areas
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("1212", "1316", "imagehash1", {value: 10});
      // 2 transactions
      await mineBlocks(2);
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "Owner rewards are 2 blocks x BLS_5_PER_BLOCK * 10 blocks").to.equal(BLS_5_PER_BLOCK * 2 * 10);

      // 1 transaction // Wallet A purchases 6 of owners block.areas for higher price
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1212", "1314", "imagehash2", {value: 40});
      
      // mine 2 additional transactions
      await mineBlocks(2);

      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "Owners rewards are BLS_5_PER_BLOCK x 3 blocks x 10 areas + BLS_5_PER_BLOCK x 2 blocks x 4 areas").to.equal(BLS_5_PER_BLOCK * 3 * 10 + BLS_5_PER_BLOCK * 2 * 4);
      
      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "WalletA rewards are BLS_5_PER_BLOCK x 2 blocks x 6 areas").to.equal(BLS_5_PER_BLOCK * 2 * 6);
    });
  });

  describe("Scenario: BNB Rewards distribution", function() {

    it("Create wallets (signers)", async function() {
      [owner, walletA, walletB] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    it("User pays 100 BNB, 5% goes to treasury", async function() {
      await setup();
      
      // if no token staked, staking reward goes to treasury; that's why we have to stake something first here
      await blsContract.transfer(walletB.address, 1);
      await blsContract.connect(walletB).approve(blocksStaking.address, 1);
      await blocksStaking.connect(walletB).deposit(1);

      let balanceBefore = await ethers.provider.getBalance(owner.address);
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1212", "1316", "imagehash1", {value: utils.parseEther("100")});
      let balanceAfter = await ethers.provider.getBalance(owner.address);
      let diff = utils.formatEther(balanceAfter.sub(balanceBefore));
      expect(diff, "It needs to be 5 ether more in treasury").to.equal("15.0");
    });

    it("Setting more than 5% fee should fail", async function() {
      await expect(rewardsManagerContract.connect(owner).setTreasuryFee(6), "Cannot set more than 5% fee").to.be.reverted;
    });

    it("Setting treasury fee to zero", async function() {
      await rewardsManagerContract.connect(owner).setTreasuryFee(0);
      let balanceBefore = await ethers.provider.getBalance(owner.address);
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0402", "0402", "imagehash1", {value: utils.parseEther("5")});
      let balanceAfter = await ethers.provider.getBalance(owner.address);
      let diff = utils.formatEther(balanceAfter.sub(balanceBefore));
      expect(diff, "Treasury should not change").to.equal("0.5"); //Because liqudiity fees are still applied
    });

  });

  describe("Scenario: BNB Rewards distribution", function() {

    it("Create fresh wallets (signers)", async function() {
      [owner, walletA, walletB, walletC, walletD] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    it("User takes over half of previous users blocks", async function() {
      await setup();
      // A Purchase 4 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0706", "0807", "imagehash1", {value: 10});
      let walletAUserInfo = await rewardsManagerContract.userInfo(0, walletA.address);
      expect(walletAUserInfo.amount.toNumber(), "User A should have 4 blocks now").to.equal(4);
      // User B Purchases 2 blocks of user A
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0806", "0807", "imagehash1", {value: 10});
      walletAUserInfo = await rewardsManagerContract.userInfo(0, walletA.address);
      expect(walletAUserInfo.amount.toNumber(), "User A should have only 2 blocks now").to.equal(2);
      let walletBUserInfo = await rewardsManagerContract.userInfo(0, walletB.address);
      expect(walletBUserInfo.amount.toNumber(), "User B should have 2 blocks now").to.equal(2);
    });

    it("User buys 42 blocks and takes over ALL (4) of previous users blocks", async function() {
      await setup();
      // A Purchase 4 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0706", "0807", "imagehash1", {value: 10});
      let walletAUserInfo = await rewardsManagerContract.userInfo(0, walletA.address);
      expect(walletAUserInfo.amount.toNumber(), "User A should have 4 blocks now").to.equal(4);
      // User B Purchases 42 blocks and takes over all of users A blocks
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0706", "1311", "imagehash1", {value: 100});
      walletAUserInfo = await rewardsManagerContract.userInfo(0, walletA.address);
      expect(walletAUserInfo.amount.toNumber(), "User A should have 0 blocks").to.equal(0);
      let walletBUserInfo = await rewardsManagerContract.userInfo(0, walletB.address);
      expect(walletBUserInfo.amount.toNumber(), "User B should have 42 blocks now").to.equal(42);
    });

  });
  
  describe("Scenario: Claiming BLS rewards", function() {

    it("Create fresh wallets (signers)", async function() {
      [owner, walletA, walletB, walletC, walletD] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    // it("Claim all BLS tokens, but no BLS on contract, so state of rewards should not change.", async function() {
    //  

    //   let blsBalanceInitial = await blsContract.balanceOf(walletA.address);
    //   // A Purchase 4 blocks
    //   await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0706", "0807", "imagehash1", {value: 10});
    //   await mineBlocks(7);
    //   let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
    //   expect(pendingTokens, "Owner needs to have BLS_5_PER_BLOCK * 7 * 4 blocks rewards").to.equal(BLS_5_PER_BLOCK * 7 * 4);
    //   await rewardsManagerContract.connect(walletA).claim(0);
    //   let blsBalanceAfter = await blsContract.balanceOf(walletA.address);
    //   expect(blsBalanceAfter.sub(blsBalanceInitial), "Balance needs to be still 0 BLS after claim").to.equal(0);
    //   pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
    //   expect(pendingTokens, "Owner needs to have BLS_5_PER_BLOCK * 8 * 4 blocks rewards").to.equal(BLS_5_PER_BLOCK * 8 * 4);
    // });

    it("Claim all BLS tokens (rewards of user).", async function() {
      await setup();
      await blsContract.transfer(rewardsManagerContract.address, utils.parseEther("2000"));

      let blsBalanceInitial = await blsContract.balanceOf(walletB.address);

      // A Purchase 4 blocks
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0706", "0807", "imagehash1", {value: 100});
      await mineBlocks(7);

      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokens, "Owner needs to have BLS_5_PER_BLOCK * 7 * 4 blocks rewards").to.equal(BLS_5_PER_BLOCK * 7 * 4);

      await rewardsManagerContract.connect(walletB).claim(0);

      let blsBalanceAfter = await blsContract.balanceOf(walletB.address);
      expect(blsBalanceAfter.sub(blsBalanceInitial), "Balance needs to be 140 BLS after claim").to.equal(BLS_5_PER_BLOCK * 8 * 4);

      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokens, "After claim pending bls should be 0").to.equal(BLS_5_PER_BLOCK * 0 * 4);
    });

  });

  describe("Scenario: Proper BLS last rewards calculations", function() {

    it("Create fresh wallets (signers)", async function() {
      // simulate different wallets: the owner of the contract and two other wallets A and B
      [owner, walletA, walletB, walletC, walletD] = await ethers.getSigners();     
    });

    it("10 bls rewards, which run out and user properly claims and sees no more pending rewards", async function() {
      await setupWithBlsDoposit(10, 1);
      let blsBalanceAfter = await blsContract.balanceOf(rewardsManagerContract.address);
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 10});
      let block = await ethers.provider.getBlock();
      let blockNr = await rewardsManagerContract.blsRewardsFinishedBlock();
      expect(blockNr.toNumber()-block.number, "This rewards need to hold for 10 blocks").to.equal(10);

      await mineBlocks(12);

      await rewardsManagerContract.connect(walletA).claim(0); // Claim everything
      blsBalanceAfter = await blsContract.balanceOf(walletA.address);
      expect(blsBalanceAfter.toNumber(), "Balance needs to be 10 BLS after claim").to.equal(10);
      //Rewards now finished. User should not see anything to claim anymore
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "Rewards finished, nothing should be to claim").to.equal(0);
    });

    it("3 purchases, different amounts, different block, last block needs to be properly calculated", async function() {
      // User A at 1 block buys 4 blocks
      // User B at 5 block buys 6 blocks
      // User C at 8 block buys 10 blocks
      // User A need to get 36, user B 30 and user C 20 before rewards run out.
      // 14 BLS stays in contract, because couldnt be divided between all buyers
      await setupWithBlsDoposit(100, 1);
      let initialBlock = await ethers.provider.getBlock();
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "img1", {value: 10});
      await mineBlocks(3);
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0204", "0405", "img2", {value: 10});
      await mineBlocks(2);
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0600", "1001", "img3", {value: 10});
      let blockNr = await rewardsManagerContract.blsRewardsFinishedBlock();
      expect(blockNr.toNumber()-initialBlock.number, "Last reward should be at block 10 after initial buy").to.equal(10);
      await mineBlocks(5); // Push out of last reward
      await rewardsManagerContract.connect(walletA).claim(0);
      await rewardsManagerContract.connect(walletB).claim(0);
      await rewardsManagerContract.connect(walletC).claim(0);
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be").to.equal(36);
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be").to.equal(30);
      await expect((await blsContract.balanceOf(walletC.address)).toNumber(), "walletC bls should be").to.equal(20);
      let blsBalanceAfter = await blsContract.balanceOf(rewardsManagerContract.address);
      expect(blsBalanceAfter.toNumber(), "Since we couldnt distribute all rewards properly, there are 14 bls left").to.equal(14);
    });

    it("Same as previous, but additional deposit of BLS was added later on", async function() {
      // User A at 1 block buys 4 blocks
      // User B at 5 block buys 6 blocks
      // User C at 8 block buys 10 blocks
      // Additional deposit of 26 bls is added at block 8
      // so all rewards should now be distributed from contract in next 2 blocks 
      // User A needs to get 44, user B 42 and user C 40 before rewards run out.
      await setupWithBlsDoposit(100, 1);
      let initialBlock = await ethers.provider.getBlock();
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "img1", {value: 10});
      await mineBlocks(3);
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0204", "0405", "img2", {value: 10});
      await mineBlocks(2);
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0600", "1001", "img3", {value: 10});
      await blsContract.approve(rewardsManagerContract.address, 26);
      await rewardsManagerContract.depositBlsRewardsForDistribution(26);
      let blockNr = await rewardsManagerContract.blsRewardsFinishedBlock();
      expect(blockNr.toNumber()-initialBlock.number, "Last reward should be at block 10 after initial buy").to.equal(12);
      await mineBlocks(5); // Push out of last reward bounds
      await rewardsManagerContract.connect(walletA).claim(0);
      await rewardsManagerContract.connect(walletB).claim(0);
      await rewardsManagerContract.connect(walletC).claim(0);
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be 44").to.equal(44);
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be 42").to.equal(42);
      await expect((await blsContract.balanceOf(walletC.address)).toNumber(), "walletC bls should be 40").to.equal(40);
      let blsBalanceAfter = await blsContract.balanceOf(rewardsManagerContract.address);
      expect(blsBalanceAfter.toNumber(), "Since we couldnt distribute all rewards properly, there are 0 bls left").to.equal(0);
    });

    it("Calling method depositBlsRewardsForDistribution without any blocks bought yet", async function() {
      
      await setupWithBlsDoposit(0);
      await blsContract.approve(rewardsManagerContract.address, 1000);
      await rewardsManagerContract.depositBlsRewardsForDistribution(1000);
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "img1", {value: 10});
      await mineBlocks(3);
      await rewardsManagerContract.connect(walletA).claim(0);
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be 80").to.equal(80);
      
    });

  });

});

