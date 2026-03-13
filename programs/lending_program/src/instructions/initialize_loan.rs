use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked},
};
use crate::state::{Loan, STATUS_OFFERED};

#[derive(Accounts)]
pub struct InitializeOffer<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,

    pub loan_mint: InterfaceAccount<'info, Mint>,
    
    #[account(
        mut,
        constraint = lender_loan_ata.mint == loan_mint.key(),
        constraint = lender_loan_ata.owner == lender.key(),
    )]
    pub lender_loan_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = lender,
        space = 8 + Loan::INIT_SPACE,
        seeds = [b"loan", lender.key().as_ref(), loan_mint.key().as_ref()],
        bump
    )]
    pub loan_account: Account<'info, Loan>,

    #[account(
        init,
        payer = lender,
        seeds = [b"vault", loan_account.key().as_ref()],
        bump,
        token::mint = loan_mint,
        token::authority = loan_account,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_offer_handler(
    ctx: Context<InitializeOffer>,
    loan_amount: u64,
    collateral_amount: u64,
    repayment_amount: u64,
    expiry: i64,
    collateral_mint: Pubkey,
) -> Result<()> {
    let loan = &mut ctx.accounts.loan_account;
    loan.lender = ctx.accounts.lender.key();
    loan.borrower = Pubkey::default();
    loan.loan_mint = ctx.accounts.loan_mint.key();
    loan.loan_amount = loan_amount;
    loan.collateral_mint = collateral_mint;
    loan.collateral_amount = collateral_amount;
    loan.repayment_amount = repayment_amount;
    loan.expiry = expiry;
    loan.status = STATUS_OFFERED;
    loan.bump = ctx.bumps.loan_account;

    // Transfer loan amount from lender to vault
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.lender_loan_ata.to_account_info(),
        mint: ctx.accounts.loan_mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.lender.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    transfer_checked(cpi_ctx, loan_amount, ctx.accounts.loan_mint.decimals)?;

    Ok(())
}
