use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::data::{csv_source::CsvConnector, postgres::PostgresConnector, sqlite::SqliteConnector, DataConnector};
use crate::state::AppState;

#[derive(Serialize)]
pub struct TablesResult {
    pub tables: Vec<String>,
}

#[derive(Serialize)]
pub struct ColumnResult {
    pub name: String,
    pub data_type: String,
}

#[derive(Serialize)]
pub struct RowsResponse {
    pub rows: Vec<serde_json::Map<String, Value>>,
    pub total: u32,
}

#[tauri::command]
pub fn data_connect(
    state: State<'_, AppState>,
    source_type: String,
    connection: String,
) -> Result<TablesResult, String> {
    let connector: Box<dyn DataConnector> = match source_type.as_str() {
        "Sqlite" => Box::new(SqliteConnector::new(&connection)?),
        "Csv" => Box::new(CsvConnector::new(&connection)?),
        "Postgres" => Box::new(PostgresConnector::new(&connection)?),
        _ => return Err(format!("Unsupported source type: {}", source_type)),
    };

    let tables = connector.tables()?;
    let mut data_conn = state.data_connection.lock().map_err(|e| e.to_string())?;
    *data_conn = Some(connector);

    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let ds_type = match source_type.as_str() {
        "Sqlite" => crate::model::DataSourceType::Sqlite,
        "Csv" => crate::model::DataSourceType::Csv,
        "Postgres" => crate::model::DataSourceType::Postgres,
        _ => crate::model::DataSourceType::Sqlite,
    };
    project.data_source = Some(crate::model::DataSource {
        source_type: ds_type,
        connection: connection.clone(),
        table: tables.first().cloned().unwrap_or_default(),
        preview_row: 0,
    });
    project.touch();

    Ok(TablesResult { tables })
}

#[tauri::command]
pub fn data_tables(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let conn = state.data_connection.lock().map_err(|e| e.to_string())?;
    let connector = conn.as_ref().ok_or("No data source connected")?;
    connector.tables()
}

#[tauri::command]
pub fn data_columns(state: State<'_, AppState>, table: String) -> Result<Vec<ColumnResult>, String> {
    let conn = state.data_connection.lock().map_err(|e| e.to_string())?;
    let connector = conn.as_ref().ok_or("No data source connected")?;
    let cols = connector.columns(&table)?;
    Ok(cols
        .into_iter()
        .map(|c| ColumnResult {
            name: c.name,
            data_type: c.data_type,
        })
        .collect())
}

#[tauri::command]
pub fn data_rows(
    state: State<'_, AppState>,
    table: String,
    offset: u32,
    limit: u32,
) -> Result<RowsResponse, String> {
    let conn = state.data_connection.lock().map_err(|e| e.to_string())?;
    let connector = conn.as_ref().ok_or("No data source connected")?;
    let result = connector.rows(&table, offset, limit)?;
    Ok(RowsResponse {
        rows: result.rows,
        total: result.total,
    })
}

#[tauri::command]
pub fn data_select_table(state: State<'_, AppState>, table: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut ds) = project.data_source {
        ds.table = table;
    }
    project.touch();
    Ok(())
}

#[tauri::command]
pub fn data_set_preview_row(
    state: State<'_, AppState>,
    row: u32,
) -> Result<Option<serde_json::Map<String, Value>>, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut ds) = project.data_source {
        ds.preview_row = row;
    }
    let table = project
        .data_source
        .as_ref()
        .map(|ds| ds.table.clone())
        .unwrap_or_default();
    project.touch();
    drop(project);

    let conn = state.data_connection.lock().map_err(|e| e.to_string())?;
    if let Some(ref connector) = *conn {
        let result = connector.rows(&table, row, 1)?;
        return Ok(result.rows.into_iter().next());
    }
    Ok(None)
}

#[tauri::command]
pub fn data_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.data_connection.lock().map_err(|e| e.to_string())?;
    *conn = None;

    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    project.data_source = None;
    project.touch();
    Ok(())
}
