pub mod html;
pub mod video;

use crate::model::{BindTransform, ConditionOp, Project};

pub fn resolve_bindings(project: &Project, row: &serde_json::Map<String, serde_json::Value>) -> Project {
    let mut p = project.clone();
    for scene in &mut p.scenes {
        for obj in &mut scene.objects {
            if let Some(ref cond) = obj.condition {
                let col_val = row
                    .get(&cond.column)
                    .map(|v| match v {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Number(n) => n.to_string(),
                        serde_json::Value::Bool(b) => b.to_string(),
                        serde_json::Value::Null => String::new(),
                        _ => v.to_string(),
                    })
                    .unwrap_or_default();

                let visible = match cond.operator {
                    ConditionOp::Equals => col_val == cond.value,
                    ConditionOp::NotEquals => col_val != cond.value,
                    ConditionOp::Empty => col_val.is_empty(),
                    ConditionOp::NotEmpty => !col_val.is_empty(),
                    ConditionOp::GreaterThan => col_val.parse::<f64>().unwrap_or(0.0) > cond.value.parse::<f64>().unwrap_or(0.0),
                    ConditionOp::LessThan => col_val.parse::<f64>().unwrap_or(0.0) < cond.value.parse::<f64>().unwrap_or(0.0),
                    ConditionOp::Contains => col_val.contains(&cond.value),
                };
                obj.visible = visible;
            }

            for binding in &obj.data_bindings {
                let raw_val = row
                    .get(&binding.column)
                    .map(|v| match v {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Number(n) => n.to_string(),
                        serde_json::Value::Bool(b) => b.to_string(),
                        serde_json::Value::Null => String::new(),
                        _ => v.to_string(),
                    })
                    .unwrap_or_default();

                let val = match &binding.transform {
                    BindTransform::None => raw_val,
                    BindTransform::Uppercase => raw_val.to_uppercase(),
                    BindTransform::Lowercase => raw_val.to_lowercase(),
                    BindTransform::FormatCurrency { symbol, decimals } => {
                        let num: f64 = raw_val.parse().unwrap_or(0.0);
                        format!("{}{:.prec$}", symbol, num, prec = *decimals as usize)
                    }
                    BindTransform::ImagePath { prefix } => {
                        format!("{}{}", prefix, raw_val)
                    }
                };

                match binding.property.as_str() {
                    "content" => obj.content = val,
                    "style.fill" => obj.style.fill = val,
                    "style.stroke" => obj.style.stroke = val,
                    "visible" => obj.visible = val == "true" || val == "1",
                    _ => {}
                }
            }
        }
    }
    p
}

pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}
