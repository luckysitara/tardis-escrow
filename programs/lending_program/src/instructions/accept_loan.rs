use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked},
};
use crate::state::{Loan, STATUS_OFFERED, STATUS_ACTIVE};
use crate::error::LendingError;
use crate::instructions::check_asset_value;

#[derive(Accounts)]
pub struct AcceptOffer<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,

    #[account(mut)]
    pub lender: SystemAccount<'info>,

    pub loan_mint: InterfaceAccount<'info, Mint>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = borrower_loan_ata.mint == loan_mint.key(),
        constraint = borrower_loan_ata.owner == borrower.key(),
    )]
    pub borrower_loan_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = borrower_collateral_ata.mint == collateral_mint.key(),
        constraint = borrower_collateral_ata.owner == borrower.key(),
    )]
    pub borrower_collateral_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"loan", lender.key().as_ref(), loan_mint.key().as_ref()],
        bump = loan_account.bump,
        constraint = loan_account.status == STATUS_OFFERED @ LendingError::InvalidStatus,
        constraint = loan_account.collateral_mint == collateral_mint.key() @ LendingError::Unauthorized,
    )]
    pub loan_account: Box<Account<'info, Loan>>,

    #[account(
        mut,
        seeds = [b"vault", loan_account.key().as_ref()],
        bump,
        token::mint = loan_mint,
        token::authority = loan_account,
    )]
    pub loan_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = borrower,
        seeds = [b"collateral_vault", loan_account.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = loan_account,
    )]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Pyth Price Feed
    pub pyth_price_info: AccountInfo<'info>,
    /// CHECK: Switchboard Price Feed
    pub switchboard_price_info: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn accept_offer_handler(ctx: Context<AcceptOffer>) -> Result<()> {
    let loan = &mut ctx.accounts.loan_account;

    // 1. Check asset value
    let collateral_price = check_asset_value(
        &ctx.accounts.pyth_price_info,
        &ctx.accounts.switchboard_price_info,
    )?;

    let collateral_value = (loan.collateral_amount as u128)
        .checked_mul(collateral_price as u128)
        .ok_or(LendingError::CalculationError)?
        .checked_div(1_000_000)
        .ok_or(LendingError::CalculationError)? as u64;
    
    // Enforce 150% Collateralization (LTV)
    let required_collateral_value = (loan.loan_amount as u128)
        .checked_mul(150)
        .ok_or(LendingError::CalculationError)?
        .checked_div(100)
        .ok_or(LendingError::CalculationError)? as u64;

    require!(collateral_value >= required_collateral_value, LendingError::InsufficientCollateral);

    // 2. Transfer collateral from borrower to collateral_vault
    let cpi_accounts_collateral = TransferChecked {
        from: ctx.accounts.borrower_collateral_ata.to_account_info(),
        mint: ctx.accounts.collateral_mint.to_account_info(),
        to: ctx.accounts.collateral_vault.to_account_info(),
        authority: ctx.accounts.borrower.to_account_info(),
    };
    let cpi_ctx_collateral = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts_collateral,
    );
    transfer_checked(cpi_ctx_collateral, loan.collateral_amount, ctx.accounts.collateral_mint.decimals)?;

    // 3. Transfer loan amount from loan_vault to borrower
    let seeds = &[
        b"loan",
        loan.lender.as_ref(),
        loan.loan_mint.as_ref(),
        &[loan.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts_loan = TransferChecked {
        from: ctx.accounts.loan_vault.to_account_info(),
        mint: ctx.accounts.loan_mint.to_account_info(),
        to: ctx.accounts.borrower_loan_ata.to_account_info(),
        authority: loan.to_account_info(),
    };
    let cpi_ctx_loan = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts_loan,
        signer_seeds,
    );
    transfer_checked(cpi_ctx_loan, loan.loan_amount, ctx.accounts.loan_mint.decimals)?;

    loan.borrower = ctx.accounts.borrower.key();
    loan.status = STATUS_ACTIVE;

    Ok(())
}
