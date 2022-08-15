import { FC, useEffect, useState } from "react";
import {
    Keypair,
    PublicKey,
    Connection,
    Transaction,
    TransactionInstruction,
    TransactionSignature,
    SimulatedTransactionResponse,
    Signer
  } from '@solana/web3.js'
import {
    getGovernanceProgramVersion,
    getInstructionDataFromBase64,
    Governance,
    ProgramAccount,
    InstructionData,
    getGovernance,
    getGovernanceAccounts,
    pubkeyFilter,
    tryGetRealmConfig,
    TokenOwnerRecord,
    GovernanceConfig,
    Realm,
    getRealm,
    getAllTokenOwnerRecords,
    withAddSignatory,
    getSignatoryRecordAddress,
    withInsertTransaction,
    withSignOffProposal,
    WalletSigner,
    VoteType,
    withCreateProposal,
    createInstructionData,
    serializeInstructionToBase64
} from '@solana/spl-governance'
import { useWallet } from '@solana/wallet-adapter-react';
import { SignerWalletAdapter, WalletAdapter } from '@solana/wallet-adapter-base'

import BN from 'bn.js'
import { sendTransaction } from "../utils/send";
import { sendTransactionsV2, SequenceType, transactionInstructionsToTypedInstructionsSets } from "../utils/sendTransactions";
import { SystemProgram } from "@solana/web3.js";
import { AssetAccount, ConnectionContext, getTokenAssetAccounts } from "../stores/useGovernanceAssetsStore";


const SECONDS_PER_DAY = 86400

function getTimestampFromDays(days: number) {
    return days * SECONDS_PER_DAY
}

interface UiInstruction {
    serializedInstruction: string
    additionalSerializedInstructions?: string[]
    isValid: boolean
    governance: ProgramAccount<Governance> | undefined
    customHoldUpTime?: number
    prerequisiteInstructions?: TransactionInstruction[]
    chunkSplitByDefault?: boolean
    prerequisiteInstructionsSigners?: Keypair[]
    chunkBy?: number
    signers?: Keypair[]
    shouldSplitIntoSeparateTxs?: boolean | undefined
}

interface ComponentInstructionData {
    governedAccount?: ProgramAccount<Governance> | undefined
    getInstruction?:  () => Promise<UiInstruction>
    type: any
}

interface InstructionDataWithHoldUpTime {
    data: InstructionData | null
    holdUpTime: number | undefined
    prerequisiteInstructions: TransactionInstruction[]
    chunkSplitByDefault?: boolean
    chunkBy?: number
    signers?: Keypair[]
    shouldSplitIntoSeparateTxs?: boolean | undefined
    prerequisiteInstructionsSigners?: Keypair[]
}

class InstructionDataWithHoldUpTime {
    constructor({
      instruction,
      governance,
    }: {
      instruction: UiInstruction
      governance?: ProgramAccount<Governance>
    }) {
      this.data = instruction.serializedInstruction
        ? getInstructionDataFromBase64(instruction.serializedInstruction)
        : null
      this.holdUpTime =
        typeof instruction.customHoldUpTime !== 'undefined'
          ? instruction.customHoldUpTime
          : governance?.account?.config.minInstructionHoldUpTime
      this.prerequisiteInstructions = instruction.prerequisiteInstructions || []
      this.chunkSplitByDefault = instruction.chunkSplitByDefault || false
      this.chunkBy = instruction.chunkBy || 2
      this.prerequisiteInstructionsSigners =
        instruction.prerequisiteInstructionsSigners || []
    }
}

function extractGovernanceAccountFromInstructionsData(
    instructionsData: ComponentInstructionData[]
  ): ProgramAccount<Governance> | null {
    return (
      instructionsData.find((itx) => itx.governedAccount)?.governedAccount ?? null
    )
}



export async function getSolTransferInstruction({
    governedTokenAccount,
    destinationAccount,
    amount,
    programId,
    currentAccount,
  }: {
    governedTokenAccount: AssetAccount
    destinationAccount:PublicKey
    amount:string
    programId: PublicKey | undefined
    currentAccount: AssetAccount | null
  }): Promise<UiInstruction> {
    const isValid = true
    let serializedInstruction = ''
    const prerequisiteInstructions: TransactionInstruction[] = []
    if (isValid && programId && governedTokenAccount?.extensions.mint?.account) {
      const sourceAccount = governedTokenAccount.extensions.transferAddress
      //We have configured mint that has same decimals settings as SOL
      const mintAmount = parseInt(amount||'0')/(10**9)
  
      const transferIx = SystemProgram.transfer({
        fromPubkey: sourceAccount!,
        toPubkey: destinationAccount,
        lamports: mintAmount,
      })
      serializedInstruction = serializeInstructionToBase64(transferIx)
    }
  
    const obj: UiInstruction = {
      serializedInstruction,
      isValid,
      governance: currentAccount?.governance,
      prerequisiteInstructions: prerequisiteInstructions,
    }
    return obj
  }

  
const CreateProposal: FC = () => {

    const wallet = useWallet();

    const [instructionsData, setInstructions] = useState<
        ComponentInstructionData[]
    >([{ type: undefined }])
    const [
            governance,
            setGovernance,
          ] = useState<ProgramAccount<Governance> | null>(null)
    
    const handleSetInstructions = (val: any, index) => {
        const newInstructions = [...instructionsData]
        newInstructions[index] = { ...instructionsData[index], ...val }
        setInstructions(newInstructions)
      }

    const handleGetInstructions = async () => {
        console.log(' handleGetInstructions function called')
        console.log(' handleGetInstructions function - instructionsData', instructionsData)
        const instructions: UiInstruction[] = []
        for (const inst of instructionsData) {
            if (inst.getInstruction) {
            const instruction: UiInstruction = await inst?.getInstruction()
            instructions.push(instruction)
            }
        }
        return instructions
    }

    useEffect(()=>{
        let instructions: UiInstruction[] = []
        instructions = instructions
        console.log('createproposal - handleGetInstructions', instructions)

        // if(instructions.length>0){
        //     const instructionsData = [
        //         ...instructions.map((x) => {
        //           return {
        //             data: x.serializedInstruction
        //               ? getInstructionDataFromBase64(x.serializedInstruction)
        //               : null,
        //             holdUpTime: x.customHoldUpTime
        //               ? getTimestampFromDays(x.customHoldUpTime)
        //               : selectedGovernance?.account?.config.minInstructionHoldUpTime,
        //             prerequisiteInstructions: x.prerequisiteInstructions || [],
        //             chunkSplitByDefault: x.chunkSplitByDefault || false,
        //             signers: x.signers,
        //             shouldSplitIntoSeparateTxs: x.shouldSplitIntoSeparateTxs,
        //           }
        //         }),
        //       ]
        // }
    },[instructionsData])
      

    const createProposalHandler = async () =>{

        // const instructions: TransactionInstruction[] = []

        const governanceAuthority = wallet.publicKey
        const signatory = wallet.publicKey
        const payer = wallet.publicKey
        const notificationTitle = 'proposal'
        const prerequisiteInstructions: TransactionInstruction[] = []
        const prerequisiteInstructionsSigners: Keypair[] = []

        const connection =  new Connection("https://mango.devnet.rpcpool.com", 'recent');
        const programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
        const realmPk = new PublicKey('HWuCwhwayTaNcRtt72edn2uEMuKCuWMwmDFcJLbah3KC')

        const governances = await getGovernanceAccounts(connection, new PublicKey(programId), Governance, [
            pubkeyFilter(1, realmPk)!,
        ])

        const realm = await getRealm(connection, realmPk);

        const connectionCxt = { cluster: 'devnet',
            current: connection,
            endpoint: "https://mango.devnet.rpcpool.com"}
        
        const accounts = await getTokenAssetAccounts([],governances, realm, connectionCxt);
        console.log("createProposal",accounts,accounts[0]?.extensions.transferAddress?.toString(), parseInt(accounts[0]?.extensions.amount?.toString())/(10**9))


        function getInstruction(): Promise<UiInstruction> {
            return  getSolTransferInstruction({
                governedTokenAccount:accounts[0],
                destinationAccount:new PublicKey('3BHtZAxD7WTWZUQATwQ8J5YPqtaqSFkEzhXW2zntEgyA'),
                amount:'0.3',
                programId:programId,
                currentAccount:accounts[0],
            })
        }

        let tempInstructionData = {
            governedAccount: accounts[0].governance,
            getInstruction,
            type: {
                id: 0,
                name: 'Transfer Tokens',
                isVisible: true,
              }
        }

        const newinstructionsData : TransactionInstruction[] = []
        
        // const newinstructionsData = [
        //     [tempInstructionData].map((x) => {
        //       return {
        //         data: x.serializedInstruction
        //           ? getInstructionDataFromBase64(x.serializedInstruction)
        //           : null,
        //         holdUpTime: x.customHoldUpTime
        //           ? getTimestampFromDays(x.customHoldUpTime)
        //           : accounts[0].governance?.account?.config.minInstructionHoldUpTime,
        //         prerequisiteInstructions: x.prerequisiteInstructions || [],
        //         chunkSplitByDefault: x.chunkSplitByDefault || false,
        //         signers: x.signers,
        //         shouldSplitIntoSeparateTxs: x.shouldSplitIntoSeparateTxs,
        //       }
        //     }),
        // ]

        // // sum up signers
        const signers: Keypair[] = instructionsData.flatMap((x) => x.signers ?? [])
        const shouldSplitIntoSeparateTxs=  false

        // // Explicitly request the version before making RPC calls to work around race conditions in resolving
        // // the version for RealmInfo

        // Changed this because it is misbehaving on my local validator setup.
        const programVersion = 2;

        // V2 Approve/Deny configuration
        const voteType = VoteType.SINGLE_CHOICE
        const options = ['Approve']
        const useDenyOption = true

        const fetchRealmGovernance=async(governancePk: PublicKey)=> {
            const governance = await getGovernance(connection, governancePk)
            return governance
        }

        const realmId = new PublicKey('HWuCwhwayTaNcRtt72edn2uEMuKCuWMwmDFcJLbah3KC');

        const selectedGovernance = (await fetchRealmGovernance(
            realmId
          )) as ProgramAccount<Governance>

        // const config = await getRealmConfig(connection, programId, realmId);

        // const ownVoterWeight = new VoterWeight(ownTokenRecord, ownCouncilTokenRecord);

        // const ownTokenRecord  = ownVoterWeight.getTokenRecordToCreateProposal(
        //     selectedGovernance!.account.config,
        //     false
        //   )

        // const tokenOwnerRecord = ownTokenRecord;

        // // //will run only if plugin is connected with realm
        

        const realmData = await getRealm(connection, realmId);

        console.log('create proposal => realmData', realmData)

        const tokenOwnerRecord = await getAllTokenOwnerRecords(
            connection,
            realmData.owner,
            realmData.pubkey
          );

        console.log('create proposal => tokenOwnerRecord', tokenOwnerRecord)

        // const plugin = await client?.withUpdateVoterWeightRecord(
        //     instructions,
        //     tokenOwnerRecord[0],
        //     'createProposal',
        //     selectedGovernance
        // )

        // let emptyinstructions: TransactionInstruction[] = []

        const proposalAddress = await withCreateProposal(
            newinstructionsData,
            programId,
            programVersion,
            realmData.pubkey,
            selectedGovernance.pubkey,
            tokenOwnerRecord[0].pubkey,
            "give me 0.3 sol -> by code",
            "description text",
            tokenOwnerRecord[0].account.governingTokenMint,
            governanceAuthority,
            0,
            voteType,
            options,
            useDenyOption,
            payer,
            undefined
        )

        console.log('withCreateProposal - instructions', newinstructionsData)

        console.log('proposalAddress', proposalAddress.toString())

        await withAddSignatory(
            newinstructionsData,
            programId,
            programVersion,
            proposalAddress,
            tokenOwnerRecord[0].pubkey,
            governanceAuthority,
            signatory,
            payer
        )

        // // TODO: Return signatoryRecordAddress from the SDK call
        const signatoryRecordAddress = await getSignatoryRecordAddress(
            programId,
            proposalAddress,
            signatory
        )

        const insertInstructions: TransactionInstruction[] = []

        console.log('withInsertTransaction params',
        {insertInstructions},
        {programId},
        {programVersion},
        {governance:accounts[0].governance.pubkey},
        {proposalAddress},
        {tokenOwnerRecord: tokenOwnerRecord.pubkey},
        {governanceAuthority},
        {index:0},
        {optionindex: 0},
        {holdUpTime: newinstructionsData[0].holdUpTime || 0},
        {instructiondata:[newinstructionsData[0].data]},
        {payer})

        // await withInsertTransaction(
        //     insertInstructions,
        //     programId,
        //     programVersion,
        //     accounts[0].governance.pubkey,
        //     proposalAddress,
        //     tokenOwnerRecord.pubkey,
        //     governanceAuthority,
        //     0,
        //     0,
        //     newinstructionsData[0].holdUpTime || 0,
        //     [newinstructionsData[0].data],
        //     payer
        // )

        // withSignOffProposal(
        //     insertInstructions, // SingOff proposal needs to be executed after inserting instructions hence we add it to insertInstructions
        //     programId,
        //     programVersion,
        //     realm.pubkey,
        //     accounts[0].governance.pubkey,
        //     proposalAddress,
        //     signatory,
        //     signatoryRecordAddress,
        //     undefined
        //   )

        console.log('instructions - sendTransactionsV2', [
            prerequisiteInstructions,
            newinstructionsData,
            insertInstructions,
        ].map((x) =>
            transactionInstructionsToTypedInstructionsSets(
            x,
            SequenceType.Sequential
            )
        ))

        await sendTransactionsV2({
        wallet,
        connection,
        signersSet: [[], [], signers],
        showUiComponent: true,
        TransactionInstructions: [
            prerequisiteInstructions,
            newinstructionsData,
            insertInstructions,
        ].map((x) =>
            transactionInstructionsToTypedInstructionsSets(
            x,
            SequenceType.Sequential
            )
        ),
        })
    }

    return(
        <button style={{margin: '20px'}} onClick={createProposalHandler}>create 0.3 sol token transfer proposal</button>
    )
}

export default CreateProposal;