const { execSync } = require('child_process');
const fs = require('fs');

// Проверка наличия Tauri CLI
try {
  execSync('tauri --version', { stdio: 'ignore' });
} catch (error) {
  console.error('Tauri CLI не установлен. Установите его с помощью: npm install -g @tauri-apps/cli');
  process.exit(1);
}

// Проверка наличия иконок
const iconPath = './src-tauri/icons';
if (!fs.existsSync(iconPath)) {
  fs.mkdirSync(iconPath, { recursive: true });
  console.log('Создана папка для иконок:', iconPath);
}

console.log('Используем Tauri для создания иконок...');
console.log('Запуск команды: tauri icon ./src-tauri/icons/icon.png');

try {
  execSync('tauri icon ./src-tauri/icons/icon.png', { stdio: 'inherit' });
  console.log('Иконки успешно созданы!');
} catch (error) {
  console.error('Ошибка при создании иконок:', error.message);
}