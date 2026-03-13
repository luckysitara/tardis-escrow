use anchor_lang::prelude::*;
use crate::error::LendingError;
use switchboard_on_demand::PullFeedAccountData;
use bytemuck::{Pod, Zeroable};

mod initialize_loan;
mod accept_loan;
mod repay_loan;
mod liquidate;
mod mint_tardis;
mod faucet;

pub use initialize_loan::*;
pub use accept_loan::*;
pub use repay_loan::*;
pub use liquidate::*;
pub use mint_tardis::*;
pub use faucet::*;

// -----------------------------------------------------------------
// Lightweight Pyth Price Parsing (No External Crate Required)
// -----------------------------------------------------------------
#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
pub struct PythPriceAccount {
    pub magic: u32,
    pub version: u32,
    pub type_id: u32,
    pub size: u32,
    pub price_type: u32,
    pub exponent: i32,
    pub num_publishers: u32,
    pub num_active_publishers: u32,
    pub last_slot: u64,
    pub valid_slot: u64,
    pub ema_price: i64,
    pub ema_conf: u64,
    pub timestamp: i64,
    pub prev_timestamp: i64,
    pub prev_price: i64,
    pub prev_conf: u64,
    pub prev_slot: u64,
    pub price: i64,
    pub conf: u64,
}

pub fn check_asset_value(
    pyth_price_info: &AccountInfo,
    switchboard_price_info: &AccountInfo,
) -> Result<u64> {
    let clock = Clock::get()?;

    let pyth_data = pyth_price_info.try_borrow_data()?;
    let pyth_price_account = bytemuck::try_from_bytes::<PythPriceAccount>(&pyth_data[..80])
        .map_err(|_| error!(LendingError::CalculationError))?;
    
    require!(clock.slot - pyth_price_account.valid_slot < 60, LendingError::CalculationError);
    
    let pyth_val = pyth_price_account.price as f64 * 10f64.powi(pyth_price_account.exponent);

    let sb_feed = PullFeedAccountData::parse(switchboard_price_info.data.borrow())
        .map_err(|_| error!(LendingError::CalculationError))?;
    let sb_result = sb_feed.get_value(clock.slot, 60, 1, true)
        .map_err(|_| error!(LendingError::CalculationError))?;
    
    let sb_val: f64 = sb_result.try_into()
        .map_err(|_| error!(LendingError::CalculationError))?;

    let variance = (pyth_val - sb_val).abs() / pyth_val;
    if variance > 0.02 {
        return Err(error!(LendingError::OraclePriceVariance));
    }

    Ok(((pyth_val + sb_val) / 2.0 * 1_000_000.0) as u64)
}
