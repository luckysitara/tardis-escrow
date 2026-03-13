import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { 
  PublicKey, 
  SystemProgram, 
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress, 
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import idl from './idl/lending_program.json';

// Anchor expects a specific wallet interface
interface AnchorWallet {
  publicKey: PublicKey;
  signTransaction(transaction: anchor.web3.Transaction): Promise<anchor.web3.Transaction>;
  signAllTransactions(transactions: anchor.web3.Transaction[]): Promise<anchor.web3.Transaction[]>;
}

const PROGRAM_ID = new PublicKey(idl.address);

const EscrowUI: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  
  // Test Token State
  const [collateralMint, setCollateralMint] = useState('');
  const [loanMint, setLoanMint] = useState('');
  
  // Inputs
  const [collateralAmount, setCollateralAmount] = useState('1');
  const [loanAmount, setLoanAmount] = useState('10');
  const [repaymentAmount, setRepaymentAmount] = useState('11');
  
  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as unknown as AnchorWallet, {
      preflightCommitment: 'processed',
    });
    return new Program(idl as any, provider);
  };

  const createTestTokens = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setLoading(true);
    try {
      setStatus('Creating Test Tokens (SOL-Collateral Mock and USDC-Loan Mock)...');
      
      // Note: In a real browser wallet, you'd usually have these already.
      // For testing, we'll try to mint some to the user.
      // This part is tricky in a UI because it requires a payer.
      setStatus('Please use the CLI tools to create tokens for better reliability on devnet, or use existing mints.');
      
    } catch (e: any) {
      console.error(e);
      setStatus('Error: ' + e.message);
    }
    setLoading(false);
  };

  const handleInitLoan = async () => {
    if (!wallet.publicKey) return;
    if (!collateralMint || !loanMint) {
      setStatus('Error: Please enter both Collateral and Loan Mint addresses.');
      return;
    }
    setLoading(true);
    try {
      const program = getProgram();
      const colMintPubkey = new PublicKey(collateralMint.trim());
      
      const [loanAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("loan"), wallet.publicKey.toBuffer(), colMintPubkey.toBuffer()],
        program.programId
      );

      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), loanAccount.toBuffer()],
        program.programId
      );

      const borrowerCollateralAta = await getAssociatedTokenAddress(colMintPubkey, wallet.publicKey);

      const tx = await program.methods
        .initializeLoan(
          new anchor.BN(parseFloat(collateralAmount) * 1e9),
          new anchor.BN(parseFloat(loanAmount) * 1e6),
          new anchor.BN(parseFloat(repaymentAmount) * 1e6),
          new anchor.BN(Math.floor(Date.now() / 1000) + 3600)
        )
        .accounts({
          borrower: wallet.publicKey,
          collateralMint: colMintPubkey,
          borrowerCollateralAta,
          loanAccount,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStatus(`Loan Initialized! Tx: ${tx}`);
    } catch (e: any) {
      console.error(e);
      setStatus('Error: ' + e.message);
    }
    setLoading(false);
  };

  const handleAcceptLoan = async () => {
    if (!wallet.publicKey) return;
    setLoading(true);
    try {
        const program = getProgram();
        // For simplicity in UI testing, we assume the connected wallet is the LENDER
        // and we need to know the borrower's address
        const borrowerAddressStr = prompt("Enter Borrower Address:");
        if (!borrowerAddressStr) return;
        const borrowerAddress = new PublicKey(borrowerAddressStr);
        const lMintPubkey = new PublicKey(loanMint);
        const cMintPubkey = new PublicKey(collateralMint);

        const [loanAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("loan"), borrowerAddress.toBuffer(), cMintPubkey.toBuffer()],
            program.programId
        );

        const lenderLoanAta = await getAssociatedTokenAddress(lMintPubkey, wallet.publicKey);
        const borrowerLoanAta = await getAssociatedTokenAddress(lMintPubkey, borrowerAddress);

        const tx = await program.methods
            .acceptLoan()
            .accounts({
                lender: wallet.publicKey,
                borrower: borrowerAddress,
                loanMint: lMintPubkey,
                lenderLoanAta,
                borrowerLoanAta,
                loanAccount,
                pythPriceInfo: PublicKey.default, // Mocked in program
                switchboardPriceInfo: PublicKey.default, // Mocked in program
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        setStatus(`Loan Accepted! Tx: ${tx}`);
    } catch (e: any) {
        console.error(e);
        setStatus('Error: ' + e.message);
    }
    setLoading(false);
  };

  const handleRepayLoan = async () => {
    if (!wallet.publicKey) return;
    setLoading(true);
    try {
      const program = getProgram();
      const colMintPubkey = new PublicKey(collateralMint);
      const lMintPubkey = new PublicKey(loanMint);
      
      // We need the lender's address to repay them
      const lenderAddressStr = prompt("Enter Lender Address (the one who accepted your loan):");
      if (!lenderAddressStr) return;
      const lenderAddress = new PublicKey(lenderAddressStr);

      const [loanAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("loan"), wallet.publicKey.toBuffer(), colMintPubkey.toBuffer()],
        program.programId
      );

      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), loanAccount.toBuffer()],
        program.programId
      );

      const borrowerLoanAta = await getAssociatedTokenAddress(lMintPubkey, wallet.publicKey);
      const lenderLoanAta = await getAssociatedTokenAddress(lMintPubkey, lenderAddress);
      const borrowerCollateralAta = await getAssociatedTokenAddress(colMintPubkey, wallet.publicKey);

      const tx = await program.methods
        .repayLoan()
        .accounts({
          borrower: wallet.publicKey,
          lender: lenderAddress,
          loanMint: lMintPubkey,
          collateralMint: colMintPubkey,
          borrowerLoanAta,
          lenderLoanAta,
          borrowerCollateralAta,
          loanAccount,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setStatus(`Loan Repaid! Tx: ${tx}`);
    } catch (e: any) {
      console.error(e);
      setStatus('Error: ' + e.message);
    }
    setLoading(false);
  };

  const handleLiquidate = async () => {
    if (!wallet.publicKey) return;
    setLoading(true);
    try {
      const program = getProgram();
      const colMintPubkey = new PublicKey(collateralMint);
      
      const borrowerAddressStr = prompt("Enter Delinquent Borrower Address:");
      if (!borrowerAddressStr) return;
      const borrowerAddress = new PublicKey(borrowerAddressStr);

      const [loanAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("loan"), borrowerAddress.toBuffer(), colMintPubkey.toBuffer()],
        program.programId
      );

      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), loanAccount.toBuffer()],
        program.programId
      );

      const lenderCollateralAta = await getAssociatedTokenAddress(colMintPubkey, wallet.publicKey);

      const tx = await program.methods
        .liquidate()
        .accounts({
          lender: wallet.publicKey,
          borrower: borrowerAddress,
          collateralMint: colMintPubkey,
          lenderCollateralAta,
          loanAccount,
          vault,
          pythPriceInfo: PublicKey.default,
          switchboardPriceInfo: PublicKey.default,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setStatus(`Liquidation Successful! Tx: ${tx}`);
    } catch (e: any) {
      console.error(e);
      setStatus('Error: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>P2P Escrow Lending UI</h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <WalletMultiButton />
        {wallet.publicKey && <small>Connected: {wallet.publicKey.toBase58().slice(0, 8)}...</small>}
      </div>
      
      <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '15px', borderRadius: '8px', backgroundColor: '#fafafa' }}>
        <h3>Configuration</h3>
        <div>
          <label style={{ display: 'inline-block', width: '150px' }}>Collateral Mint: </label>
          <input value={collateralMint} onChange={e => setCollateralMint(e.target.value)} style={{ width: '450px', padding: '5px' }} placeholder="6iXuxae5ZiJHufCUTsSWvuDua9k1GBSZ58dCqMepiwqA"/>
        </div>
        <div style={{ marginTop: '10px' }}>
          <label style={{ display: 'inline-block', width: '150px' }}>Loan Mint: </label>
          <input value={loanMint} onChange={e => setLoanMint(e.target.value)} style={{ width: '450px', padding: '5px' }} placeholder="3YA9GN8R93cGfcRoqizWRJhXzaExJvFhqco9g6yAt8io"/>
        </div>
      </div>

      <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
          <h3>1. Request Loan (Borrower)</h3>
          <p>Collateral: <input type="number" value={collateralAmount} onChange={e => setCollateralAmount(e.target.value)} style={{ width: '60px' }} /> SOL-Mock</p>
          <p>Loan Amount: <input type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} style={{ width: '60px' }} /> USDC-Mock</p>
          <p>Repayment: <input type="number" value={repaymentAmount} onChange={e => setRepaymentAmount(e.target.value)} style={{ width: '60px' }} /> USDC-Mock</p>
          <button onClick={handleInitLoan} disabled={loading || !wallet.connected} style={{ width: '100%', padding: '10px', cursor: 'pointer' }}>Initialize Loan Request</button>
        </div>

        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
          <h3>2. Offer Loan (Lender)</h3>
          <p>Check active requests and fund them.</p>
          <button onClick={handleAcceptLoan} disabled={loading || !wallet.connected} style={{ width: '100%', padding: '10px', cursor: 'pointer', backgroundColor: '#e7f3ff' }}>Accept Loan Request</button>
        </div>

        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
          <h3>3. Close Loan (Borrower)</h3>
          <p>Return funds + interest to get collateral back.</p>
          <button onClick={handleRepayLoan} disabled={loading || !wallet.connected} style={{ width: '100%', padding: '10px', cursor: 'pointer', backgroundColor: '#f0fff4' }}>Repay & Close Loan</button>
        </div>

        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
          <h3>4. Liquidate (Lender)</h3>
          <p>Claim collateral if loan is expired.</p>
          <button onClick={handleLiquidate} disabled={loading || !wallet.connected} style={{ width: '100%', padding: '10px', cursor: 'pointer', backgroundColor: '#fff5f5', color: '#c53030' }}>Liquidate Collateral</button>
        </div>
      </div>

      {status && (
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '5px' }}>
          <strong>Status:</strong> {status}
        </div>
      )}
    </div>
  );
};

export default EscrowUI;
