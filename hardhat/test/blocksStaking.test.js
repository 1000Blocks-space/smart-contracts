const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { MockProvider, solidity, loadFixture, deployContract } = require("ethereum-waffle");
const { utils } = require("ethers");

use(solidity);

describe("Testing BlocksStaking", function() {

  let blsContract;
  let rewardsManagerContract;
  let blocksStakingContract;
  let blocksSpaceContract;

  async function setup() {
    [owner, walletA, walletB, walletC, walletD] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    const contractObject = await ethers.getContractFactory("BLSToken");
    blsContract = await contractObject.deploy();
    const blocksStakingObject = await ethers.getContractFactory("BlocksStaking");
    blocksStakingContract = await blocksStakingObject.deploy(blsContract.address);
    const contractObject2 = await ethers.getContractFactory("BlocksRewardsManager");
    rewardsManagerContract = await contractObject2.deploy(blsContract.address, blocksStakingContract.address, owner.address);
    const contractObject3 = await ethers.getContractFactory("BlocksSpace");
    blocksSpaceContract = await contractObject3.deploy(rewardsManagerContract.address);
    await rewardsManagerContract.addSpace(blocksSpaceContract.address, 1);
    await blsContract.transfer(rewardsManagerContract.address, 1000);
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

  deposit1000Wei = async function() {
    await setup();
    await blocksStakingContract.distributeRewards([],[], {value: 1000});
    let balance = await ethers.provider.getBalance(blocksStakingContract.address);
    expect(balance.toNumber(), "Balance should be 1000").to.equal(1000);
  }

  describe("Scenario: Deposit BNB rewards", function() {

    it("Deposit BNB when noone is staking", deposit1000Wei);

  });
  
  describe("Scenario: Stake BLS  with rewards already waiting", function() {

    it("Deposit BLS when already rewards waiting", async function() {
      await deposit1000Wei();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(10);
      await mineBlocks(2);
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 100 pending rewards").to.equal(100);
    });
    
    it("Above user should get all rewards after end of rewards distribution is reached", async function() {
      await mineBlocks(22);
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 1000 pending rewards").to.equal(1000);
    });

    it("2 users deposit same amount of BLS", async function() {
      await deposit1000Wei();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(10);
      // Now there are not anymore 1000 wei rewards, but only 950
      await blocksStakingContract.connect(walletB).deposit(10); // A = 50
      // Reward per block 25
      await mineBlocks(2);
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 100 pending rewards").to.equal(100);      
      let pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 50 pending rewards").to.equal(50);
    });

    it("2 users deposit different amount of BLS one after other", async function() {
      await deposit1000Wei();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.transfer(walletB.address, 40);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 40);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(10); 
      await mineBlocks(1); // A 100
      await blocksStakingContract.connect(walletB).deposit(40); // A 110
      // After this deposit, rewardPerBlock is 0.9 per token
      await mineBlocks(2);
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 120 pending rewards").to.equal(120);      
      let pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 80 pending rewards").to.equal(80);
    });

  });

  describe("Scenario: Single user and claims all rewards at end", function() {
    it("Single user deposits some BLS and claims all rewards with withdrawal", async function() {
      await deposit1000Wei();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(10);
      await mineBlocks(19);
      
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 1000 pending rewards").to.equal(950);  
      await blocksStakingContract.connect(walletA).claim({gasPrice:0}); 
    });

  });

  describe("Scenario: Stake BLS at different times with rewards already waiting", function() {
    
    it("Single user deposit BLS at different times", async function() {
      await deposit1000Wei();
      await blsContract.transfer(walletA.address, 40);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 40);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(10); // 5 per block per token
      await mineBlocks(3);
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 150 pending rewards").to.equal(150);
      await blocksStakingContract.connect(walletA).deposit(30); // Claim 200 // 1 per block per token
      await mineBlocks(2);
      pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 100 pending rewards").to.equal(100);
    });

    it("2 users deposit different amount of BLS", async function() {
      await deposit1000Wei();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.transfer(walletB.address, 90);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 90);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(10);
      // Only user A deposited for 4 block
      await mineBlocks(4); 
      await blocksStakingContract.connect(walletB).deposit(90); // A = 250   
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 250 pending rewards after second user deposits").to.equal(250);
      // Now also user B deposited but 9x more than user A
      // Rewards per block = 50 so each token get 0.5
      await mineBlocks(4);
      pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 270 pending rewards").to.equal(270);
      let pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 180 pending rewards").to.equal(180);
    });

  });

  describe("Scenario: Deposit new rewards as users are staking", function() {
    
    it("2 users deposit different amount of BLS with difference of couple of blocks (division is not whole number)", async function() {
      await deposit1000Wei();
      await blsContract.transfer(walletA.address, 70);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 70);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(70);
      // Only user A deposited for 4 block
      // At this point calculation is as follows: RPB = 50, reward per block/token = 0.714285714285
      await mineBlocks(3);        
      await blocksStakingContract.connect(walletB).deposit(10); // B rewardDebt = 28.5714
      // Now also user B deposited some tokens, 10 to be precise     
      // accrewards = 0.71428571428571 * 4 = 2.857142857142857
      // Rewards per block = 50 / 80 = 0.625 per block per token
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      // Here user actually gets 199.9996 tokens, but rounded down to 199 because of EVM
      expect(pendRewards.toNumber(), "User should have 199 pending rewards after second user deposits").to.equal(199);
      await mineBlocks(4);
      // 2.857142857142857 + (0.625 * 4) = 5.3571428571428 * 70 = 374.999
      pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 340 pending rewards after second user deposits").to.equal(374);
      // B 5.3571428571428 * 10 = 53.571 - rewardDebtB(2.857142857142857 * 10) = 25
      let pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 25 pending rewards").to.equal(25);    

      // rewards A = 374, B = 25, accrewards = 5.3571428571428, 
      await blocksStakingContract.distributeRewards([],[], {value: 1000});
      // accrewards = 5.9821428571 A = 418 B = 31 left in pool = 1550 new per block reward = 0.96874717125
      pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 418 pending rewards after second user deposits").to.equal(418);
      pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 31 pending rewards").to.equal(31);
      // Now on we are distributing till end 80 rewards per block 10 to B and 70 to A
      await mineBlocks(5);
      pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 757 pending rewards after second user deposits").to.equal(757); /// TUKAAAJA
      pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 80 pending rewards").to.equal(80);

      // Now just distribute everything till end
      await mineBlocks(17);
      pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 1774 pending rewards after second user deposits").to.equal(1774);
      pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 225 pending rewards").to.equal(225);

      // And for FINALS claim
      let balanceWalletABefore = await ethers.provider.getBalance(walletA.address);
      // HAX, we need to set gas price to 0 to get proper value, otherwise also tx cost are subtracted from balance
      await blocksStakingContract.connect(walletA).claim({gasPrice:0}); 
      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 1774").to.equal(1774);

      let balanceWalletBBefore = await ethers.provider.getBalance(walletB.address);
      // HAX, we need to set gas price to 0 to get proper value, otherwise also tx cost are subtracted from balance
      await blocksStakingContract.connect(walletB).claim({gasPrice:0}); 
      let balanceWalletBAfter = await ethers.provider.getBalance(walletB.address);
      expect((balanceWalletBAfter.sub(balanceWalletBBefore)).toNumber(), "Balance should be 225").to.equal(225);

    });

  });

  describe("Scenario: Withdraw BLS and doposit same amount a bit later", function() {
    
    it("Users deposit BLS, withdraws and later on again deposits", async function() {
      await deposit1000Wei();
      await blsContract.transfer(walletA.address, 30);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10000);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(30);
      // 50 per block => 1.66666666 per block per token
      await mineBlocks(3);
      let balanceWalletABefore = await ethers.provider.getBalance(walletA.address);
      await blocksStakingContract.connect(walletA).withdraw({gasPrice:0}); // 1.66666666 * 30toknes * 4 blocks = 199.9999
      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be +199").to.equal(199);

      await mineBlocks(10);
      await blocksStakingContract.connect(walletA).deposit(30);
      await mineBlocks(30);

      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 801 pending rewards after second deposits").to.equal(801);

      balanceWalletABefore = await ethers.provider.getBalance(walletA.address);
      await blocksStakingContract.connect(walletA).withdraw({gasPrice:0});
      balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be +801").to.equal(801);

    });

  });


  describe("Scenario: Withdraw BLS in middle of staking", function() {
    
    it("2 Users deposit BLS, and larger one withdraws in middle", async function() {
      await deposit1000Wei();
      await blsContract.transfer(walletA.address, 90);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 90);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(90);
      // Only user A deposited for 4 block
      await mineBlocks(4); // accRewardsPerShare = 0.555555555 * 5
      await blocksStakingContract.connect(walletB).deposit(10); // accRewardsPerShare = 0.5
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 249 pending rewards after second user deposits").to.equal(249);
      
      await mineBlocks(4); 
      let pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 20 pending rewards").to.equal(20);
      pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User should have 429 pending rewards after second user deposits").to.equal(429);
      await blocksStakingContract.connect(walletA).withdraw({gasPrice:0}); // Claiming 474, new accRewardsPerShare = 5
      await mineBlocks(30);
      let balanceWalletBBefore = await ethers.provider.getBalance(walletB.address);
      await blocksStakingContract.connect(walletB).claim({gasPrice:0});  // Claiming 525
      let balanceWalletBAfter = await ethers.provider.getBalance(walletB.address);
      expect((balanceWalletBAfter.sub(balanceWalletBBefore)).toNumber(), "Balance should be 525").to.equal(525);
    });
  });

  describe("Scenario 1", function() {
    it("Transfer and check expected balance with approval", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 100);
      await blsContract.transfer(walletB.address, 100);
      await blsContract.connect(walletA).approve(owner.address, 1);
      await blsContract.connect(owner).transferFrom(walletA.address, walletB.address, 1);
      expect(await blsContract.balanceOf(walletA.address)).to.equal(99);
      expect(await blsContract.balanceOf(walletB.address)).to.equal(101);
    });

    it("No tokens and rewards yet in the Vault", async function() {
      expect(await blocksStakingContract.totalTokens()).to.equal(0); // no tokens yet in the Vault
    });

    it("Wallet A deposits 1 BLS tokens", async function() {
      expect(await blsContract.balanceOf(blocksStakingContract.address)).to.equal(0);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 1);
      await blocksStakingContract.connect(walletA).deposit(1);
      expect(await blocksStakingContract.totalTokens()).to.equal(1);
      expect(await blsContract.balanceOf(blocksStakingContract.address)).to.equal(1);
    });

    it("We distribute 10 BNBs of rewards", async function() {
      await blocksStakingContract.distributeRewards([], [], {value: 10});
      expect(await blocksStakingContract.totalTokens()).to.equal(1);
    });

    it("Wallet B deposits 1 BLS tokens", async function() {
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 1);
      await blocksStakingContract.connect(walletB).deposit(1);
      expect(await blocksStakingContract.totalTokens()).to.equal(2);
      expect(await blsContract.balanceOf(blocksStakingContract.address)).to.equal(2);
    });

    it("We distribute 10 BNBs of rewards", async function() {
      await blocksStakingContract.distributeRewards([], [], {value: 10});
      expect(await blocksStakingContract.totalTokens()).to.equal(2);
    });

    it("Wallet A withdraws rewards", async function() {
      await blocksStakingContract.connect(walletA).withdraw();
      expect(await blocksStakingContract.totalTokens()).to.equal(1);
    });


    it("Wallet B withdraws rewards", async function() {
      await blocksStakingContract.connect(walletB).withdraw();
      expect(await blocksStakingContract.totalTokens()).to.equal(0);
      expect(await blsContract.balanceOf(blocksStakingContract.address)).to.equal(0);
    });

    it("Wallet B does two deposits", async function() {
      expect(await blsContract.balanceOf(blocksStakingContract.address)).to.equal(0);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 2);
      
      await blocksStakingContract.connect(walletB).deposit(1);
      let user = await blocksStakingContract.connect(walletB).userInfo(walletB.address);
      expect(user.amount).to.equal(1);
      expect(await blocksStakingContract.totalTokens()).to.equal(1);
      expect(await blsContract.balanceOf(blocksStakingContract.address)).to.equal(1);

      await blocksStakingContract.connect(walletB).deposit(1);
      user = await blocksStakingContract.connect(walletB).userInfo(walletB.address);
      expect(user.amount).to.equal(2);
      expect(await blocksStakingContract.totalTokens()).to.equal(2);
      expect(await blsContract.balanceOf(blocksStakingContract.address)).to.equal(2);

      await blocksStakingContract.connect(walletB).withdraw();
      user = await blocksStakingContract.connect(walletB).userInfo(walletB.address);
      expect(user.amount).to.equal(0);
      expect(await blocksStakingContract.totalTokens()).to.equal(0);
      expect(await blsContract.balanceOf(blocksStakingContract.address)).to.equal(0);
    });
  });
  
  describe("Scenario 2", function() {

    it("Setup", async function() {
      await setup();
      blsContract.transfer(walletA.address, 100);
      blsContract.transfer(walletB.address, 100);
    });
  
    it("No tokens and rewards yet in the Vault", async function() {
      expect(await blocksStakingContract.totalTokens()).to.equal(0); // no tokens yet in the Vault
    });
  
    it("Wallet A deposits 2 BLS tokens", async function() {
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 2);
      await blocksStakingContract.connect(walletA).deposit(2);
      expect(await blocksStakingContract.totalTokens()).to.equal(2);
    });
  
    it("We distribute 10 BNBs of rewards", async function() {
      await blocksStakingContract.distributeRewards([], [], {value: 10});
    });
  
    it("Wallet B deposits 4 BLS tokens", async function() {
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 4);
      await blocksStakingContract.connect(walletB).deposit(4);
      expect(await blocksStakingContract.totalTokens()).to.equal(6);
    });
  
    it("We distribute 10 BNBs of rewards", async function() {
      await blocksStakingContract.distributeRewards([], [], {value: 10});
    });
  
    it("Wallet A withdraws rewards", async function() {
      await blocksStakingContract.connect(walletA).withdraw();
      expect(await blocksStakingContract.totalTokens()).to.equal(4);
    });
  
    it("Wallet B withdraws rewards", async function() {
      await blocksStakingContract.connect(walletB).withdraw();
      expect(await blocksStakingContract.totalTokens()).to.equal(0);
    });
  });

  describe("Scenario 3", function() {
    it("Setup", async function() {
      await setup();
      blsContract.transfer(walletA.address, 100);
      blsContract.transfer(walletB.address, 100);
      blsContract.transfer(walletC.address, 100);
    });
  
    it("No tokens and rewards yet in the Vault", async function() {
      expect(await blocksStakingContract.totalTokens()).to.equal(0); // no tokens yet in the Vault
    });
  
    it("Wallet A deposits 3 BLS tokens", async function() {
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 3);
      await blocksStakingContract.connect(walletA).deposit(3);
      expect(await blocksStakingContract.totalTokens()).to.equal(3);
    });
  
    it("We distribute 10 BNBs of rewards", async function() {
      await blocksStakingContract.distributeRewards([], [], {value: 10});
    });
  
    it("Wallet B deposits 4 BLS tokens", async function() {
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 4);
      await blocksStakingContract.connect(walletB).deposit(4);
      expect(await blocksStakingContract.totalTokens()).to.equal(7);
    });
  
    it("We distribute 11 BNBs of rewards", async function() {
      await blocksStakingContract.distributeRewards([], [], {value: 11});
    });

    it("Wallet C deposits 5 BLS tokens", async function() {
      await blsContract.connect(walletC).approve(blocksStakingContract.address, 5);
      await blocksStakingContract.connect(walletC).deposit(5);
      expect(await blocksStakingContract.totalTokens()).to.equal(12);
    });

    it("We distribute 12 BNBs of rewards", async function() {
      await blocksStakingContract.distributeRewards([], [], {value: 12});
    });
  
    it("Wallet A withdraws rewards", async function() {
      await blocksStakingContract.connect(walletA).withdraw();
      expect(await blocksStakingContract.totalTokens()).to.equal(9);
    });
  
    it("Wallet B withdraws rewards", async function() {
      await blocksStakingContract.connect(walletB).withdraw();
      expect(await blocksStakingContract.totalTokens()).to.equal(5);
    });

    it("Wallet C withdraws rewards", async function() {
      await blocksStakingContract.connect(walletC).withdraw();
      expect(await blocksStakingContract.totalTokens()).to.equal(0);
    });
  });

  describe("Scenario: Rewards calculation with takeover rewards", function() {
    
    it("should distribute 800 rewards for stakers and 200 for takeover additionally to A", async function() {
      await setup();
      await blocksStakingContract.distributeRewards([walletA.address],[200], {value: 1000});
      
      await blsContract.transfer(walletA.address, 10);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(10);
      // Only user A deposited for 4 block
      await mineBlocks(4); // perblockpertoken = 4
      await blocksStakingContract.connect(walletB).deposit(10); // accrewa = 5 * 4 * 10 = A = 200
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User A should have 400 pending rewards after second user deposits").to.equal(400);
      // rewardsPerShareBlock = 0.3755
      await mineBlocks(30); 
      pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User A should have 700 pending rewards after second user deposits").to.equal(700);
      let pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 300 pending rewards").to.equal(300);
    });

    it("should distribute 700 rewards first time and second time 900", async function() {
      await setup();
      await blocksStakingContract.distributeRewards([walletA.address],[300], {value: 1000});
      
      await blsContract.transfer(walletA.address, 10);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(10);
      // Only user A deposited for 4 block
      await mineBlocks(4); // perblock = 35, acc = 3.5 * 5 => 17.5
      await blocksStakingContract.connect(walletB).deposit(10); // accrewa = 35 * 5 = A = 175+300. Brewarddebt = 175
      let pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User A should have 475 pending rewards after second user deposits").to.equal(475);
      let pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 0 pending rewards").to.equal(0);
      await mineBlocks(5); // acc = 17.5 + 1.75 * 5 => 26.25
      pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewards.toNumber(), "User A should have 562 pending rewards after second user deposits").to.equal(562);
      pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewards2.toNumber(), "User should have 87 pending rewards").to.equal(87);
      // New takeover on user B comes in
      await blocksStakingContract.distributeRewards([walletB.address],[100], {value: 900});
      // 6 blocks, acc = 45.5, //TODO: nonfinished test
      // pendRewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      // expect(pendRewards.toNumber(), "User A should have 630 pending rewards after second user deposits").to.equal(630);
      // pendRewards2 = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      // expect(pendRewards2.toNumber(), "User should have 87 pending rewards").to.equal(87);
    });

    it("should fail distribution of too much rewards", async function() {
      await setup();
      await expect(blocksStakingContract.distributeRewards([walletA.address],[1100], {value: 1000}), "Should fail because someone wants to manipulate").to.be.reverted;
    });


  });
});

