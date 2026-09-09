#![forbid(unsafe_code)]

pub mod arithmetic;
pub mod error;
pub mod itf;

pub use arithmetic::{add, subtract};
pub use error::DomainError;
pub use itf::{calculate_itf, ITF_RATE};
