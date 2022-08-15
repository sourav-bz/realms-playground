import {
  PublicKey,
  Keypair,
  TransactionInstruction,
  Connection,
  SystemProgram,
} from '@solana/web3.js'

import {
  getGovernanceProgramVersion,
  GovernanceConfig,
  SetRealmAuthorityAction,
  VoteThresholdPercentage,
  VoteTipping,
  WalletSigner,
  withCreateGovernance,
  withCreateMintGovernance,
  withCreateNativeTreasury,
  withCreateRealm,
  withDepositGoverningTokens,
  withSetRealmAuthority,
  MintMaxVoteWeightSource
} from '@solana/spl-governance'

import BN from 'bn.js'
import { BigNumber } from 'bignumber.js'

import { MintLayout, Token, ASSOCIATED_TOKEN_PROGRAM_ID, u64  } from '@solana/spl-token'

interface RealmCreation {
  connection: Connection
  walletPk: PublicKey
  programIdAddress: string

  realmName: string
  tokensToGovernThreshold: number | undefined
  maxVotingTimeInDays?: number

  nftCollectionCount?: number
  existingCommunityMintPk: PublicKey | undefined
  communityMintSupplyFactor: number | undefined
  communityYesVotePercentage: number
  transferCommunityMintAuthority: boolean

  createCouncil: boolean
  existingCouncilMintPk: PublicKey | undefined
  transferCouncilMintAuthority: boolean
  councilWalletPks: PublicKey[]

  additionalRealmPlugins?: PublicKey[]
}

function getWalletPublicKey(wallet: WalletSigner) {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected!')
  }

  return wallet.publicKey
}

const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
)

const withCreateMint = async (
  connection: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[],
  ownerPk: PublicKey,
  freezeAuthorityPk: PublicKey | null,
  decimals: number,
  payerPk: PublicKey
) => {
  const mintRentExempt = await connection.getMinimumBalanceForRentExemption(
    MintLayout.span
  )

  const mintAccount = new Keypair()

  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payerPk,
      newAccountPubkey: mintAccount.publicKey,
      lamports: mintRentExempt,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  )
  signers.push(mintAccount)

  instructions.push(
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      mintAccount.publicKey,
      decimals,
      ownerPk,
      freezeAuthorityPk
    )
  )
  return mintAccount.publicKey
}

const parseMintMaxVoteWeight = (mintMaxVoteWeight) => {
  let value = MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION.value
  if (mintMaxVoteWeight) {
    const fraction = new BigNumber(mintMaxVoteWeight)
      .shiftedBy(MintMaxVoteWeightSource.SUPPLY_FRACTION_DECIMALS)
      .toString()
    value = new BN(fraction)
  }

  return new MintMaxVoteWeightSource({
    value,
  })
}

function getMintNaturalAmountFromDecimalAsBN(
  decimalAmount: number,
  decimals: number
) {
  return new BN(new BigNumber(decimalAmount).shiftedBy(decimals).toString())
}

const MAX_TOKENS_TO_DISABLE = new BN('18446744073709551615')

const withCreateAssociatedTokenAccount = async (
  instructions: TransactionInstruction[],
  mintPk: PublicKey,
  ownerPk: PublicKey,
  payerPk: PublicKey
) => {
  const ataPk = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mintPk,
    ownerPk, // owner
    true
  )

  instructions.push(
    Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mintPk,
      ataPk,
      ownerPk,
      payerPk
    )
  )

  return ataPk
}

const withMintTo = async (
  instructions: TransactionInstruction[],
  mintPk: PublicKey,
  destinationPk: PublicKey,
  mintAuthorityPk: PublicKey,
  amount: number | u64
) => {
  instructions.push(
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      mintPk,
      destinationPk,
      mintAuthorityPk,
      [],
      amount
    )
  )
}

const SECONDS_PER_DAY = 86400

function getTimestampFromDays(days: number) {
  return days * SECONDS_PER_DAY
}


export async function prepareRealmCreation({
  connection,
  walletPk,
  programIdAddress,

  realmName,
  tokensToGovernThreshold,
  maxVotingTimeInDays = 3,

  nftCollectionCount = 0,
  existingCommunityMintPk,
  communityYesVotePercentage,
  communityMintSupplyFactor: rawCMSF,
  transferCommunityMintAuthority,

  createCouncil,
  existingCouncilMintPk,
  transferCouncilMintAuthority,
  councilWalletPks,

  additionalRealmPlugins = [],
}: RealmCreation) {
  const realmInstructions: TransactionInstruction[] = []
  const programIdPk = new PublicKey(programIdAddress)
  // const programVersion = await getGovernanceProgramVersion(
  //   connection,
  //   programIdPk
  // )
  const programVersion = 2;


  const mintsSetupInstructions: TransactionInstruction[] = []
  const mintsSetupSigners: Keypair[] = []
  const communityMintDecimals = 6
  const realmSigners: Keypair[] = []

  let communityMintPk = await withCreateMint(
    connection,
    mintsSetupInstructions,
    mintsSetupSigners,
    walletPk,
    null,
    communityMintDecimals,
    walletPk
  )

  let councilMintPk = await withCreateMint(
    connection,
    mintsSetupInstructions,
    mintsSetupSigners,
    walletPk,
    null,
    0,
    walletPk
  )

  let walletAtaPk: PublicKey | undefined
  const tokenAmount = 1

  console.log('Prepare realm - council members', councilWalletPks)

  const councilMembersInstructions: TransactionInstruction[] = []
  for (const teamWalletPk of councilWalletPks) {
    const ataPk = await withCreateAssociatedTokenAccount(
      councilMembersInstructions,
      councilMintPk,
      teamWalletPk,
      walletPk
    )

    // Mint 1 council token to each team member
    await withMintTo(
      councilMembersInstructions,
      councilMintPk,
      ataPk,
      walletPk,
      tokenAmount
    )

    if (teamWalletPk.equals(walletPk)) {
      walletAtaPk = ataPk
    }
  }

  const communityMintSupplyFactor = parseMintMaxVoteWeight(rawCMSF)

  const minCommunityTokensToCreateAsMintValue =
    typeof tokensToGovernThreshold !== 'undefined'
      ? getMintNaturalAmountFromDecimalAsBN(
          tokensToGovernThreshold,
          communityMintDecimals
        )
      : MAX_TOKENS_TO_DISABLE

  const realmPk = await withCreateRealm(
    realmInstructions,
    programIdPk,
    programVersion,
    realmName,
    walletPk,
    communityMintPk,
    walletPk,
    councilMintPk,
    communityMintSupplyFactor,
    minCommunityTokensToCreateAsMintValue,
    ...additionalRealmPlugins
  )

  console.log('realmPk', realmPk)

  const initialCouncilTokenAmount = 1

  if (walletAtaPk) {
    await withDepositGoverningTokens(
      realmInstructions,
      programIdPk,
      programVersion,
      realmPk,
      walletAtaPk,
      councilMintPk,
      walletPk,
      walletPk,
      walletPk,
      new BN(initialCouncilTokenAmount)
    )
  }

   // Put community and council mints under the realm governance with default config
   const config = new GovernanceConfig({
    voteThresholdPercentage: new VoteThresholdPercentage({
      value: communityYesVotePercentage,
    }),
    minCommunityTokensToCreateProposal: minCommunityTokensToCreateAsMintValue,
    // Do not use instruction hold up time
    minInstructionHoldUpTime: 0,
    // max voting time 3 days
    maxVotingTime: getTimestampFromDays(maxVotingTimeInDays),
    voteTipping: VoteTipping.Strict,
    proposalCoolOffTime: 0,
    minCouncilTokensToCreateProposal: new BN(initialCouncilTokenAmount),
  })

  const communityMintGovPk =  await withCreateMintGovernance(
        realmInstructions,
        programIdPk,
        programVersion,
        realmPk,
        communityMintPk,
        config,
        transferCommunityMintAuthority,
        walletPk,
        PublicKey.default,
        walletPk,
        walletPk
      )


      await withCreateNativeTreasury(
        realmInstructions,
        programIdPk,
        communityMintGovPk,
        walletPk
      )

      const councilMintHasMintAuthority = true

      if (councilMintPk && councilMintHasMintAuthority) {
        await withCreateMintGovernance(
          realmInstructions,
          programIdPk,
          programVersion,
          realmPk,
          councilMintPk,
          config,
          transferCouncilMintAuthority,
          walletPk,
          PublicKey.default,
          walletPk,
          walletPk
        )
      }
    
      // Set the community governance as the realm authority
      if (transferCommunityMintAuthority) {
        withSetRealmAuthority(
          realmInstructions,
          programIdPk,
          programVersion,
          realmPk,
          walletPk,
          communityMintGovPk,
          SetRealmAuthorityAction.SetChecked
        )
      }

  return {
    communityMintGovPk,
    communityMintPk,
    councilMintPk,
    realmPk,
    realmInstructions,
    realmSigners,
    mintsSetupInstructions,
    mintsSetupSigners,
    councilMembersInstructions,
    walletPk,
    programIdPk,
    programVersion,
    minCommunityTokensToCreateAsMintValue,
  }
}
