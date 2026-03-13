use anchor_lang::prelude::*;

#[error_code]
pub enum LendingError {
    #[msg("Invalid loan status for this operation.")]
    InvalidStatus,
    #[msg("Loan has not expired yet.")]
    LoanNotExpired,
    #[msg("Loan has already expired.")]
    LoanExpired,
    #[msg("Unauthorized access.")]
    Unauthorized,
    #[msg("Price variance between oracles is too high.")]
    OraclePriceVariance,
    #[msg("Collateral value is insufficient.")]
    InsufficientCollateral,
    #[msg("Calculation error.")]
    CalculationError,
}
