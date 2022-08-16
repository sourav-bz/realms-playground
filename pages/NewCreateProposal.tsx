import { FC, useEffect, useState } from "react";
import {
    Keypair,
    PublicKey,
    Connection,
    Transaction,
    TransactionInstruction,
  } from '@solana/web3.js'
import {
    getInstructionDataFromBase64,
    Governance,
    ProgramAccount,
    InstructionData,
    getGovernance,
    getGovernanceAccounts,
    pubkeyFilter,
    getRealm,
    getAllTokenOwnerRecords,
    withInsertTransaction,
    withSignOffProposal,
    WalletSigner,
    VoteType,
    withCreateProposal,
    createInstructionData,
    serializeInstructionToBase64,
    getNativeTreasuryAddress
} from '@solana/spl-governance'

import { SystemProgram } from "@solana/web3.js";
import { AssetAccount, getTokenAssetAccounts } from "../stores/useGovernanceAssetsStore";


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

  
const NewCreateProposal = ({ wallet, connection}:{ wallet: WalletSigner, connection: Connection}) => {

    console.log("CreateProposal - wallet", wallet)

    const [instructionsData, setInstructions] = useState<
        ComponentInstructionData[]
    >([{ type: undefined }])
    const [instructionsDataToSend, setInstructionsDataToSend] = useState<InstructionDataWithHoldUpTime[]>()
    const [
      selectedGovernance,
            setSelectedGovernance,
          ] = useState<ProgramAccount<Governance> | null>(null)
    
    const handleSetInstructions = (val: any, index) => {
        const newInstructions = [...instructionsData]
        newInstructions[index] = { ...instructionsData[index], ...val }
        setInstructions(newInstructions)
      }

    const handleGetInstructions = async (instructionsData) => {
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

    const createProposalHandler = async () =>{

        // const instructions: TransactionInstruction[] = []

        const governanceAuthority = wallet.publicKey
        const signatory = new PublicKey('HWuCwhwayTaNcRtt72edn2uEMuKCuWMwmDFcJLbah3KC')
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
        console.log("createProposal",accounts,accounts[0]?.extensions.transferAddress, (accounts[0]?.extensions.amount))


        function getInstruction(): Promise<UiInstruction> {
            return  getSolTransferInstruction({
                governedTokenAccount:accounts[0],
                destinationAccount:new PublicKey('3BHtZAxD7WTWZUQATwQ8J5YPqtaqSFkEzhXW2zntEgyA'),
                amount:'0.3',
                programId:programId,
                currentAccount:accounts[0],
            })
        }

        


        let newinstructionsData : TransactionInstruction[] = []

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

        // const fetchRealmGovernance=async(realmPk: PublicKey)=> {
        //     const governance = await getGovernance(connection, realmPk)
        //     return governance
        // }

        const realmId = new PublicKey('HWuCwhwayTaNcRtt72edn2uEMuKCuWMwmDFcJLbah3KC');
        const governance =await getGovernance(connection,  new PublicKey('9PDa3cRWPiA6uCDN5rC92XygoV8WeKuvsM2YuoETCQkb'))
        const realmData = await getRealm(connection, realmId);

        const tokenOwnerRecord = await getAllTokenOwnerRecords(
        connection,
        realmData.owner,
        realmData.pubkey
        );


        const proposalInstructions: TransactionInstruction[] = [];

        const proposalAddress = await withCreateProposal(
        proposalInstructions,
        programId,
        2,
        realmPk,
        governance.pubkey,
        tokenOwnerRecord[0].pubkey,
        `NEW give me 0.3 sol payouts ${new Date().toTimeString()}`,
        `give me money`,
        tokenOwnerRecord[0].account.governingTokenMint,
        payer!,
        governance.account.proposalCount,
        VoteType.SINGLE_CHOICE,
        ["Approve"],
        true,
        payer!
        );

        console.log('create New proposal - proposal Address', proposalAddress)

        const nativeTreasury = await getNativeTreasuryAddress(programId, governance.pubkey)

        console.log('create New proposal - nativeTreasury', nativeTreasury.toString())

        let ins = SystemProgram.transfer({
        fromPubkey: nativeTreasury,
        toPubkey: payer!,
        lamports: 0.3*1000000000,
        programId: programId,
        });

        console.log('create New proposal - proposalInstructions', proposalInstructions)
        console.log('create New proposal - ins', ins)

        const instructionData = createInstructionData(ins)

        await withInsertTransaction(
        proposalInstructions,
        programId,
        2,
        governance.pubkey,
        proposalAddress,
        tokenOwnerRecord[0].pubkey,
        payer!,
        0,
        0,
        0,
        [instructionData],
        payer!
        );

        console.log('create New proposal - after withInsertTransaction', proposalInstructions)

        withSignOffProposal(
        proposalInstructions,
        programId,
        2,
        realm.pubkey,
        governance.pubkey,
        proposalAddress,
        payer!,
        undefined,
        // signatoryRecord,
        tokenOwnerRecord[0].pubkey
        );

        const getProvider = (): any => {
            if ("solana" in window) {
              // @ts-ignore
              const provider = window.solana as any;
              if (provider.isPhantom) return provider as any;
            }
        };

        console.log('create New proposal - getProvider', getProvider())

        const block = await connection.getLatestBlockhash('confirmed')
        const transaction = new Transaction();
        transaction.recentBlockhash = block.blockhash
        transaction.feePayer = wallet.publicKey!
        transaction.add(...proposalInstructions);
        const sendTrxn = await getProvider().signAndSendTransaction(transaction)
        // const sendTrxn = await sendAndConfirmRawTransaction(connection, transaction.serialize())

        console.log('create New proposal - sendTrxn', sendTrxn)
    }

    return(
        <button style={{margin: '20px'}} onClick={createProposalHandler}>
          create 0.3 sol proposal - single Txn
        </button>
    )
}

export default NewCreateProposal;