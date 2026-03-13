import * as anchor from "@coral-xyz/anchor";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount, 
  mintTo 
} from "@solana/spl-token";
import { 
  Connection, 
  Keypair, 
  LAMPORTS_PER_SOL, 
  clusterApiUrl 
} from "@solana/web3.js";
import fs from "fs";

async function main() {
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    const payer = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
    );

    console.log("Payer:", payer.publicKey.toBase58());

    // 1. Create Collateral Mint (SOL Mock)
    const collateralMint = await createMint(connection, payer, payer.publicKey, null, 9);
    console.log("Collateral Mint (SOL-Mock):", collateralMint.toBase58());

    // 2. Create Loan Mint (USDC Mock)
    const loanMint = await createMint(connection, payer, payer.publicKey, null, 6);
    console.log("Loan Mint (USDC-Mock):", loanMint.toBase58());

    // 3. Create ATAs for Payer
    const collateralAta = await getOrCreateAssociatedTokenAccount(connection, payer, collateralMint, payer.publicKey);
    const loanAta = await getOrCreateAssociatedTokenAccount(connection, payer, loanMint, payer.publicKey);

    // 4. Mint tokens to Payer
    await mintTo(connection, payer, collateralMint, collateralAta.address, payer.publicKey, 100 * 1e9);
    await mintTo(connection, payer, loanMint, loanAta.address, payer.publicKey, 1000 * 1e6);

    console.log("Done! Minted 100 Collateral and 1000 Loan tokens.");
}

main();
