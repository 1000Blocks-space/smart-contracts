const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { MockProvider, solidity, loadFixture, deployContract } = require("ethereum-waffle");

use(solidity);

describe("Testing BlocksSpace", function() {

  let blsContract;
  let rewardsManagerContract;
  let blocksSpaceContract;
  async function setup() {
    const contractObject = await ethers.getContractFactory("BLSToken");
    blsContract = await contractObject.deploy();
    const contractObject2 = await ethers.getContractFactory("BlocksRewardsManager");
    rewardsManagerContract = await contractObject2.deploy(blsContract.address);
    const contractObject3 = await ethers.getContractFactory("BlocksSpace");
    blocksSpaceContract = await contractObject3.deploy(rewardsManagerContract.address);
    await rewardsManagerContract.addSpace(blocksSpaceContract.address, 5);
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

  describe("Scenario: Purchasing posters", function() {

    it("Setup", async function() {
      [walletA, walletB, walletC, walletD, walletE] = await ethers.getSigners(); // simulate different wallets
      await setup();
    });
    
    it("Simple purchase of poster", async function() {
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0000", "0000", "imagehash1", "https://1000block.space", {value: 1});
    });

    it("Simple purchase without money", async function() {
      await expect(blocksSpaceContract.connect(walletB).purchaseBlocksArea("0000", "0000", "imagehash1", "https://1000block.space", {value: 0})).to.be.reverted;
    });
    
    it("Want to overtake block, but with same amount of money as previous", async function() {
      await expect(blocksSpaceContract.connect(walletB).purchaseBlocksArea("0000", "0000", "imagehash1", "https://1000block.space", {value: 1})).to.be.reverted;
    });

    it("Overtaking single block, now paying more money", async function() {
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0000", "0000", "imagehash2", "https://1000block.space", {value: 2});
    });

    it("Purchasing 3 x 3 blocks, but price increase per block too small", async function() {
      await expect(blocksSpaceContract.connect(walletC).purchaseBlocksArea("0505", "0707", "imagehash2", "https://1000block.space", {value: 2})).to.be.revertedWith("Price increase too small");
    });
    
    it("Purchasing 3 x 3 blocks, paying at least 1 / block more.", async function() {
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0505", "0707", "imagehash2", "https://1000block.space", {value: 9});
    });
    
    it("Purchasing 7 x 7 blocks, which is too big.", async function() {
      await expect(blocksSpaceContract.connect(walletD).purchaseBlocksArea("0707", "1313", "imagehash2", "https://1000block.space", {value: 50})).to.be.revertedWith("BlocksArea invalid");
    });

    it("Purchasing 6 x 7 blocks, which is biggest possible blocksarea.", async function() {
      await blocksSpaceContract.connect(walletD).purchaseBlocksArea("0707", "1213", "imagehash2", "https://1000block.space", {value: 50});
    });
    
    it("Purchasing 1 x 7 blocks, which is stretched blocksarea.", async function() {
      await blocksSpaceContract.connect(walletE).purchaseBlocksArea("1314", "1914", "imagehash2", "https://1000block.space", {value: 7});
    });

  });

  describe("Scenario: User can buy second poster only after 42 hours", function() {

    it("Create wallets (signers)", async function() {
      [owner] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    it("Same wallet cannot purchase 2 blockareas immediately", async function() {
      await setup();
      await blocksSpaceContract.purchaseBlocksArea("0000", "0000", "imagehash1", "https://1000block.space", {value: 1});
      await expect(blocksSpaceContract.purchaseBlocksArea("0000", "0000", "imagehash1", "https://1000block.space", {value: 10})).to.be.reverted;
    });

    it("Same wallet purchase 2 blockareas with span inbetween 42h", async function() {
      await setup();
      await blocksSpaceContract.purchaseBlocksArea("0100", "0100", "imagehash1", "https://1000block.space", {value: 1});
      await mineBlockAndMoveTimestamp(42 * 60 * 60 + 60); //+60s for error
      await blocksSpaceContract.purchaseBlocksArea("0100", "0100", "imagehash1", "https://1000block.space", {value: 10});
    });   
  });

  describe("Scenario: Valid posters", function() {
      
      it("Invalid posters", async function () {
        await setup();
        await expect(blocksSpaceContract.getPricesOfBlocks("0203", "0102"), "Second numbers should be bigger than first.").to.be.reverted;
        await expect(blocksSpaceContract.getPricesOfBlocks("0000", "4224"), "Trying to buy all blocks").to.be.reverted;
        await expect(blocksSpaceContract.getPricesOfBlocks("4454545", "4224"), "Simply strange numbers").to.be.reverted;
        await expect(blocksSpaceContract.getPricesOfBlocks("4123", "4022"), "Out of range posters").to.be.reverted;
      });

      it("Poster size", async function () {
        await blocksSpaceContract.getPricesOfBlocks("0000", "0000"); // Smallest possible poster
        await blocksSpaceContract.getPricesOfBlocks("0000", "0600"); // Tinyest poster, but stretched
        await expect(blocksSpaceContract.getPricesOfBlocks("0000", "0700"), "Tinyest poster out of range").to.be.reverted;
        await blocksSpaceContract.getPricesOfBlocks("3617", "4123"); // Biggest poster at edge
        await expect(blocksSpaceContract.getPricesOfBlocks("3517", "4123"), "Out of range posters").to.be.reverted;
      });

      it("Buy smallest poster on all 4 edges", async function () {
        await blocksSpaceContract.getPricesOfBlocks("0000", "0000"); 
        await blocksSpaceContract.getPricesOfBlocks("4100", "4100"); 
        await blocksSpaceContract.getPricesOfBlocks("0023", "0023"); 
        await blocksSpaceContract.getPricesOfBlocks("4123", "4123"); 
      });
  });

  describe("Scenario: Valid poster prices and sizes", function() {
      
    it("Initial price of blocks", async function () {
      await setup();
      const block = await blocksSpaceContract.blocks("0000");
      expect(block.price, "Top edge block needs to be 0").to.equal(0);

      // Blocks 303 - 604 currnetly reserved for poster
      const blockPoster0 = await blocksSpaceContract.blocks("0303");
      expect(blockPoster0.price, "Top left block of LOGO should be 42").to.equal(ethers.utils.parseEther("42"));

      const blockPoster1 = await blocksSpaceContract.blocks("0604");
      expect(blockPoster1.price, "Right bot block of LOGO should be 42").to.equal(ethers.utils.parseEther("42"));

      const edgeBlock = await blocksSpaceContract.blocks("4123");
      expect(edgeBlock.price, "Edge price is needs to be 0").to.equal(0);
    });

  });

  describe("Scenario: Retrieve users last blocksarea bought", function() {
      
    it("Create wallets (signers)", async function() {
      [owner] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    it("Initial purchase of blocksarea", async function () {
      await setup();
      await blocksSpaceContract.purchaseBlocksArea("0705", "0807", "hellohash", "https://1000block.space", {value: 100});
      let userInfo = await blocksSpaceContract.users(owner.address);
      expect(userInfo.lastBlocksAreaBought.imghash, "Image hash needs to equal to last poster").to.equal("hellohash");
      expect(userInfo.lastBlocksAreaBought.blockend, "Block end needs to be 0807").to.equal("0807");
    });

    it("User purchase another blocksarea", async function () {
      await setup();
      await blocksSpaceContract.purchaseBlocksArea("0705", "0807", "hellohash", "https://1000block.space", {value: 100});
      await mineBlockAndMoveTimestamp(42 * 60 * 60); // So user can purchase again
      await blocksSpaceContract.purchaseBlocksArea("0909", "0909", "image09", "https://1000block.space", {value: 200});
      let userInfo = await blocksSpaceContract.users(owner.address);
      expect(userInfo.lastBlocksAreaBought.imghash, "Image hash needs to equal to last poster").to.equal("image09");
      expect(userInfo.lastBlocksAreaBought.blockend, "Block end needs to be 0807").to.equal("0909");
    });

  });
});

