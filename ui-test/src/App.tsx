import React, { useState, useMemo, useEffect } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, PublicKey, SystemProgram } from '@solana/web3.js';
import { Toaster, toast } from 'react-hot-toast';
import { Layers, ArrowRightLeft, LayoutDashboard, Coins, Info, ShieldCheck, Wallet, Droplets, Loader2, RefreshCcw } from 'lucide-react';
import * as anchor from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';
import idlData from './idl.json';

import '@solana/wallet-adapter-react-ui/styles.css';

// Ensure Buffer is available
if (typeof window !== 'undefined' && !window.Buffer) {
    import('buffer').then(module => {
        window.Buffer = module.Buffer;
    });
}

const idl = idlData as any;
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const PROGRAM_ID = new PublicKey("AgrWR4tV2EkujabgQJt1sTM1jKuDL8CU3T8ug251tQV1");
const TARDIS_SEED = Buffer.from("tardis");

// Devnet Oracles (SOL/USD)
const PYTH_SOL_PRICE_FEED = new PublicKey("J83w4Be9icXvEwhfTAURMghSU8nB69mW2WEJGrDWjhkh");
const SWITCHBOARD_SOL_PRICE_FEED = new PublicKey("AdHpkYuey9M4i2ga7n9re2LsqSbs6fuy6SpxLbvHmSrh");

// --- Custom Wallet Button ---
const CustomWalletButton = () => {
    const { setVisible } = useWalletModal();
    const { publicKey, connected, disconnect } = useWallet();

    return (
        <button 
            onClick={() => connected ? disconnect() : setVisible(true)}
            style={{ 
                backgroundColor: connected ? 'rgba(153, 69, 255, 0.1)' : '#9945FF', 
                color: connected ? '#9945FF' : 'white', 
                border: connected ? '1px solid #9945FF' : 'none', 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
            }}
        >
            <Wallet size={16} />
            {connected && publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : "Connect Wallet"}
        </button>
    );
};

const DashboardContent = () => {
    const { connection } = useConnection();
    const wallet = useWallet();
    const [lendAmount, setLendAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [faucetLoading, setFaucetLoading] = useState(false);
    const [offers, setOffers] = useState<any[]>([]);
    const [fetching, setFetching] = useState(false);

    const program = useMemo(() => {
        if (!wallet.publicKey || !wallet.signTransaction) return null;
        try {
            const provider = new anchor.AnchorProvider(connection, wallet as any, { preflightCommitment: 'processed' });
            return new anchor.Program(idl, provider);
        } catch (e) {
            console.error("Program init failed", e);
            return null;
        }
    }, [connection, wallet.publicKey, wallet.connected]);

    const fetchOffers = async () => {
        if (!program) return;
        setFetching(true);
        try {
            const allLoans = await program.account.loan.all();
            const activeOffers = allLoans.filter((l: any) => l.account.status === 1); // STATUS_OFFERED
            setOffers(activeOffers);
        } catch (e) {
            console.error("Fetch offers failed", e);
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        if (program) fetchOffers();
    }, [program]);

    const suggestedCollateral = lendAmount ? (parseFloat(lendAmount) * 0.1 * 1.5 / 100).toFixed(4) : '0.00';

    const handleFaucet = async () => {
        if (!program || !wallet.publicKey) return toast.error("Connect wallet first!");
        setFaucetLoading(true);
        try {
            const [tardisMint] = PublicKey.findProgramAddressSync([TARDIS_SEED], program.programId);
            const userTokenAccount = await getAssociatedTokenAddress(tardisMint, wallet.publicKey);
            
            await program.methods.requestFaucet().accounts({
                user: wallet.publicKey,
                tardisMint,
                userTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            } as any).rpc();
            
            toast.success("Received 1,000 TARDIS!");
        } catch (e: any) {
            console.error(e);
            toast.error("Faucet failed: " + e.message);
        } finally {
            setFaucetLoading(false);
        }
    };

    const handleInitializeOffer = async () => {
        if (!program || !wallet.publicKey) return toast.error("Connect wallet first!");
        if (!lendAmount || parseFloat(lendAmount) <= 0) return toast.error("Enter amount");
        
        setLoading(true);
        try {
            const [tardisMint] = PublicKey.findProgramAddressSync([TARDIS_SEED], program.programId);
            const [loanAccount] = PublicKey.findProgramAddressSync(
                [Buffer.from("loan"), wallet.publicKey.toBuffer(), tardisMint.toBuffer()],
                program.programId
            );
            const [vault] = PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), loanAccount.toBuffer()],
                program.programId
            );
            const lenderLoanAta = await getAssociatedTokenAddress(tardisMint, wallet.publicKey);

            const amountBN = new anchor.BN(parseFloat(lendAmount) * 1e6);
            const collateralBN = new anchor.BN(parseFloat(suggestedCollateral) * 1e9);
            const repaymentBN = amountBN.muln(11).divn(10); 
            const expiry = new anchor.BN(Math.floor(Date.now() / 1000) + 86400 * 7);

            await program.methods.initializeOffer(
                amountBN,
                collateralBN,
                repaymentBN,
                expiry,
                SOL_MINT
            ).accounts({
                lender: wallet.publicKey,
                loanMint: tardisMint,
                lenderLoanAta,
                loanAccount,
                vault,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            } as any).rpc();
            
            toast.success("Lending offer live!");
            setLendAmount('');
            fetchOffers();
        } catch (e: any) {
            console.error(e);
            toast.error("Initialization failed: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptOffer = async (offer: any) => {
        if (!program || !wallet.publicKey) return toast.error("Connect wallet!");
        
        const loadingToast = toast.loading("Accepting offer...");
        try {
            const loanAccount = offer.publicKey;
            const loanData = offer.account;
            
            const [loanVault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), loanAccount.toBuffer()], program.programId);
            const [collateralVault] = PublicKey.findProgramAddressSync([Buffer.from("collateral_vault"), loanAccount.toBuffer()], program.programId);
            
            const borrowerLoanAta = await getAssociatedTokenAddress(loanData.loanMint, wallet.publicKey);
            const borrowerCollateralAta = await getAssociatedTokenAddress(loanData.collateralMint, wallet.publicKey);

            // Ensure ATA exists or add creation to pre-instructions
            const preInstructions = [];
            try {
                await getAccount(connection, borrowerCollateralAta);
            } catch (e) {
                preInstructions.push(
                    createAssociatedTokenAccountInstruction(
                        wallet.publicKey,
                        borrowerCollateralAta,
                        wallet.publicKey,
                        loanData.collateralMint
                    )
                );
            }

            await program.methods.acceptOffer().accounts({
                borrower: wallet.publicKey,
                lender: loanData.lender,
                loanMint: loanData.loanMint,
                collateralMint: loanData.collateralMint,
                borrowerLoanAta,
                borrowerCollateralAta,
                loanAccount,
                loanVault,
                collateralVault,
                pythPriceInfo: PYTH_SOL_PRICE_FEED,
                switchboardPriceInfo: SWITCHBOARD_SOL_PRICE_FEED,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            } as any).preInstructions(preInstructions).rpc();

            toast.success("Loan accepted! Funds received.", { id: loadingToast });
            fetchOffers();
        } catch (e: any) {
            console.error(e);
            toast.error("Failed to accept: " + e.message, { id: loadingToast });
        }
    };

    return (
        <div style={{ backgroundColor: '#121212', minHeight: '100vh', color: 'white', padding: '0 2rem' }}>
            <Toaster position="bottom-right" />
            
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Layers color="#14F195" size={32} />
                    <h1 style={{ fontSize: '1.75rem', fontWeight: '900', letterSpacing: '-0.05em' }}>
                        TARDIS<span style={{ color: '#9945FF' }}>Escrow</span>
                    </h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={handleFaucet}
                        disabled={faucetLoading || !wallet.connected}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(20, 241, 149, 0.1)', color: '#14F195', border: '1px solid #14F195', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', opacity: (faucetLoading || !wallet.connected) ? 0.5 : 1 }}
                    >
                        {faucetLoading ? <Loader2 size={16} className="animate-spin" /> : <Droplets size={16} />}
                        Get 1,000 TARDIS
                    </button>
                    <CustomWalletButton />
                </div>
            </header>

            <main style={{ maxWidth: '1100px', margin: '4rem auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '4rem' }}>
                    <div>
                        <h2 style={{ fontSize: '3.5rem', fontWeight: '900', margin: '0 0 1.5rem 0', lineHeight: 1, letterSpacing: '-0.02em' }}>
                            Institutional <span style={{ color: '#14F195' }}>Lending</span> for Everyone.
                        </h2>
                        <p style={{ color: '#888', fontSize: '1.25rem', maxWidth: '500px', margin: '0 0 3rem 0', lineHeight: 1.5 }}>
                            The only P2P escrow platform on Solana with mandatory 150% collateral enforcement.
                        </p>
                        
                        <div style={{ backgroundColor: '#1B1B1F', border: '1px solid #333', borderRadius: '24px', padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <ArrowRightLeft color="#9945FF" size={24} />
                                    Lend TARDIS
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#14F195', fontSize: '0.875rem', fontWeight: 'bold', backgroundColor: 'rgba(20, 241, 149, 0.1)', padding: '6px 12px', borderRadius: '99px' }}>
                                    <ShieldCheck size={14} />
                                    150% COLLATERAL
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <label style={{ fontSize: '0.875rem', color: '#666', fontWeight: '600' }}>AMOUNT TO LEND</label>
                                    <div style={{ display: 'flex', backgroundColor: '#000', borderRadius: '12px', padding: '1rem', border: '1px solid #444' }}>
                                        <input 
                                            type="number" 
                                            value={lendAmount}
                                            onChange={(e) => setLendAmount(e.target.value)}
                                            style={{ background: 'none', border: 'none', color: 'white', width: '100%', outline: 'none', fontSize: '1.25rem' }} 
                                            placeholder="0.00" 
                                        />
                                        <span style={{ fontWeight: '900', color: '#9945FF' }}>TARDIS</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <label style={{ fontSize: '0.875rem', color: '#666', fontWeight: '600' }}>REQUIRED COLLATERAL</label>
                                    <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem', border: '1px solid #222' }}>
                                        <input readOnly value={suggestedCollateral} style={{ background: 'none', border: 'none', color: '#14F195', width: '100%', outline: 'none', fontSize: '1.25rem', fontWeight: 'bold' }} />
                                        <span style={{ fontWeight: '900', color: '#14F195' }}>SOL</span>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleInitializeOffer}
                                disabled={loading || !wallet.connected}
                                style={{ width: '100%', marginTop: '2rem', padding: '1.25rem', backgroundColor: '#9945FF', color: 'white', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '1.125rem', cursor: 'pointer', boxShadow: '0 4px 20px rgba(153, 69, 255, 0.3)', opacity: (loading || !wallet.connected) ? 0.5 : 1 }}
                            >
                                {loading ? <Loader2 className="animate-spin" style={{ margin: '0 auto' }} /> : 'Initialize Secured Offer'}
                            </button>
                        </div>
                    </div>

                    <div style={{ backgroundColor: '#1B1B1F', borderRadius: '32px', padding: '2.5rem', border: '1px solid #333', minHeight: '400px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <LayoutDashboard size={24} color="#14F195" />
                                Marketplace
                            </h3>
                            <button onClick={fetchOffers} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>
                                <RefreshCcw size={18} className={fetching ? "animate-spin" : ""} />
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {offers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '4rem 0', color: '#444' }}>
                                    <Coins size={64} style={{ marginBottom: '1.5rem', opacity: 0.1 }} />
                                    <p style={{ fontSize: '1.125rem' }}>{wallet.connected ? "No active offers found." : "Connect wallet to view offers."}</p>
                                </div>
                            ) : (
                                offers.map((offer, idx) => (
                                    <div key={idx} style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid #333', borderRadius: '16px', padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(153, 69, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: '#9945FF' }}>T</div>
                                                <div>
                                                    <span style={{ display: 'block', fontWeight: 'bold' }}>{(offer.account.loanAmount.toNumber() / 1e6).toFixed(2)} TARDIS</span>
                                                    <span style={{ fontSize: '0.7rem', color: '#555' }}>Lender: {offer.account.lender.toBase58().slice(0, 4)}...{offer.account.lender.toBase58().slice(-4)}</span>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ display: 'block', color: '#14F195', fontWeight: 'bold', fontSize: '0.875rem' }}>{(offer.account.collateralAmount.toNumber() / 1e9).toFixed(4)} SOL</span>
                                                <span style={{ fontSize: '0.7rem', color: '#555' }}>Collateral</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleAcceptOffer(offer)}
                                            style={{ width: '100%', padding: '0.75rem', backgroundColor: '#14F195', color: '#000', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', transition: 'transform 0.1s' }}
                                        >
                                            Borrow Funds
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

function App() {
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);
    const wallets = useMemo(() => [], []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <DashboardContent />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}

export default App;
