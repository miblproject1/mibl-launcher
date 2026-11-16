const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

// Создаем холст 1024x1024
const canvas = createCanvas(1024, 1024);
const ctx = canvas.getContext('2d');

// Загружаем исходное изображение
loadImage('new-icon.png').then(image => {
    // Очищаем холст прозрачностью
    ctx.clearRect(0, 0, 1024, 1024);
    
    // Рисуем белый фон (для правильного отображения прозрачности)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Вычисляем размеры для центрирования
    const size = Math.min(image.width, image.height);
    const x = (1024 - size) / 2;
    const y = (1024 - size) / 2;
    
    // Рисуем изображение с закругленными углами
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 20); // 20px радиус скругления
    ctx.closePath();
    ctx.clip();
    
    ctx.drawImage(image, x, y, size, size);
    ctx.restore();
    
    // Сохраняем в файл
    const out = fs.createWriteStream('app-icon.png');
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    
    out.on('finish', () => {
        console.log('Изображение успешно обработано');
        // Удаляем скрипт
        fs.unlinkSync('process_icon.js');
    });
});