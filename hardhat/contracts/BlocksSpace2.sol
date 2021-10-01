pragma solidity ^0.8.5;
//SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "./BlocksRewardsManager2.sol";
import "./BLSToken.sol";

contract BlocksSpace2 is Ownable {
    struct Block {
        uint256 price;
        address owner;
        uint256 blockWhenClaimed;
    }

    struct BlockView {
        uint256 price;
        uint256 priceBls;
        address owner;
        uint256 blockWhenClaimed;
        uint16 blockNumber;
    }

    struct BlocksArea {
        address owner;
        uint256 blockstart;
        uint256 blockend;
        string imghash;
        uint256 zindex;
    }

    struct BlockAreaLocation {
        uint256 startBlockX;
        uint256 startBlockY;
        uint256 endBlockX;
        uint256 endBlockY;
    }

    struct UserState {
        BlocksArea lastBlocksAreaBought;
        uint256 lastPurchase;
    }

    uint256 public blockClaimPrice = 10 * 1e15; // 0.01 BNB
    uint256 constant PRICE_OF_LOGO_BLOCKS = 42 ether;
    BlocksRewardsManager2 public rewardsPool;
    BLSToken public blsToken;
    uint256 public minTimeBetweenPurchases = 4 hours + 20 minutes;
    uint256 public maxBlsTakeoverAmount = 420 ether;
    uint256 public minBlsTakeoverAmount = 20 ether;
    uint256 public blsTakeoverTimeInBlocks = 42 * 60 * 60 / 3; // Amount of blocks that pass before high BLS rewards drop to base. (42 hours)
    uint256 public blsFreeTimeInBlocks = 1 * 60 * 60 / 3; // Amount of blocks that pass when there is 0 BLS for takeover (1h)
    uint256 public blsTakeoverBurnPercents = 24; // Amount of BLS from fees that are burned
    uint256 blsTakeoverDecreasePerBlock = maxBlsTakeoverAmount / blsTakeoverTimeInBlocks;
    mapping(uint256 => Block) public blocks;
    mapping(address => UserState) public users;
    
    event MinTimeBetweenPurchasesUpdated(uint256 inSeconds);
    event BlocksAreaPurchased(address indexed blocksAreaOwner, uint256 blocksBought, uint256 paid);
    event BlockClaimPriceUpdated(uint256 newPrice);
    event MaxBlsTakeoverAmountUpdated(uint256 newAmount);
    event MinBlsTakeoverAmountUpdated(uint256 newAmount);
    event BlsTakeoverTimeInBlocksUpdated(uint256 amountSeconds);
    event BlsFreeTimeInBlocksUpdated(uint256 amountSeconds);
    event BlsTakeoverBurnPercentsUpdated(uint256 newAmount);

    constructor(address rewardsPoolContract_, address blsTokenContract) {
        rewardsPool = BlocksRewardsManager2(rewardsPoolContract_);
        blsToken = BLSToken(blsTokenContract);
        setPriceOfLogoBlocks(0, 301);
    }

    function setPriceOfLogoBlocks(uint256 startBlockId_, uint256 endBlockId_) internal {
        // 0 - 301
        (uint256 startBlockX, uint256 startBlockY) = (startBlockId_ / 100, startBlockId_ % 100);
        (uint256 endBlockX, uint256 endBlockY) = (endBlockId_ / 100, endBlockId_ % 100);
        for (uint256 i = startBlockX; i <= endBlockX; ++i) {
            for (uint256 j = startBlockY; j <= endBlockY; ++j) {
                Block storage currentBlock = blocks[i * 100 + j];
                currentBlock.price = PRICE_OF_LOGO_BLOCKS;
                currentBlock.owner = msg.sender;
            }
        }
    }

    function purchaseBlocksArea(
        uint256 startBlockId_,
        uint256 endBlockId_,
        string calldata imghash_,
        uint256 allowedMaxBls_
    ) external payable {
        BlockAreaLocation memory blocksArea = BlockAreaLocation(
            startBlockId_ / 100,
            startBlockId_ % 100,
            endBlockId_ / 100,
            endBlockId_ % 100
        );

        // 1. Checks
        uint256 paymentReceived = msg.value;
        require(
            block.timestamp >= users[msg.sender].lastPurchase + minTimeBetweenPurchases,
            "You must wait between buys"
        );
        require(isBlocksAreaValid(blocksArea), "BlocksArea invalid");
        require(bytes(imghash_).length != 0, "Image hash cannot be empty");

        uint256 numberOfBlocks = calculateSizeOfBlocksArea(blocksArea);
        require(paymentReceived == (blockClaimPrice * numberOfBlocks), "You should pay exact amount");
        // Here we need to check if he paid enough BLS for takeover

        // console.log("numberOfBlocks", numberOfBlocks);
        BlockView[] memory blocks = getPricesOfBlocks(startBlockId_, endBlockId_);
        uint256 blsTakeoverFullPrice;
        uint256 blsTakeoverPrevOwnersFees;
        address[] memory previousBlockOwners = new address[](numberOfBlocks);
        uint256[] memory previousOwnersBlsTakeover = new uint256[](numberOfBlocks);
        for(uint256 i; i < numberOfBlocks; ++i){
            uint256 blsTakeoverRewardPrevOwner = (100 - blsTakeoverBurnPercents) * blocks[i].priceBls / 100;
            blsTakeoverPrevOwnersFees = blsTakeoverPrevOwnersFees + blsTakeoverRewardPrevOwner;
            previousBlockOwners[i] = blocks[i].owner;
            previousOwnersBlsTakeover[i] = blsTakeoverRewardPrevOwner;
            blsTakeoverFullPrice = blsTakeoverFullPrice + blocks[i].priceBls;
        }

        // 2. Token Transactions and burning
        // Transfer amount of tokens for cover to this contract
        blsToken.transferFrom(msg.sender, address(this), blsTakeoverFullPrice);
        // Transfer to rewards manager rewards for previous owners
        blsToken.transfer(address(rewardsPool), blsTakeoverPrevOwnersFees);
        // burn the rest
        blsToken.burn(blsTakeoverFullPrice - blsTakeoverPrevOwnersFees);

        // 3. Storage operations
        calculateBlocksOwnershipChanges(blocksArea, numberOfBlocks);
        updateUserState(msg.sender, startBlockId_, endBlockId_, imghash_);

        // Send fresh info to RewardsPool contract, so buyer gets some sweet rewards
        rewardsPool.blocksAreaBoughtOnSpace{value: paymentReceived}(msg.sender, previousBlockOwners, previousOwnersBlsTakeover);

        // 4. Emit purchase event
        emit BlocksAreaPurchased(msg.sender, startBlockId_ * 10000 + endBlockId_, paymentReceived);
    }

    function calculateBlocksOwnershipChanges(
        BlockAreaLocation memory blocksArea,
        uint256 numberOfBlocks_
    ) internal returns (address[] memory, uint256[] memory) {
        // Go through all blocks that were paid for
        address[] memory previousBlockOwners = new address[](numberOfBlocks_);
        uint256[] memory previousOwnersPrices = new uint256[](numberOfBlocks_);
        uint256 arrayIndex;
        for (uint256 i = blocksArea.startBlockX; i <= blocksArea.endBlockX; ++i) {
            for (uint256 j = blocksArea.startBlockY; j <= blocksArea.endBlockY; ++j) {
                //Set new state of the Block
                Block storage currentBlock = blocks[i * 100 + j];
                currentBlock.price = blockClaimPrice; // Set constant price
                currentBlock.owner = msg.sender; // Set new owner of block
                currentBlock.blockWhenClaimed = block.number; // Set when it was claimed
                ++arrayIndex;
            }
        }
        return (previousBlockOwners, previousOwnersPrices);
    }

    function updateUserState(
        address user_,
        uint256 startBlockId_,
        uint256 endBlockId_,
        string calldata imghash_
    ) internal {
        UserState storage userState = users[user_];
        userState.lastBlocksAreaBought.owner = user_;
        userState.lastBlocksAreaBought.blockstart = startBlockId_;
        userState.lastBlocksAreaBought.blockend = endBlockId_;
        userState.lastBlocksAreaBought.imghash = imghash_;
        userState.lastBlocksAreaBought.zindex = block.number;
        userState.lastPurchase = block.timestamp;
    }

    function getPricesOfBlocks(uint256 startBlockId_, uint256 endBlockId_) public view returns (BlockView[] memory) {
        BlockAreaLocation memory blocksArea = BlockAreaLocation(
            startBlockId_ / 100,
            startBlockId_ % 100,
            endBlockId_ / 100,
            endBlockId_ % 100
        );

        require(isBlocksAreaValid(blocksArea), "blocksArea invalid");

        BlockView[42] memory blockAreaTemp;
        uint256 arrayCounter;
        for (uint256 i = blocksArea.startBlockX; i <= blocksArea.endBlockX; ++i) {
            for (uint256 j = blocksArea.startBlockY; j <= blocksArea.endBlockY; ++j) {
                uint16 index = uint16(i * 100 + j);
                Block memory currentBlock = blocks[index];
                uint256 takeoverPriceBls;
                // Checking if block was already claimed, because that is important for takeover price in BLS
                if(currentBlock.blockWhenClaimed > 0){
                    // blsTakeoverTimeInBlocks
                    uint256 blocksSinceLastClaim = block.number - currentBlock.blockWhenClaimed;

                    if(blocksSinceLastClaim < blsTakeoverTimeInBlocks){
                        // First part of declining graph
                        takeoverPriceBls = maxBlsTakeoverAmount - (blocksSinceLastClaim * blsTakeoverDecreasePerBlock);
                    }else if(blocksSinceLastClaim > blsTakeoverTimeInBlocks + blsFreeTimeInBlocks){
                        takeoverPriceBls = minBlsTakeoverAmount;
                    }     
                }
                
                blockAreaTemp[arrayCounter] = BlockView(
                    currentBlock.price != 0 ? currentBlock.price : blockClaimPrice,
                    takeoverPriceBls, 
                    currentBlock.owner,
                    currentBlock.blockWhenClaimed,
                    index // block number
                );
                ++arrayCounter;
            }
        }

        // Shrink array and return only whats filled
        BlockView[] memory blockArea = new BlockView[](arrayCounter);
        for (uint256 i; i < arrayCounter; ++i) {
            blockArea[i] = blockAreaTemp[i];
        }
        return blockArea;
    }

    function calculateSizeOfBlocksArea(BlockAreaLocation memory blocksArea) internal view returns (uint256) {
        uint256 numberOfBlocks;
        for (uint256 i = blocksArea.startBlockX; i <= blocksArea.endBlockX; ++i) {
            for (uint256 j = blocksArea.startBlockY; j <= blocksArea.endBlockY; ++j) {
                ++numberOfBlocks;
            }
        }
        return numberOfBlocks;
    }

    function isBlocksAreaValid(BlockAreaLocation memory blocksArea) internal view returns (bool) {
        require(blocksArea.startBlockX < 42 && blocksArea.endBlockX < 42, "X blocks out of range. Oh Why?");
        require(blocksArea.startBlockY < 24 && blocksArea.endBlockY < 24, "Y blocks out of range. Oh Why?");

        uint256 blockWidth = blocksArea.endBlockX - blocksArea.startBlockX + 1; // +1 because its including
        uint256 blockHeight = blocksArea.endBlockY - blocksArea.startBlockY + 1; // +1 because its including
        uint256 blockArea = blockWidth * blockHeight;

        return blockWidth <= 7 && blockHeight <= 7 && blockArea <= 42;
    }

    function updateMinTimeBetweenPurchases(uint256 inSeconds_) external onlyOwner {
        minTimeBetweenPurchases = inSeconds_;
        emit MinTimeBetweenPurchasesUpdated(inSeconds_);
    }

    function updateBlockClaimPrice(uint256 newPrice) external onlyOwner {
        blockClaimPrice = newPrice;
        emit BlockClaimPriceUpdated(newPrice);
    }
    
    function updateMaxBlsTakeoverAmount(uint256 newAmount) external onlyOwner {
        maxBlsTakeoverAmount = newAmount;
        blsTakeoverDecreasePerBlock = maxBlsTakeoverAmount / blsTakeoverTimeInBlocks;
        emit MaxBlsTakeoverAmountUpdated(newAmount);
    }
    
    function updateMinBlsTakeoverAmount(uint256 newAmount) external onlyOwner {
        minBlsTakeoverAmount = newAmount;
        emit MinBlsTakeoverAmountUpdated(newAmount);
    }
    
    function updateBlsTakeoverTimeInBlocks(uint256 amountSeconds) external onlyOwner {
        blsTakeoverTimeInBlocks = amountSeconds / 3; // Get amount of blocks from seconds
        blsTakeoverDecreasePerBlock = maxBlsTakeoverAmount / blsTakeoverTimeInBlocks;
        emit BlsTakeoverTimeInBlocksUpdated(amountSeconds);
    }
    
    function updateBlsFreeTimeInBlocks(uint256 amountSeconds) external onlyOwner {
        blsFreeTimeInBlocks = amountSeconds / 3; // Get amount of blocks from seconds
        emit BlsFreeTimeInBlocksUpdated(amountSeconds);
    }
    
    function updateBlsTakeoverBurnPercents(uint256 newPercents) external onlyOwner {
        blsTakeoverBurnPercents = newPercents;
        emit BlsTakeoverBurnPercentsUpdated(newPercents);
    }
}