import { createInstructionData, getAllTokenOwnerRecords, getGovernanceAccount, getGovernanceAccounts, getGovernanceProgramVersion, getNativeTreasuryAddress, getRealm, Governance, pubkeyFilter, TokenOwnerRecord, VoteType, withCreateProposal, withInsertTransaction, withSignOffProposal } from "@solana/spl-governance";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";


const UpdatedCreateProposal = ({wallet, connection}) => {

    const createProposalHandler = async () => {
            const safeAddressPublicKey = new PublicKey("BxQDL42nwWTq2UVNEoWoY2mDrQf7Cp4QEZQ4VqjTXgnd");
			const realmData = await getRealm(connection, safeAddressPublicKey)
            const programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
			const governances = await getGovernanceAccounts(
                connection, 
                programId, 
                Governance, 
                [pubkeyFilter(1, safeAddressPublicKey)!,
			])
            
			console.log("realms governances", governances.map((g)=>g.pubkey.toString()))

			const governance = governances.filter((gov)=>gov.pubkey.toString()===realmData.account.authority?.toString())[0]
			const payer : PublicKey = wallet.publicKey

			console.log("realms governance", governance.pubkey.toString())

			const tokenOwnerRecordTrial = await getAllTokenOwnerRecords(
				connection,
				realmData.owner,
				realmData.pubkey
			)

			console.log("realms tokenOwnerRecordTrial", tokenOwnerRecordTrial.map((t)=>t.pubkey.toString()))

			const tokenOwnerRecord  = await getGovernanceAccounts(
				connection,
				programId,
				TokenOwnerRecord,
				[pubkeyFilter(1, realmData.pubkey)!, pubkeyFilter(65, payer)!]
			);

			console.log("realms tokenOwnerRecord", tokenOwnerRecord[0].pubkey.toString())
			console.log("realms tokenOwnerRecord governingTokenMint", tokenOwnerRecord[0].account.governingTokenMint.toString())
			
            const programVersion = await getGovernanceProgramVersion(connection, programId)

			const proposalInstructions: TransactionInstruction[] = []

			const proposalAddress = await withCreateProposal(
				proposalInstructions,
				programId,
				programVersion,
				safeAddressPublicKey,
				governance.pubkey,
				tokenOwnerRecord[0].pubkey,
				`new proposal name`,
				`proposal description`,
				tokenOwnerRecord[0].account.governingTokenMint,
				payer!,
				0,
				VoteType.SINGLE_CHOICE,
				['Approve'],
				true,
				payer!
			)

            const nativeTreasury = await getNativeTreasuryAddress(programId, governance.pubkey)

            const obj = {
                fromPubkey: nativeTreasury,
                toPubkey: new PublicKey("3BHtZAxD7WTWZUQATwQ8J5YPqtaqSFkEzhXW2zntEgyA"),
                lamports: Math.floor(1 * 10**9),
                programId: programId,
            }
            console.log("realms obj", obj.fromPubkey.toString(), obj.toPubkey.toString(), obj.lamports)
            console.log("realms payer", payer.toString())
            const ins = SystemProgram.transfer(obj)
            const instructionData = createInstructionData(ins)
            await withInsertTransaction(
                proposalInstructions,
                programId,
                programVersion,
                governance.pubkey,
                proposalAddress,
                tokenOwnerRecord[0].pubkey,
                payer!,
                0,
                0,
                0,
                [instructionData],
                payer!
            )

            withSignOffProposal(
                proposalInstructions,
                programId,
                programVersion,
                safeAddressPublicKey,
                governance.pubkey,
                proposalAddress,
                payer!,
                undefined,
                tokenOwnerRecord[0].pubkey
            )

            const getProvider = (): any => {
                if('solana' in window) {
                    // @ts-ignore
                    const provider = window.solana as any
                    if(provider.isPhantom) {
                        return provider as any
                    }
                }
            }

            const block = await connection.getLatestBlockhash('confirmed')
            const transaction = new Transaction()
            transaction.recentBlockhash = block.blockhash
            transaction.feePayer = payer!
            transaction.add(...proposalInstructions)
            console.log("realms transaction", transaction)
            await getProvider().signAndSendTransaction(transaction)
    }

    return(
        <button style={{margin: '20px'}} onClick={createProposalHandler}>
          (v3) create 0.3 sol proposal - single Txn
        </button>
    )
}

export default UpdatedCreateProposal