use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked},
};
use crate::state::{Loan, STATUS_ACTIVE, STATUS_REPAID};
use crate::error::LendingError;

#[derive(Accounts)]
pub struct RepayLoan<'info> {
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
        constraint = lender_loan_ata.mint == loan_mint.key(),
        constraint = lender_loan_ata.owner == lender.key(),
    )]
    pub lender_loan_ata: Box<InterfaceAccount<'info, TokenAccount>>,

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
        has_one = borrower @ LendingError::Unauthorized,
        has_one = lender @ LendingError::Unauthorized,
        constraint = loan_account.status == STATUS_ACTIVE @ LendingError::InvalidStatus,
    )]
    pub loan_account: Box<Account<'info, Loan>>,

    #[account(
        mut,
        seeds = [b"collateral_vault", loan_account.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = loan_account,
    )]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn repay_loan_handler(ctx: Context<RepayLoan>) -> Result<()> {
    let loan = &mut ctx.accounts.loan_account;

    // 1. Borrower repays lender (amount + interest)
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.borrower_loan_ata.to_account_info(),
        mint: ctx.accounts.loan_mint.to_account_info(),
        to: ctx.accounts.lender_loan_ata.to_account_info(),
        authority: ctx.accounts.borrower.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    transfer_checked(cpi_ctx, loan.repayment_amount, ctx.accounts.loan_mint.decimals)?;

    // 2. Vault releases collateral back to borrower
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
        to: ctx.accounts.borrower_collateral_ata.to_account_info(),
        authority: loan.to_account_info(),
    };
    let cpi_ctx_vault = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts_vault,
        signer_seeds,
    );
    transfer_checked(cpi_ctx_vault, loan.collateral_amount, ctx.accounts.collateral_mint.decimals)?;

    loan.status = STATUS_REPAID;

    Ok(())
}
