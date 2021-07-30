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

For better representation, you should check our concept:
![1000Blocks space concept](/Concept.svg)
