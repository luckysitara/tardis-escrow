import { 
  Connection, 
  Keypair, 
  PublicKey, 
  clusterApiUrl 
} from "@solana/web3.js";
import { 
  getOrCreateAssociatedTokenAccount, 
  transfer 
} from "@solana/spl-token";
import fs from "fs";

async function main() {
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    const payer = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
    );

    const browserWallet = new PublicKey(process.argv[2]);
    const collateralMint = new PublicKey("6iXuxae5ZiJHufCUTsSWvuDua9k1GBSZ58dCqMepiwqA");
    const loanMint = new PublicKey("3YA9GN8R93cGfcRoqizWRJhXzaExJvFhqco9g6yAt8io");

    console.log(`Transferring tokens from CLI (${payer.publicKey.toBase58()}) to Browser (${browserWallet.toBase58()})...`);

    // Transfer Collateral
    const fromColAta = await getOrCreateAssociatedTokenAccount(connection, payer, collateralMint, payer.publicKey);
    const toColAta = await getOrCreateAssociatedTokenAccount(connection, payer, collateralMint, browserWallet);
    await transfer(connection, payer, fromColAta.address, toColAta.address, payer.publicKey, 2 * 1e9);
    console.log("Transferred 10 Collateral Mock Tokens");

    // Transfer Loan tokens (so you can test repayment later)
    const fromLoanAta = await getOrCreateAssociatedTokenAccount(connection, payer, loanMint, payer.publicKey);
    const toLoanAta = await getOrCreateAssociatedTokenAccount(connection, payer, loanMint, browserWallet);
    await transfer(connection, payer, fromLoanAta.address, toLoanAta.address, payer.publicKey, 100 * 1e6);
    console.log("Transferred 100 Loan Mock Tokens");

    console.log("Done! You can now test in the UI.");
}

main();
