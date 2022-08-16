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
    getGovernance
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
                const governances = await getGovernanceAccounts(connection, new PublicKey(programId), Governance, [
                    pubkeyFilter(1, realmPk)!,
                ])

                setTreasuryAddress('');
                console.log('governances', governances);
                
               // const realm = await getRealm(connection, new PublicKey('HWuCwhwayTaNcRtt72edn2uEMuKCuWMwmDFcJLbah3KC'));

                // const connectionCxt = { cluster: 'devnet',
                //     current: connection,
                //     endpoint: "https://mango.devnet.rpcpool.com"}
               
                // const accounts = await getTokenAssetAccounts([],governances, realm,connectionCxt);
                // console.log("sendFundToTreasury",accounts,accounts[0]?.extensions.transferAddress?.toString(), parseInt(accounts[0]?.extensions.amount?.toString())/(10**9))

                // // governances.map(async (governance, i)=>{
                // //     let treasuryaddr = await getNativeTreasuryAddress(new PublicKey(programId), governance.pubkey)
                // //     console.log('treasuryaddr', treasuryaddr.toString())
                // //     treasuryadd.push(treasuryaddr.toString())
                // // })

                // setTreasuryAddress(accounts[0]?.extensions?.transferAddress?.toString()||'');
                // setTreasuryBalance(parseInt(accounts[0]?.extensions.amount?.toString()||'0')/(10**9))
                
                const governance =await getGovernance(connection,  new PublicKey('9PDa3cRWPiA6uCDN5rC92XygoV8WeKuvsM2YuoETCQkb'))
                setTreasuryAddress(governance.pubkey.toString());
                    // setTreasuryAddress(treasuryaddr.toString())
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