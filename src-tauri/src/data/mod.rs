pub mod sqlite;
pub mod csv_source;
pub mod postgres;

use serde_json::Value;

pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
}

pub struct RowsResult {
    pub rows: Vec<serde_json::Map<String, Value>>,
    pub total: u32,
}

pub trait DataConnector: Send {
    fn tables(&self) -> Result<Vec<String>, String>;
    fn columns(&self, table: &str) -> Result<Vec<ColumnInfo>, String>;
    fn rows(&self, table: &str, offset: u32, limit: u32) -> Result<RowsResult, String>;
    fn row_count(&self, table: &str) -> Result<u32, String>;
}
