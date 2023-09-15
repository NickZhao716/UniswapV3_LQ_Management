# UniswapV3_LQ_Management
Program requirements:
- NodeJS installation:
  
  required 18.x verison

- foundry installation
  
  curl -L https://foundry.paradigm.xyz | bash
  
  source ~/.bashrc
  
  foundryup
  
  forge build
  
- Infura API key:
  
  [register](https://www.infura.io/)
  
  create Infura account and get a API key.

Program structure:

![image](https://github.com/NickZhao716/UniswapV3_LQ_Management/assets/104879437/3e1511e1-c736-47e9-bf98-3784539a1696)


Excute src\ scripts:

npx ts-node C:\Users\Flybear\Documents\UniswapProject\poolStatusCheck\poolLQ.ts  

Excute test\ scripts:

Start forking chain first! 

anvil --chain-id 1 --fork-url https://mainnet.infura.io/v3/cb21c3cb7e7943419c7b38b7a1384015 --silent
