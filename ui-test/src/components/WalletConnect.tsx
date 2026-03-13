import { FC } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export const WalletConnect: FC = () => {
    return (
        <div className="flex items-center gap-4">
            <WalletMultiButton className="!bg-solana-purple hover:!bg-purple-700 !font-bold !rounded-lg" />
        </div>
    );
};
