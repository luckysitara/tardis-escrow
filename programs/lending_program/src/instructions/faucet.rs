use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface, mint_to, MintTo},
    associated_token::AssociatedToken,
};
use crate::state::FAUCET_AMOUNT;

#[derive(Accounts)]
pub struct RequestFaucet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"tardis"],
        bump,
        mint::authority = tardis_mint,
    )]
    pub tardis_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = tardis_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn request_faucet_handler(ctx: Context<RequestFaucet>) -> Result<()> {
    // Mint 1,000 TARDIS to the user
    let bump = ctx.bumps.tardis_mint;
    let seeds = &[
        b"tardis".as_ref(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = MintTo {
        mint: ctx.accounts.tardis_mint.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.tardis_mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    mint_to(cpi_ctx, FAUCET_AMOUNT)?;

    Ok(())
}
