import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LendingProgram } from "../target/types/lending_program.ts";
import { 
  PublicKey, 
  SystemProgram, 
  Keypair, 
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createMint, 
  getOrCreateAssociatedTokenAccount, 
  mintTo 
} from "@solana/spl-token";
import { expect } from "chai";

describe("lending_program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LendingProgram as Program<LendingProgram>;
  console.log("Program ID used in tests:", program.programId.toBase58());
  const borrower = Keypair.generate();
  const lender = Keypair.generate();

  // Oracle Mock Addresses (Devnet addresses for SOL/USD)
  const pythSolUsd = new PublicKey("J83w4H9txzS6AsvS5hL8HscV57sY4zQ9w64D9YWh5T84");
  const sbSolUsd = new PublicKey("GvDMxP2uzBox97D3vjLzyfJyoH79YCDAuyvBnN1YuyW4");

  let collateralMint: PublicKey;
  let loanMint: PublicKey;
  let borrowerCollateralAta: PublicKey;
  let lenderLoanAta: PublicKey;
  let borrowerLoanAta: PublicKey;
  let lenderCollateralAta: PublicKey;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(borrower.publicKey, 2 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(lender.publicKey, 2 * LAMPORTS_PER_SOL)
    );

    // Using SOL as collateral (Mint) and USDC as loan (Mint)
    collateralMint = await createMint(provider.connection, borrower, borrower.publicKey, null, 9);
    loanMint = await createMint(provider.connection, lender, lender.publicKey, null, 6);

    borrowerCollateralAta = (await getOrCreateAssociatedTokenAccount(provider.connection, borrower, collateralMint, borrower.publicKey)).address;
    lenderLoanAta = (await getOrCreateAssociatedTokenAccount(provider.connection, lender, loanMint, lender.publicKey)).address;
    borrowerLoanAta = (await getOrCreateAssociatedTokenAccount(provider.connection, borrower, loanMint, borrower.publicKey)).address;
    lenderCollateralAta = (await getOrCreateAssociatedTokenAccount(provider.connection, lender, collateralMint, lender.publicKey)).address;

    await mintTo(provider.connection, borrower, collateralMint, borrowerCollateralAta, borrower.publicKey, 10_000_000_000); // 10 SOL
    await mintTo(provider.connection, lender, loanMint, lenderLoanAta, lender.publicKey, 1000_000_000); // 1000 USDC
    
    // Mint some loan tokens to borrower to cover interest during repayment
    await mintTo(provider.connection, lender, loanMint, borrowerLoanAta, lender.publicKey, 20_000_000); // 20 USDC extra
  });

  it("Initializes a loan request", async () => {
    const collateralAmount = new anchor.BN(5_000_000_000); // 5 SOL
    const loanAmount = new anchor.BN(100_000_000); // 100 USDC
    const repaymentAmount = new anchor.BN(110_000_000); // 110 USDC
    const expiry = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

    const [loanAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("loan"), borrower.publicKey.toBuffer(), collateralMint.toBuffer()],
      program.programId
    );

    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), loanAccount.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeLoan(collateralAmount, loanAmount, repaymentAmount, expiry)
      .accounts({
        borrower: borrower.publicKey,
        collateralMint,
        borrowerCollateralAta,
        loanAccount,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    const account = await program.account.loan.fetch(loanAccount);
    expect(account.status).to.equal(0);
  });

  it("Lender accepts the loan", async () => {
    const [loanAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("loan"), borrower.publicKey.toBuffer(), collateralMint.toBuffer()],
      program.programId
    );

    await program.methods
      .acceptLoan()
      .accounts({
        lender: lender.publicKey,
        borrower: borrower.publicKey,
        loanMint,
        lenderLoanAta,
        borrowerLoanAta,
        loanAccount,
        pythPriceInfo: pythSolUsd,
        switchboardPriceInfo: sbSolUsd,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([lender])
      .rpc();

    const account = await program.account.loan.fetch(loanAccount);
    expect(account.status).to.equal(1); // Active
  });

  it("Borrower repays the loan", async () => {
    const [loanAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("loan"), borrower.publicKey.toBuffer(), collateralMint.toBuffer()],
      program.programId
    );

    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), loanAccount.toBuffer()],
      program.programId
    );

    // Only attempt if loan is active
    const accountBefore = await program.account.loan.fetch(loanAccount);
    if (accountBefore.status === 1) {
      await program.methods
        .repayLoan()
        .accounts({
          borrower: borrower.publicKey,
          lender: lender.publicKey,
          loanMint,
          collateralMint,
          borrowerLoanAta,
          lenderLoanAta,
          borrowerCollateralAta,
          loanAccount,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([borrower])
        .rpc();

      const accountAfter = await program.account.loan.fetch(loanAccount);
      expect(accountAfter.status).to.equal(2); // Repaid
    }
  });
});
