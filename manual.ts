import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LendingProgram } from "./target/types/lending_program.ts";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as splToken from "@solana/spl-token";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.LendingProgram as Program<LendingProgram>;

async function main() {
    const action = process.argv[2];
    const colMint = new PublicKey(process.argv[3]);
    const loanMint = new PublicKey(process.argv[4]);

    const [loanAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("loan"), provider.wallet.publicKey.toBuffer(), colMint.toBuffer()],
        program.programId
    );

    const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), loanAccount.toBuffer()],
        program.programId
    );

    if (action === "init") {
        console.log("Initializing Loan...");
        const borrowerCollateralAta = await splToken.getAssociatedTokenAddress(colMint, provider.wallet.publicKey);
        
        await program.methods.initializeLoan(
            new anchor.BN(5_000_000_000), // 5 Collateral
            new anchor.BN(100_000_000),   // 100 Loan
            new anchor.BN(110_000_000),   // 110 Repayment
            new anchor.BN(Math.floor(Date.now() / 1000) + 3600) // 1 hour expiry
        ).accounts({
            borrower: provider.wallet.publicKey,
            collateralMint: colMint,
            borrowerCollateralAta,
            loanAccount,
            vault,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        }).rpc();
        console.log("Loan Initialized! PDA:", loanAccount.toBase58());
    } 
    
    else if (action === "accept") {
        console.log("Accepting Loan (as Lender)...");
        // For manual testing, we use the same wallet as lender for simplicity
        const lenderLoanAta = await splToken.getAssociatedTokenAddress(loanMint, provider.wallet.publicKey);
        const borrowerLoanAta = await splToken.getAssociatedTokenAddress(loanMint, provider.wallet.publicKey);

        await program.methods.acceptLoan().accounts({
            lender: provider.wallet.publicKey,
            borrower: provider.wallet.publicKey,
            loanMint,
            lenderLoanAta,
            borrowerLoanAta,
            loanAccount,
            pythPriceInfo: PublicKey.default, // Using Mock
            switchboardPriceInfo: PublicKey.default, // Using Mock
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
        }).rpc();
        console.log("Loan Accepted!");
    }

    else if (action === "repay") {
        console.log("Repaying Loan...");
        const borrowerLoanAta = await splToken.getAssociatedTokenAddress(loanMint, provider.wallet.publicKey);
        const lenderLoanAta = await splToken.getAssociatedTokenAddress(loanMint, provider.wallet.publicKey);
        const borrowerCollateralAta = await splToken.getAssociatedTokenAddress(colMint, provider.wallet.publicKey);

        await program.methods.repayLoan().accounts({
            borrower: provider.wallet.publicKey,
            lender: provider.wallet.publicKey,
            loanMint,
            collateralMint: colMint,
            borrowerLoanAta,
            lenderLoanAta,
            borrowerCollateralAta,
            loanAccount,
            vault,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
        }).rpc();
        console.log("Loan Repaid! Collateral returned.");
    }
}

main();
