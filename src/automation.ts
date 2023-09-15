import{getERC20Balance} from '../libs/balance'
import{getPoolInfo} from '../libs/pool'
import{swapWETH,withdrawWETH} from '../libs/trading'
import { CurrentConfig } from '../tokens.config'
import {TransactionState,} from '../libs/providers'
import {FeeAmount,} from '@uniswap/v3-sdk'
import {mintPosition,getPositionInfo,removeLiquidity} from '../libs/positions'
import { rebalanceTokens} from './tokenRebalancing'
import {AutomationState, ETHMarginForGasFee,FeeLevel} from './automationConstants'
import { BaseProvider } from '@ethersproject/providers'
import { ethers} from 'ethers'
import{readAutomationStats,writeAutomationStats,AutomationInfo} from './RWAutomationState'
import { Token } from '@uniswap/sdk-core'
export interface FormattedPoolInfo {
  token0: Token
  token1: Token
  poolFee: FeeAmount
}

export async function AutoRedeemCV(provider: BaseProvider,wallet: ethers.Wallet){
  let currentAutomationInfo = await readAutomationStats(wallet.address.substring(0,5))
  let positionID = currentAutomationInfo.CONSERVATIVE_POSITION_ID
  let token0
  let token1
  let poolFee
  CurrentConfig.tokensETHTether.token0
  switch(currentAutomationInfo.TOKEN_PAIR_CV){
    case 'ETHTether':{
      token0 = CurrentConfig.tokensETHTether.token0
      token1 = CurrentConfig.tokensETHTether.token1
      break
    }
    case 'USDCETH':{
      token0 = CurrentConfig.tokensUSDCETH.token0
      token1 = CurrentConfig.tokensUSDCETH.token1
      break
    }
    case 'DaiETH':{
      token0 = CurrentConfig.tokensDaiETH.token0
      token1 = CurrentConfig.tokensDaiETH.token1
      break
    }
    case 'USDCTether':{
      token0 = CurrentConfig.tokensUSDCTether.token0
      token1 = CurrentConfig.tokensUSDCTether.token1
      break
    }
    default: {
      token0 = CurrentConfig.tokensETHTether.token0
      token1 = CurrentConfig.tokensETHTether.token1
      break
    }
  }
  
  switch(currentAutomationInfo.FEE_LEVEL_CV){
    case 'HIGH':{
      poolFee = FeeAmount.HIGH
      break
    }
    case 'LOW':{
      poolFee = FeeAmount.LOW
      break
    }
    case 'MEDIUM':{
      poolFee = FeeAmount.MEDIUM
      break
    }
    default: {
      poolFee = FeeAmount.LOW
      break
    }
  }
  const poolInfo = await getPoolInfo(token0,token1, poolFee,provider)
  const currentTick = poolInfo.tick

  let automationState

  let posi_info = await getPositionInfo(positionID,provider)
  const tickLower = posi_info.tickLower
  const tickUpper = posi_info.tickUpper
  //console.log(`position tickLower: ${tickLower}`)
  //console.log(`position tickUpper: ${tickUpper}`)
  console.log(`position LQ: ${parseInt(posi_info.liquidity.toString())}`)
  //No position Needs to be removed
  if(positionID==1||posi_info.liquidity.eq(0)){
    return 
  }
  //Pause program when previous TX failed
  if(currentAutomationInfo.CURRENT_AUTOMATION_STATE_CV==AutomationState.Automation_Paused_PendingTX
    ||currentAutomationInfo.CURRENT_AUTOMATION_STATE_CV==AutomationState.Automation_Paused_RevertedTX){
    return
  }
  
  if(currentTick > tickUpper) {
    console.log("current price hit Upper range, redeem as Tether")
    let redeemRes = await removeLiquidity(token0,token1, poolFee,provider,wallet, positionID)
    if(redeemRes==TransactionState.Failed) {
      await HandleTXFail(redeemRes,currentAutomationInfo,wallet);
      console.log('Redeem fail in func AutoRedeemCV!!!!!!!!!!!!!!!!!! Take Action now')
      return 
    }
    posi_info = await getPositionInfo(positionID,provider)
    console.log(`position LQ after redeem: ${parseInt(posi_info.liquidity.toString())}`)
    automationState = AutomationState.Price_Hit_TickUpper
    currentAutomationInfo.CONSERVATIVE_POSITION_ID = 1
    currentAutomationInfo.CURRENT_LQ_AMOUNT_CV = posi_info.liquidity._hex
  } else if(currentTick < tickLower) {
    console.log("current price hit lower range, redeem as ETH")
    
    let redeemRes = await removeLiquidity(token0,token1, poolFee,provider,wallet, positionID)
    if(redeemRes==TransactionState.Failed) {
      await HandleTXFail(redeemRes,currentAutomationInfo,wallet);
      console.log('Redeem fail in func AutoRedeemCV!!!!!!!!!!!!!!!!!! Take Action now')
      return 
    }
    posi_info = await getPositionInfo(positionID,provider)
    console.log(`position LQ after redeem: ${parseInt(posi_info.liquidity.toString())}`)
    automationState = AutomationState.Price_Hit_TickLower
    currentAutomationInfo.CONSERVATIVE_POSITION_ID = 1
    currentAutomationInfo.CURRENT_LQ_AMOUNT_CV = posi_info.liquidity._hex
  } else{
    console.log("current price stay in range of this position, no need for redeem!!!!!!!!")
    automationState = AutomationState.Price_In_Range
  }

  //const token0Amount_LQ = await getERC20Balance(provider,wallet.address,token0.address)
  //const token1Amount_LQ = await getERC20Balance(provider, wallet.address,token1.address)
  //console.log(`after redeem: ${token0Amount_LQ}`);
  //console.log(`after redeem: ${token1Amount_LQ}`);
  currentAutomationInfo.CURRENT_AUTOMATION_STATE_CV=automationState
  await writeAutomationStats(currentAutomationInfo,wallet.address.substring(0,5))
}

export async function AutoDepositCV(leftRange:number, rightRange:number,provider: BaseProvider,wallet: ethers.Wallet){
    let currentAutomationInfo = await readAutomationStats(wallet.address.substring(0,5))

    let token0
    let token1
    let poolFee
    CurrentConfig.tokensETHTether.token0
    switch(currentAutomationInfo.TOKEN_PAIR_CV){
      case 'ETHTether':{
        token0 = CurrentConfig.tokensETHTether.token0
        token1 = CurrentConfig.tokensETHTether.token1
        break
      }
      case 'USDCETH':{
        token0 = CurrentConfig.tokensUSDCETH.token0
        token1 = CurrentConfig.tokensUSDCETH.token1
        break
      }
      case 'DaiETH':{
        token0 = CurrentConfig.tokensDaiETH.token0
        token1 = CurrentConfig.tokensDaiETH.token1
        break
      }
      case 'USDCTether':{
        token0 = CurrentConfig.tokensUSDCTether.token0
        token1 = CurrentConfig.tokensUSDCTether.token1
        break
      }
      default: {
        token0 = CurrentConfig.tokensETHTether.token0
        token1 = CurrentConfig.tokensETHTether.token1
        break
      }
    }
    
    switch(currentAutomationInfo.FEE_LEVEL_CV){
      case 'HIGH':{
        poolFee = FeeAmount.HIGH
        break
      }
      case 'LOW':{
        poolFee = FeeAmount.LOW
        break
      }
      case 'MEDIUM':{
        poolFee = FeeAmount.MEDIUM
        break
      }
      default: {
        poolFee = FeeAmount.LOW
        break
      }
    }


    if(currentAutomationInfo.CURRENT_AUTOMATION_STATE_CV != AutomationState.Executing_DepositLQ ){
      return 
    }
    const ETHBalance = Number(await provider.getBalance(wallet.address))
    // withdraw WETH to ETH for gas fee, when ETH balance is below the ETHMarginForGasFee
    // withdraw amount is ETHMarginForGasFee 
    // so the ETH balance will bigger than ETHMarginForGasFee to avoid frequent withdraw
    if(ETHBalance < ETHMarginForGasFee ){
      const withdrawAmount = ETHMarginForGasFee - ETHBalance
      const withdrawRes = await withdrawWETH(withdrawAmount, provider, wallet)
      // need to handle tx fail
      if(!await HandleTXFail(withdrawRes,currentAutomationInfo,wallet)){
        console.log('Deposit fail in func AutoRedeemCV !!!!!!!!!!!!!!!!!! Take Action now')
        return
      }
    }

    const rebalanceTokenResult = await rebalanceTokens(provider, wallet, token0, token1,leftRange, rightRange)
    
    if(!await HandleTXFail(rebalanceTokenResult,currentAutomationInfo,wallet)){
      console.log('Token rebalancing fail in func AutoRedeemCV!!!!!!!!!!!!!!!!!! Take Action now')
      return
    }
    const positinID = await mintPosition(token0,token1, poolFee, leftRange, rightRange, provider,wallet);
 
    console.log(`minted positio ID: ${positinID}`);
    console.log()
    //Mint TX succeed when position ID is not 1 or -1
    if(positinID==-1||positinID==1){
      await HandleTXFail(TransactionState.Failed,currentAutomationInfo,wallet)
      return
    }

    const positionInfo = await getPositionInfo(positinID,provider)
    currentAutomationInfo.CURRENT_LQ_RANGE_LOWER_CV = positionInfo.tickLower
    currentAutomationInfo.CURRENT_LQ_RANGE_UPPER_CV = positionInfo.tickUpper
    currentAutomationInfo.CURRENT_LQ_AMOUNT_CV = positionInfo.liquidity._hex
    currentAutomationInfo.CONSERVATIVE_POSITION_ID = positinID
    currentAutomationInfo.CURRENT_AUTOMATION_STATE_CV = AutomationState.Price_In_Range
    currentAutomationInfo.WALLET_ADDRESS = wallet.address
    const token0Amount_LQ = await getERC20Balance(provider,wallet.address,token0.address)
    const token1Amount_LQ = await getERC20Balance(provider, wallet.address,token1.address)

    //console.log(`after adding liquidity: ${token0Amount_LQ}`);
    //console.log(`after adding liquidity: ${token1Amount_LQ}`);
    await writeAutomationStats(currentAutomationInfo,wallet.address.substring(0,5))
}

//Change the AutoMation stats when TX failed
async function HandleTXFail(TX: TransactionState,automationInfo:AutomationInfo,wallet:ethers.Wallet): Promise<boolean>{
  if(TX!=TransactionState.Sent){
    automationInfo.CURRENT_AUTOMATION_STATE_CV = AutomationState.Automation_Paused_RevertedTX
    await writeAutomationStats(automationInfo,wallet.address.substring(0,5))
    return false
  }
  return true
}

//Move LQ from current pool to new pool
async function LQRelocate(provider: BaseProvider,wallet: ethers.Wallet,newPoolTokenPair: string,newPoolFeeLevel: string){
  let currentAutomationInfo = await readAutomationStats(wallet.address.substring(0,5))
  let token0Current,token1Current,poolFeeCurrent = getTokenPairAndFeeLevel(currentAutomationInfo.TOKEN_PAIR_CV,currentAutomationInfo.FEE_LEVEL_CV)
  let token0Target,token1Target,poolFeeTarget = getTokenPairAndFeeLevel(newPoolTokenPair,newPoolFeeLevel)

}
async function getTokenPairAndFeeLevel(TokenPair: string,feeLevel: string):Promise<FormattedPoolInfo>{
  let token0
  let token1
  let poolFee
  switch(TokenPair){
    case 'ETHTether':{
      token0 = CurrentConfig.tokensETHTether.token0
      token1 = CurrentConfig.tokensETHTether.token1
      break
    }
    case 'USDCETH':{
      token0 = CurrentConfig.tokensUSDCETH.token0
      token1 = CurrentConfig.tokensUSDCETH.token1
      break
    }
    case 'DaiETH':{
      token0 = CurrentConfig.tokensDaiETH.token0
      token1 = CurrentConfig.tokensDaiETH.token1
      break
    }
    case 'USDCTether':{
      token0 = CurrentConfig.tokensUSDCTether.token0
      token1 = CurrentConfig.tokensUSDCTether.token1
      break
    }
    default: {
      token0 = CurrentConfig.tokensETHTether.token0
      token1 = CurrentConfig.tokensETHTether.token1
      break
    }
  }
  
  switch(feeLevel){
    case 'HIGH':{
      poolFee = FeeAmount.HIGH
      break
    }
    case 'LOW':{
      poolFee = FeeAmount.LOW
      break
    }
    case 'MEDIUM':{
      poolFee = FeeAmount.MEDIUM
      break
    }
    default: {
      poolFee = FeeAmount.LOW
      break
    }
  }
  return {token0, token1,poolFee}
}

/*
export async function AutoDepositAG(positionRange:number, provider: BaseProvider, wallet: ethers.Wallet){
    let currentAutomationInfo = await readEnv()
    const token0 = CurrentConfig.tokensETHTether.token0
    const token1 = CurrentConfig.tokensETHTether.token1
    const poolFee = FeeAmount.LOW
    
    const rebalanceTokenResult = await rebalanceTokens(provider, wallet, token0, token1, poolFee, currentAutomationInfo.CURRENT_LQ_RANGE_LOWER_AG)
    const positinID = await mintPosition(token0,token1, poolFee, positionRange,provider,wallet);
        // need to handle tx fail
    console.log(`minted positio ID: ${positinID}`);
    console.log()
    if(positinID==-1||positinID==1){
      currentAutomationInfo.CURRENT_AUTOMATION_STATE_AG = AutomationState.Automation_Paused_RevertedTX
      return
    }

    const positionInfo = await getPositionInfo(positinID,provider)
    currentAutomationInfo.CURRENT_LQ_RANGE_LOWER_AG = positionInfo.tickLower
    currentAutomationInfo.CURRENT_LQ_RANGE_UPPER_AG = positionInfo.tickUpper
    currentAutomationInfo.CURRENT_LQ_AMOUNT_AG = positionInfo.liquidity.toNumber()
    currentAutomationInfo.AGGRESSIVE_POSITION_ID = positinID
    currentAutomationInfo.CURRENT_AUTOMATION_STATE_AG = AutomationState.Price_In_Range
    const token0Amount_LQ = await getERC20Balance(provider,wallet.address,token0.address)
    const token1Amount_LQ = await getERC20Balance(provider, wallet.address,token1.address)
    await writeEnv(currentAutomationInfo)
    //console.log(`after adding liquidity: ${token0Amount_LQ}`);
    //console.log(`after adding liquidity: ${token1Amount_LQ}`);
}
*/
/*
export async function AutoDepositInitial(provider: BaseProvider, walletCV: ethers.Wallet, walletAG: ethers.Wallet){
    const token0 = CurrentConfig.tokensETHTether.token0
    const token1 = CurrentConfig.tokensETHTether.token1
    const poolFee = FeeAmount.LOW
    const receipt = await swapWETH(100, provider,wallet)
            // need to handle tx fail
    const rebalanceTokenResult = await rebalanceTokens(provider, wallet, token0, token1, poolFee, positionRange)
    const positinID = await mintPosition(token0,token1, poolFee, positionRange, provider, wallet);
        // need to handle tx fail
    console.log(`minted positio ID: ${positinID}`);
    console.log()
    const token0Amount_LQ = await getERC20Balance(provider,wallet.address,token0.address)
    const token1Amount_LQ = await getERC20Balance(provider, wallet.address,token1.address)
    //console.log(`after adding liquidity: ${token0Amount_LQ}`);
    //console.log(`after adding liquidity: ${token1Amount_LQ}`);
}
*/