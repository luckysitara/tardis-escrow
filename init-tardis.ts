import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    // 1. Setup Provider (uses Anchor.toml config)
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    // 2. Load IDL manually to avoid TS import issues
    const idlPath = path.join(__dirname, 'target', 'idl', 'lending_program.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

    const program = new Program(idl as anchor.Idl, provider);

    // 3. Find Mint PDA
    const [tardisMint] = PublicKey.findProgramAddressSync(
        [Buffer.from('tardis')],
        program.programId
    );
    
    console.log('Program ID:', program.programId.toBase58());
    console.log('Initializing TARDIS Mint PDA:', tardisMint.toBase58());

    try {
        const tx = await program.methods
            .initializeTardis()
            .accounts({
                payer: provider.wallet.publicKey,
                tardisMint,
                tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();

        console.log('🚀 Success! Mint Initialized on Devnet.');
        console.log('Transaction Signature:', tx);
    } catch (e: any) {
        if (e.message.includes('already in use')) {
            console.log('✅ TARDIS Mint already initialized.');
        } else {
            throw e;
        }
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
