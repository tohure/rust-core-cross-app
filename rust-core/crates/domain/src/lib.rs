#![forbid(unsafe_code)]

pub mod arithmetic;
pub mod error;

pub use arithmetic::{add, subtract};
pub use error::DomainError;
