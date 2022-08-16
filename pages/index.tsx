import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'
import { getRealms } from '@solana/spl-governance';
import { Connection, PublicKey,clusterApiUrl } from '@solana/web3.js';
import { useEffect, useMemo, useState } from 'react';
import CreateARealm from './CreateARealm';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
require('@solana/wallet-adapter-react-ui/styles.css');

export default function Home() {

    const [connection, setConnection] = useState<Connection>();
    const [walletConnected, setWalletConnected] = useState(false);
    const [wallet, setWallet] = useState(new PhantomWalletAdapter());

  	// you can use Mainnet, Devnet or Testnet here
    const solNetwork = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(() => clusterApiUrl(solNetwork), [solNetwork]);
    // initialise all the wallets you want to use
    // const wallets = useMemo(
    //     () => [
    //         new PhantomWalletAdapter(),
    //     ],
    //     [solNetwork]
    // );

  useEffect(()=>{

    const getAllRealms = async () => {
      const connection = new Connection("https://mango.devnet.rpcpool.com", 'recent');
      setConnection(connection);
      const programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
    
      const realms = await getRealms(connection, programId);
      console.log('realms', realms)
    }

    getAllRealms();
    
  },[])

  const handleConnectPhantom = async () =>{

    console.log('wallet connect called');
    await wallet.connect();
  }

  wallet.on('connect', ()=>{
    setWalletConnected(true)
    setWallet(wallet)
  })

  useEffect(()=>{
    console.log('wallet', walletConnected, wallet)
    if(wallet){
      wallet.on('connect',async ()=>{
        setWalletConnected(true)
        setWallet(wallet)
      })
    }
  },[wallet.connected])

  return (
    // <ConnectionProvider endpoint={endpoint}>
    //   <WalletProvider wallets={wallets}>
            <div className={styles.container}>
              <h3>testing spl-governance SDK</h3>
              <h4>and trying to create realms using that</h4>

              <button onClick={()=>{handleConnectPhantom()}}>connect phantom</button>
              <CreateARealm wallet={wallet} connection={connection}/>
            </div>
    //     </WalletProvider>
    // </ConnectionProvider>
  )
}
