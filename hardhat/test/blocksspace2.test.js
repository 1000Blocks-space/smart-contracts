const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { MockProvider, solidity, loadFixture, deployContract } = require("ethereum-waffle");

use(solidity);

describe("Testing BlocksSpace", function() {

  let blsContract;
  let rewardsManagerContract;
  let blocksStaking;
  let blocksSpaceContract;
  let PRICE_OF_BLOCK;
  let MAX_BLS_TAKEOVER;
  let MIN_BLS_TAKEOVER;
  let BLS_PER_BLOCK_LOWERED;
  async function setup() {
    [owner, walletA, walletB, walletC, walletD] = await ethers.getSigners(); // simulate different wallets
    const contractObject = await ethers.getContractFactory("BLSToken");
    blsContract = await contractObject.deploy();
    const blocksStakingObject = await ethers.getContractFactory("BlocksStaking");
    blocksStaking = await blocksStakingObject.deploy(blsContract.address);
    const contractObject2 = await ethers.getContractFactory("BlocksRewardsManager2");
    rewardsManagerContract = await contractObject2.deploy(blsContract.address, blocksStaking.address, owner.address);
    const contractObject3 = await ethers.getContractFactory("BlocksSpace2");
    blocksSpaceContract = await contractObject3.deploy(rewardsManagerContract.address, blsContract.address);
    await rewardsManagerContract.addSpace(blocksSpaceContract.address, 5);
    
    await blocksSpaceContract.updateBlsFreeTimeInBlocks(15); // 5 blocks free
    await blocksSpaceContract.updateBlsTakeoverTimeInBlocks(30); // 10 blocks then we are flat
    MAX_BLS_TAKEOVER = await blocksSpaceContract.maxBlsTakeoverAmount();
    MIN_BLS_TAKEOVER = await blocksSpaceContract.minBlsTakeoverAmount();
    BLS_PER_BLOCK_LOWERED = MAX_BLS_TAKEOVER.div(10);
    PRICE_OF_BLOCK = await blocksSpaceContract.blockClaimPrice();
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

  function bls(amount){
    return ethers.utils.parseEther(amount.toString());
  }

  describe("Scenario: Basic transfers of BLS tokens and values", function() {

    it("Proper sending of BLS to RewardsManager2", async function () {
      await setup();

      let blsSupplyInitial = await blsContract.totalSupply();

      await blsContract.transfer(walletB.address, bls(400));
      console.log((await blsContract.balanceOf(walletB.address)).toString());
      console.log((await blsContract.balanceOf(blocksSpaceContract.address)).toString());
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0705", "0705", "hellohash", 0, {value: PRICE_OF_BLOCK});
      let priceOfBlocks = blocksSpaceContract.connect(walletB).getPricesOfBlocks("0705", "0705")
      await blsContract.connect(walletB).approve(blocksSpaceContract.address, bls(400));
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0705", "0705", "hellohash", bls(400), {value: PRICE_OF_BLOCK});
     
      expect(await blsContract.balanceOf(walletB.address), "Balance B should be correct ").to.equal(bls(400).sub(MAX_BLS_TAKEOVER.sub(BLS_PER_BLOCK_LOWERED.mul(2))));
      let blsSupplyFinal = await blsContract.totalSupply();
      expect(blsSupplyFinal, "BLS Suppy needs to be less than at begining since tokens were burned").to.be.lt(blsSupplyInitial);

    });

  });

  describe("Scenario: Purchasing posters", function() {

    it("Setup", async function() {
      // [walletA, walletB, walletC, walletD, walletE] = await ethers.getSigners(); // simulate different wallets
      await setup();
    });
    
    
    it("should revert if you dont send proper amount of coins", async function() {    
      await expect(blocksSpaceContract.connect(walletB).purchaseBlocksArea("0502", "0502", "imagehash1", {value: 1})).to.be.reverted;
    });

    it("Simple purchase", async function() {
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0502", "0502", "imagehash1", 0, {value: PRICE_OF_BLOCK});
    });
    
    it("Want to overtake block from user A", async function() {
      await blsContract.transfer(walletB.address, MAX_BLS_TAKEOVER);
      await blsContract.connect(walletB).approve(blocksSpaceContract.address, MAX_BLS_TAKEOVER);
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0502", "0502", "imagehash1", MAX_BLS_TAKEOVER, {value: PRICE_OF_BLOCK});
    });

    it("Purchasing 3 x 3 blocks, but price too small", async function() {
      await expect(blocksSpaceContract.connect(walletC).purchaseBlocksArea("0505", "0707", "imagehash2", {value: 8 * PRICE_OF_BLOCK})).to.be.reverted;
    });
    
    it("Purchasing 3 x 3 blocks, price too high", async function() {
      await expect(blocksSpaceContract.connect(walletC).purchaseBlocksArea("0505", "0707", "imagehash2", {value: 10 * PRICE_OF_BLOCK})).to.be.reverted;
    });
    
    it("Purchasing 3 x 3 blocks, paying proper amount", async function() {
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0505", "0707", "imagehash2", MAX_BLS_TAKEOVER.mul(9), {value: PRICE_OF_BLOCK.mul(9)});
    });
    
  });

  describe("Scenario: User can buy second poster only after 4h 20m", function() {

    it("Create wallets (signers)", async function() {
      [owner] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    it("Same wallet cannot purchase 2 blockareas immediately", async function() {
      await setup();
      await blocksSpaceContract.purchaseBlocksArea("0502", "0502", "imagehash1", 0, {value: PRICE_OF_BLOCK});
      await expect(blocksSpaceContract.purchaseBlocksArea("0602", "0602", "imagehash1", 0, {value: PRICE_OF_BLOCK})).to.be.reverted;
    });

    it("Same wallet purchase 2 blockareas with span inbetween 4h 20m", async function() {
      await setup();
      await blocksSpaceContract.purchaseBlocksArea("0702", "0702", "imagehash1", 0, {value: PRICE_OF_BLOCK});
      await mineBlockAndMoveTimestamp(4 * 60 * 60 + 1200 + 60); //+60s for error
      await blocksSpaceContract.purchaseBlocksArea("0902", "0902", "imagehash1", 0, {value: PRICE_OF_BLOCK});
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
    
    it("Price of block areas", async function () {
      await setup();
      const priceOfBlock = await blocksSpaceContract.blockClaimPrice();
      expect((await blocksSpaceContract.getPricesOfBlocks("0000", "0000"))[0].price.toString(), "Price of blocks 1").to.not.equal((1 * priceOfBlock).toString());
      expect((await blocksSpaceContract.getPricesOfBlocks("4100", "4100"))[0].price.toString(), "Price of blocks 2").to.equal((1 * priceOfBlock).toString());
      expect((await blocksSpaceContract.getPricesOfBlocks("0023", "0023"))[0].price.toString(), "Price of blocks 3").to.equal((1 * priceOfBlock).toString());
      expect((await blocksSpaceContract.getPricesOfBlocks("4123", "4123"))[0].price.toString(), "Price of blocks 4").to.equal((1 * priceOfBlock).toString());
      expect((await blocksSpaceContract.getPricesOfBlocks("0303", "0404"))[2].price.toString(), "Price of blocks 5").to.equal((1 * priceOfBlock).toString());
      expect((await blocksSpaceContract.getPricesOfBlocks("0407", "0609"))[5].price.toString(), "Price of blocks 6").to.equal((1 * priceOfBlock).toString());
      expect((await blocksSpaceContract.getPricesOfBlocks("0407", "0913"))[41].price.toString(), "Price of blocks 7").to.equal((1 * priceOfBlock).toString());
    });

    it("Price of block areas in BLS", async function () {
      await setup();
      expect((await blocksSpaceContract.getPricesOfBlocks("0000", "0000"))[0].priceBls, "Price of initial blocks (logo) should be 0").to.equal(0);
      expect((await blocksSpaceContract.getPricesOfBlocks("0002", "0002"))[0].priceBls, "Price of initial blocks should be 0").to.equal(0);
    });

    it("Price of block areas in BLS (for takeover)", async function () {
      await setup();

      await blocksSpaceContract.updateBlsFreeTimeInBlocks(15); // 5 blocks free
      const maxBlsTakeover = await blocksSpaceContract.maxBlsTakeoverAmount();
      const minBlsTakeover = await blocksSpaceContract.minBlsTakeoverAmount();
      await blocksSpaceContract.updateBlsTakeoverTimeInBlocks(90); // 30 blocks then we are flat

      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0705", "0705", "hellohash", 0, {value: PRICE_OF_BLOCK});
      let blsTakeoverAmount = (await blocksSpaceContract.getPricesOfBlocks("0705", "0705"))[0].priceBls;
      expect(blsTakeoverAmount, "Price of initial blocks (logo) should be 0").to.equal(maxBlsTakeover);

      for(let i = 0; i < 36; i++){
        await mineBlocks(1);
        blsTakeoverAmount = (await blocksSpaceContract.getPricesOfBlocks("0705", "0705"))[0].priceBls;
        if(i == 1){
          expect(blsTakeoverAmount, "Takeover amount after 1 block should be less than 420").to.be.lt(maxBlsTakeover);
        }
        if(i===30){
          expect(blsTakeoverAmount, "Takeover amount after 30 block should be 0").to.equal(0);
        }
        if(i===35){
          expect(blsTakeoverAmount, "Takeover amount after 40 block should be 20").to.equal(minBlsTakeover);
        }
      }
    });

  });

  // describe("Scenario: Retrieve users last blocksarea bought", function() {
      
  //   it("Create wallets (signers)", async function() {
  //     [owner] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
  //   });

  //   it("Initial purchase of blocksarea", async function () {
  //     await setup();
  //     await blocksSpaceContract.purchaseBlocksArea("0705", "0807", "hellohash", {value: 100});
  //     let userInfo = await blocksSpaceContract.users(owner.address);
  //     expect(userInfo.lastBlocksAreaBought.imghash, "Image hash needs to equal to last poster").to.equal("hellohash");
  //     expect(userInfo.lastBlocksAreaBought.blockend, "Block end needs to be 0807").to.equal("0807");
  //   });

  //   it("User purchase another blocksarea", async function () {
  //     await setup();
  //     await blocksSpaceContract.purchaseBlocksArea("0705", "0807", "hellohash", {value: 100});
  //     await mineBlockAndMoveTimestamp(42 * 60 * 60); // So user can purchase again
  //     await blocksSpaceContract.purchaseBlocksArea("0909", "0909", "image09", {value: 200});
  //     let userInfo = await blocksSpaceContract.users(owner.address);
  //     expect(userInfo.lastBlocksAreaBought.imghash, "Image hash needs to equal to last poster").to.equal("image09");
  //     expect(userInfo.lastBlocksAreaBought.blockend, "Block end needs to be 0807").to.equal("0909");
  //   });

  // });
});

