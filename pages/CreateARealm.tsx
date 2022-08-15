import { FC, useEffect, useState } from "react";
import { Connection, PublicKey, clusterApiUrl, 
    TransactionInstruction, } from "@solana/web3.js";
import { prepareRealmCreation } from "../utils/prepareRealmCreation";
import { sendTransactionsV2 } from "../utils/sendTransactions";
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import CreateProposal from "./CreateProposal";
import SendFundToTreasury from "./SendFundToTreasury";


type PhantomEvent = "disconnect" | "connect" | "accountChanged";

interface ConnectOpts {
    onlyIfTrusted: boolean;
}

interface PhantomProvider {
    connect: (opts?: Partial<ConnectOpts>) => Promise<{ publicKey: PublicKey }>;
    disconnect: ()=>Promise<void>;
    on: (event: PhantomEvent, callback: (args:any)=>void) => void;
    isPhantom: boolean;
}

const CreateARealm: FC = () => {

    const wallet = useWallet();

    const [realmName, setRealmName] = useState('');
    const [realmPk, setRealmPk] = useState('8G7jxmrrPoxe6KBzFQ29QTXXnUX8zpQhwpkbgHDoWxjo');


    enum SequenceType {
        Sequential,
        Parallel,
        StopOnFailure,
      }

    interface TransactionInstructionWithType {
        instructionsSet: TransactionInstruction[]
        sequenceType?: SequenceType
      }

    const transactionInstructionsToTypedInstructionsSets = (
        instructionsSet: TransactionInstruction[],
        type: SequenceType
      ): TransactionInstructionWithType => {
        return {
          instructionsSet: instructionsSet,
          sequenceType: type,
        }
      }

      function chunks<T>(array: T[], size: number): T[][] {
        const result: Array<T[]> = []
        let i, j
        for (i = 0, j = array.length; i < j; i += size) {
          result.push(array.slice(i, i + size))
        }
        return result
      }

    const createRealmHandler: React.MouseEventHandler<HTMLButtonElement> = async (event) => {
        console.log("createRealm handler");
        if(wallet.publicKey){
            const connection = new Connection("https://mango.devnet.rpcpool.com", 'recent');
            const programId = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
            let realmName = `payouts ${Math.floor(Math.random()*(999-100+1)+100)}`;
            const {
                communityMintPk,
                councilMintPk,
                realmPk,
                realmInstructions,
                realmSigners,
                mintsSetupInstructions,
                mintsSetupSigners,
                councilMembersInstructions,
              } = await prepareRealmCreation({
                connection,
                walletPk: wallet.publicKey,
                programIdAddress: programId,
            
                realmName,
                tokensToGovernThreshold: undefined,
            
                existingCommunityMintPk: undefined,
                communityMintSupplyFactor: undefined,
                transferCommunityMintAuthority: true,
                communityYesVotePercentage: 100,
            
                createCouncil: true,
                existingCouncilMintPk: undefined,
                transferCouncilMintAuthority: true,
                councilWalletPks: [new PublicKey('3BHtZAxD7WTWZUQATwQ8J5YPqtaqSFkEzhXW2zntEgyA'), new PublicKey('5JhJkGb7ZhSV1SeXyVstmC1miHDurL3fgsBWZ9Vveetv')],
              })


              try {
                const councilMembersChunks = chunks(councilMembersInstructions, 10)
                // only walletPk needs to sign the minting instructions and it's a signer by default and we don't have to include any more signers
                const councilMembersSignersChunks = Array(councilMembersChunks.length).fill(
                  []
                )
                console.log('CREATE MULTISIG WALLET: sending transactions')
                const tx = await sendTransactionsV2({
                  connection,
                  showUiComponent: true,
                  wallet: wallet,
                  signersSet: [
                    mintsSetupSigners,
                    ...councilMembersSignersChunks,
                    realmSigners,
                  ],
                  TransactionInstructions: [
                    mintsSetupInstructions,
                    ...councilMembersChunks,
                    realmInstructions,
                  ].map((x) =>
                    transactionInstructionsToTypedInstructionsSets(
                      x,
                      SequenceType.Sequential
                    )
                  ),
                })

                setRealmName(realmName);
                setRealmPk(realmPk.toString())
                console.log('realm', {
                  realmName, 
                  tx, 
                  realmPk: realmPk.toString(), 
                  communityMintPk: communityMintPk.toString(), 
                  councilMintPk: councilMintPk.toString()})
              } catch (ex) {
                console.error(ex)
                throw ex
              }
        }
    }

    return (
        <div>
            <div>
            <WalletMultiButton />
           </div>
            <button style={{margin: '20px'}} onClick={createRealmHandler}>Create a demo realm</button>
            {realmName && <div> <b>{realmName}</b> ==&gt; realm created</div>}
            {realmPk && <div><b>{realmPk}</b> ==&gt; realm publickey </div>}

            <div>
              <SendFundToTreasury realmPk={realmPk?new PublicKey(realmPk):null}/>
            </div>
            <div>
              <CreateProposal />
            </div>
        </div>
    );
}

export default CreateARealm;