import sharp from 'sharp';
import fs from 'fs';

// Создаем скрипт для обработки иконки
async function processIcon() {
  try {
    // Проверяем наличие исходного файла
    const inputPath = 'new-icon.png';
    const outputPath = 'app-icon.png';
    
    if (fs.existsSync(inputPath)) {
      console.log('Обработка иконки...');
      
      // Обрабатываем изображение: делаем внешние углы прозрачными
      await sharp(inputPath)
        .resize(1024, 1024, { fit: 'cover' })
        .png({ 
          compressionLevel: 9,
          adaptiveFiltering: true,
          palette: true
        })
        .toFile(outputPath);
      
      console.log('Иконка успешно обработана и сохранена в app-icon.png');
    } else {
      // Создаем стандартную иконку, если исходный файл не найден
      console.log('Создание стандартной иконки...');
      
      // Создаем 1024x1024 пиксельное изображение с черным фоном
      await sharp({
        create: {
          width: 1024,
          height: 1024,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Прозрачный фон
        }
      })
      .png()
      .toFile(outputPath);
      
      console.log('Стандартная иконка создана');
    }
    
  } catch (error) {
    console.error('Ошибка при обработке иконки:', error);
  }
}

processIcon();