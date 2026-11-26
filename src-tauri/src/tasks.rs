//! Глобальный реестр фоновых задач + события для индикатора в UI.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use crate::models::TaskInfo;

pub static TASKS: LazyLock<Mutex<HashMap<String, TaskInfo>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn snapshot() -> Vec<TaskInfo> {
    let mut list: Vec<TaskInfo> = TASKS.lock().unwrap().values().cloned().collect();
    list.sort_by(|a, b| a.id.cmp(&b.id));
    list
}

fn broadcast(app: &AppHandle) {
    let _ = app.emit("tasks", snapshot());
}

pub struct TaskHandle {
    id: String,
    app: AppHandle,
    done: AtomicU64,
    total: AtomicU64,
    sample: Mutex<(u64, Instant)>,
    speed: Mutex<f64>,
    last_emit: Mutex<Instant>,
    state: Mutex<String>,
    detail: Mutex<String>,
}

impl TaskHandle {
    pub fn new(app: &AppHandle, title: impl Into<String>, kind: impl Into<String>) -> Self {
        let id = uuid::Uuid::new_v4().to_string();
        let info = TaskInfo {
            id: id.clone(),
            title: title.into(),
            kind: kind.into(),
            done: 0,
            total: 0,
            speed: 0.0,
            state: "running".into(),
            detail: String::new(),
        };
        TASKS.lock().unwrap().insert(id.clone(), info);
        broadcast(app);
        Self {
            id,
            app: app.clone(),
            done: AtomicU64::new(0),
            total: AtomicU64::new(0),
            sample: Mutex::new((0, Instant::now())),
            speed: Mutex::new(0.0),
            last_emit: Mutex::new(Instant::now()),
            state: Mutex::new("running".into()),
            detail: Mutex::new(String::new()),
        }
    }

    fn sync(&self, force: bool) {
        let done = self.done.load(Ordering::Relaxed);
        let total = self.total.load(Ordering::Relaxed);
        let now = Instant::now();

        // скорость считаем по окну ~0.4 с
        {
            let mut sample = self.sample.lock().unwrap();
            let dt = now.duration_since(sample.1).as_secs_f64();
            if dt > 0.25 {
                let delta = done.saturating_sub(sample.0) as f64;
                let inst = delta / dt;
                let mut sp = self.speed.lock().unwrap();
                *sp = if *sp <= 0.0 { inst } else { *sp * 0.7 + inst * 0.3 };
                *sample = (done, now);
            }
        }

        let mut last = self.last_emit.lock().unwrap();
        if !force && now.duration_since(*last) < Duration::from_millis(120) {
            return;
        }
        *last = now;
        drop(last);

        let speed = *self.speed.lock().unwrap();
        let state = self.state.lock().unwrap().clone();
        let detail = self.detail.lock().unwrap().clone();
        if let Some(info) = TASKS.lock().unwrap().get_mut(&self.id) {
            info.done = done;
            info.total = total;
            info.speed = speed;
            info.state = state;
            info.detail = detail;
        }
        broadcast(&self.app);
    }

    pub fn set_total(&self, total: u64) {
        self.total.store(total, Ordering::Relaxed);
        self.sync(true);
    }

    /// Начать новый этап задачи (скачали архив — перешли к распаковке).
    pub fn reset(&self, total: u64, detail: impl Into<String>) {
        self.done.store(0, Ordering::Relaxed);
        self.total.store(total, Ordering::Relaxed);
        *self.detail.lock().unwrap() = detail.into();
        *self.speed.lock().unwrap() = 0.0;
        *self.sample.lock().unwrap() = (0, Instant::now());
        self.sync(true);
    }

    pub fn add(&self, n: u64) {
        self.done.fetch_add(n, Ordering::Relaxed);
        self.sync(false);
    }

    pub fn detail(&self, text: impl Into<String>) {
        *self.detail.lock().unwrap() = text.into();
        self.sync(true);
    }

    pub fn finish(&self) {
        let done = self.done.load(Ordering::Relaxed);
        let total = self.total.load(Ordering::Relaxed);
        if total == 0 {
            // Задача без измеримого объёма всё равно должна показать 100%.
            let synthetic = done.max(1);
            self.total.store(synthetic, Ordering::Relaxed);
            self.done.store(synthetic, Ordering::Relaxed);
        } else {
            self.done.store(total, Ordering::Relaxed);
        }
        *self.state.lock().unwrap() = "done".into();
        *self.detail.lock().unwrap() = "Готово".into();
        self.sync(true);
        self.remove_later(2);
    }

    pub fn fail(&self, message: impl Into<String>) {
        *self.state.lock().unwrap() = "error".into();
        *self.detail.lock().unwrap() = message.into();
        self.sync(true);
        self.remove_later(6);
    }

    fn remove_later(&self, secs: u64) {
        let app = self.app.clone();
        let id = self.id.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(secs)).await;
            TASKS.lock().unwrap().remove(&id);
            broadcast(&app);
        });
    }
}

/// Забыть все завершённые задачи (кнопка «очистить»).
pub fn forget_finished(app: &AppHandle) {
    TASKS
        .lock()
        .unwrap()
        .retain(|_, t| t.state == "running");
    broadcast(app);
}
