use std::{fs, io::Write, path::{Path, PathBuf}};
use tauri::Manager;

const MAX_IMPORT_SIZE: u64 = 10 * 1024 * 1024;

fn validate_project_id(project_id: &str) -> Result<(), String> {
    if project_id.is_empty() || project_id.len() > 100 || !project_id.chars().all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_')) {
        return Err("项目 ID 不合法".into());
    }
    Ok(())
}

fn projects_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| format!("无法确定应用数据目录：{error}"))?.join("projects");
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建项目目录：{error}"))?;
    Ok(dir)
}

fn atomic_write(target: &Path, contents: &[u8]) -> Result<(), String> {
    let extension = target.extension().and_then(|value| value.to_str()).unwrap_or("json");
    let temporary = target.with_extension(format!("{extension}.tmp"));
    let backup = target.with_extension(format!("{extension}.bak"));
    let mut file = fs::File::create(&temporary).map_err(|error| format!("无法创建临时文件：{error}"))?;
    file.write_all(contents).and_then(|_| file.sync_all()).map_err(|error| format!("无法写入临时文件：{error}"))?;
    if backup.exists() { fs::remove_file(&backup).map_err(|error| format!("无法轮换备份：{error}"))?; }
    if target.exists() { fs::rename(target, &backup).map_err(|error| format!("无法创建备份：{error}"))?; }
    if let Err(error) = fs::rename(&temporary, target) {
        if backup.exists() { let _ = fs::rename(&backup, target); }
        return Err(format!("无法替换项目文件：{error}"));
    }
    Ok(())
}

#[tauri::command]
fn save_project(app: tauri::AppHandle, project_id: String, contents: String) -> Result<(), String> {
    validate_project_id(&project_id)?;
    serde_json::from_str::<serde_json::Value>(&contents).map_err(|_| "拒绝保存无效 JSON".to_string())?;
    atomic_write(&projects_dir(&app)?.join(format!("{project_id}.json")), contents.as_bytes())
}

#[tauri::command]
fn read_project(app: tauri::AppHandle, project_id: String) -> Result<Option<String>, String> {
    validate_project_id(&project_id)?;
    let target = projects_dir(&app)?.join(format!("{project_id}.json"));
    let backup = target.with_extension("json.bak");
    match fs::read_to_string(&target) {
        Ok(value) if serde_json::from_str::<serde_json::Value>(&value).is_ok() => Ok(Some(value)),
        _ if backup.exists() => {
            let value = fs::read_to_string(backup).map_err(|error| format!("项目及备份均无法读取：{error}"))?;
            if serde_json::from_str::<serde_json::Value>(&value).is_ok() { Ok(Some(value)) } else { Err("项目文件及备份均已损坏".into()) }
        },
        _ if target.exists() => Err("项目文件已损坏且没有可用备份".into()),
        _ => Ok(None),
    }
}

#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let mut projects = Vec::new();
    for entry in fs::read_dir(projects_dir(&app)?).map_err(|error| format!("无法列出项目：{error}"))? {
        let entry = match entry { Ok(value) => value, Err(_) => continue };
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") { continue; }
        if let Ok(value) = fs::read_to_string(&path) {
            if serde_json::from_str::<serde_json::Value>(&value).is_ok() { projects.push(value); continue; }
        }
        let backup = path.with_extension("json.bak");
        if let Ok(value) = fs::read_to_string(backup) {
            if serde_json::from_str::<serde_json::Value>(&value).is_ok() { projects.push(value); }
        }
    }
    Ok(projects)
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    validate_project_id(&project_id)?;
    let target = projects_dir(&app)?.join(format!("{project_id}.json"));
    let backup = target.with_extension("json.bak");
    let temporary = target.with_extension("json.tmp");
    for path in [&target, &backup, &temporary] {
        if path.exists() { fs::remove_file(path).map_err(|error| format!("无法删除项目文件：{error}"))?; }
    }
    Ok(())
}

fn validate_external_json_path(path: &Path) -> Result<(), String> {
    if path.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("json")) != Some(true) {
        return Err("只能读写 .json 文件".into());
    }
    Ok(())
}

#[tauri::command]
fn read_external_json(path: PathBuf) -> Result<String, String> {
    validate_external_json_path(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| format!("无法读取所选文件：{error}"))?;
    if metadata.len() > MAX_IMPORT_SIZE { return Err("项目文件超过 10 MB 限制".into()); }
    fs::read_to_string(path).map_err(|error| format!("无法读取所选文件：{error}"))
}

#[tauri::command]
fn write_external_json(path: PathBuf, contents: String) -> Result<(), String> {
    validate_external_json_path(&path)?;
    serde_json::from_str::<serde_json::Value>(&contents).map_err(|_| "拒绝导出无效 JSON".to_string())?;
    atomic_write(&path, contents.as_bytes())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_project, read_project, list_projects, delete_project, read_external_json, write_external_json])
        .run(tauri::generate_context!())
        .expect("GalNavi failed to start");
}
