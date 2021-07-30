pragma solidity ^0.8.0;
//SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


contract BlocksRewardsManager is Ownable {

    // Info of each user.
    struct UserInfo {
        uint256 amount;                     // How many block.areas user owns currently.
        uint256 pendingRewards;             // Rewards assigned, but not yet claimed
        uint256 lastRewardCalculatedBlock;  // When pending rewards were last calculated for user
    }

    // Info of each blocks.space
    struct SpaceInfo {
        uint256 spaceId;
        uint256 amountOfBlocksBought;       // Number of all blocks bought on this space
        address contractAddress;            // Address of space contract.
        uint256 blsPerBlockAreaPerBlock;    // Start with 830000000000000 wei (approx 24 BLS/block.area/day)
    }

    IERC20 public blsToken;
    SpaceInfo[] public spaceInfo;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    mapping(address => bool) public spacesByAddress;
    uint256 public allAllocationBlocks; // Amount of all blocks from all spaces that are getting BLS rewards

    event SpaceAdded(uint256 indexed spaceId, address indexed space, address indexed addedBy);
    event Claim(address indexed user, uint256 amount);

    modifier onlySpace(){
        require(spacesByAddress[msg.sender] == true, "Not a space.");
        _;
    }

    constructor(IERC20 _blsAddress){
        blsToken = IERC20(_blsAddress);
    }

    function spacesLength() external view returns (uint256){
        return spaceInfo.length;
    }

    function addSpace(address _spaceContract, uint256 _blsPerBlockAreaPerBlock) external onlyOwner {
        spacesByAddress[_spaceContract] = true;
        uint256 spaceId = spaceInfo.length;
        SpaceInfo storage newSpace = spaceInfo.push();
        newSpace.contractAddress = _spaceContract;
        newSpace.spaceId = spaceId;
        newSpace.blsPerBlockAreaPerBlock = _blsPerBlockAreaPerBlock;
        emit SpaceAdded(spaceId, _spaceContract, msg.sender);
    }

    function pendingBlsTokens(uint256 _spaceId, address _user) public view returns(uint256){
        SpaceInfo storage space = spaceInfo[_spaceId];
        UserInfo storage user = userInfo[_spaceId][_user];
        uint256 rewards;
        if(user.amount > 0 && user.lastRewardCalculatedBlock < block.number){
            uint256 multiplier = block.number - user.lastRewardCalculatedBlock;
            uint256 blsRewards = multiplier * space.blsPerBlockAreaPerBlock;
            rewards = user.amount * blsRewards;
        }
        return user.pendingRewards + rewards;
    }

    function blocksAreaBoughtOnSpace(uint256 _spaceId, address _buyer, uint256 _numberOfBlocksBought, address[] calldata _previousBlockOwners) public payable onlySpace {
    
        SpaceInfo storage space = spaceInfo[_spaceId];
        UserInfo storage user = userInfo[_spaceId][_buyer];
        
        // If user already had some block.areas then calculate all rewards pending
        if(user.lastRewardCalculatedBlock > 0){
            uint256 multiplier = block.number - user.lastRewardCalculatedBlock;
            uint256 blsRewards = multiplier * space.blsPerBlockAreaPerBlock;
            user.pendingRewards += user.amount * blsRewards;
        }

        // Set user data
        user.amount += _numberOfBlocksBought;
        user.lastRewardCalculatedBlock = block.number;
        
        //remove blocks from previous owners that this guy took over. Max 42 loops
        uint256 amountOfBlocksToRemove;
        for(uint256 i = 0; i < _numberOfBlocksBought; i++){
            // If previous owners of block are non zero address, means we need to take block from them
            if(_previousBlockOwners[i] != address(0x0)){

                // Calculate previous users pending rewards
                UserInfo storage prevUser = userInfo[_spaceId][_previousBlockOwners[i]];          
                uint256 multiplier = block.number - prevUser.lastRewardCalculatedBlock;
                uint256 blsRewards = multiplier * space.blsPerBlockAreaPerBlock;
                prevUser.pendingRewards += prevUser.amount * blsRewards;
                prevUser.lastRewardCalculatedBlock = block.number;
                // Remove his ownership of block
                prevUser.amount--;
                amountOfBlocksToRemove++;
            }           
        }

        // If amount of blocks on space changed, we need to update space state
        if(amountOfBlocksToRemove < _numberOfBlocksBought){           
            space.amountOfBlocksBought = space.amountOfBlocksBought - amountOfBlocksToRemove + _numberOfBlocksBought;
            allAllocationBlocks += _numberOfBlocksBought - amountOfBlocksToRemove;
        }

        // At this point we have all stuff to calculate rewards. 
        // We have how many blocks does a specific user (address has). 
        // And we know how many are all of blocks in space bought.
        // console.log("Money received:", msg.value);
    }

    function claim(uint256 _spaceId) public {
        SpaceInfo storage space = spaceInfo[_spaceId];
        UserInfo storage user = userInfo[_spaceId][msg.sender];

        if(user.amount > 0 && user.lastRewardCalculatedBlock < block.number){
            uint256 multiplier = block.number - user.lastRewardCalculatedBlock;
            uint256 blsRewards = multiplier * space.blsPerBlockAreaPerBlock;
            user.pendingRewards += user.amount * blsRewards;
            user.lastRewardCalculatedBlock = block.number;
        }
        uint256 toClaimAmount = user.pendingRewards;
        if(toClaimAmount > 0){
            uint256 claimedAmount = safeBlsTransfer(msg.sender, toClaimAmount);
            emit Claim(msg.sender, claimedAmount);
            // This is also kinda check, since if user claims more than eligible, this will revert
            user.pendingRewards -= claimedAmount; 
        }
    }

    // Safe BLS transfer function, just in case if rounding error causes pool to not have enough BLSs.
    function safeBlsTransfer(address _to, uint256 _amount) internal returns (uint256){
        uint256 blsBalance = blsToken.balanceOf(address(this));
        if (_amount > blsBalance) {            
            blsToken.transfer(_to, blsBalance);
            return blsBalance;
        } else {
            blsToken.transfer(_to, _amount);
            return _amount;
        }
    }

    // TODO: This shall be removed after testnet. If you see this, contact devs immediately
    function withdrawTestOnly() external onlyOwner {
        // Get BNB
        uint256 contractBalance = address(this).balance;
        (bool success, ) = msg.sender.call{value: contractBalance}("");
        require(success, "Transfer failed.");
        // Get BLS
        uint256 blsBalance = blsToken.balanceOf(address(this));       
        blsToken.transfer(msg.sender, blsBalance);
    }

//   address payable public treasury;
//   uint constant MAX_TREASURY_FEE = 15; //%
//   uint public treasuryFee = 10; // %

//   function setTreasuryFee(uint256 newFee_) external onlyOwner {
//     require(newFee_ < MAX_TREASURY_FEE);
//     treasuryFee = newFee_;
//   }

//   function updateTreasuryWallet(address newWallet_) external onlyOwner {
//     treasury = payable(newWallet_);
//   }

      // function rewardOf(address userAddress) external view returns (uint){
  //   return users[userAddress].pendingReward;
  // }

  // function claimReward() external {

  //   uint userBalanceToGrant = users[msg.sender].pendingReward;
  //   require(userBalanceToGrant > 0, "Nothing to withraw.");
  //   users[msg.sender].pendingReward = 0;
  //   (bool success, ) = payable(msg.sender).call{value: userBalanceToGrant}("");
  //   require(success, "Claiming rewards failed.");
  //   emit RewardClaimed(msg.sender, userBalanceToGrant);
  // }

  // TODO: This shall be removed after testnet. If you see this, contact devs immediately
  // function withdrawTestOnly() external onlyOwner{
  //   uint contractBalance = address(this).balance;
  //   (bool success, ) = owner.call{value: contractBalance}("");
  //   require(success, "Transfer failed.");
  // }

}