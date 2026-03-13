use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Loan {
    pub lender: Pubkey,
    pub borrower: Pubkey,
    pub collateral_mint: Pubkey,
    pub loan_mint: Pubkey,
    pub collateral_amount: u64,
    pub loan_amount: u64,
    pub repayment_amount: u64,
    pub expiry: i64,
    pub status: u8, // 0: Requested, 1: Offered, 2: Active, 3: Repaid, 4: Liquidated
    pub bump: u8,
}

pub const STATUS_REQUESTED: u8 = 0;
pub const STATUS_OFFERED: u8 = 1;
pub const STATUS_ACTIVE: u8 = 2;
pub const STATUS_REPAID: u8 = 3;
pub const STATUS_LIQUIDATED: u8 = 4;

// TARDIS Mint Seeds (for program-owned mint)
pub const TARDIS_SEED: &[u8] = b"tardis";
pub const FAUCET_AMOUNT: u64 = 1_000_000_000; // 1,000 TARDIS (assuming 6 decimals)
