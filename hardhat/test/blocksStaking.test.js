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

    it("should claim 0 rewards if nothing was ever deposited", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 1);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 1);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(1);

      await mineBlocks(1);     
      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 0 pending rewards").to.equal(0);
      // Trying to claim 0
      let balanceWalletABefore = await ethers.provider.getBalance(walletA.address);
      await blocksStakingContract.connect(walletA).claim({gasPrice:0}); 
      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 0").to.equal(0);
    });

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
      await blocksStakingContract.connect(walletA).deposit(30); // 1.666 
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

  describe("Scenario: Rewards per block per token", function() {   
    it("should return rewards per token uint", async function() {
      await deposit1000Wei();
      await blsContract.transfer(walletA.address, 90);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 90);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(90);
      await mineBlocks(1);
      let rewards = await blocksStakingContract.rewardsPerBlockPerToken();
      expect(rewards.toNumber(), "There needs to be rewards returned per block token").to.be.greaterThan(0);
    });
  });

  describe("Scenario: End 2 end usecases", function() {   
    it("should still return proper amount of tokens to claim after 2 users buying and rewards distribution changed in between", async function() {
      await setup();
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 1000000});
      await mineBlocks(3);
      await rewardsManagerContract.connect(walletA).claim(0);
      let walletABls = (await blsContract.balanceOf(walletA.address)).toNumber();
      expect(walletABls, "walletA bls should be 4").to.equal(4);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10000);
      await blocksStakingContract.connect(walletA).deposit(walletABls);
      await mineBlocks(10);
      let rewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewards.toNumber(), "User earned 12 wei BNB so far...").to.equal(12);
      
      await blocksStakingContract.setRewardDistributionPeriod(100);
      await mineBlocks(5);

      rewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewards.toNumber(), "User earned 19 wei BNB so far...").to.equal(19);

      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0805", "0906", "imagehash1", {value: 500000});
      await mineBlocks(5);

      rewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewards.toNumber(), "User earned 63769 wei BNB so far...").to.equal(63769);
      await mineBlocks(100);
      await blocksStakingContract.connect(walletA).withdraw();
      await mineBlocks(2);
      rewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewards.toNumber(), "User earned 0 wei BNB so far...").to.equal(0);
    });

    // BUG: where pendingrewards were being reverted
    it("should still return proper amount of pending token after rewards run out and user 2 deposits", async function() {
      await setup();
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 1000000});
      await mineBlocks(3);
      await rewardsManagerContract.connect(walletA).claim(0);
      let walletABls = (await blsContract.balanceOf(walletA.address)).toNumber();
      expect(walletABls, "walletA bls should be 4").to.equal(4);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10000);
      await blocksStakingContract.connect(walletA).deposit(walletABls);
      await mineBlocks(10);
      let rewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewards.toNumber(), "User earned 12 wei BNB so far...").to.equal(12);
      
      await blocksStakingContract.setRewardDistributionPeriod(10);
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0805", "0906", "imagehash1", {value: 500000});
      await mineBlocks(12); // Here rewards should run out

      rewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewards.toNumber(), "User earned 1275000 wei BNB so far...").to.equal(1275000);
      await rewardsManagerContract.connect(walletB).claim(0);
      let walletBBls = (await blsContract.balanceOf(walletB.address)).toNumber();
      expect(walletBBls, "walletB bls should be 52").to.equal(52);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10000);
      await mineBlocks(1); // make sure rewards have run out
      // Rewards should still be same as before this block
      rewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewards.toNumber(), "User earned SHOUL STILL be 1275000  wei BNB so far...").to.equal(1275000);

      // Now another user deposits after no rewards in pipeline and pending rewards should still be same for user A
      await blocksStakingContract.connect(walletB).deposit(walletBBls);
      rewards = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewards.toNumber(), "User earned SHOUL STILL be 1275000  wei BNB so far...").to.equal(1275000);
    });

  });

  
  describe("Scenario: End 2 end usecases - Takeover Rewards", function() {   
    // Test for BUG: If takeover happens and there is nothing staked in Staking.
    // Then user A claims his takeover rewards, but from then on his pendingRewards is always reverting
    // After user claims, his rewardDebt should be set to 0
    it("should return proper claimed rewards after user B does takeover from A", async function() {
      await setup();
      await blocksStakingContract.setRewardDistributionPeriod(100); // X blocks
      // A purchase 1 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 100});
      await mineBlocks(3);
      // B takesover block from A, so A should be eligible for 25% of blocks B pay
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 200});
      await mineBlocks(1);
      let rewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewardsA.toNumber(), "A should have 50 rewards (25%) from takeover...").to.equal(50);
      await mineBlocks(1);
      await blocksStakingContract.connect(walletA).claim();
      rewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewardsA.toNumber(), "A should have 0 rewards directly after claim").to.equal(0);
    });

    it("should return proper pending rewards after user B does takeover from A and C takeover on B", async function() {
      await setup();
      await blocksStakingContract.setRewardDistributionPeriod(10); // X blocks
      await blsContract.transfer(walletC.address, 1000); // Give 1000 bls to walletC
      // A purchase 1 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 100}); // 85 pool
      // B takesover block from A, so A should be eligible for 25% of blocks B pay
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 200}); // 120 pool, 50 takeover
      await mineBlocks(1);
      let rewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewardsA.toNumber(), "A should have 50 rewards (25%) from takeover...").to.equal(50);
      await mineBlocks(1);

      // C takes over half of block from B. B should get 25% of 400
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0502", "0503", "imagehash1", {value: 400}); // 240 pool, 100 takeover
      let rewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(rewardsB.toNumber(), "B should have 100 rewards (25%) from takeover...").to.equal(100);

      // C deposits BLS, and all of rewards (240 + 120 + 85) => 445 should be distributed to him in 10 blocks
      await blsContract.connect(walletC).approve(blocksStakingContract.address, 10000);
      await blocksStakingContract.connect(walletC).deposit("10");

      let rewardsC = await blocksStakingContract.connect(walletC).pendingRewards(walletC.address);
      expect(rewardsC.toNumber(), "C should have 0 rewards at this point").to.equal(0);
      await mineBlocks(11); // Run all rewards out
      rewardsC = await blocksStakingContract.connect(walletC).pendingRewards(walletC.address);
      expect(rewardsC.toNumber(), "C should have 445 rewards at this point").to.equal(445);
    });

    // Test for BUG: IDX-002 Incorrect Reward Calculation from takeoverRewards
    it("should return proper claimed rewards after user B does takeover from A nad C does takeover, but instead of pending, users claim", async function() {
      await setup();
      await blocksStakingContract.setRewardDistributionPeriod(10); // X blocks
      await blsContract.transfer(walletC.address, 1000); // Give 1000 bls to walletC
      // A purchase 1 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 100}); // 85 pool
      // await mineBlocks(3);
      // B takesover block from A, so A should be eligible for 25% of blocks B pay
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 200}); // 120 pool, 50 takeover
      await mineBlocks(1);
      let rewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(rewardsA.toNumber(), "A should have 50 rewards (25%) from takeover...").to.equal(50);
      await blocksStakingContract.connect(walletA).claim(); // Claims 50 of takeover rewards

      // C takes over half of block from B. B should get 25% of 400
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0502", "0503", "imagehash1", {value: 400}); // 240 pool, 100 takeover
      let rewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(rewardsB.toNumber(), "B should have 100 rewards (25%) from takeover...").to.equal(100);
      await blocksStakingContract.connect(walletB).claim(); // Claims 100 of takeover rewards

      // C deposits BLS, and all of rewards (240 + 120 + 85) => 445 should be distributed to him in 10 blocks
      await blsContract.connect(walletC).approve(blocksStakingContract.address, 10000);
      await blocksStakingContract.connect(walletC).deposit("10");

      let rewardsC = await blocksStakingContract.connect(walletC).pendingRewards(walletC.address);
      expect(rewardsC.toNumber(), "C should have 0 rewards at this point").to.equal(0);
      await mineBlocks(11); // Run all rewards out
      rewardsC = await blocksStakingContract.connect(walletC).pendingRewards(walletC.address);
      expect(rewardsC.toNumber(), "C should have 445 rewards at this point").to.equal(445);
    });
  });

  // Finding BUG: IDX-003 Incorrect Reward Calculation from allUsersRewardDebt
  describe("Scenario: Proper rewards distribution till the end", function() {
    
    it("should properly distribute rewards when single user has deposited BLS into staking and multiple distributeRewards happen", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(1);

      await mineBlocks(1);     
      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 0 pending rewards").to.equal(0);

      // Trying to claim 0
      let balanceWalletABefore = await ethers.provider.getBalance(walletA.address);
      await blocksStakingContract.connect(walletA).claim({gasPrice:0}); 
      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 0").to.equal(0);

      // Incoming first rewards. This should give our user 50 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});
      await mineBlocks(2);

      // User now deposits additional token, but since he is still alone, he should get all rewards
      await blocksStakingContract.connect(walletA).deposit(1); // Transaction, 150 claimed accpershare = 150

      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "With deposit rewards are autoclaimed, so pending should be 0").to.equal(0);

      // Incoming second rewards. 
      await blocksStakingContract.distributeRewards([],[], {value: 1000}); // 150 claimed + 50 pending, accpershare = 175
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "Here pending should be 50 (still old ones)").to.equal(50);
      // This should give our user 90(1800/20) rewards per block from now on

      await mineBlocks(4);
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 50 (from before) + 360 (90*4) => 410 pending rewards").to.equal(410);

      // Finish rewards
      await mineBlocks(22); 
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have (2000 - 150 already claimed) => 1850 pending rewards").to.equal(1850);      
    });

    it("should properly distribute rewards when multiple users deposited same amount BLS into staking and multiple distributeRewards happen", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(1);

      // Incoming first rewards. This should give our user 50 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});

      await mineBlocks(5);     
      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 250 (5*50) pending rewards").to.equal(250);

      // Now user 2 deposits
      await blocksStakingContract.connect(walletB).deposit(1); // At this point user A has 300 rewards
      // Rewards still 50, user A gets 25 and user B gets 25
      await mineBlocks(10);

      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 550 (300 from before + 10*25) pending rewards").to.equal(550);
      let pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 250 (10*25) pending rewards").to.equal(250);

      // Incoming second rewards. This should give 150 (remaining from before) + 850 => 1000 / 20 = 50 per block
      await blocksStakingContract.distributeRewards([],[], {value: 850}); // A = 575 B = 275

      await mineBlocks(10);
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 825 (575 from before + 10*25) pending rewards").to.equal(825);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 525 (275 from before + 10*25) pending rewards").to.equal(525);

      // Rewards now run out
      await mineBlocks(12);
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 1075 (825 from before + 10*25) pending rewards").to.equal(1075);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 775 (525 from before + 10*25) pending rewards").to.equal(775);

      expect(1075 + 775, "Sum of pending rewards after they run out should be equal to amount of input").to.equal(1000+850);
    });

    it("should properly distribute rewards when multiple users deposited different BLS into staking and multiple distributeRewards happen", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(1);

      // Incoming first rewards. This should give our user 50 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});

      await mineBlocks(5);     
      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 250 (5*50) pending rewards").to.equal(250);

      // Now user 2 deposits
      await blocksStakingContract.connect(walletB).deposit(3); // At this point user A has 300 rewards
      // Rewards still 50, user A gets 12.5 and user B gets 37.5
      await mineBlocks(9);

      // Incoming second rewards. This should give 200 (remaining from before) + 1800 => 2000 / 20 = 100 per block
      await blocksStakingContract.distributeRewards([],[], {value: 1800});

      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 425 (300 from before + 10*12.5) pending rewards").to.equal(425);
      let pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 375 (10*37.5) pending rewards").to.equal(375);

      // From here on A gets 25 per block and B gets 75 per block
      await mineBlocks(10);
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 675 (425 from before + 10*25) pending rewards").to.equal(675);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 1125 (375 from before + 10*75) pending rewards").to.equal(1125);

      // // Rewards now run out
      await mineBlocks(12);
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 925 (675 from before + 10*25) pending rewards").to.equal(925);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 1875 (1125 from before + 10*75) pending rewards").to.equal(1875);

      expect(925 + 1875, "Sum of pending rewards after they run out should be equal to amount of input").to.equal(1000+1800);
    });

    it("should properly distribute rewards when multiple users deposited different BLS into staking and multiple distributeRewards happen case 2", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.transfer(walletC.address, 20);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletC).approve(blocksStakingContract.address, 20);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(1);

      // Incoming first rewards. This should give our user 50 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});

      await mineBlocks(5);     
      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 250 (5*50) pending rewards").to.equal(250);

      // Now user 2 deposits
      await blocksStakingContract.connect(walletB).deposit(3); // At this point user A has 300 rewards
      // Rewards still 50, user A gets 12.5 and user B gets 37.5
      await mineBlocks(9);

      // Incoming second rewards. This should give 200 (remaining from before) + 1800 => 2000 / 20 = 100 per block
      await blocksStakingContract.distributeRewards([],[], {value: 1800});

      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 425 (300 from before + 10*12.5) pending rewards").to.equal(425);
      let pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 375 (10*37.5) pending rewards").to.equal(375);

      // From here on A gets 25 per block and B gets 75 per block
      await mineBlocks(9);
      // Here C comes into play with deposit of 
      await blocksStakingContract.connect(walletC).deposit(16);
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 675 (425 from before + 10*25) pending rewards").to.equal(675);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 1125 (375 from before + 10*75) pending rewards").to.equal(1125);

      // A getting 5, B getting 15 and C getting 80
      await mineBlocks(1);
      // Incoming third rewards. This should give 800 (remaining from before) + 3200 => 4000 / 20 = 200 per block
      await blocksStakingContract.distributeRewards([],[], {value: 3200});
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 685 (675 from before + 2*5) pending rewards").to.equal(685);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 1155 (1125 from before + 2*15) pending rewards").to.equal(1155);
      let pendRewardsC = await blocksStakingContract.connect(walletC).pendingRewards(walletC.address);
      expect(pendRewardsC.toNumber(), "C should have 160 (2*80) pending rewards").to.equal(160);

      // Now new era comes, rewards per block are 200. A = 10, B = 30, C = 160
      await mineBlocks(21); // We run out of rewards here
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 885 (685 from before + 20*10) pending rewards").to.equal(885);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 1755 (1155 from before + 20*30) pending rewards").to.equal(1755);
      pendRewardsC = await blocksStakingContract.connect(walletC).pendingRewards(walletC.address);
      expect(pendRewardsC.toNumber(), "C should have 3360 (160 from before + 20*160) pending rewards").to.equal(3360);
    });

    it("should properly distribute rewards when multiple users deposited different BLS into staking and multiple distributeRewards happen case 2", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.transfer(walletC.address, 20);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletC).approve(blocksStakingContract.address, 20);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksStakingContract.connect(walletA).deposit(1);

      // Incoming first rewards. This should give our user 50 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});

      await mineBlocks(5);     
      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 250 (5*50) pending rewards").to.equal(250);

      // Now user 2 deposits
      await blocksStakingContract.connect(walletB).deposit(3); // At this point user A has 300 rewards
      // Rewards still 50, user A gets 12.5 and user B gets 37.5
      await mineBlocks(9);

      // Incoming second rewards. This should give 200 (remaining from before) + 1800 => 2000 / 20 = 100 per block
      await blocksStakingContract.distributeRewards([],[], {value: 1800});

      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 425 (300 from before + 10*12.5) pending rewards").to.equal(425);
      let pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 375 (10*37.5) pending rewards").to.equal(375);

      // From here on A gets 25 per block and B gets 75 per block
      await mineBlocks(9);
      // Here C comes into play with deposit of 
      await blocksStakingContract.connect(walletC).deposit(16);
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 675 (425 from before + 10*25) pending rewards").to.equal(675);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 1125 (375 from before + 10*75) pending rewards").to.equal(1125);

      // A getting 5, B getting 15 and C getting 80
      await mineBlocks(1);
      // Incoming third rewards. This should give 800 (remaining from before) + 3200 => 4000 / 20 = 200 per block
      await blocksStakingContract.distributeRewards([],[], {value: 3200});
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 685 (675 from before + 2*5) pending rewards").to.equal(685);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 1155 (1125 from before + 2*15) pending rewards").to.equal(1155);
      let pendRewardsC = await blocksStakingContract.connect(walletC).pendingRewards(walletC.address);
      expect(pendRewardsC.toNumber(), "C should have 160 (2*80) pending rewards").to.equal(160);

      // Now new era comes, rewards per block are 200. A = 10, B = 30, C = 160
      await mineBlocks(9); 
      // Something unexpected happens and C withdraws all his guts
      let balanceWalletCBefore = await ethers.provider.getBalance(walletC.address);
      await blocksStakingContract.connect(walletC).withdraw({gasPrice:0});
      let balanceWalletCAfter = await ethers.provider.getBalance(walletC.address);
      expect((balanceWalletCAfter.sub(balanceWalletCBefore)).toNumber(), "Balance should be 1760 after withdrawal").to.equal(1760);

      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 785 (685 from before + 10*10) pending rewards").to.equal(785);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 1455 (1155 from before + 10*30) pending rewards").to.equal(1455);
      pendRewardsC = await blocksStakingContract.connect(walletC).pendingRewards(walletC.address);
      expect(pendRewardsC.toNumber(), "C should have 0 pending rewards directly after he withdraw").to.equal(0);

      // From now on, its still 200 per block, A = 50 and B = 150
      await mineBlocks(11); // We run out of rewards here
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 1285 (785 from before + 10*50) pending rewards").to.equal(1285);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 2955 (1455 from before + 10*150) pending rewards").to.equal(2955);
      pendRewardsC = await blocksStakingContract.connect(walletC).pendingRewards(walletC.address);
      expect(pendRewardsC.toNumber(), "C should have 0 pending rewards").to.equal(0);
    });
  });

  describe("Scenario: Random scenarios", function() {
    
    it("should properly calculate rewards after rewards run out and another user deposits.", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.transfer(walletC.address, 20);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);
      await blsContract.connect(walletC).approve(blocksStakingContract.address, 20);
      await blocksStakingContract.setRewardDistributionPeriod(10);
      let balanceWalletABefore = await ethers.provider.getBalance(walletA.address);
      let balanceWalletBBefore = await ethers.provider.getBalance(walletB.address);
      await blocksStakingContract.connect(walletA).deposit(1, {gasPrice:0});

      // Incoming first rewards. This should give our user 100 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});

      await mineBlocks(20);   // Run rewards out and mine 10 extra blocks  
      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 1000 pending rewards").to.equal(1000);

      // Now user B deposits
      await blocksStakingContract.connect(walletB).deposit(1, {gasPrice:0});
      await mineBlocks(3); 
      // Both should have zero, because no more rewards
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 1000 pending rewards becuase no more").to.equal(1000);
      let pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 0 pending rewards becuase no more").to.equal(0);
      
      // Incoming second rewards. This should give our user 100 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});

      await mineBlocks(2);

      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 1000 + 100 pending rewards").to.equal(1100);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 100 pending rewards").to.equal(100);

      await mineBlocks(10); // Lets end rewards

      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 1500 pending rewards ").to.equal(1500);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 500 pending rewards").to.equal(500);


      await blocksStakingContract.connect(walletA).deposit(3, {gasPrice:0});
      await mineBlocks(2);
      await blocksStakingContract.distributeRewards([],[], {value: 1000}); 
      // Rewards again 100, A = 80 B = 20
      await mineBlocks(15);

      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 800 pending rewards").to.equal(800);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 500 + 200 pending rewards").to.equal(700);

      await blocksStakingContract.connect(walletA).claim({gasPrice:0});
      await blocksStakingContract.connect(walletB).claim({gasPrice:0});

      // Check end results
      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 2300").to.equal(2300);
      let balanceWalletBAfter = await ethers.provider.getBalance(walletB.address);
      expect((balanceWalletBAfter.sub(balanceWalletBBefore)).toNumber(), "Balance should be 700").to.equal(700);
    });
  });

  describe("Scenario: Claiming and withdrawal of rewards", function() {
    it("should properly calculate pending rewards after claim", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      let balanceWalletABefore = await ethers.provider.getBalance(walletA.address);

      // Incoming first rewards. This should give our user 50 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});
      await mineBlocks(2);

      await blocksStakingContract.connect(walletA).deposit(1, {gasPrice:0});

      await mineBlocks(11);
      await blocksStakingContract.connect(walletA).claim({gasPrice:0});
      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 600 directly on wallet").to.equal(600);

      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "Pending rewards should be 0 after claim").to.equal(0);
     
    });

    it("should properly calculate last reward calculated block after single deposit", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);

      await blocksStakingContract.connect(walletA).deposit(1, {gasPrice:0});
      await mineBlocks(2);
      // Incoming first rewards. This should give our user 50 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});
      await mineBlocks(2);
      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "Pending rewards should be 100").to.equal(100);
      await mineBlocks(18);
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "Pending rewards after finish should be 1000").to.equal(1000);
      await mineBlocks(1);
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "Pending rewards should still be 1000").to.equal(1000);      
    });

    it("should give user 0 if withdrawing 0", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      let balanceWalletABefore = await ethers.provider.getBalance(walletA.address);

      await blocksStakingContract.connect(walletA).deposit(1, {gasPrice:0});

      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 0 since nothing was in").to.equal(0);
      await mineBlocks(2);
      await blocksStakingContract.connect(walletA).withdraw({gasPrice:0});
      await mineBlocks(2);
      // Incoming first rewards. This should give our user 50 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});
      await mineBlocks(2);

      await blocksStakingContract.connect(walletA).deposit(1, {gasPrice:0});

      await mineBlocks(11);
      await blocksStakingContract.connect(walletA).claim({gasPrice:0});
      balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 600 directly on wallet").to.equal(600);

      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "Pending rewards should be 0 after claim").to.equal(0);
    });

    
    it("should give user 0 if withdrawing 0, strange numbers", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      let balanceWalletABefore = await ethers.provider.getBalance(walletA.address);

      await blocksStakingContract.connect(walletA).deposit(3, {gasPrice:0});

      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 0 since nothing was in").to.equal(0);
      await mineBlocks(2);
      await blocksStakingContract.connect(walletA).withdraw({gasPrice:0});
      await mineBlocks(2);
      // Incoming first rewards. This should give our user 50 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 1000});
      await mineBlocks(2);

      await blocksStakingContract.connect(walletA).deposit(3, {gasPrice:0});

      await mineBlocks(11);
      await blocksStakingContract.connect(walletA).claim({gasPrice:0});
      balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 600 directly on wallet").to.equal(600);

      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "Pending rewards should be 0 after claim").to.equal(0);
    });

    it("should still allow money inflow after user claims big chunk and fresh rewards wanna drop in", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 100);
      await blsContract.transfer(walletB.address, 100);
      await blsContract.transfer(walletC.address, 200);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 100);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 100);
      await blsContract.connect(walletC).approve(blocksStakingContract.address, 200);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      let balanceWalletABefore = await ethers.provider.getBalance(walletA.address);
      let balanceWalletBBefore = await ethers.provider.getBalance(walletB.address);
      let balanceWalletCBefore = await ethers.provider.getBalance(walletC.address);

      await blocksStakingContract.connect(walletA).deposit(1, {gasPrice:0});
      await blocksStakingContract.connect(walletB).deposit(3, {gasPrice:0});

      await mineBlocks(3);

      await blocksStakingContract.connect(walletB).withdraw({gasPrice:0});

      // Incoming first rewards. This should give our user 100 rewards per block
      await blocksStakingContract.distributeRewards([],[], {value: 2000});
      await mineBlocks(2);

      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 200 pending rewards").to.equal(200);
      
      await blocksStakingContract.connect(walletB).deposit(4, {gasPrice:0}); // A has 300

      await mineBlocks(9); // A getting 20 B = 80

      await blocksStakingContract.connect(walletA).withdraw({gasPrice:0}); // A balance = 500

      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "A Balance should be 500").to.equal(500);

      let pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 800 pending rewards").to.equal(800);

      // A claims, although he has nothing staked
      await blocksStakingContract.connect(walletA).claim({gasPrice:0});

      balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "A Balance should still be 500").to.equal(500);

      await blocksStakingContract.connect(walletB).deposit(6, {gasPrice:0}); // B is still only one in staking, her withdraws 1000 

      // Until here 6 transactions, RUN THEM OUT now
      await mineBlocks(15);

      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 0 pending rewards, because withdrew").to.equal(0);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have all rewards ever, which should be 500").to.equal(500);

      await mineBlocks(3);
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 0 pending rewards, because withdrew").to.equal(0);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have all rewards ever, which should be 500").to.equal(500);

      await blocksStakingContract.connect(walletC).deposit(2, {gasPrice:0}); 
      await blocksStakingContract.connect(walletB).claim({gasPrice:0});
      pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "A should have 0 pending rewards, because withdrew").to.equal(0);
      pendRewardsB = await blocksStakingContract.connect(walletB).pendingRewards(walletB.address);
      expect(pendRewardsB.toNumber(), "B should have 0 pending rewards now").to.equal(0);
      let pendRewardsC = await blocksStakingContract.connect(walletC).pendingRewards(walletB.address);
      expect(pendRewardsC.toNumber(), "C should have 0 pending rewards now").to.equal(0);

      let balanceWalletBAfter = await ethers.provider.getBalance(walletB.address);
      expect((balanceWalletBAfter.sub(balanceWalletBBefore)).toNumber(), "Balance should be 1500").to.equal(1500);
    });

    it("should properly handle withdrawal when withdrawing as last one", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 10);
      await blocksStakingContract.setRewardDistributionPeriod(20);
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);

      // Incoming first rewards. This should give our user 50 rewards per block
      // await blocksStakingContract.distributeRewards([],[], {value: 1000});
      
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0402", "imagehash1", {value: 1176}); // 1000 remaining
      let balanceWalletABefore = await ethers.provider.getBalance(walletA.address);
      await mineBlocks(2);
      await rewardsManagerContract.connect(walletA).claim(0, {gasPrice:0});
      await mineBlocks(2);

      await blocksStakingContract.connect(walletA).deposit(1, {gasPrice:0});

      await mineBlocks(11);
      await blocksStakingContract.connect(walletA).claim({gasPrice:0});
      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 600 directly on wallet").to.equal(600);

      let pendRewardsA = await blocksStakingContract.connect(walletA).pendingRewards(walletA.address);
      expect(pendRewardsA.toNumber(), "Pending rewards should be 0 after claim").to.equal(0);

      await mineBlocks(20);

      await blocksStakingContract.connect(walletA).withdraw({gasPrice:0});
      balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      expect((balanceWalletAAfter.sub(balanceWalletABefore)).toNumber(), "Balance should be 1001 directly on wallet").to.equal(1001);
      await mineBlocks(2);
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0503", "0604", "imagehash1", {value: 100});
      await blocksStakingContract.connect(walletA).deposit(3, {gasPrice:0});
      await mineBlocks(2);
    });
  });
  
  describe("Scenario: End 2 end usecases - Withdrawals, Claiming", function() {   

    // BUG
    it("should not fail after user deposits and then tries to purchase 2 block areas", async function() {
      await setup(); // 1000 bls and 1 bls per block
      await blocksStakingContract.setRewardDistributionPeriod(10); // X blocks
      await blocksSpaceContract.updateMinTimeBetweenPurchases(1);
      // A purchase 4 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 100});
      await mineBlocks(3);
      expect(await rewardsManagerContract.pendingBlsTokens(0, walletA.address), "There should be 12 pending BLS").to.equal(12);
      await rewardsManagerContract.connect(walletA).claim(0);
      await mineBlocks(3);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 1000);
      await blocksStakingContract.connect(walletA).deposit(16);
      await mineBlocks(3);
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0206", "0207", "imagehash1", {value: 100});
      await mineBlocks(8);
      await blocksStakingContract.connect(walletA).claim();
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0002", "0002", "imagehash1", {value: 100});
    });

    it("should properly handle withdrawal burning fee", async function() {
      await setup();
      await blsContract.transfer(walletA.address, 200);
      await blsContract.transfer(walletB.address, 10);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 200);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 10);

      await blocksStakingContract.connect(walletA).deposit(200, {gasPrice:0});
      await blocksStakingContract.connect(walletA).withdraw({gasPrice:0});
      expect(await blsContract.balanceOf(walletA.address)).to.equal(198);
      await mineBlocks(3);
      await blocksStakingContract.connect(walletB).deposit(10, {gasPrice:0});
      await mineBlocks(3);
      await blocksStakingContract.connect(walletB).withdraw({gasPrice:0});
      expect(await blsContract.balanceOf(walletB.address)).to.equal(10);
    });
    // BUG
    it("should properly calculate allUsersRewardDebt", async function() {
      await setup(); // 1000 bls and 1 bls per block
      await blocksStakingContract.setRewardDistributionPeriod(10); // X blocks
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      await rewardsManagerContract.setTreasuryFee(0);
      await rewardsManagerContract.setLiquidityFee(0);
      await blsContract.transfer(walletA.address, 2000);
      await blsContract.transfer(walletB.address, 2000);

      // A purchase 4 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 100});
      await mineBlocks(2);
      // First deposit of rewards
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 1000);      
      await blocksStakingContract.connect(walletA).deposit(1);
      // Rewards initially calculated 100 in, 1 user has deposits. 10pb, 1t, 10pt 

      await blsContract.connect(walletB).approve(blocksStakingContract.address, 1000);  // 1 transaction
      await blocksStakingContract.connect(walletB).deposit(19);                         // 1 transaction
      expect(await blocksStakingContract.pendingRewards(walletA.address), "There should be 20 pending rewards").to.equal(20);
      // B deposits. 10pb, 20t, 0.5pt
      await mineBlocks(5); // 5 transaction

      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0909", "1111", "imagehash1", {value: 100}); // 1 transaction
      expect(await blocksStakingContract.pendingRewards(walletA.address), "There should be 23 pending rewards").to.equal(23);
      expect(await blocksStakingContract.pendingRewards(walletB.address), "There should be 6*19*0.5 = 57  pending rewards").to.equal(57);
      // Reward recalculation happens. Balance = 200, rewardsNotDistributed = 80, available to distri = 120. => 12pb, 20t, 0.6pt

      await mineBlocks(4); // 4 transaction
      let balanceWalletBBefore = await ethers.provider.getBalance(walletB.address);
      await blocksStakingContract.connect(walletB).withdraw({gasPrice:0}); // A: transactions=13
      let balanceWalletBAfter = await ethers.provider.getBalance(walletB.address);
      expect((balanceWalletBAfter.sub(balanceWalletBBefore)).toNumber(), "Balance should be 57 +57 = 114").to.equal(114);
      expect(await blocksStakingContract.pendingRewards(walletA.address), "There should be 26 pending rewards").to.equal(26);

      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("2010", "2414", "imagehaa", {value: 100}); // 114 claimed + 38 pending = 152
      expect(await blocksStakingContract.pendingRewards(walletA.address), "There should be 38 pending rewards after B withdraws").to.equal(38);
      expect(await blocksStakingContract.pendingRewards(walletB.address), "There should be 0 pending rewards for B").to.equal(0);
      // Reward recalculation happens. Balance = 300 - 114(claimed), rewardsNotDistributed = 38, available to distri = 148 => 14.8pb, 1t, 14.8pt
      await mineBlocks(1);
      expect(await blocksStakingContract.pendingRewards(walletA.address), "There should be 52 pending rewards for A after fresh buy incoming").to.equal(52);
      expect(await blocksStakingContract.pendingRewards(walletB.address), "There should be 0 pending rewards for B").to.equal(0);
      await mineBlocks(7);
      
      let rewA = (await blocksStakingContract.pendingRewards(walletA.address)).toNumber();
      let rewB = (await blocksStakingContract.pendingRewards(walletB.address)).toNumber();
      expect(rewA + rewB, "Pending rewards should be less than input").to.be.lessThan(100 + 100 + 100);

    });
    // BUG
    it("should properly calculate allUsersRewardDebt next level", async function() {
      await setup(); // 1000 bls and 1 bls per block
      await blocksStakingContract.setRewardDistributionPeriod(10); // X blocks
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      await rewardsManagerContract.setTreasuryFee(0);
      await rewardsManagerContract.setLiquidityFee(0);
      await blsContract.transfer(walletB.address, 2000);
      await blsContract.transfer(walletC.address, 50);

      // A purchase 4 block
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 1000});
      await mineBlocks(2);
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("0604", "0706", "imagehash1", {value: 1000});
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("1818", "2020", "imagehash1", {value: 500});
      await rewardsManagerContract.connect(walletA).claim(0);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 1000);
      await blocksStakingContract.connect(walletA).deposit(1);
      await blsContract.connect(walletC).approve(blocksStakingContract.address, 1000);
      await blocksStakingContract.connect(walletC).deposit(50);
      await mineBlocks(9);
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0909", "1111", "imagehash1", {value: 2000});
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1818", "2020", "imagehash1", {value: 4000});

      await blocksStakingContract.connect(walletC).emergencyWithdraw();
      await mineBlocks(11);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 2000);
      await blocksStakingContract.connect(walletB).deposit(10);

      await mineBlocks(3);

      await blocksSpaceContract.connect(walletD).purchaseBlocksArea("2010", "2414", "imagehaa", {value: 1000});
      await mineBlocks(8);

      let rewA = (await blocksStakingContract.pendingRewards(walletA.address)).toNumber();
      let rewB = (await blocksStakingContract.pendingRewards(walletB.address)).toNumber();
      let rewC = (await blocksStakingContract.pendingRewards(walletC.address)).toNumber();
      let rewD = (await blocksStakingContract.pendingRewards(walletD.address)).toNumber();
      expect(rewA + rewB + rewC + rewD, "Pending rewards should be less than input").to.be.lessThan(1000 + 1000 + 500 + 2000 + 4000 + 1000);
    });

    // BUG
    it("should properly calculate allUsersRewardDebt when emergencyWithdrawal happens", async function() {
      await setup(); // 1000 bls and 1 bls per block
      await blocksStakingContract.setRewardDistributionPeriod(10); // X blocks
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      await rewardsManagerContract.setTreasuryFee(0);
      await rewardsManagerContract.setLiquidityFee(0);
      await blsContract.transfer(walletA.address, 20);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 1000);
      await blsContract.transfer(walletB.address, 2000);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 1000);
      await blsContract.transfer(walletC.address, 50);

      await blocksStakingContract.connect(walletA).deposit(1);
      // A purchase 4 block
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 1000});
      await mineBlocks(6); // 100 per block
      await blocksStakingContract.connect(walletB).deposit(1); // 700 distributed to A, now A = 50, B = 50
      expect((await blocksStakingContract.pendingRewards(walletA.address)).toNumber() , "Pending rewards from A before deposit are").to.equal(700);
      await blocksStakingContract.connect(walletB).emergencyWithdraw(); // B leaves 50 rewards, pusy
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0604", "0706", "imagehash1", {value: 1000});
      await mineBlocks(12);
      expect((await blocksStakingContract.pendingRewards(walletA.address)).toNumber() , "Pending rewards from A should be 2000").to.equal(2000);
    });

    it("should properly calculate allUsersRewardDebt when emergencyWithdrawal happens", async function() {
      await setup(); // 1000 bls and 1 bls per block
      await blocksStakingContract.setRewardDistributionPeriod(10); // X blocks
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      await rewardsManagerContract.setTreasuryFee(0);
      await rewardsManagerContract.setLiquidityFee(0);
      await blsContract.transfer(walletA.address, 20);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 1000);
      await blsContract.transfer(walletB.address, 2000);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 1000);
      await blsContract.transfer(walletC.address, 50);
      let balanceWalletAbefore = await ethers.provider.getBalance(walletA.address);
      let balanceWalletBbefore = await ethers.provider.getBalance(walletB.address);
      let balanceWalletCbefore = await ethers.provider.getBalance(walletC.address);

      await blocksStakingContract.connect(walletA).deposit(1, {gasPrice:0});
      // A purchase 4 block
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 1000, gasPrice:0});
      await mineBlocks(6); // 100 per block
      await blocksStakingContract.connect(walletB).deposit(1, {gasPrice:0}); // 700 distributed to A, now A = 50, B = 50
      await blocksStakingContract.connect(walletB).emergencyWithdraw({gasPrice:0}); // B leaves 50 rewards, pusy
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0604", "0706", "imagehash1", {value: 1000, gasPrice:0});
      await mineBlocks(11);
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("1818", "2020", "imagehash1", {value: 500, gasPrice:0});
      await rewardsManagerContract.connect(walletA).claim(0, {gasPrice:0});
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 1000, {gasPrice:0});
      await blocksStakingContract.connect(walletA).deposit(1, {gasPrice:0});
      await blsContract.connect(walletC).approve(blocksStakingContract.address, 1000, {gasPrice:0});
      await blocksStakingContract.connect(walletC).deposit(50, {gasPrice:0});
      await mineBlocks(9);
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0909", "1111", "imagehash1", {value: 2000, gasPrice:0});
      await blocksStakingContract.connect(walletA).emergencyWithdraw({gasPrice:0});
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1818", "2020", "imagehash1", {value: 4000, gasPrice:0});
      await blocksStakingContract.connect(walletC).withdraw({gasPrice:0});
      await mineBlocks(11);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 2000, {gasPrice:0});
      await blocksStakingContract.connect(walletB).deposit(10, {gasPrice:0});
      await mineBlocks(3);
      await blocksSpaceContract.connect(walletD).purchaseBlocksArea("2010", "2414", "imagehaa", {value: 1000, gasPrice:0});
      await mineBlocks(8);

      let rewA = await blocksStakingContract.pendingRewards(walletA.address);
      let rewB = await blocksStakingContract.pendingRewards(walletB.address);
      let rewC = await blocksStakingContract.pendingRewards(walletC.address);
      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      let balanceWalletBAfter = await ethers.provider.getBalance(walletB.address);
      let balanceWalletCAfter = await ethers.provider.getBalance(walletC.address);

      expect((balanceWalletAAfter.sub(balanceWalletAbefore).add(rewA)
      .add(balanceWalletBAfter).sub(balanceWalletBbefore).add(rewB)
      .add(balanceWalletCAfter).sub(balanceWalletCbefore).add(rewC)).toNumber(), "Pending rewards should be less than input").to.be.lessThan(1000 + 1000 + 500 + 2000 + 4000 + 1000);
    });

    it("should properly calculate allUsersRewardDebt when emergencyWithdrawal happens", async function() {
      await setup(); // 1000 bls and 1 bls per block
      await blocksStakingContract.setRewardDistributionPeriod(10); // X blocks
      await blocksSpaceContract.updateMinTimeBetweenPurchases(0);
      await rewardsManagerContract.setTreasuryFee(0);
      await rewardsManagerContract.setLiquidityFee(0);
      await blsContract.transfer(walletA.address, 20);
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 1000);
      await blsContract.transfer(walletB.address, 2000);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 1000);
      await blsContract.transfer(walletC.address, 50);
      let balanceWalletAbefore = await ethers.provider.getBalance(walletA.address);
      let balanceWalletBbefore = await ethers.provider.getBalance(walletB.address);
      let balanceWalletCbefore = await ethers.provider.getBalance(walletC.address);

      await blocksStakingContract.connect(walletA).deposit(1, {gasPrice:0});
      // A purchase 4 block
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0402", "0503", "imagehash1", {value: 1000, gasPrice:0});
      await mineBlocks(6); // 100 per block
      await blocksStakingContract.connect(walletB).deposit(1, {gasPrice:0}); // 700 distributed to A, now A = 50, B = 50
      await blocksStakingContract.connect(walletB).emergencyWithdraw({gasPrice:0}); // B leaves 50 rewards, pusy
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("0604", "0706", "imagehash1", {value: 1000, gasPrice:0});
      await mineBlocks(11);
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("1818", "2020", "imagehash1", {value: 500, gasPrice:0});
      await mineBlocks(3);
      await blocksSpaceContract.connect(walletC).purchaseBlocksArea("1818", "2020", "imagehash1", {value: 1500, gasPrice:0});
      await rewardsManagerContract.connect(walletA).claim(0, {gasPrice:0});
      await blsContract.connect(walletA).approve(blocksStakingContract.address, 1000, {gasPrice:0});
      await blocksStakingContract.connect(walletA).deposit(15, {gasPrice:0});
      await blsContract.connect(walletC).approve(blocksStakingContract.address, 1000, {gasPrice:0});
      await blocksStakingContract.connect(walletC).deposit(50, {gasPrice:0});
      await mineBlocks(9);
      await blocksSpaceContract.connect(walletB).purchaseBlocksArea("0909", "1111", "imagehash1", {value: 2000, gasPrice:0});
      await blocksStakingContract.connect(walletB).emergencyWithdraw({gasPrice:0});
      await mineBlocks(7);
      await blocksStakingContract.connect(walletB).deposit(300, {gasPrice:0});
      await blocksSpaceContract.connect(walletA).purchaseBlocksArea("1818", "2020", "imagehash1", {value: 4000, gasPrice:0});
      await blocksStakingContract.connect(walletC).withdraw({gasPrice:0});
      await mineBlocks(11);
      await blsContract.connect(walletB).approve(blocksStakingContract.address, 2000, {gasPrice:0});
      await blocksStakingContract.connect(walletB).deposit(10, {gasPrice:0});
      await mineBlocks(3);
      await blocksSpaceContract.connect(walletD).purchaseBlocksArea("2010", "2414", "imagehaa", {value: 1000, gasPrice:0});
      await mineBlocks(12);

      let rewA = await blocksStakingContract.pendingRewards(walletA.address);
      let rewB = await blocksStakingContract.pendingRewards(walletB.address);
      let rewC = await blocksStakingContract.pendingRewards(walletC.address);
      let balanceWalletAAfter = await ethers.provider.getBalance(walletA.address);
      let balanceWalletBAfter = await ethers.provider.getBalance(walletB.address);
      let balanceWalletCAfter = await ethers.provider.getBalance(walletC.address);
      let allA = (balanceWalletAAfter.sub(balanceWalletAbefore).add(rewA)).toNumber();
      let allB = (balanceWalletBAfter.sub(balanceWalletBbefore).add(rewB)).toNumber();
      let allC = (balanceWalletCAfter.sub(balanceWalletCbefore).add(rewC)).toNumber();
      // console.log(allA);
      // console.log(allB);
      // console.log(allC);
      expect(allA+allB+allC, "Pending rewards should be less than input").to.lte(1000 + 1500 + 1000 + 500 + 2000 + 4000 + 1000);
    });
  


  });

});

