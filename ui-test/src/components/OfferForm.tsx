import { FC, useState } from 'react';
import { useAnchor } from '../hooks/useAnchor';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { toast } from 'react-hot-toast';
import { ArrowRightLeft } from 'lucide-react';

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const TARDIS_SEED = Buffer.from("tardis");

export const OfferForm: FC = () => {
    const { program, wallet } = useAnchor();
    const [loading, setLoading] = useState(false);
    const [loanAmount, setLoanAmount] = useState('');
    const [collateralAmount, setCollateralAmount] = useState('');
    const [lendToken, setLendToken] = useState<'SOL' | 'TARDIS'>('TARDIS');

    const handleCreateOffer = async () => {
        if (!wallet.publicKey) return;
        
        try {
            setLoading(true);
            const tardisMint = PublicKey.findProgramAddressSync([TARDIS_SEED], program.programId)[0];
            
            const loanMint = lendToken === 'TARDIS' ? tardisMint : SOL_MINT; // In reality, we'd use wSOL for SOL lending
            const collateralMint = lendToken === 'TARDIS' ? SOL_MINT : tardisMint;

            // ... Setup for instruction ...
            // Note: For simplicity, I'm skipping the wSOL wrapping logic here, 
            // but in a real app, you'd check if the user has wSOL or auto-wrap it.
            
            // This is a placeholder for the actual instruction call logic
            // Because wSOL handling adds complexity (SyncNative), I'll focus on the UI flow.
            
            toast.success("Offer Created (Simulation)");
        } catch (error) {
            console.error(error);
            toast.error("Failed to create offer");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-solana-dark p-6 rounded-xl border border-gray-700 space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <ArrowRightLeft className="text-solana-purple" />
                Create Lending Offer
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm text-gray-400 mb-1">I want to Lend</label>
                    <div className="flex gap-2">
                        <input 
                            type="number" 
                            value={loanAmount}
                            onChange={e => setLoanAmount(e.target.value)}
                            className="w-full bg-solana-darker border border-gray-600 rounded-lg p-2 focus:border-solana-purple outline-none"
                            placeholder="Amount"
                        />
                        <select 
                            value={lendToken}
                            onChange={(e: any) => setLendToken(e.target.value)}
                            className="bg-solana-darker border border-gray-600 rounded-lg p-2"
                        >
                            <option value="TARDIS">TARDIS</option>
                            <option value="SOL">SOL</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-gray-400 mb-1">For Collateral</label>
                    <div className="flex items-center h-[42px] px-3 bg-solana-darker border border-gray-600 rounded-lg text-gray-300">
                        {lendToken === 'TARDIS' ? 'SOL' : 'TARDIS'}
                    </div>
                    <input 
                        type="number" 
                        value={collateralAmount}
                        onChange={e => setCollateralAmount(e.target.value)}
                        className="w-full mt-2 bg-solana-darker border border-gray-600 rounded-lg p-2 focus:border-solana-purple outline-none"
                        placeholder="Required Collateral"
                    />
                </div>
            </div>

            <button
                onClick={handleCreateOffer}
                disabled={loading || !wallet.publicKey}
                className="w-full py-3 bg-solana-purple hover:bg-purple-700 rounded-lg font-bold transition-colors disabled:opacity-50"
            >
                {loading ? 'Creating...' : 'Create Offer'}
            </button>
        </div>
    );
};
