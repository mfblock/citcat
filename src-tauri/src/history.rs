use crate::model::Project;

pub struct HistoryEntry {
    pub snapshot: String,
    pub description: String,
}

pub struct History {
    entries: Vec<HistoryEntry>,
    current: usize,
    max_entries: usize,
}

impl History {
    pub fn new(max_entries: usize) -> Self {
        Self {
            entries: Vec::new(),
            current: 0,
            max_entries,
        }
    }

    pub fn push(&mut self, project: &Project, description: &str) {
        let snapshot = serde_json::to_string(project).unwrap_or_default();
        self.entries.truncate(self.current);
        self.entries.push(HistoryEntry {
            snapshot,
            description: description.to_string(),
        });
        if self.entries.len() > self.max_entries {
            self.entries.remove(0);
        }
        self.current = self.entries.len();
    }

    pub fn undo(&mut self) -> Option<Project> {
        if self.current <= 1 {
            return None;
        }
        self.current -= 1;
        self.entries.get(self.current - 1).and_then(|entry| {
            serde_json::from_str(&entry.snapshot).ok()
        })
    }

    pub fn redo(&mut self) -> Option<Project> {
        if self.current >= self.entries.len() {
            return None;
        }
        let project = self.entries.get(self.current).and_then(|entry| {
            serde_json::from_str(&entry.snapshot).ok()
        });
        self.current += 1;
        project
    }

    pub fn can_undo(&self) -> bool {
        self.current > 1
    }

    pub fn can_redo(&self) -> bool {
        self.current < self.entries.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_undo_redo() {
        let mut history = History::new(50);
        let p1 = Project::new("Step 1", 1920, 1080, 30);
        history.push(&p1, "initial");

        let mut p2 = p1.clone();
        p2.meta.name = "Step 2".to_string();
        history.push(&p2, "renamed");

        assert!(history.can_undo());
        let restored = history.undo().unwrap();
        assert_eq!(restored.meta.name, "Step 1");

        assert!(history.can_redo());
        let restored = history.redo().unwrap();
        assert_eq!(restored.meta.name, "Step 2");
    }

    #[test]
    fn test_undo_at_beginning_returns_none() {
        let mut history = History::new(50);
        assert!(!history.can_undo());
        assert!(history.undo().is_none());
    }

    #[test]
    fn test_push_truncates_redo_stack() {
        let mut history = History::new(50);
        let p1 = Project::new("A", 100, 100, 30);
        history.push(&p1, "a");

        let p2 = Project::new("B", 100, 100, 30);
        history.push(&p2, "b");

        history.undo();

        let p3 = Project::new("C", 100, 100, 30);
        history.push(&p3, "c");

        assert!(!history.can_redo());
    }
}
