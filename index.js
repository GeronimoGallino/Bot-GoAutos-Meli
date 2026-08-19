const express = require('express');
const axios = require('axios');
require('dotenv').config();

// Importaciones modularizadas
const { respuestasFijas } = require('./config');
const { clasificarPregunta, consultarGemini } = require('./services/gemini');
// IMPORTANTE: Ya no importamos obtenerDetallesItem porque ahora usamos la BD local
const { obtenerDetallesPregunta, enviarRespuestaMeli, renovarToken } = require('./services/meli');
const { enviarAlertaTelegram } = require('./services/telegram');
const db = require('./services/db');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Set para bloquear notificaciones duplicadas y evitar la condición de carrera
const preguntasEnProceso = new Set();

app.get('/', (req, res) => res.send('Bot Activo.'));

app.get('/login', (req, res) => {
    const meliAuthUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${process.env.MELI_APP_ID}&redirect_uri=${encodeURIComponent(process.env.MELI_REDIRECT_URI)}`;
    res.redirect(meliAuthUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Falta el código.');
    
    try {
        const response = await axios.post('https://api.mercadolibre.com/oauth/token', {
            grant_type: 'authorization_code',
            client_id: process.env.MELI_APP_ID,
            client_secret: process.env.MELI_CLIENT_SECRET,
            code: code,
            redirect_uri: process.env.MELI_REDIRECT_URI
        }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        const nuevoAccessToken = response.data.access_token;
        const nuevoRefreshToken = response.data.refresh_token;
        const userId = response.data.user_id;
        const expiresIn = response.data.expires_in; 
        
        const fechaVencimiento = new Date(Date.now() + (expiresIn * 1000));

        const query = `
            INSERT INTO meli_tokens (user_id, access_token, refresh_token, expires_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                access_token = EXCLUDED.access_token,
                refresh_token = EXCLUDED.refresh_token,
                expires_at = EXCLUDED.expires_at,
                updated_at = CURRENT_TIMESTAMP;
        `;
        const values = [userId, nuevoAccessToken, nuevoRefreshToken, fechaVencimiento];

        await db.query(query, values);

        console.log("=== TOKENS GUARDADOS EN POSTGRESQL ===");
        console.log("Usuario ID:", userId);
        console.log("Vence el:", fechaVencimiento.toLocaleString());
        console.log("======================================");

        res.send('Autenticación exitosa. Los tokens se guardaron de forma segura en la base de datos.');
    } catch (error) {
        console.error("Error en OAuth:", error.response ? error.response.data : error.message);
        res.status(500).send('Error en OAuth.');
    }
});

/**
 * =================================================================
 * FLUJO DEL BOT: WEBHOOK -> MERCADO LIBRE -> GEMINI -> RESPUESTA
 * =================================================================
 */

app.post('/webhooks/meli', async (req, res) => {
    res.sendStatus(200);
    
    const notification = req.body;
    console.log("==> WEBHOOK RECIBIDO:", JSON.stringify(notification));

    if (notification.topic === 'questions') {
        const questionId = notification.resource.split('/').pop();
        const sellerId = notification.user_id.toString();

        const modoBot = process.env.MODO_BOT || 'TEST';
        const testUserId = process.env.TEST_USER_ID;
        const prodUserId = process.env.PROD_USER_ID;

        if (modoBot === 'TEST' && sellerId !== testUserId) {
            console.log(`[Entorno TEST] Ignorando pregunta de la cuenta Real (${sellerId}). El bot no intervendrá.`);
            return; // Corta el flujo. La pregunta queda sin responder por el bot.
        }

        if (modoBot === 'PROD' && sellerId !== prodUserId) {
            console.log(`[Entorno PROD] Ignorando pregunta de la cuenta Test (${sellerId}).`);
            return; 
        }

        if (preguntasEnProceso.has(questionId)) {
            console.log(`[Webhook] Ignorando notificación duplicada para la pregunta: ${questionId}`);
            return;
        }

        preguntasEnProceso.add(questionId);
        
        setTimeout(() => {
            if (preguntasEnProceso.has(questionId)) {
                console.log(`[Seguridad] Removiendo pregunta ${questionId} por timeout de procesamiento.`);
                preguntasEnProceso.delete(questionId);
            }
        }, 60000);

        try {
            const dbRes = await db.query('SELECT access_token, refresh_token, expires_at FROM meli_tokens WHERE user_id = $1', [sellerId.toString()]);
            
            if (dbRes.rows.length === 0) {
                console.error(`[Base de Datos] No se encontró un token para el usuario ${sellerId}`);
                preguntasEnProceso.delete(questionId);
                return; 
            }

            let tokenDinamico = dbRes.rows[0].access_token;
            const refreshTokenBD = dbRes.rows[0].refresh_token;
            const expiresAtBD = new Date(dbRes.rows[0].expires_at);
            const ahora = new Date();

            const margenSeguridad = new Date(ahora.getTime() + 5 * 60000);

            if (margenSeguridad >= expiresAtBD) {
                console.log(`[Token] El token del vendedor ${sellerId} está vencido o por vencer. Renovando automáticamente...`);
                
                try {
                    const nuevosTokens = await renovarToken(refreshTokenBD);
                    
                    tokenDinamico = nuevosTokens.access_token; 
                    const nuevoRefreshTokenBD = nuevosTokens.refresh_token;
                    const nuevaFechaVencimiento = new Date(Date.now() + (nuevosTokens.expires_in * 1000));

                    await db.query(`
                        UPDATE meli_tokens 
                        SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = $4
                    `, [tokenDinamico, nuevoRefreshTokenBD, nuevaFechaVencimiento, sellerId.toString()]);
                    
                    console.log(`[Token] Renovación exitosa. Nueva fecha de vencimiento: ${nuevaFechaVencimiento.toLocaleString()}`);
                } catch (errorRenovacion) {
                    console.error(`[Token] Falló la renovación automática para el vendedor ${sellerId}.`);
                    preguntasEnProceso.delete(questionId);
                    return; 
                }
            } else {
                console.log(`[Token] Usando token de BD para el vendedor ${sellerId} (Válido hasta ${expiresAtBD.toLocaleString()})`);
            }

            console.log(`[Webhook] Nueva pregunta detectada: ${questionId}`);

            const questionData = await obtenerDetallesPregunta(questionId, tokenDinamico);
            if (questionData.status !== 'ANSWERED') { 
                const preguntaTexto = questionData.text;
                const itemId = questionData.item_id;
                
                console.log(`Pregunta recibida: "${preguntaTexto}" para el ítem: ${itemId}`);

                // =================================================================
                // NUEVA LÓGICA: Consultamos los datos en nuestra propia BD
                // =================================================================
                const queryProducto = `SELECT titulo_meli, oem, compatibilidad FROM productos WHERE meli_item_id = $1 LIMIT 1`;
                const dbProdRes = await db.query(queryProducto, [itemId]);

                if (dbProdRes.rows.length === 0) {
                    console.log(`[Alerta] El producto ${itemId} no está en la base de datos local. Derivando a manual.`);
                    await enviarAlertaTelegram(preguntaTexto, "Desconocido", questionId, itemId);
                    preguntasEnProceso.delete(questionId);
                    return;
                }

                // Armamos un objeto con todos los datos clave de la tabla
                const producto = dbProdRes.rows[0];
                console.log(`Ítem BD: "${producto.titulo_meli}" | OEM: ${producto.oem}`);

                console.log(`[Router] Analizando intención de la pregunta...`);
                // Le pasamos a la IA todo el contexto del producto
                const intencion = await clasificarPregunta(preguntaTexto, producto); 
                console.log(`[Router] Intención detectada: ${intencion}`);

                let textoRespuesta = "";

                switch (intencion) {
                    case "STOCK":
                    case "LOCAL":
                    case "AGRADECIMIENTO":
                        textoRespuesta = respuestasFijas[intencion];
                        break;
                    
                    case "COMPATIBILIDAD_SEGURA":
                        textoRespuesta = await consultarGemini(preguntaTexto, producto);
                        break;

                    case "REVISION_MANUAL":
                        await enviarAlertaTelegram(preguntaTexto, producto.oem, questionId, itemId);
                        console.log(`[Atención] Pregunta derivada a REVISIÓN MANUAL: ${questionId}. El bot no responderá.`);
                        preguntasEnProceso.delete(questionId);
                        return; 

                    default:
                        console.log(`[Atención] Intención desconocida (${intencion}). Derivada a manual.`);
                        preguntasEnProceso.delete(questionId);
                        return;
                }

                if (textoRespuesta) {
                    await enviarRespuestaMeli(questionId, textoRespuesta, tokenDinamico);
                    console.log(`[Éxito] Respuesta enviada correctamente a la pregunta ${questionId} con el token de la BD.`);
                }
            }
            
            preguntasEnProceso.delete(questionId);

        } catch (err) {
            console.error('Error procesando el flujo automático:', err.message);
            preguntasEnProceso.delete(questionId);
        }
    }
});

app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));