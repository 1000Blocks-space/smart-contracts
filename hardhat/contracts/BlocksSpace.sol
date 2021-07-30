pragma solidity ^0.8.0;
//SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "./BlocksRewardsManager.sol";


contract BlocksSpace is Ownable {

  struct Block {
    uint price;
    address owner;
  }

  struct BlockView {
    uint price;
    address owner;
    uint16 blockNumber;
  }

  struct BlocksArea {
    address owner;
    uint blockstart;
    uint blockend;
    string imghash;
    string text;
    uint zindex;
  }

  struct UserState{
    BlocksArea lastBlocksAreaBought;
    uint lastPurchase;
  }

  uint constant PRICE_OF_LOGO_BLOCKS = 42 ether;

  BlocksRewardsManager public rewardsPool;
  uint public minTimeBetweenPurchases = 42 hours;
  mapping(uint => Block) public blocks;
  mapping(address => UserState) public users;

  event BlocksAreaPurchased(address indexed blocksAreaOwner, uint startBlock, uint endBlock);

  function updateRewardsPoolContract(address add_) public onlyOwner {
    rewardsPool = BlocksRewardsManager(add_);
  }

  function updateMinTimeBetweenPurchases(uint256 inSeconds_) public onlyOwner {
    minTimeBetweenPurchases = inSeconds_;
  }

  constructor(address rewardsPoolContract_) {
    rewardsPool = BlocksRewardsManager(rewardsPoolContract_);
    setPriceOfLogoBlocks(303, 604);
  }

  function setPriceOfLogoBlocks(uint256 startBlockId, uint256 endBlockId) internal {
    // 303 - 604
    (uint startBlockX, uint startBlockY) = getBlockLocation(startBlockId);
    (uint endBlockX, uint endBlockY) = getBlockLocation(endBlockId);

    for(uint i = startBlockX; i <= endBlockX; i++){
      for(uint j = startBlockY; j <= endBlockY; j++){
        blocks[i * 100 + j].price = PRICE_OF_LOGO_BLOCKS;
        blocks[i * 100 + j].owner = msg.sender;
      }
    }
  }

  function purchaseBlocksArea(uint startBlockId, uint endBlockId, string calldata imghash, string calldata text) external payable {

    // 1. Checks
    uint paymentReceived = msg.value;
    require(paymentReceived > 0, "Money expected...");
    require(block.timestamp >= users[msg.sender].lastPurchase + minTimeBetweenPurchases, "You must wait 42h between buys");
    require(isBlocksAreaValid(startBlockId, endBlockId), "BlocksArea invalid");
    require(bytes(imghash).length != 0, "Image hash cannot be empty");

    (uint currentPriceOfBlocksArea, uint numberOfBlocks) = calculatePriceAndSize(startBlockId, endBlockId);   

    // Price increase per block needs to be at least minimal
    uint priceIncreasePerBlock = (paymentReceived - currentPriceOfBlocksArea) / numberOfBlocks;
    require(priceIncreasePerBlock > 0, "Price increase too small");

    // 2. Storage operations
    address[] memory previousBlockOwners = calculateBlocksOwnershipChanges(startBlockId, endBlockId, priceIncreasePerBlock); 
    updateUserState(msg.sender, startBlockId, endBlockId, imghash, text);

    // 3. Transactions   
    // Send fresh info to RewardsPool contract, so buyer gets some sweet rewards
    rewardsPool.blocksAreaBoughtOnSpace{value: paymentReceived}(0, msg.sender, numberOfBlocks, previousBlockOwners);

    // 4. Emit purchase event
    emit BlocksAreaPurchased(msg.sender, startBlockId * 10000000 + endBlockId, paymentReceived);
  }

  function calculateBlocksOwnershipChanges(uint startBlockId, uint endBlockId, uint priceIncreasePerBlock) internal returns (address[] memory) {
    
    (uint startBlockX, uint startBlockY) = getBlockLocation(startBlockId);
    (uint endBlockX, uint endBlockY) = getBlockLocation(endBlockId);

    // Go through all blocks that were paid for
    address[] memory previousBlockOwners = new address[](42);
    uint256 arrayIndex = 0;
    for(uint i = startBlockX; i <= endBlockX; i++){
      for(uint j = startBlockY; j <= endBlockY; j++){
        //Set new state of the Block
        Block storage currentBlock = blocks[i * 100 + j];      
        currentBlock.price += priceIncreasePerBlock; // Set new price that was paid for this block
        previousBlockOwners[arrayIndex] = currentBlock.owner;
        currentBlock.owner = msg.sender; // Set new owner of block
        arrayIndex++;
      }
    }
    return previousBlockOwners;
  }

  function updateUserState(address user, uint startBlockId, uint endBlockId, string calldata imghash, string calldata text) internal {
    UserState storage userState = users[user];   
    userState.lastBlocksAreaBought.owner = user;
    userState.lastBlocksAreaBought.blockstart = startBlockId;
    userState.lastBlocksAreaBought.blockend = endBlockId;
    userState.lastBlocksAreaBought.imghash = imghash;
    userState.lastBlocksAreaBought.text = text;
    userState.lastBlocksAreaBought.zindex = block.number;
    userState.lastPurchase = block.timestamp;
  }

  function getPricesOfBlocks(uint startBlockId, uint endBlockId) external view returns(BlockView[] memory){

    require(isBlocksAreaValid(startBlockId, endBlockId), "BlocksArea invalid");

    (uint startBlockX, uint startBlockY) = getBlockLocation(startBlockId);
    (uint endBlockX, uint endBlockY) = getBlockLocation(endBlockId);

    BlockView[42] memory blockAreaTemp;
    uint256 arrayCounter;
    for(uint16 i = uint16(startBlockX); i <= endBlockX; i++){
      for(uint16 j = uint16(startBlockY); j <= endBlockY; j++){
        blockAreaTemp[arrayCounter] = BlockView(
          blocks[i * 100 + j].price, 
          blocks[i * 100 + j].owner, 
          (i * 100 + j) // block number
        );
        arrayCounter++;
      }
    }

    // Shrink array and return only whats filled
    BlockView[] memory blockArea = new BlockView[](arrayCounter);
    for(uint i; i < arrayCounter; i++){
      blockArea[i] = blockAreaTemp[i];
    }
    return blockArea;
  }

  function calculatePriceAndSize(uint startBlockId, uint endBlockId) internal view returns(uint, uint){

    (uint startBlockX, uint startBlockY) = getBlockLocation(startBlockId);
    (uint endBlockX, uint endBlockY) = getBlockLocation(endBlockId);

    uint currentPrice;
    uint numberOfBlocks;
    for(uint i = startBlockX; i <= endBlockX; i++){
      for(uint j = startBlockY; j <= endBlockY; j++){
        currentPrice += blocks[i * 100 + j].price;
        numberOfBlocks++;
      }
    }
    return (currentPrice, numberOfBlocks);
  }

  function isBlocksAreaValid(uint startBlockId, uint endBlockId) internal pure returns(bool){
    (uint startBlockX, uint startBlockY) = getBlockLocation(startBlockId);
    (uint endBlockX, uint endBlockY) = getBlockLocation(endBlockId);
        
    require(startBlockX < 42 && endBlockX < 42, "X blocks out of range. Oh Why?");
    require(startBlockY < 24 && endBlockY < 24, "Y blocks out of range. Oh Why?");
    
    uint blockWidth = endBlockX - startBlockX + 1; // +1 because its including
    uint blockHeight = endBlockY - startBlockY + 1; // +1 because its including
    uint blockArea = blockWidth * blockHeight;

    return blockWidth <= 7 && blockHeight <= 7 && blockArea <= 42;
  }

  function getBlockLocation(uint blockId) internal pure returns(uint, uint){
    return (blockId / 100, blockId % 100);
  }

}



