import { ethers } from 'ethers'
import{getERC20Balance} from '../libs/balance'
import{getPoolInfo} from '../libs/pool'
import{createTrade,executeTrade} from '../libs/trading'
import { Token } from '@uniswap/sdk-core'
import {TransactionState,} from '../libs/providers'
import {FeeAmount} from '@uniswap/v3-sdk'
import {sqrtPriceToTick, tickToSqrtPrice, tickToPrice} from '../libs/positions'
import { BaseProvider } from '@ethersproject/providers'
import {PoolInfo} from '../libs/pool'
import { ETHMarginForGasFee } from './automationConstants'

export interface tokenBalancingInfo {
  swap0for1: boolean,
  swapAmount: number
}
// TO DO:
//    Smart swap for least cost
export async function rebalanceTokens(provider: BaseProvider, wallet: ethers.Wallet, token0: Token, token1: Token, leftRange: number, rightRange: number
): Promise<TransactionState>{
    const walletAddress = wallet.address
    const poolInfo = await getPoolInfo(token0,token1,FeeAmount.LOW,provider)   

    const token0Amount = await getERC20Balance(provider,walletAddress,token0.address)
    const token1Amount = await getERC20Balance(provider, walletAddress,token1.address)
    //console.log(`before trade: ${token0Amount}`);
    //console.log(`before trade: ${token1Amount}`);
    const swapInfo = await constructRebalancingAsymmetry(token0Amount, token0.decimals, token1Amount, token1.decimals, leftRange, rightRange, poolInfo)
    let rebalancingResult
    if(swapInfo.swap0for1){
      rebalancingResult = await rebalancing(token0, token1, swapInfo.swapAmount, provider, wallet)
    }else{
      rebalancingResult = await rebalancing(token1, token0, swapInfo.swapAmount, provider, wallet)
    }
    if(rebalancingResult == TransactionState.Failed) {
      return TransactionState.Failed
    }
    console.log()
    const token0AmountAF = await getERC20Balance(provider, walletAddress,token0.address)
    const token1AmountAF = await getERC20Balance(provider, walletAddress,token1.address)
    console.log('---------------Token0 & Token1 after deposit-------------------------')
    console.log(`Token0 balance after rebalancing: ${token0AmountAF}`);
    console.log(`Token1 balance after rebalancing: ${token1AmountAF}`);
    console.log('---------------------------------------------')
    return rebalancingResult
    //const positinID = await mintPosition(token0,token1, poolFee,range,provider,wallet);
        // need to handle tx fail
    //console.log(`minted positio ID: ${positinID}`);
    //console.log()
    //const token0Amount_LQ = await getERC20Balance(provider,walletAddress,token0.address)
    //const token1Amount_LQ = await getERC20Balance(provider, walletAddress,token1.address)
    //console.log(`after adding liquidity: ${token0Amount_LQ}`);
    //console.log(`after adding liquidity: ${token1Amount_LQ}`);
}
// calculate the swap amount
export async function constructRebalancing( amount0: number, decimal0:number, amount1: number, decimal1:number, range: number,poolInfo:PoolInfo): Promise<tokenBalancingInfo>  {
  return constructRebalancingAsymmetry(amount0, decimal0, amount1, decimal1, range, range, poolInfo)
}
// calculate the swap amount 
export async function constructRebalancingAsymmetry( amount0: number, decimal0:number, amount1: number, decimal1:number, leftRange: number, rightRange: number, poolInfo:PoolInfo): Promise<tokenBalancingInfo>  {
  
  const poolTick = poolInfo.tick
  const poolPrice = tickToPrice(poolTick);
  const sqrtprice = Math.pow(poolPrice, 0.5);
  console.log(`pool price: ${poolPrice}`);
  const sqrtPriceUpperTemp = sqrtprice * Math.pow((1+rightRange), 0.5);
  const sqrtPriceLowerTemp = sqrtprice * Math.pow((1-leftRange), 0.5);
  const tickUpper = sqrtPriceToTick(sqrtPriceUpperTemp);
  const tickLower = sqrtPriceToTick(sqrtPriceLowerTemp);
  const sqrtPriceUpper = tickToSqrtPrice(tickUpper)
  const sqrtPriceLower = tickToSqrtPrice(tickLower)
  //console.log(`sqrtPriceUpper: ${sqrtPriceUpper}`);
  //console.log(`sqrtPriceLower: ${sqrtPriceLower}`);
  //console.log(`sqrtPriceUpperTemp: ${sqrtPriceUpperTemp}`);
  //console.log(`sqrtPriceLowerTemp: ${sqrtPriceLowerTemp}`);
  console.log(`tickLower: ${tickLower}`);
  console.log(`tickUpper: ${tickUpper}`);
  
  let swap0for1
  const constant = (1/sqrtprice - 1/sqrtPriceUpper)/(sqrtprice - sqrtPriceLower);
  let swapAmount
  const swap0 = (amount0 - amount1*constant)/(1+constant*poolPrice*(1-FeeAmount.LOW/100000));
  
  if(swap0 > 0) {
    swap0for1=true
    //swapAmount = swap0*Math.pow(10, -decimal0)
    swapAmount = swap0*Math.pow(10, -decimal0);
    console.log(`going to swap in WETH amount: ${swapAmount}`);
  } else {
    swap0for1=false
    //const swap1= -(amount0 - amount1*constant)/(constant + (1-FeeAmount.LOW/100000)/poolPrice);
    const swap1= -(amount0 - amount1*constant)/(constant + (1-FeeAmount.LOW/100000)/poolPrice);
    swapAmount = swap1*Math.pow(10, -decimal1);
    console.log(`going to swap in TETHER amount: ${swapAmount}`);
  }
 return{swap0for1, swapAmount}
}

// execute token swap according to the result of constructRebalancingAsymmetry
async function rebalancing(token0: Token, token1: Token, swapAmount: number,provider: BaseProvider,wallet: ethers.Wallet): Promise<TransactionState>{
  try {
    const uncheckedTrade = await createTrade(swapAmount, token0, token1, FeeAmount.LOW, provider)
    const swapOutput = await executeTrade(uncheckedTrade, token0, provider, wallet)
    if(swapOutput == TransactionState.Failed) {
      console.log('swap failed when rebalancing tokens, please chack out the reason')
    }
    // need to handle tx fail
    return swapOutput;
  } catch (e) {
    console.error(e)
    return TransactionState.Failed
  }
}
