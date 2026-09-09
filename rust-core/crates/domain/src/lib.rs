#![forbid(unsafe_code)]

pub mod arithmetic;
pub mod card;
pub mod cci;
pub mod error;
pub mod itf;

pub use arithmetic::{add, subtract};
pub use card::{validate_card, ValidCard};
pub use cci::{validate_cci, ValidCci};
pub use error::DomainError;
pub use itf::{calculate_itf, ITF_RATE};
