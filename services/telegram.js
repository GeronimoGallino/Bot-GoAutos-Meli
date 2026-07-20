const axios = require('axios');
require('dotenv').config();

async function enviarAlertaTelegram(pregunta, numeroPieza, questionId, itemId) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
        console.log("[Telegram] Faltan credenciales en el .env. No se envió la alerta.");
        return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    // Armamos el mensaje con formato (negritas y emojis)
    const mensaje = `🚨 *ATENCIÓN MANUAL REQUERIDA* 🚨\n\n` +
                    `*Pregunta:* "${pregunta}"\n` +
                    `*Pieza Consultada:* ${numeroPieza}\n` +
                    `*ID del Ítem:* ${itemId}\n\n` +
                    `🔗 [Ir al panel de preguntas de Mercado Libre](https://questions.mercadolibre.com.ar/seller/questions)`;

    try {
        await axios.post(url, {
            chat_id: chatId,
            text: mensaje,
            parse_mode: 'Markdown' // Permite usar los asteriscos para negritas
        });
        console.log(`[Telegram] Alerta enviada con éxito para la pregunta ${questionId}`);
    } catch (error) {
        console.error(`[Telegram] Error enviando alerta:`, error.response ? error.response.data : error.message);
    }
}

module.exports = { enviarAlertaTelegram };