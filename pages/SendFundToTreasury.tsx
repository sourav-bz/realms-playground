import { FC, useEffect, useState } from "react";
import {
    getNativeTreasuryAddress,
    getGovernanceAccounts,
    getGovernanceAccount,
    Governance,
    GovernanceAccountType,
    Realm,
    TOKEN_PROGRAM_ID,
    pubkeyFilter,
    ProgramAccount,
    getRealm,
    WalletSigner,
    getGovernance,
    Proposal
  } from '@solana/spl-governance'
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Connection } from "@solana/web3.js";
import { getTokenAssetAccounts } from "../stores/useGovernanceAssetsStore";
const SendFundToTreasury = ({realmPk, wallet, connection}:{realmPk: PublicKey | null, wallet: WalletSigner, connection: Connection}) => {

    const programId = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';

    const [treasuryAddress, setTreasuryAddress] = useState<string>('');
    const [treasuryBalance, setTreasuryBalance] = useState<Number>(0);

    useEffect(()=>{
        if(realmPk && connection){
            const getTreasuryAddress = async () =>{
                const realmData = await getRealm(connection, new PublicKey(realmPk))
                const COUNCIL_MINT = realmData.account.config.councilMint
                const governanceInfo = await getGovernanceAccounts(connection, new PublicKey(programId), Governance, [pubkeyFilter(33, COUNCIL_MINT)!])
                const governance = governanceInfo[0]
                const nativeTreasury = await getNativeTreasuryAddress(new PublicKey(programId), governance.pubkey)

                const proposals =await getGovernanceAccounts(connection, new PublicKey(programId), Proposal, [
                    pubkeyFilter(1, governance.pubkey)!,
                  ])

                  console.log('proposals -', proposals)
                setTreasuryAddress(nativeTreasury)
            }
            getTreasuryAddress()
        }
    },[realmPk, connection])

    return(
        <>
            {treasuryAddress && (<div style={{margin: 20}}>add 0.3 sol to treasury ==&gt; {`${treasuryAddress}`}</div>)}
        </>
    )
}

export default SendFundToTreasury;