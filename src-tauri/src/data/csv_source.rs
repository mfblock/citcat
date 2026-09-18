use serde_json::Value;
use std::fs::File;

use super::{ColumnInfo, DataConnector, RowsResult};

pub struct CsvConnector {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
}

impl CsvConnector {
    pub fn new(path: &str) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| format!("CSV open: {}", e))?;
        let mut reader = csv::ReaderBuilder::new()
            .has_headers(true)
            .from_reader(file);

        let headers: Vec<String> = reader
            .headers()
            .map_err(|e| format!("CSV headers: {}", e))?
            .iter()
            .map(|s| s.to_string())
            .collect();

        let mut rows = Vec::new();
        for result in reader.records() {
            let record = result.map_err(|e| format!("CSV row: {}", e))?;
            let row: Vec<String> = record.iter().map(|s| s.to_string()).collect();
            rows.push(row);
        }

        Ok(Self { headers, rows })
    }
}

impl DataConnector for CsvConnector {
    fn tables(&self) -> Result<Vec<String>, String> {
        Ok(vec!["data".to_string()])
    }

    fn columns(&self, _table: &str) -> Result<Vec<ColumnInfo>, String> {
        Ok(self
            .headers
            .iter()
            .map(|h| ColumnInfo {
                name: h.clone(),
                data_type: "TEXT".to_string(),
            })
            .collect())
    }

    fn row_count(&self, _table: &str) -> Result<u32, String> {
        Ok(self.rows.len() as u32)
    }

    fn rows(&self, _table: &str, offset: u32, limit: u32) -> Result<RowsResult, String> {
        let total = self.rows.len() as u32;
        let start = (offset as usize).min(self.rows.len());
        let end = (start + limit as usize).min(self.rows.len());

        let mut result_rows = Vec::new();
        for row in &self.rows[start..end] {
            let mut map = serde_json::Map::new();
            for (i, header) in self.headers.iter().enumerate() {
                let val = row.get(i).cloned().unwrap_or_default();
                if let Ok(n) = val.parse::<i64>() {
                    map.insert(header.clone(), Value::Number(n.into()));
                } else if let Ok(f) = val.parse::<f64>() {
                    if let Some(num) = serde_json::Number::from_f64(f) {
                        map.insert(header.clone(), Value::Number(num));
                    } else {
                        map.insert(header.clone(), Value::String(val));
                    }
                } else {
                    map.insert(header.clone(), Value::String(val));
                }
            }
            result_rows.push(map);
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
    use std::io::Write;

    #[test]
    fn test_csv_connection_and_query() {
        let path = std::env::temp_dir().join("citcat_test.csv");
        {
            let mut f = File::create(&path).unwrap();
            writeln!(f, "id,name,price").unwrap();
            writeln!(f, "1,Widget,9.99").unwrap();
            writeln!(f, "2,Gadget,19.99").unwrap();
            writeln!(f, "3,Doohickey,4.50").unwrap();
        }

        let connector = CsvConnector::new(&path.to_string_lossy()).unwrap();

        let tables = connector.tables().unwrap();
        assert_eq!(tables, vec!["data"]);

        let cols = connector.columns("data").unwrap();
        assert_eq!(cols.len(), 3);
        assert_eq!(cols[0].name, "id");
        assert_eq!(cols[1].name, "name");
        assert_eq!(cols[2].name, "price");

        let total = connector.row_count("data").unwrap();
        assert_eq!(total, 3);

        let result = connector.rows("data", 0, 10).unwrap();
        assert_eq!(result.total, 3);
        assert_eq!(result.rows.len(), 3);
        assert_eq!(result.rows[0]["name"], Value::String("Widget".to_string()));

        let result2 = connector.rows("data", 1, 2).unwrap();
        assert_eq!(result2.rows.len(), 2);

        let _ = std::fs::remove_file(&path);
    }
}
