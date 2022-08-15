import { BN } from '@project-serum/anchor'
import { ParsedAccountData, PublicKey } from '@solana/web3.js'
import {
  
  AccountInfo,
  AccountLayout,
  MintInfo,
  MintLayout,
  Token,
  u64,
} from '@solana/spl-token'
import { Connection } from '@solana/web3.js'
import { ProgramAccount ,
  getNativeTreasuryAddress,
  Governance,
  GovernanceAccountType,
  Realm,
  TOKEN_PROGRAM_ID,
  
} from '@solana/spl-governance'
import axios from 'axios'


export const DEFAULT_NFT_TREASURY_MINT =
  'GNFTm5rz1Kzvq94G7DJkcrEUnCypeQYf7Ya8arPoHWvw'
export const DEFAULT_NATIVE_SOL_MINT =
'GSoLvSToqaUmMyqP12GffzcirPAickrpZmVUFtek6x5u'
export const WSOL_MINT = 'So11111111111111111111111111111111111111112'

type EndpointTypes = 'mainnet' | 'devnet' | 'localnet'
type TokenProgramAccount<T> = {
  publicKey: PublicKey
  account: T
}

interface SolAccInfo {
  governancePk: PublicKey
  acc: any
  nativeSolAddress: PublicKey
}

export interface ConnectionContext {
  cluster: EndpointTypes
  current: Connection
  endpoint: string
}
enum AccountType {
  TOKEN,
  SOL,
  MINT,
  PROGRAM,
  NFT,
  GENERIC,
  AuxiliaryToken,
}

type AccountInfoGen<T> = {
  executable: boolean
  owner: PublicKey
  lamports: number
  data: T
  rentEpoch?: number
}


interface AccountExtension {
  mint?: TokenProgramAccount<MintInfo> | undefined
  transferAddress?: PublicKey
  amount?: u64
  solAccount?: AccountInfoGen<Buffer | ParsedAccountData>
  token?: TokenProgramAccount<AccountInfo>
}

export interface AssetAccount {
  governance: ProgramAccount<Governance>
  pubkey: PublicKey
  type: AccountType
  extensions: AccountExtension
  isSol?: boolean
  isNft?: boolean
  isToken?: boolean
}


class AccountTypeNFT implements AssetAccount {
  governance: ProgramAccount<Governance>
  type: AccountType
  extensions: AccountExtension
  pubkey: PublicKey
  isNft: boolean
  constructor(
    tokenAccount: TokenProgramAccount<AccountInfo>,
    mint: TokenProgramAccount<MintInfo>,
    governance: ProgramAccount<Governance>
  ) {
    this.governance = governance
    this.pubkey = tokenAccount.publicKey
    this.type = AccountType.NFT
    this.extensions = {
      token: tokenAccount,
      mint: mint,
      transferAddress: tokenAccount.account.owner,
      amount: tokenAccount.account.amount,
    }
    this.isNft = true
  }
}

const getSolAccountsInfo = async (
  connection: ConnectionContext,
  pubkeys: { governancePk: PublicKey; nativeSolAddress: PublicKey }[]
) => {
  const solAccountsInfo = await axios.request({
    url: connection.endpoint,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: JSON.stringify([
      ...pubkeys.map((x) => {
        return {
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [
            x.nativeSolAddress.toBase58(),
            {
              commitment: connection.current.commitment,
              encoding: 'jsonParsed',
            },
          ],
        }
      }),
    ]),
  })
  const solAccountsJson = solAccountsInfo.data
  const solAccountsParsed = solAccountsJson?.length
    ? solAccountsJson
        .flatMap((x, index) => {
          return {
            acc: x.result.value,
            ...pubkeys[index],
          }
        })
        .filter((x) => x.acc)
    : []
  return solAccountsParsed as SolAccInfo[]
}

function parseMintAccountData(data: Buffer) {
  const mintInfo = MintLayout.decode(data)
  if (mintInfo.mintAuthorityOption === 0) {
    mintInfo.mintAuthority = null
  } else {
    mintInfo.mintAuthority = new PublicKey(mintInfo.mintAuthority)
  }

  mintInfo.supply = u64.fromBuffer(mintInfo.supply)
  mintInfo.isInitialized = mintInfo.isInitialized != 0

  if (mintInfo.freezeAuthorityOption === 0) {
    mintInfo.freezeAuthority = null
  } else {
    mintInfo.freezeAuthority = new PublicKey(mintInfo.freezeAuthority)
  }
  return mintInfo
}


const getMintAccountsInfo = async (
  connection: ConnectionContext,
  pubkeys: PublicKey[]
) => {
  const mintAccountsInfo = await axios.request({
    url: connection.endpoint,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: JSON.stringify([
      ...pubkeys.map((x) => {
        return {
          jsonrpc: '2.0',
          id: x.toBase58(),
          method: 'getAccountInfo',
          params: [
            x.toBase58(),
            {
              commitment: connection.current.commitment,
              encoding: 'base64',
            },
          ],
        }
      }),
    ]),
  })
  const mintAccountsJson = mintAccountsInfo.data
  const mintAccountsParsed = mintAccountsJson?.map((x) => {
    const result = x.result
    const publicKey = new PublicKey(x.id)
    const data = Buffer.from(result.value.data[0], 'base64')
    const account = parseMintAccountData(data)
    return { publicKey, account }
  })
  return mintAccountsParsed
}

class AccountTypeToken implements AssetAccount {
  governance: ProgramAccount<Governance>
  type: AccountType
  extensions: AccountExtension
  pubkey: PublicKey
  isToken: boolean
  constructor(
    tokenAccount: TokenProgramAccount<AccountInfo>,
    mint: TokenProgramAccount<MintInfo>,
    governance: ProgramAccount<Governance>
  ) {
    this.governance = governance
    this.pubkey = tokenAccount.publicKey
    this.type = AccountType.TOKEN
    this.extensions = {
      token: tokenAccount,
      mint: mint,
      transferAddress: tokenAccount!.publicKey!,
      amount: tokenAccount!.account.amount,
    }
    this.isToken = true
  }
}

const getTokenAccountObj = async (
  governance: ProgramAccount<Governance>,
  tokenAccount: TokenProgramAccount<AccountInfo>,
  mintAccounts: TokenProgramAccount<MintInfo>[]
) => {
  const isNftAccount =
    tokenAccount.account.mint.toBase58() === DEFAULT_NFT_TREASURY_MINT
  const mint = mintAccounts.find(
    (x) => x.publicKey.toBase58() === tokenAccount.account.mint.toBase58()
  )
  if (isNftAccount) {
    return new AccountTypeNFT(tokenAccount, mint!, governance)
  }

  if (
    mint?.account.supply &&
    mint?.account.supply.cmpn(1) !== 0 &&
    mint.publicKey.toBase58() !== DEFAULT_NATIVE_SOL_MINT
  ) {
    return new AccountTypeToken(tokenAccount, mint!, governance)
  }
}

class AccountTypeSol implements AssetAccount {
  governance: ProgramAccount<Governance>
  type: AccountType
  extensions: AccountExtension
  pubkey: PublicKey
  isSol: boolean
  constructor(
    mint: TokenProgramAccount<MintInfo>,
    solAddress: PublicKey,
    solAccount: AccountInfoGen<Buffer | ParsedAccountData>,
    governance: ProgramAccount<Governance>
  ) {
    this.governance = governance
    this.type = AccountType.SOL
    this.pubkey = solAddress
    this.extensions = {
      token: undefined,
      mint: mint,
      transferAddress: solAddress,
      amount: new BN(solAccount.lamports),
      solAccount: solAccount,
    }
    this.isSol = true
  }
}

const getSolAccountsObj = async (
  connection: ConnectionContext,
  accounts: AssetAccount[],
  solAccountsInfo: SolAccInfo[],
  mintAccounts: TokenProgramAccount<MintInfo>[],
  governances: ProgramAccount<Governance>[]
) => {
  const solAccs: AccountTypeSol[] = []
  for (const i of solAccountsInfo) {
    const mint = mintAccounts.find((x) => x.publicKey.toBase58() === WSOL_MINT)
    const governance = governances.find(
      (x) => x.pubkey.toBase58() === i.governancePk.toBase58()
    )
    const account = await getSolAccountObj(
      governance!,
      connection,
      mint!,
      accounts,
      i
    )
    if (account) {
      solAccs.push(account)
    }
  }
  return solAccs as AssetAccount[]
}

const getSolAccountObj = async (
  governance: ProgramAccount<Governance>,
  connection: ConnectionContext,
  mint: TokenProgramAccount<MintInfo>,
  accounts: AssetAccount[],
  solAcc: SolAccInfo
) => {
  if (solAcc.acc) {
    
    
    const minRentAmount = await connection.current.getMinimumBalanceForRentExemption(
      0
    )
    console.log('getAccountsForGovernances - minRentAmount', minRentAmount)
    const solAccount = solAcc.acc as AccountInfoGen<Buffer | ParsedAccountData>
    solAccount.lamports =
      solAccount.lamports !== 0
        ? solAccount.lamports - minRentAmount
        : solAccount.lamports

    console.log('getAccountsForGovernances - solAccount409', solAccount)

    return new AccountTypeSol(
      mint!,
      solAcc.nativeSolAddress,
      solAccount,
      governance
    )
  }
}

export const getTokenAssetAccounts = async (
  tokenAccounts: {
    publicKey: PublicKey
    account: AccountInfo
  }[],
  governances: ProgramAccount<Governance>[],
  realm: ProgramAccount<Realm>,
  connection: ConnectionContext
) => {
  const accounts: AssetAccount[] = []
  const mintsPks = [...tokenAccounts.map((x) => x.account.mint)]
  //WSOL is used as mint for sol accounts to calculate amounts
  if (!mintsPks.find((x) => x.toBase58() === WSOL_MINT)) {
    mintsPks.push(new PublicKey(WSOL_MINT))
  }
  const mintAccounts = mintsPks.length
    ? await getMintAccountsInfo(connection, [...mintsPks])
    : []
  const nativeSolAddresses = await Promise.all(
    governances.map((x) => getNativeTreasuryAddress(realm.owner, x!.pubkey))
  )
  
  const govNativeSolAddress = nativeSolAddresses.map((x, index) => {
    return {
      governancePk: governances[index].pubkey,
      nativeSolAddress: x,
    }
  })
  const solAccs = await getSolAccountsInfo(connection, govNativeSolAddress)
  

  const solAccounts = await getSolAccountsObj(
    connection,
    accounts,
    solAccs,
    mintAccounts,
    governances
  )
  if (solAccounts.length) {
    accounts.push(...solAccounts)
  }
  return accounts
}



