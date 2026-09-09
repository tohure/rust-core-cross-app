#![forbid(unsafe_code)]

pub mod arithmetic;
pub mod card;
pub mod cci;
pub mod crypto;
pub mod error;
pub mod itf;
pub mod transfer;

pub use arithmetic::{add, subtract};
pub use card::{validate_card, ValidCard};
pub use cci::{validate_cci, ValidCci};
pub use crypto::{decrypt, encrypt};
pub use error::DomainError;
pub use itf::{calculate_itf, ITF_RATE};
pub use transfer::{execute_transfer, Account, TransferRequest, TransferResult};
