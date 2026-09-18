use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DataBinding {
    pub id: String,
    pub property: String,
    pub column: String,
    pub transform: BindTransform,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum BindTransform {
    None,
    Uppercase,
    Lowercase,
    FormatCurrency { symbol: String, decimals: u8 },
    ImagePath { prefix: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VisibilityCondition {
    pub column: String,
    pub operator: ConditionOp,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConditionOp {
    Equals,
    NotEquals,
    Empty,
    NotEmpty,
    GreaterThan,
    LessThan,
    Contains,
}

impl DataBinding {
    pub fn new(property: &str, column: &str, transform: BindTransform) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            property: property.to_string(),
            column: column.to_string(),
            transform,
        }
    }
}
