const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { MockProvider, solidity } = require("ethereum-waffle");

use(solidity);

describe("Testing BlocksStaking", function() {
  describe("Scenario 1", function() {
    it("Create wallets (signers)", async function() {
      [owner, walletA, walletB] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
      console.log("owner:", owner.address);
      console.log("walletA:", walletA.address);
      console.log("walletB:", walletB.address);
    });

    let blsToken;
    it("Deploy BLSToken contract", async function() {
      const contractObject = await ethers.getContractFactory("BLSToken");
      blsToken = await contractObject.deploy();
    });

    let contract;
    it("Expected to deploy BlocksStaking contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksStaking");
      contract = await contractObject.deploy(blsToken.address);
    });

    it("Transfer and check expected balance with approval", async function() {
      await blsToken.transfer(walletA.address, 100);
      await blsToken.transfer(walletB.address, 100);
      await blsToken.connect(walletA).approve(owner.address, 1);
      await blsToken.connect(owner).transferFrom(walletA.address, walletB.address, 1);
      expect(await blsToken.balanceOf(walletA.address)).to.equal(99);
      expect(await blsToken.balanceOf(walletB.address)).to.equal(101);
    });

    it("No tokens and rewards yet in the Vault", async function() {
      expect(await contract.totalTokens()).to.equal(0); // no tokens yet in the Vault
      expect(await contract.getTotalRewardPerToken()).to.equal(0); // no rewards yet in the Vault
    });

    it("Wallet A deposits 1 BLS tokens", async function() {
      expect(await blsToken.balanceOf(contract.address)).to.equal(0);
      await blsToken.connect(walletA).approve(contract.address, 1);
      await contract.connect(walletA).deposit(1);
      expect(await contract.totalTokens()).to.equal(1);
      expect(await blsToken.balanceOf(contract.address)).to.equal(1);
    });

    it("We distribute 10 BNBs of rewards", async function() {
      await contract.distribute({value: 10});
      expect(await contract.totalTokens()).to.equal(1);
    });

    it("Wallet B deposits 1 BLS tokens", async function() {
      await blsToken.connect(walletB).approve(contract.address, 1);
      await contract.connect(walletB).deposit(1);
      expect(await contract.totalTokens()).to.equal(2);
      expect(await blsToken.balanceOf(contract.address)).to.equal(2);
    });

    it("We distribute 10 BNBs of rewards", async function() {
      await contract.distribute({value: 10});
      expect(await contract.totalTokens()).to.equal(2);
    });

    it("Wallet A withdraws rewards", async function() {
      await contract.connect(walletA).withdraw();
      expect(await contract.totalTokens()).to.equal(1);
    });

    it("Wallet B withdraws rewards", async function() {
      await contract.connect(walletB).withdraw();
      expect(await contract.totalTokens()).to.equal(0);
      expect(await blsToken.balanceOf(contract.address)).to.equal(0);
    });

    it("Wallet B does two deposits", async function() {
      expect(await blsToken.balanceOf(contract.address)).to.equal(0);
      await blsToken.connect(walletB).approve(contract.address, 2);
      
      await contract.connect(walletB).deposit(1);
      let user = await contract.connect(walletB).userInfo(walletB.address);
      expect(user.tokens).to.equal(1);
      expect(await contract.totalTokens()).to.equal(1);
      expect(await blsToken.balanceOf(contract.address)).to.equal(1);

      await contract.connect(walletB).deposit(1);
      user = await contract.connect(walletB).userInfo(walletB.address);
      expect(user.tokens).to.equal(2);
      expect(await contract.totalTokens()).to.equal(2);
      expect(await blsToken.balanceOf(contract.address)).to.equal(2);

      await contract.connect(walletB).withdraw();
      user = await contract.connect(walletB).userInfo(walletB.address);
      expect(user.tokens).to.equal(0);
      expect(await contract.totalTokens()).to.equal(0);
      expect(await blsToken.balanceOf(contract.address)).to.equal(0);
    });
  });

  describe("Scenario 2", function() {
    it("Create wallets (signers)", async function() {
      [walletA, walletB] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    let blsToken;
    it("Deploy BLSToken contract", async function() {
      const contractObject = await ethers.getContractFactory("BLSToken");
      blsToken = await contractObject.deploy();
      blsToken.transfer(walletA.address, 100);
      blsToken.transfer(walletB.address, 100);
    });

    let contract;
    it("Expected to deploy BlocksStaking contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksStaking");
      contract = await contractObject.deploy(blsToken.address);
    });
  
    it("No tokens and rewards yet in the Vault", async function() {
      expect(await contract.totalTokens()).to.equal(0); // no tokens yet in the Vault
      expect(await contract.getTotalRewardPerToken()).to.equal(0); // no rewards yet in the Vault
    });
  
    it("Wallet A deposits 2 BLS tokens", async function() {
      await blsToken.connect(walletA).approve(contract.address, 2);
      await contract.connect(walletA).deposit(2);
      expect(await contract.totalTokens()).to.equal(2);
    });
  
    it("We distribute 10 BNBs of rewards", async function() {
      await contract.distribute({value: 10});
    });
  
    it("Wallet B deposits 4 BLS tokens", async function() {
      await blsToken.connect(walletB).approve(contract.address, 4);
      await contract.connect(walletB).deposit(4);
      expect(await contract.totalTokens()).to.equal(6);
    });
  
    it("We distribute 12 BNBs of rewards", async function() {
      await contract.distribute({value: 10});
    });
  
    it("Wallet A withdraws rewards", async function() {
      await contract.connect(walletA).withdraw();
      expect(await contract.totalTokens()).to.equal(4);
    });
  
    it("Wallet B withdraws rewards", async function() {
      await contract.connect(walletB).withdraw();
      expect(await contract.totalTokens()).to.equal(0);
    });
  });

  describe("Scenario 3", function() {
    it("Create wallets (signers)", async function() {
      [walletA, walletB, walletC] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    let blsToken;
    it("Deploy BLSToken contract", async function() {
      const contractObject = await ethers.getContractFactory("BLSToken");
      blsToken = await contractObject.deploy();
      blsToken.transfer(walletA.address, 100);
      blsToken.transfer(walletB.address, 100);
      blsToken.transfer(walletC.address, 100);
    });

    let contract;
    it("Expected to deploy BlocksStaking contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksStaking");
      contract = await contractObject.deploy(blsToken.address);
    });
  
    it("No tokens and rewards yet in the Vault", async function() {
      expect(await contract.totalTokens()).to.equal(0); // no tokens yet in the Vault
      expect(await contract.getTotalRewardPerToken()).to.equal(0); // no rewards yet in the Vault
    });
  
    it("Wallet A deposits 3 BLS tokens", async function() {
      await blsToken.connect(walletA).approve(contract.address, 3);
      await contract.connect(walletA).deposit(3);
      expect(await contract.totalTokens()).to.equal(3);
    });
  
    it("We distribute 10 BNBs of rewards", async function() {
      await contract.distribute({value: 10});
    });
  
    it("Wallet B deposits 4 BLS tokens", async function() {
      await blsToken.connect(walletB).approve(contract.address, 4);
      await contract.connect(walletB).deposit(4);
      expect(await contract.totalTokens()).to.equal(7);
    });
  
    it("We distribute 11 BNBs of rewards", async function() {
      await contract.distribute({value: 11});
    });

    it("Wallet C deposits 5 BLS tokens", async function() {
      await blsToken.connect(walletC).approve(contract.address, 5);
      await contract.connect(walletC).deposit(5);
      expect(await contract.totalTokens()).to.equal(12);
    });

    it("We distribute 12 BNBs of rewards", async function() {
      await contract.distribute({value: 12});
    });
  
    it("Wallet A withdraws rewards", async function() {
      await contract.connect(walletA).withdraw();
      expect(await contract.totalTokens()).to.equal(9);
    });
  
    it("Wallet B withdraws rewards", async function() {
      await contract.connect(walletB).withdraw();
      expect(await contract.totalTokens()).to.equal(5);
    });

    it("Wallet C withdraws rewards", async function() {
      await contract.connect(walletC).withdraw();
      expect(await contract.totalTokens()).to.equal(0);
    });
  });

  describe("Scenario 4", function() {
    it("Create wallets (signers)", async function() {
      [walletA] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    let blsToken;
    it("Deploy BLSToken contract", async function() {
      const contractObject = await ethers.getContractFactory("BLSToken");
      blsToken = await contractObject.deploy();
    });
  
    let contract;
    it("Expected to deploy BlocksStaking contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksStaking");
      contract = await contractObject.deploy(blsToken.address);
    });

    it("Deposit, distribute, get current reward", async function() {
      await blsToken.connect(walletA).approve(contract.address, 3);
      await contract.connect(walletA).deposit(3);
      await contract.distribute({value: 10});
      var ret = await contract.connect(walletA).getCurrentReward();
      expect(ret).to.equal(9);
    });
  });

  describe("Scenario 5", function() {
    it("Create wallets (signers)", async function() {
      [walletA, walletB] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });

    let blsToken;
    it("Deploy BLSToken contract", async function() {
      const contractObject = await ethers.getContractFactory("BLSToken");
      blsToken = await contractObject.deploy();
    });

    let contract;
    it("Expected to deploy BlocksStaking contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksStaking");
      contract = await contractObject.deploy(blsToken.address);
    });

    it("A:1, 10, B:1, 10 -> A=15, B=5", async function() {
      await blsToken.transfer(walletA.address, 100);
      await blsToken.transfer(walletB.address, 100);
      await blsToken.connect(walletA).approve(contract.address, 1);
      await contract.connect(walletA).deposit(1);
      await contract.distribute({value: 10});
      await blsToken.connect(walletB).approve(contract.address, 1);
      await contract.connect(walletB).deposit(1);
      await contract.distribute({value: 10});
      var retA = await contract.connect(walletA).getCurrentReward();
      var retB = await contract.connect(walletB).getCurrentReward();
      expect(retA).to.equal(15);
      expect(retB).to.equal(5);
    });
  });

  describe("Scenario 6", function() {
    it("Create wallets (signers)", async function() {
      [walletA, walletB] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    });
    
    let blsToken;
    it("Deploy BLSToken contract", async function() {
      const contractObject = await ethers.getContractFactory("BLSToken");
      blsToken = await contractObject.deploy();
    });

    let contract;
    it("Expected to deploy BlocksStaking contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksStaking");
      contract = await contractObject.deploy(blsToken.address);
    });

    it("Complex", async function() {
      await blsToken.transfer(walletA.address, 100);
      await blsToken.transfer(walletB.address, 100);
      await blsToken.connect(walletA).approve(contract.address, 1);
      await contract.connect(walletA).deposit(1);
      await contract.distribute({value: 10});
      await expect(contract.connect(walletA).claim()).to.emit(contract, "Claim").withArgs(walletA.address, 10);
      await blsToken.connect(walletB).approve(contract.address, 1);
      await contract.connect(walletB).deposit(1);
      await contract.distribute({value: 10});
      var retA = await contract.connect(walletA).getCurrentReward();
      var retB = await contract.connect(walletB).getCurrentReward();
      expect(retA).to.equal(5);
      expect(retB).to.equal(5);

      await contract.connect(walletA).withdraw();
      await contract.distribute({value: 10});
      var retB = await contract.connect(walletB).getCurrentReward();
      expect(retB).to.equal(15);

      await contract.connect(walletB).withdraw();
      var retB = await contract.connect(walletB).getCurrentReward();
      expect(retB).to.equal(0);

      expect(await contract.totalTokens()).to.equal(0);

      await blsToken.connect(walletA).approve(contract.address, 1);
      await contract.connect(walletA).deposit(1);
      await contract.distribute({value: 10});
      await blsToken.connect(walletB).approve(contract.address, 1);
      await contract.connect(walletB).deposit(1);
      await contract.distribute({value: 10});
      var retA = await contract.connect(walletA).getCurrentReward();
      var retB = await contract.connect(walletB).getCurrentReward();
      expect(retA).to.equal(15);
      expect(retB).to.equal(5);
      await expect(contract.connect(walletA).claim()).to.emit(contract, "Claim").withArgs(walletA.address, 15);
      var retA = await contract.connect(walletA).getCurrentReward();
      var retB = await contract.connect(walletB).getCurrentReward();
      expect(retA).to.equal(0);
      expect(retB).to.equal(5);
      
      expect(await contract.totalTokens()).to.equal(2);
    });
  });
});

describe("Regression testing BlocksContract", function() {
  it("Create wallets (signers)", async function() {
    [owner, walletA, walletB] = await ethers.getSigners(); // simulate different wallets: the owner of the contract and two other wallets A and B
    console.log("owner:", owner.address);
    console.log("walletA:", walletA.address);
    console.log("walletB:", walletB.address);
  });
  
  let blsToken;
  it("Deploy BLSToken contract", async function() {
    const contractObject = await ethers.getContractFactory("BLSToken");
    blsToken = await contractObject.deploy();
    blsToken.transfer(walletA.address, 100);
    blsToken.transfer(walletB.address, 100);
  });

  let blocksVault; // then we have to deploy also BlocksStaking contract
  it("Deploy BlocksStaking contract", async function() {
    const contractObject = await ethers.getContractFactory("BlocksStaking");
    blocksVault = await contractObject.deploy(blsToken.address);
  });

  let blocksRewardsPool; // we have to first deploy BlocksRewardsPool contract
  it("Deploy BlocksRewardPool contract", async function() {
    const contractObject = await ethers.getContractFactory("BlocksRewardsManager");
    blocksRewardsPool = await contractObject.deploy(blsToken.address, blocksVault.address);
  });

  let blocksContract; // now we can deploy BlocksContract with providing the addresses of previously deployed the other contracts
  it("Deploy BlocksContract contract", async function() {
    const contractObject = await ethers.getContractFactory("BlocksSpace");
    blocksContract = await contractObject.deploy(blocksRewardsPool.address);
  });

  it("Check for two different wallets that we start with 0 total tokens in Vault", async function() {
    var val = await blocksVault.connect(walletA).totalTokens(); // by connecting as a specific wallet we simulate calling the function as the respective wallet
    expect(val).to.equal(0);
    var val = await blocksVault.connect(walletB).totalTokens();
    expect(val).to.equal(0);
  });

  it("Wallet A deposits 2 BLSs", async function() {
    await blsToken.connect(walletA).approve(blocksVault.address, 2);
    await blocksVault.connect(walletA).deposit(2);
    var val = await blocksVault.connect(walletA).totalTokens();
    expect(val).to.equal(2);
    var val = await blocksVault.connect(walletB).totalTokens();
    expect(val).to.equal(2);
  });

  it("Wallet B deposits 4 BLSs", async function() {
    await blsToken.connect(walletB).approve(blocksVault.address, 4);
    await blocksVault.connect(walletB).deposit(4);
    var val = await blocksVault.connect(walletA).totalTokens();
    expect(val).to.equal(6);
    var val = await blocksVault.connect(walletB).totalTokens();
    expect(val).to.equal(6);
  });

  it("We do a real purchase of a poster and pay 12 BNBs for the Blocks area", async function() {
    await blocksRewardsPool.connect(owner).addSpace(blocksContract.address, 1);
    await blocksContract.connect(walletA).purchaseBlocksArea("0000", "0000", 'imagehash1', "My text", {value: 12});

    var val = await blocksVault.connect(walletA).getTotalRewardPerToken();
    expect(val).to.equal(2);
    var val = await blocksVault.connect(walletB).getTotalRewardPerToken();
    expect(val).to.equal(2);
  });

  it("Check wallet's A and B rewards", async function() {
    var ret = await blocksVault.connect(walletA).getCurrentReward();
    expect(ret).to.equal(4);

    var ret = await blocksVault.connect(walletB).getCurrentReward();
    expect(ret).to.equal(8);
  });

  it("Wallet A harvests rewards", async function() {
    await blocksVault.connect(walletA).claim();
    var ret = await blocksVault.connect(walletA).getCurrentReward();
    expect(ret).to.equal(0);
    var ret = await blocksVault.connect(walletB).getCurrentReward();
    expect(ret).to.equal(8);
  });

  it("Wallet B withdraws tokens", async function() {
    await blocksVault.connect(walletB).withdraw();
    var ret = await blocksVault.connect(walletB).getCurrentReward();
    expect(ret).to.equal(0);
  });
});

// describe("My Dapp", function () {
//   let myContract;

//   describe("YourContract", function () {
//     it("Should deploy YourContract", async function () {
//       const YourContract = await ethers.getContractFactory("BlocksContract");

//       myContract = await YourContract.deploy();
//     });

    // describe("calculatePrice()", function () {
    //   it("Proper prices shown", async function () {

    //     let res = await ethers.provider.getStorageAt('0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0', 0);
    //     let next = ethers.hexToAscii(res)
    //     // .then(result => {
    //     //   console.log(ethers.utils.hexToAscii(result));
    //     // });
    //     // .testing("0xb3B5e4c37BA0c173dA6347D99Dc0f1F77ad5AA91");
    //     console.log(next);
    //     // const responseArray = await myContract.calculatePrice(101, 202);
    //     // let block1 = responseArray[0];
    //     // console.log(responseArray[0]);
    //     // expect(block1.price).to.equal(0); // Price is 0
    //   });
    // });

    // describe("isPosterValid2()", function () {
    //   it("Poster validation should fail", async function () {
    //     // const newPurpose = "Test Purpose";
    //     await expect(myContract.calculatePrice("0203", "0102")).to.be.reverted;
    //     await expect(myContract.calculatePrice("0000", "4224")).to.be.reverted;
    //     await expect(myContract.calculatePrice("4454545", "4224")).to.be.reverted;
    //     await expect(myContract.calculatePrice("4123", "4022")).to.be.reverted;
    //   });
    // });

    // describe("purchasePoster()", function () {
    //   it("Should error if you dont pay anything", async function () {
    //     await expect(myContract.purchasePoster("0000", "0000",'imagehash1')).to.be.reverted;
    //   });

    //   it("Simple buy with proper amount of money", async function () {
    //     await myContract.setInitialBlockPrice(1);
    //     await myContract.purchasePoster("0000", "0000",'imagehash1',{value: 1});
    //   });

    //   it("should increase price after someone bought", async function () {
    //     await myContract.setInitialBlockPrice(1);
    //     await myContract.purchasePoster("0101", "0101",'imagehash1',{value: 1});

    //     expect(await myContract.calculatePrice("0101", "0101")).to.equal(5);
    //   });


    //   it("should be possible to pay more. Paying 5x more than initial price", async function () {
    //     await myContract.setInitialBlockPrice(1);
    //     await myContract.purchasePoster("0202", "0202",'imagehash1',{value: 5});

    //     expect(await myContract.calculatePrice("0202", "0202")).to.equal(25);
    //   });

    //   describe("Posting over existing posters.", function () {
         
    //     it("should be possible to buy once its already bought", async function () {         
    //       await myContract.setInitialBlockPrice(1);
    //       // Initial buy
    //       await myContract.purchasePoster("0404", "0404",'imagehash4',{value: 1});
    //       // Price now 5x  
    //       await myContract.purchasePoster("0404", "0404",'imagehash44',{value: 5});
    //       // expect(await myContract.calculatePrice("0101", "0101")).to.equal(5);
    //     });

    //     it("Bigger poster and increase price, but does not count as price increase per block < 1", async function () {         
    //       await myContract.setInitialBlockPrice(1);
    //       // Initial buy
    //       await myContract.purchasePoster("0505", "0505",'imagehash5',{value: 1});
    //       // Price now 5x
    //       await myContract.purchasePoster("0505", "0606",'imagehash66',{value: 11});
    //       // expect(await myContract.calculatePrice("0101", "0101")).to.equal(5);
    //       expect(await myContract.calculatePrice("0505", "0606")).to.equal(40);
    //     });

    //     it("Bigger poster and increase price.", async function () {         
    //       await myContract.setInitialBlockPrice(1);
    //       // Initial buy
    //       await myContract.purchasePoster("0707", "0707",'imagehash5',{value: 1});
    //       // Price now 5x
    //       await myContract.purchasePoster("0707", "0808",'imagehash66',{value: 12});
    //       // expect(await myContract.calculatePrice("0101", "0101")).to.equal(5);
    //       expect(await myContract.calculatePrice("0707", "0808")).to.equal(60);
    //     });

    //   });


    // });
    
//   });
// });
