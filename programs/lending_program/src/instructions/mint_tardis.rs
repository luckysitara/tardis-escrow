use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenInterface},
};

#[derive(Accounts)]
pub struct InitializeMint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        seeds = [b"tardis"],
        bump,
        mint::decimals = 6,
        mint::authority = tardis_mint,
    )]
    pub tardis_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_mint_handler(_ctx: Context<InitializeMint>) -> Result<()> {
    // The mint is initialized via the constraints above.
    // The authority is set to the mint PDA itself, making it program-controlled.
    Ok(())
}
