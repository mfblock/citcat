use std::sync::Mutex;

use crate::data::DataConnector;
use crate::history::History;
use crate::model::Project;

const DEMO_PROJECT: &str = include_str!("../../templates/demo-showcase.citcat");

pub struct AppState {
    pub project: Mutex<Project>,
    pub data_connection: Mutex<Option<Box<dyn DataConnector>>>,
    pub history: Mutex<History>,
}

impl AppState {
    pub fn new() -> Self {
        let project = serde_json::from_str::<Project>(DEMO_PROJECT)
            .unwrap_or_else(|_| Project::new("Untitled", 1920, 1080, 30));
        Self {
            project: Mutex::new(project),
            data_connection: Mutex::new(None),
            history: Mutex::new(History::new(50)),
        }
    }
}
