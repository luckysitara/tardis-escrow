use anchor_lang::prelude::*;
use crate::instructions::*;

declare_id!("AgrWR4tV2EkujabgQJt1sTM1jKuDL8CU3T8ug251tQV1");

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

#[program]
pub mod lending_program {
    use super::*;

    // --- TARDIS Token Logic ---
    pub fn initialize_tardis(ctx: Context<InitializeMint>) -> Result<()> {
        initialize_mint_handler(ctx)
    }

    pub fn request_faucet(ctx: Context<RequestFaucet>) -> Result<()> {
        request_faucet_handler(ctx)
    }

    // --- Lending Logic ---
    pub fn initialize_offer(
        ctx: Context<InitializeOffer>,
        loan_amount: u64,
        collateral_amount: u64,
        repayment_amount: u64,
        expiry: i64,
        collateral_mint: Pubkey,
    ) -> Result<()> {
        initialize_offer_handler(ctx, loan_amount, collateral_amount, repayment_amount, expiry, collateral_mint)
    }

    pub fn accept_offer(ctx: Context<AcceptOffer>) -> Result<()> {
        accept_offer_handler(ctx)
    }

    pub fn repay_loan(ctx: Context<RepayLoan>) -> Result<()> {
        repay_loan_handler(ctx)
    }

    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        liquidate_handler(ctx)
    }
}
