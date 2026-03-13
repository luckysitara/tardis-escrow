use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked},
};
use crate::state::{Loan, STATUS_ACTIVE, STATUS_LIQUIDATED};
use crate::error::LendingError;
use crate::instructions::check_asset_value;

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,

    #[account(mut)]
    pub borrower: SystemAccount<'info>,

    pub loan_mint: InterfaceAccount<'info, Mint>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = lender_collateral_ata.mint == collateral_mint.key(),
        constraint = lender_collateral_ata.owner == lender.key(),
    )]
    pub lender_collateral_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"loan", lender.key().as_ref(), loan_mint.key().as_ref()],
        bump = loan_account.bump,
        has_one = lender @ LendingError::Unauthorized,
        constraint = loan_account.status == STATUS_ACTIVE @ LendingError::InvalidStatus,
    )]
    pub loan_account: Account<'info, Loan>,

    #[account(
        mut,
        seeds = [b"collateral_vault", loan_account.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = loan_account,
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Pyth Price Feed
    pub pyth_price_info: AccountInfo<'info>,
    /// CHECK: Switchboard Price Feed
    pub switchboard_price_info: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn liquidate_handler(ctx: Context<Liquidate>) -> Result<()> {
    let clock = Clock::get()?;
    let loan = &mut ctx.accounts.loan_account;

    // 1. Check if loan has expired
    require!(clock.unix_timestamp > loan.expiry, LendingError::LoanNotExpired);

    // 2. Validate collateral value
    let _collateral_price = check_asset_value(
        &ctx.accounts.pyth_price_info,
        &ctx.accounts.switchboard_price_info,
    )?;

    // 3. Transfer collateral to lender
    let seeds = &[
        b"loan",
        loan.lender.as_ref(),
        loan.loan_mint.as_ref(),
        &[loan.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts_vault = TransferChecked {
        from: ctx.accounts.collateral_vault.to_account_info(),
        mint: ctx.accounts.collateral_mint.to_account_info(),
        to: ctx.accounts.lender_collateral_ata.to_account_info(),
        authority: loan.to_account_info(),
    };
    let cpi_ctx_vault = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts_vault,
        signer_seeds,
    );
    transfer_checked(cpi_ctx_vault, loan.collateral_amount, ctx.accounts.collateral_mint.decimals)?;

    loan.status = STATUS_LIQUIDATED;

    Ok(())
}
