import { FC, useState } from 'react';
import { useAnchor } from '../hooks/useAnchor';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { Droplets, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const Faucet: FC = () => {
    const { program, wallet } = useAnchor();
    const [loading, setLoading] = useState(false);

    const handleGetTardis = async () => {
        if (!wallet.publicKey || !program) return;

        try {
            setLoading(true);
            const [tardisMint] = PublicKey.findProgramAddressSync(
                [Buffer.from("tardis")],
                program.programId
            );

            const userTokenAccount = await getAssociatedTokenAddress(
                tardisMint,
                wallet.publicKey
            );

            const tx = await program.methods
                .requestFaucet()
                .accounts({
                    user: wallet.publicKey,
                    tardisMint: tardisMint,
                    userTokenAccount: userTokenAccount,
                    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .rpc();

            console.log("Tx:", tx);
            toast.success("Received 1,000 TARDIS!");
        } catch (error) {
            console.error(error);
            toast.error("Faucet failed. Check console.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleGetTardis}
            disabled={loading || !wallet.publicKey || !program}
            style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                padding: '0.5rem 1rem', 
                backgroundColor: 'rgba(20, 241, 149, 0.2)', 
                color: '#14F195', 
                border: '1px solid #14F195', 
                borderRadius: '8px', 
                cursor: 'pointer',
                opacity: (loading || !wallet.publicKey || !program) ? 0.5 : 1
            }}
        >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Droplets className="w-4 h-4" />}
            Get 1,000 TARDIS
        </button>
    );
};
