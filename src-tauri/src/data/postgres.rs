use crate::data::{ColumnInfo, DataConnector, RowsResult};
use serde_json::Value;
use std::sync::Mutex;

pub struct PostgresConnector {
    client: Mutex<postgres::Client>,
}

impl PostgresConnector {
    pub fn new(connection_string: &str) -> Result<Self, String> {
        let client = postgres::Client::connect(connection_string, postgres::NoTls)
            .map_err(|e| format!("Postgres connection failed: {}", e))?;
        Ok(Self {
            client: Mutex::new(client),
        })
    }
}

impl DataConnector for PostgresConnector {
    fn tables(&self) -> Result<Vec<String>, String> {
        let mut client = self.client.lock().map_err(|e| e.to_string())?;
        let rows = client
            .query(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
                &[],
            )
            .map_err(|e| format!("Query failed: {}", e))?;
        Ok(rows.iter().map(|r| r.get::<_, String>(0)).collect())
    }

    fn columns(&self, table: &str) -> Result<Vec<ColumnInfo>, String> {
        let mut client = self.client.lock().map_err(|e| e.to_string())?;
        let rows = client
            .query(
                "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
                &[&table],
            )
            .map_err(|e| format!("Query failed: {}", e))?;
        Ok(rows
            .iter()
            .map(|r| ColumnInfo {
                name: r.get(0),
                data_type: r.get(1),
            })
            .collect())
    }

    fn rows(&self, table: &str, offset: u32, limit: u32) -> Result<RowsResult, String> {
        let total = self.row_count(table)?;
        let mut client = self.client.lock().map_err(|e| e.to_string())?;
        let safe_table = table.replace(|c: char| !c.is_alphanumeric() && c != '_', "");
        let query = format!(
            "SELECT * FROM \"{}\" LIMIT {} OFFSET {}",
            safe_table, limit, offset
        );
        let rows = client
            .query(&query, &[])
            .map_err(|e| format!("Query failed: {}", e))?;

        let mut result_rows = Vec::new();
        for row in &rows {
            let mut map = serde_json::Map::new();
            for (i, col) in row.columns().iter().enumerate() {
                let val: Value = if let Ok(v) = row.try_get::<_, String>(i) {
                    Value::String(v)
                } else if let Ok(v) = row.try_get::<_, i32>(i) {
                    Value::Number(serde_json::Number::from(v))
                } else if let Ok(v) = row.try_get::<_, i64>(i) {
                    Value::Number(serde_json::Number::from(v))
                } else if let Ok(v) = row.try_get::<_, f64>(i) {
                    serde_json::Number::from_f64(v)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                } else if let Ok(v) = row.try_get::<_, bool>(i) {
                    Value::Bool(v)
                } else {
                    Value::Null
                };
                map.insert(col.name().to_string(), val);
            }
            result_rows.push(map);
        }

        Ok(RowsResult {
            rows: result_rows,
            total,
        })
    }

    fn row_count(&self, table: &str) -> Result<u32, String> {
        let mut client = self.client.lock().map_err(|e| e.to_string())?;
        let safe_table = table.replace(|c: char| !c.is_alphanumeric() && c != '_', "");
        let query = format!("SELECT COUNT(*) FROM \"{}\"", safe_table);
        let row = client
            .query_one(&query, &[])
            .map_err(|e| format!("Count failed: {}", e))?;
        let count: i64 = row.get(0);
        Ok(count as u32)
    }
}
