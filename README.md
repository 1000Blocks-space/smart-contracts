## Welcome to 1000blocks.space smart contracts repository

- Web page: https://1000blocks.space
- Gitbook docs: https://1000blocks.gitbook.io

## How to run
- Go inside hardhat folder where you do following:
- ```npm install```
- Create mnemonic.txt and put in your deployment secret words phrase (alternatively you can autogenerate it with ```yarn generate```)
- ```yarn test```
- ```yarn deploy``` to initiate deployment.js from scripts folder. (you do here which contracts need to be deployed)

Others:
- you should put etherscan (for verified contracts) api into hardhat.config.js

Contracts (hardhat/contracts):
- `BLSToken.sol` is very simple ERC20 contract for our token. Max supply 42 million tokens
- `BlocksSpace.sol` is main contract which handles buying of blocksareas and attaching pictures (main part of dApp)
- `BlocksRewardsManager.sol` is receiving payments for blocksareas and manages where goes what. It is also handling initial distribution of BLS tokens as rewards
- `BlocksStaking.sol` is contract where users can stake BLS tokens and in return they get BNBs that were used to purchase blocksareas on dApp
- `BlocksSpacePresale.sol` was contract used for private limited community presale

For better representation, you should check our concept:
![1000Blocks space concept](/Concept.svg)
