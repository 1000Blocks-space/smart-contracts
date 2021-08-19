const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { MockProvider, solidity, loadFixture, deployContract } = require("ethereum-waffle");
const { utils, BigNumber } = require("ethers");

use(solidity);

describe("Testing BlocksRewardsManager", function() {

  const BLS_5_PER_BLOCK = 5;
  let blsContract;
  let rewardsManagerContract;
  let blocksStaking;
  let blocksSpaceContract;
  let blocksSpace2Contract;
  let owner;

  async function setupWithBlsDoposit(amountOfBls, blsPerBlock = BLS_5_PER_BLOCK) {
    [owner, walletA, walletB, walletC, walletD] = await ethers.getSigners();
    const contractObject = await ethers.getContractFactory("BLSToken");
    blsContract = await contractObject.deploy();
    const blocksStakingObject = await ethers.getContractFactory("BlocksStaking");
    blocksStaking = await blocksStakingObject.deploy(blsContract.address);
    const contractObject2 = await ethers.getContractFactory("BlocksRewardsManager");
    rewardsManagerContract = await contractObject2.deploy(blsContract.address, blocksStaking.address, owner.address);
    const contractObject3 = await ethers.getContractFactory("BlocksSpace");
    blocksSpaceContract = await contractObject3.deploy(rewardsManagerContract.address);
    await rewardsManagerContract.addSpace(blocksSpaceContract.address, blsPerBlock);
    await blsContract.transfer(rewardsManagerContract.address, amountOfBls);
  }

  async function setupWith2Spaces(amountOfBls, space1BlsPerBlock, space2BlsPerBlock) {
    [owner, walletA, walletB, walletC, walletD] = await ethers.getSigners();
    const contractObject = await ethers.getContractFactory("BLSToken");
    blsContract = await contractObject.deploy();
    const blocksStakingObject = await ethers.getContractFactory("BlocksStaking");
    blocksStaking = await blocksStakingObject.deploy(blsContract.address);
    const contractObject2 = await ethers.getContractFactory("BlocksRewardsManager");
    rewardsManagerContract = await contractObject2.deploy(blsContract.address, blocksStaking.address, owner.address);
    const contractObject3 = await ethers.getContractFactory("BlocksSpace");
    blocksSpaceContract = await contractObject3.deploy(rewardsManagerContract.address);
    const contractObject4 = await ethers.getContractFactory("BlocksSpace");
    blocksSpace2Contract = await contractObject4.deploy(rewardsManagerContract.address);
    await rewardsManagerContract.addSpace(blocksSpaceContract.address, space1BlsPerBlock);
    await rewardsManagerContract.addSpace(blocksSpace2Contract.address, space2BlsPerBlock);
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

    it("Purchase 1 block.area, but no rewards in manager yet, so no rewards", async function() {
      await setupWithBlsDoposit(0);
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 1});
      await mineBlocks(4);
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "There should be 0 pending BLS").to.equal(0);
    });

    it("Purchase 1 block.area", async function() {
      await setupWithBlsDoposit(1000);
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 1});
      await mineBlocks(4);
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "There should be 20 pending BLS").to.equal(BLS_5_PER_BLOCK * 4);
      await mineBlocks(6);
      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens).to.equal(BLS_5_PER_BLOCK * 10);
    });

    it("Rewards of 2 purchases of non overlapping block.areas", async function() {
      await setupWithBlsDoposit(1000);
      // purchase 1 block.area
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 1});
      // 1 transaction
      await mineBlocks(1);
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "There should be 5 bls rewards").to.equal(BLS_5_PER_BLOCK * 1);

      // 1 transaction // purchase 9 block.area
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1212", "1414", "imagehash2", {value: 10});
      
      // // 3 transactions
      await mineBlocks(3);
      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "After second users buy, first user should have 25").to.equal(BLS_5_PER_BLOCK * 5); 
      
      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens).to.equal(BLS_5_PER_BLOCK * 3 * 9); // 3 x 8 x 5 bls rewards 
    });

    it("Rewards of complete take over of blockareas (second user buys all from first user)", async function() {
      await setupWithBlsDoposit(1000);
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
      await setupWithBlsDoposit(1000);
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

    it("User pays 100 BNB, 5% goes to treasury", async function() {
      await setupWithBlsDoposit(1000);
      
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

    it("User takes over half of previous users blocks", async function() {
      await setupWithBlsDoposit(1000);
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
      await setupWithBlsDoposit(1000);
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

    it("Claim all BLS tokens (rewards of user).", async function() {
      await setupWithBlsDoposit(1000);
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

    it("10 bls rewards, which run out and user properly claims and sees no more pending rewards", async function() {
      await setupWithBlsDoposit(10, 1);
      let blsBalanceAfter = await blsContract.balanceOf(rewardsManagerContract.address);
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 10});
      let block = await ethers.provider.getBlock();
      let blockNr = await rewardsManagerContract.blsLastRewardsBlock();
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
      let blockNr = await rewardsManagerContract.blsLastRewardsBlock();
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

    //BUG: IDX-013 Incorrect Condition
    it("should distribute all rewards that are in pool, but not more.", async function() {
      await setupWithBlsDoposit(120, 1);
      // A purchases 4 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "img1", {value: 10});

      await mineBlocks(18); 
      await rewardsManagerContract.connect(walletA).claim(0); // user has now 76 blocks to claim
      let walletABlsBalance = (await blsContract.balanceOf(walletA.address)).toNumber();
      await expect(walletABlsBalance, "walletA bls should be").to.equal(76);
      
      // B purchases 4 blocks
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0204", "0305", "img2", {value: 10}); // 80 reserved already
      // From now on, there are 40 rewards remaining, should it should distribute all in 5 blocks. Each 4 

      await mineBlocks(8);
      
      let pendingA = (await rewardsManagerContract.pendingBlsTokens(0, walletA.address)).toNumber();
      let pendingB = (await rewardsManagerContract.pendingBlsTokens(0, walletB.address)).toNumber();
      expect(pendingA + pendingB + walletABlsBalance, "All rewards after finish should be less than input").to.be.lte(120);
    });

    // BUG: Not proper reward debt calculations
    it("should properly distribute rewards after same user buys multiple times", async function() {

      await setupWithBlsDoposit(100, 1);
      // let initialBlock = await ethers.provider.getBlock();
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      // A purchasese 1 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0002", "0002", "imagehash1", {value: 10});
      await mineBlocks(3);
      // A purchasese 4 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
      let pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 4*1 bls").to.equal(4);
      await mineBlocks(3);
      // A purchasese 10 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0705", "1106", "imagehash1", {value: 10});
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 4 + 4*5*1 bls").to.equal(24);
    });

    it("should properly distribute rewards after same user buys multiple times and someone already bought before", async function() {

      await setupWithBlsDoposit(1000, 1);
      // let initialBlock = await ethers.provider.getBlock();
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      // B purchasese 4 blocks
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("1000", "1101", "imagehash1", {value: 10});
      await mineBlocks(10);
      let pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 10*1*4 bls").to.equal(40);

      // A purchasese 1 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0002", "0002", "imagehash1", {value: 10});
      await mineBlocks(3);

      // A purchasese 4 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
      let pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 4*1 bls").to.equal(4);
      await mineBlocks(10);

      // A purchasese 10 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0705", "1106", "imagehash1", {value: 10});
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 4 + 11*5*1 bls").to.equal(59);

      // Now user C does a takeover of 1 of users A block
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0705", "0705", "imagehash1", {value: 20});
      await mineBlocks(1);
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 59+15+14 bls").to.equal(88);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 28*4 bls").to.equal(28*4);
      let pendingTokensC = await rewardsManagerContract.pendingBlsTokens(0, walletC.address);
      expect(pendingTokensC, "C should have 1 bls").to.equal(1);
    });

    it("should properly distribute rewards after same user buys multiple times and someone already bought before. Then takeover of 1 block happens.", async function() {

      await setupWithBlsDoposit(2000, 1);
      // let initialBlock = await ethers.provider.getBlock();
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      // // B purchasese 4 blocks
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("1000", "1101", "imagehash1", {value: 10});
      await mineBlocks(10);
      let pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 10*1*4 bls").to.equal(40);

      // A purchasese 1 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0002", "0002", "imagehash1", {value: 10});
      await mineBlocks(9);

      // A purchasese 4 blocks, A = 5
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
      let pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 10 bls").to.equal(10);
      await mineBlocks(9);

      // A purchasese 42 blocks, A = 47
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0705", "1310", "imagehash1", {value: 42});
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 10 + 50 bls").to.equal(60);

      await mineBlocks(9); // 47 per block

      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 40 * 4 * 1 bls").to.equal(160);
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 60+ 9 * 47 bls").to.equal(483);

      await rewardsManagerContract.connect(walletA).claim(0);
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be 530").to.equal(530);
      await rewardsManagerContract.connect(walletB).claim(0);
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be 168").to.equal(168);

      await mineBlocks(1);
      await rewardsManagerContract.connect(walletB).claim(0); // 8 extra
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be 176").to.equal(176);
      
      await mineBlocks(1);
      await rewardsManagerContract.connect(walletB).claim(0);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should be 0 pending bls").to.equal(0);

      // Suming up all rewards until now. Consumed = 949
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be 530").to.equal(530);
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be 176").to.equal(184);
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should be 235 pending bls").to.equal(235);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should be 0 pending bls").to.equal(0);


      // B now takes over 1 blocks from A. Before: A = 47, B = 4
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0705", "0705", "imagehash1", {value: 100}); // B = +4
      // A has +47 rewards in pipeline. All together pending: 
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 235 + 47 - 282 bls").to.equal(282);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "A should have 1 * 4 bls").to.equal(4);
      // Reards here : A = 46 B = 5
      await mineBlocks(10);

      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 742 bls").to.equal(742);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "A should have 54 bls").to.equal(54);

      await rewardsManagerContract.connect(walletA).claim(0);
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls END should be 1318").to.equal(1318);
      await rewardsManagerContract.connect(walletB).claim(0);
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls END should be 248").to.equal(248);
    });

    it("should properly distribute rewards after same user buys multiple times and someone already bought before. Then takeover of 12 blocks happens", async function() {

      await setupWithBlsDoposit(2000, 1);
      // let initialBlock = await ethers.provider.getBlock();
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      // // B purchasese 4 blocks
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("1000", "1101", "imagehash1", {value: 10});
      await mineBlocks(10);
      let pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 10*1*4 bls").to.equal(40);

      // A purchasese 1 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0002", "0002", "imagehash1", {value: 10});
      await mineBlocks(9);

      // A purchasese 4 blocks, A = 5
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
      let pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 10 bls").to.equal(10);
      await mineBlocks(9);

      // A purchasese 42 blocks, A = 47
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0705", "1310", "imagehash1", {value: 42});
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 10 + 50 bls").to.equal(60);

      await mineBlocks(9); // 47 per block

      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 40 * 4 * 1 bls").to.equal(160);
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 60+ 9 * 47 bls").to.equal(483);

      await rewardsManagerContract.connect(walletA).claim(0);
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be 530").to.equal(530);
      await rewardsManagerContract.connect(walletB).claim(0);
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be 168").to.equal(168);

      await mineBlocks(1);
      await rewardsManagerContract.connect(walletB).claim(0); // 8 extra
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be 176").to.equal(176);
      
      await mineBlocks(1);
      await rewardsManagerContract.connect(walletB).claim(0);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should be 0 pending bls").to.equal(0);

      // Suming up all rewards until now. Consumed = 949
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be 530").to.equal(530);
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be 176").to.equal(184);
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should be 235 pending bls").to.equal(235);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should be 0 pending bls").to.equal(0);


      // B now takes over 12 blocks from A. Before: A = 47, B = 4 
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0705", "0908", "imagehash1", {value: 100}); // B = +4
      // A has +47 rewards in pipeline. All together pending: 
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 235 + 47 - 282 bls").to.equal(282);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "A should have 1 * 4 bls").to.equal(4);
      // Reards here : A = 35 B = 16
      await mineBlocks(10);

      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 282 + 10 * 35 bls").to.equal(632);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "A should have 4 + 10*16 bls").to.equal(164);

      // await mineBlocks(9);

      await rewardsManagerContract.connect(walletA).claim(0);
      await rewardsManagerContract.connect(walletB).claim(0);

      let balanceAEnd = (await blsContract.balanceOf(walletA.address)).toNumber();
      let balanceBEnd = (await blsContract.balanceOf(walletB.address)).toNumber();
      let balanceOfContractEnd = (await blsContract.balanceOf(rewardsManagerContract.address)).toNumber();

      await expect(balanceAEnd + balanceBEnd, "Sum of all claims needs to be same as initial BLS deposit to contract minus balance").to.equal(2000-balanceOfContractEnd);
      
    });

    // BUGFIX
    it("should properly distribute rewards after same user buys multiple times and someone already bought before. Then takeover of 12 blocks happens. all while rewards deposited run out", async function() {

      await setupWithBlsDoposit(1000, 1);
      // let initialBlock = await ethers.provider.getBlock();
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      // // B purchasese 4 blocks
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("1000", "1101", "imagehash1", {value: 10});
      await mineBlocks(10);
      let pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 10*1*4 bls").to.equal(40);

      // A purchasese 1 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0002", "0002", "imagehash1", {value: 10});
      await mineBlocks(9);

      // A purchasese 4 blocks, A = 5
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
      let pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 10 bls").to.equal(10);
      await mineBlocks(9);

      // A purchasese 42 blocks, A = 47
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0705", "1310", "imagehash1", {value: 42});
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 10 + 50 bls").to.equal(60);

      await mineBlocks(9); // 47 per block

      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 40 * 4 * 1 bls").to.equal(160);
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 60+ 9 * 47 bls").to.equal(483);

      await rewardsManagerContract.connect(walletA).claim(0);
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be 530").to.equal(530);
      await rewardsManagerContract.connect(walletB).claim(0);
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be 168").to.equal(168);

      await mineBlocks(1);
      await rewardsManagerContract.connect(walletB).claim(0); // 8 extra
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be 176").to.equal(176);
      
      await mineBlocks(1);
      await rewardsManagerContract.connect(walletB).claim(0);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should be 0 pending bls").to.equal(0);

      // Suming up all rewards until now. Consumed = 949
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be 530").to.equal(530);
      await expect((await blsContract.balanceOf(walletB.address)).toNumber(), "walletB bls should be 176").to.equal(184);
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should be 235 pending bls").to.equal(235);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should be 0 pending bls").to.equal(0);


      // B now takes over 12 blocks from A. Before: A = 47, B = 4 
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0705", "0705", "imagehash1", {value: 100}); // B = +4
      // A has +47 rewards in pipeline. All together pending: 
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 235 + 47 - 282 bls").to.equal(282);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 1 * 4 bls").to.equal(4);

      expect((await blsContract.balanceOf(rewardsManagerContract.address)).toNumber(), "Balance of contract is 286").to.equal(286);
      // Here A = 46, B = 5 
      // If at this point we would claim, then we run out of rewards. What happens nexT? Noone knows...
      await mineBlocks(3);

      // ITs actually not true that noone knows, we know! Rewards stay same...
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should still have 282 bls").to.equal(282);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 4 bls").to.equal(4);

      // Now all users claim last rewards
      await rewardsManagerContract.connect(walletA).claim(0);
      await rewardsManagerContract.connect(walletB).claim(0);

      let balanceAEnd = (await blsContract.balanceOf(walletA.address)).toNumber();
      let balanceBEnd = (await blsContract.balanceOf(walletB.address)).toNumber();
      let balanceOfContractEnd = (await blsContract.balanceOf(rewardsManagerContract.address)).toNumber();

      await expect(balanceAEnd + balanceBEnd, "Sum of all claims needs to be same as initial BLS deposit to contract minus balance").to.equal(1000-balanceOfContractEnd);
      
      await mineBlocks(4);
      // B purchases 9 blocks additionally
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("1412", "1614", "imagehash1", {value: 10});
      await mineBlocks(2);
      // Now using A = 46, B = 14 => 60 per block 
      await blsContract.approve(rewardsManagerContract.address, 2000);
      await rewardsManagerContract.depositBlsRewardsForDistribution(1000);

      await mineBlocks(18); // Rewards run out again

      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 736X bls").to.equal(736);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "A should have 224 bls").to.equal(224);
      
      await rewardsManagerContract.connect(walletA).claim(0);
      let balanceBBeforeEnd = (await blsContract.balanceOf(walletB.address)).toNumber();
      await rewardsManagerContract.connect(walletB).claim(0);

      balanceAEnd = (await blsContract.balanceOf(walletA.address)).toNumber();  
      balanceBEnd = (await blsContract.balanceOf(walletB.address)).toNumber();

      balanceOfContractEnd = (await blsContract.balanceOf(rewardsManagerContract.address)).toNumber();
      expect(balanceBEnd - balanceBBeforeEnd, "B should have 224 bls at end").to.equal(224);

      await expect(balanceAEnd + balanceBEnd, "Sum of all claims needs to be same as initial BLS deposit to contract minus balance").to.equal(2000-balanceOfContractEnd);
      
    });

    it("should work properly if first tokens are added to contract, then space is added", async function() {

      // Special setup here:
      [owner, walletA, walletB, walletC, walletD] = await ethers.getSigners();
      const contractObject = await ethers.getContractFactory("BLSToken");
      blsContract = await contractObject.deploy();
      const blocksStakingObject = await ethers.getContractFactory("BlocksStaking");
      blocksStaking = await blocksStakingObject.deploy(blsContract.address);
      const contractObject2 = await ethers.getContractFactory("BlocksRewardsManager");
      rewardsManagerContract = await contractObject2.deploy(blsContract.address, blocksStaking.address, owner.address);
      const contractObject3 = await ethers.getContractFactory("BlocksSpace");
      blocksSpaceContract = await contractObject3.deploy(rewardsManagerContract.address);

      await blsContract.approve(rewardsManagerContract.address, 1000);
      await rewardsManagerContract.depositBlsRewardsForDistribution(1000);

      await mineBlocks(10);

      await rewardsManagerContract.addSpace(blocksSpaceContract.address, 1);

      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      // B purchasese 4 blocks
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("1000", "1101", "imagehash1", {value: 10});
      await mineBlocks(10);
      let pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 10*1*4 bls").to.equal(40);

      // A purchasese 1 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0002", "0002", "imagehash1", {value: 10});
      await mineBlocks(3);

      // A purchasese 4 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
      let pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 4*1 bls").to.equal(4);
      await mineBlocks(10);

      // A purchasese 10 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0705", "1106", "imagehash1", {value: 10});
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 4 + 11*5*1 bls").to.equal(59);

      // Now user C does a takeover of 1 of users A block
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0705", "0705", "imagehash1", {value: 20});
      await mineBlocks(1);
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A should have 59+15+14 bls").to.equal(88);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B should have 28*4 bls").to.equal(28*4);
      let pendingTokensC = await rewardsManagerContract.pendingBlsTokens(0, walletC.address);
      expect(pendingTokensC, "C should have 1 bls").to.equal(1);
    });

  });
  describe("Scenario: Depositing additional BLS rewards to RewardsManager", function() {
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
      let blockNr = await rewardsManagerContract.blsLastRewardsBlock();
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

    it("should properly distribute rewards when rewards run out then after X blocks they are refilled", async function() {
      await setupWithBlsDoposit(100, 5);
      // Buys 4 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "img1", {value: 10});
      // After 5 blocks rewards run out
      await mineBlocks(8);
      expect((await rewardsManagerContract.pendingBlsTokens(0, walletA.address)).toNumber(), "Pending BLS should be all bls = 100").to.equal(100);
      await rewardsManagerContract.connect(walletA).claim(0); // Then we claim and should be also 100
      await expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be 100").to.equal(100);
      await mineBlocks(2); // We simply mine a bit more
      await blsContract.approve(rewardsManagerContract.address, 100);
      await rewardsManagerContract.depositBlsRewardsForDistribution(100);
      await mineBlocks(3);
      expect((await rewardsManagerContract.pendingBlsTokens(0, walletA.address)).toNumber(), "Pending BLS should be 60 BLS after 3 blocks").to.equal(60);
      await rewardsManagerContract.connect(walletA).claim(0); // Then we claim and should be 180
      expect((await blsContract.balanceOf(walletA.address)).toNumber(), "walletA bls should be 180").to.equal(180);

    });
  });

  describe("Scenario: Proper BLS distribution when changing BLS rewards per block", function() {

    it("should properly distribute rewards when blsperblockareaperblock are updated", async function() {
      await setupWithBlsDoposit(10000, 10); // 10000 bls, 10 bls per block per token
      // Purchase 10 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0002", "0403", "imagehash1", {value: 10});
      // First
      await mineBlocks(9);

      // At block 10 we change amount to bls per block per token to 5
      await rewardsManagerContract.updateBlsPerBlockAreaPerBlock(0, 5);

      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "Owner rewards are 10 blocks x 10 * 10 blocks").to.equal(1000);

      await mineBlocks(10);

      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "Owner rewards are 1000 + 500 blocks").to.equal(1500);
    });

    it("should properly distribute rewards when blsperblockareaperblock is set to 0", async function() {
      await setupWithBlsDoposit(10000, 10); // 10000 bls, 10 bls per block per token
      // Purchase 10 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0002", "0403", "imagehash1", {value: 10});
      // First
      await mineBlocks(9);

      // At block 10 we change amount to bls per block per token to 5
      await rewardsManagerContract.updateBlsPerBlockAreaPerBlock(0, 0);

      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "Owner rewards are 10 blocks x 10 * 10 blocks").to.equal(1000);

      await mineBlocks(10);

      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "Owner rewards are 1000 + 500 blocks").to.equal(1000);
    });
    
    it("should properly distribute rewards when blsperblockareaperblock is changed with multiple spaces", async function() {
      await setupWith2Spaces(410, 10, 5);
      // Purchase 1 blocks on space 0
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1213", "1213", "imagehash1", {value: 10});
      // Purchase 1 blocks on space 1
      await blocksSpace2Contract.connect(walletB).purchaseBlocksArea("1213", "1213", "imagexxx", {value: 10});

      // First
      await mineBlocks(9);

      // At block 10 we change amount to bls per block per token to 5
      await rewardsManagerContract.updateBlsPerBlockAreaPerBlock(1, 0);

      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "A rewards are should be 11*10 blocks").to.equal(110);
      let pendingTokensB = await rewardsManagerContract.pendingBlsTokens(1, walletB.address);
      expect(pendingTokensB, "B rewards should be 10*5 blocks").to.equal(50);

      await rewardsManagerContract.updateBlsPerBlockAreaPerBlock(0, 20); // R 170

      await mineBlocks(40); // Run out of rewards

      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "AA rewards are should be 360 blocks").to.equal(360);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(1, walletB.address);
      expect(pendingTokensB, "BB rewards should stay 50 blocks").to.equal(50);
    });

  });
  
  describe("Scenario: Multiple spaces", function() {

    it("should properly distribute rewards when we have more spaces", async function() {

      await setupWith2Spaces(100, 10, 5);
      // Purchase 10 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1213", "1213", "imagehash1", {value: 10});
      await blocksSpace2Contract.connect(walletB).purchaseBlocksArea("1213", "1213", "imagexxx", {value: 10});

      // At this point, user A already has 1 BLS
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "A rewards are 10 bls").to.equal(10);

      // So rewards should last for 6 blocks more
      await mineBlocks(6);

      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "A rewards are 70 bls").to.equal(70);

      let pendingTokensB = await rewardsManagerContract.pendingBlsTokens(1, walletB.address);
      expect(pendingTokensB, "B rewards are 30 bls").to.equal(30);
    });

    it("should properly distribute rewards when we add space later on", async function() {

      await setupWithBlsDoposit(1000, 2);

      // 4 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
      // 10 blocks
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0705", "1106", "imagehash1", {value: 10});

      await mineBlocks(3);
      let pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A rewards are 32 bls").to.equal(32);
      let pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B rewards are 60 bls").to.equal(60);

      // Now we get another space into action with BLS per block = 10
      const contractObject4 = await ethers.getContractFactory("BlocksSpace");
      blocksSpace2Contract = await contractObject4.deploy(rewardsManagerContract.address); // Transaction mined
      await rewardsManagerContract.addSpace(blocksSpace2Contract.address, 10); // Transaction mined
      
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A rewards are 48 bls").to.equal(48);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B rewards are 100 bls").to.equal(100);

      // Now user C and D purchase on space 1
      // 4 blocks
      await blocksSpace2Contract.connect(walletC).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
      let blsPerBlock = await rewardsManagerContract.blsPerBlock();
      expect(blsPerBlock, "blsPerBlock should now be updated with").to.equal(68);
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A rewards are 56 bls").to.equal(56);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B rewards are 120 bls").to.equal(120);
      let pendingTokensC = await rewardsManagerContract.pendingBlsTokens(1, walletC.address);
      expect(pendingTokensC, "C rewards are 0 bls").to.equal(0);

      await mineBlocks(1);
      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A rewards are 64 bls").to.equal(64);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B rewards are 140 bls").to.equal(140);
      pendingTokensC = await rewardsManagerContract.pendingBlsTokens(1, walletC.address);
      expect(pendingTokensC, "C rewards are 40 bls").to.equal(40);

      await mineBlocks(17);
      // Here all rewards should run out

      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      pendingTokensC = await rewardsManagerContract.pendingBlsTokens(1, walletC.address);

      expect(pendingTokensA.add(pendingTokensB).add(pendingTokensC), "SUM rewards should be 992 bls").to.equal(992);
    });

    it("should not be able to add space with same address", async function() {
      await setupWithBlsDoposit(1000, 2);
      await expect(rewardsManagerContract.addSpace(blocksSpaceContract.address, 2)).to.be.revertedWith("Space is already added.");
    });

    it("should properly distribute rewards when we add space later on wi th purchase on space 0", async function() {

      await setupWithBlsDoposit(1000, 2);

      // 4 blocks
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
      // 10 blocks
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0705", "1106", "imagehash1", {value: 10});

      await mineBlocks(3);
      let pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A rewards are 32 bls").to.equal(32);
      let pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B rewards are 60 bls").to.equal(60);

      // Now we get another space into action with BLS per block = 10
      const contractObject4 = await ethers.getContractFactory("BlocksSpace");
      blocksSpace2Contract = await contractObject4.deploy(rewardsManagerContract.address); // Transaction mined
      await rewardsManagerContract.addSpace(blocksSpace2Contract.address, 10); // Transaction mined
      
      // Now user C 2 blocks on space 0
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0206", "0207", "imagehash1", {value: 10});

      pendingTokensA = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokensA, "A rewards are 56 bls").to.equal(56);
      pendingTokensB = await rewardsManagerContract.pendingBlsTokens(0, walletB.address);
      expect(pendingTokensB, "B rewards are 120 bls").to.equal(120);

      // Now user D purchase on space 1
      // 4 blocks
      await blocksSpace2Contract.connect(walletD).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
      let pendingTokensC = await rewardsManagerContract.pendingBlsTokens(0, walletC.address);
      expect(pendingTokensC, "C rewards are 4 bls").to.equal(4);
      await mineBlocks(2);
      pendingTokensC = await rewardsManagerContract.pendingBlsTokens(0, walletC.address);
      expect(pendingTokensC, "CC rewards are 12 bls").to.equal(12);
      let pendingTokensD = await rewardsManagerContract.pendingBlsTokens(1, walletD.address);
      expect(pendingTokensD, "D rewards are 80 bls").to.equal(80);
    });
  });

});
// // 1 block
// await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0002", "0002", "imagehash1", {value: 10});
// // 4 blocks
// await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 10});
// // 10 blocks
// await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0705", "1106", "imagehash1", {value: 10});
// // 2 blocks
// await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0206", "0207", "imagehash1", {value: 10});
// // 9 blocks
// await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0407", "0609", "imagehash1", {value: 10});
      

