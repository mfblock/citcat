use rusqlite::Connection;
use serde_json::Value;

use super::{ColumnInfo, DataConnector, RowsResult};

pub struct SqliteConnector {
    conn: Connection,
}

impl SqliteConnector {
    pub fn new(path: &str) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| format!("SQLite open: {}", e))?;
        Ok(Self { conn })
    }
}

impl DataConnector for SqliteConnector {
    fn tables(&self) -> Result<Vec<String>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .map_err(|e| format!("SQLite tables: {}", e))?;

        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("SQLite tables query: {}", e))?;

        let mut result = Vec::new();
        for name in rows {
            result.push(name.map_err(|e| format!("SQLite row: {}", e))?);
        }
        Ok(result)
    }

    fn columns(&self, table: &str) -> Result<Vec<ColumnInfo>, String> {
        let sql = format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\""));
        let mut stmt = self
            .conn
            .prepare(&sql)
            .map_err(|e| format!("SQLite columns: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| format!("SQLite columns query: {}", e))?;

        let mut result = Vec::new();
        for r in rows {
            let (name, dtype) = r.map_err(|e| format!("SQLite column row: {}", e))?;
            result.push(ColumnInfo {
                name,
                data_type: dtype,
            });
        }
        Ok(result)
    }

    fn row_count(&self, table: &str) -> Result<u32, String> {
        let sql = format!("SELECT COUNT(*) FROM \"{}\"", table.replace('"', "\"\""));
        self.conn
            .query_row(&sql, [], |row| row.get::<_, u32>(0))
            .map_err(|e| format!("SQLite count: {}", e))
    }

    fn rows(&self, table: &str, offset: u32, limit: u32) -> Result<RowsResult, String> {
        let total = self.row_count(table)?;
        let cols = self.columns(table)?;

        let sql = format!(
            "SELECT * FROM \"{}\" LIMIT {} OFFSET {}",
            table.replace('"', "\"\""),
            limit,
            offset
        );
        let mut stmt = self
            .conn
            .prepare(&sql)
            .map_err(|e| format!("SQLite rows: {}", e))?;

        let col_count = cols.len();
        let mut result_rows = Vec::new();

        let rows = stmt
            .query_map([], |row| {
                let mut map = serde_json::Map::new();
                for i in 0..col_count {
                    let val: Value = match row.get_ref(i) {
                        Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                        Ok(rusqlite::types::ValueRef::Integer(n)) => Value::Number(n.into()),
                        Ok(rusqlite::types::ValueRef::Real(f)) => {
                            serde_json::Number::from_f64(f)
                                .map(Value::Number)
                                .unwrap_or(Value::Null)
                        }
                        Ok(rusqlite::types::ValueRef::Text(s)) => {
                            Value::String(String::from_utf8_lossy(s).to_string())
                        }
                        Ok(rusqlite::types::ValueRef::Blob(_)) => Value::String("[blob]".to_string()),
                        Err(_) => Value::Null,
                    };
                    map.insert(cols[i].name.clone(), val);
                }
                Ok(map)
            })
            .map_err(|e| format!("SQLite rows query: {}", e))?;

        for r in rows {
            result_rows.push(r.map_err(|e| format!("SQLite row: {}", e))?);
        }

        Ok(RowsResult {
            rows: result_rows,
            total,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sqlite_connection_and_query() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL);
             INSERT INTO products VALUES (1, 'Widget', 9.99);
             INSERT INTO products VALUES (2, 'Gadget', 19.99);
             INSERT INTO products VALUES (3, 'Doohickey', 4.50);"
        ).unwrap();

        let path = std::env::temp_dir().join("citcat_test.db");
        let path_str = path.to_string_lossy().to_string();
        conn.execute(&format!("VACUUM INTO '{}'", path_str), []).unwrap();

        let connector = SqliteConnector::new(&path_str).unwrap();

        let tables = connector.tables().unwrap();
        assert!(tables.contains(&"products".to_string()));

        let cols = connector.columns("products").unwrap();
        assert_eq!(cols.len(), 3);
        assert_eq!(cols[0].name, "id");
        assert_eq!(cols[1].name, "name");
        assert_eq!(cols[2].name, "price");

        let total = connector.row_count("products").unwrap();
        assert_eq!(total, 3);

        let result = connector.rows("products", 0, 10).unwrap();
        assert_eq!(result.total, 3);
        assert_eq!(result.rows.len(), 3);
        assert_eq!(result.rows[0]["name"], Value::String("Widget".to_string()));

        let result2 = connector.rows("products", 1, 2).unwrap();
        assert_eq!(result2.rows.len(), 2);
        assert_eq!(result2.rows[0]["name"], Value::String("Gadget".to_string()));

        let _ = std::fs::remove_file(&path);
    }
}
