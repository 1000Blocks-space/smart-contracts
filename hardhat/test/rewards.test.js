const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { MockProvider, solidity, loadFixture, deployContract } = require("ethereum-waffle");

use(solidity);

describe("Testing BlocksRewardsManager", function() {

  const BLS_5_PER_BLOCK = 5;
  let blsContract;
  let rewardsManagerContract;
  let blocksStaking;
  let blocksSpaceContract;
  
  async function setup() {
    const contractObject = await ethers.getContractFactory("BLSToken");
    blsContract = await contractObject.deploy();
    const blocksStakingObject = await ethers.getContractFactory("BlocksStaking");
    blocksStaking = await blocksStakingObject.deploy(blsContract.address);
    const contractObject2 = await ethers.getContractFactory("BlocksRewardsManager");
    rewardsManagerContract = await contractObject2.deploy(blsContract.address, blocksStaking.address);
    const contractObject3 = await ethers.getContractFactory("BlocksSpace");
    blocksSpaceContract = await contractObject3.deploy(rewardsManagerContract.address);
    await rewardsManagerContract.addSpace(blocksSpaceContract.address, BLS_5_PER_BLOCK);
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

  describe("Scenario: Rewards distribution", function() {

    it("Create wallets (signers)", async function() {
      [owner, walletA, walletB] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    it("Purchase 1 block.area", async function() {
      await setup();
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("0000", "0000", "imagehash1", "https://1000block.space", {value: 1});
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
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("0100", "0100", "imagehash1", "https://1000block.space", {value: 1});
      // 1 transaction
      await mineBlocks(1);
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens).to.equal(BLS_5_PER_BLOCK * 1);

      // 1 transaction // purchase 9 block.area
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1212", "1414", "imagehash2", "https://1000block.space", {value: 10});
      
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
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("1212", "1414", "imagehash1", "https://1000block.space", {value: 10});
      // 2 transactions
      await mineBlocks(2);
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "Owner needs to have 2 blocks x BLS_PER_BLOCK * 9 blocks rewards").to.equal(BLS_5_PER_BLOCK * 2 * 9);

      // 1 transaction // Wallet A purchases all owners block.areas for higher price
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1212", "1414", "imagehash2", "https://1000block.space", {value: 200});
      
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
      await blocksSpaceContract.connect(owner).purchaseBlocksArea("1212", "1316", "imagehash1", "https://1000block.space", {value: 10});
      // 2 transactions
      await mineBlocks(2);
      let pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "Owner rewards are 2 blocks x BLS_5_PER_BLOCK * 10 blocks").to.equal(BLS_5_PER_BLOCK * 2 * 10);

      // 1 transaction // Wallet A purchases 6 of owners block.areas for higher price
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1212", "1314", "imagehash2", "https://1000block.space", {value: 40});
      
      // mine 2 additional transactions
      await mineBlocks(2);

      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, owner.address);
      expect(pendingTokens, "Owners rewards are BLS_5_PER_BLOCK x 3 blocks x 10 areas + BLS_5_PER_BLOCK x 2 blocks x 4 areas").to.equal(BLS_5_PER_BLOCK * 3 * 10 + BLS_5_PER_BLOCK * 2 * 4);
      
      pendingTokens = await rewardsManagerContract.pendingBlsTokens(0, walletA.address);
      expect(pendingTokens, "WalletA rewards are BLS_5_PER_BLOCK x 2 blocks x 6 areas").to.equal(BLS_5_PER_BLOCK * 2 * 6);
    });
  });

});

