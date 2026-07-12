const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Inicializamos Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Usamos gemini-1.5-flash que es rapidísimo y excelente para tareas de texto estructurado
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    // Le damos instrucciones fijas de comportamiento (System Instructions)
    systemInstruction: `Sos un asistente experto en atención al cliente para una tienda de repuestos automotores especializada en mangueras y bombas de agua. 
    Tu objetivo es responder si un producto es compatible con el vehículo del cliente basándote estrictamente en el "Número de pieza" provisto.
    
    Reglas de comportamiento:
    1. Sé amable, profesional y directo.
    2. Si estás 100% seguro de que el número de pieza aplica al auto consultado (modelo, año y motor), confirmalo con seguridad.
    3. Si tenés la más mínima duda, o si el cliente no especificó el año exacto, motor o modelo de su auto, respondé amablemente solicitando los datos faltantes (por ejemplo: "Para confirmarte con exactitud, ¿me podrías pasar el año y motorización de tu auto, o los últimos dígitos del chasis?"). Nunca arriesgues una respuesta afirmativa si hay ambigüedad.
    4. Tus respuestas deben ser concisas, pensadas para leerse rápido en la sección de preguntas de Mercado Libre.
    5. si el cliente pregunta si hay stock de la pieza responde que sí, que hay stock y que puede comprarla sin problemas. Todas nuestras piezas publicadas estan disponibles.
    6.Si el cliente pregunta por  algo que no tiene que ver con la compatibilidad de la pieza, respondé amablemente y no le preguntes sobre la pieza.
    `
});

// Guardado temporal de tokens (Luego se persistirán para no perderlos al reiniciar)
let accessToken = process.env.MELI_ACCESS_TOKEN; 
let refreshToken = process.env.MELI_REFRESH_TOKEN;

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

        accessToken = response.data.access_token;
        refreshToken = response.data.refresh_token;

       
        console.log("=== NUEVOS TOKENS ===");
        console.log("Access Token:", accessToken);
        console.log("Refresh Token:", refreshToken);
        console.log("=====================");

        res.send('Autenticación exitosa. Tokens guardados en memoria.');
    } catch (error) {
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
    console.log("Token que estoy usando:", accessToken.substring(0, 15) + "...");
    const notification = req.body;
    console.log("==> WEBHOOK RECIBIDO:", JSON.stringify(notification));
    
    

    if (notification.topic === 'questions') {
        try {
            console.log(`[Webhook] Nueva pregunta detectada en el recurso: ${notification.resource}`);
            
            // Extraemos el ID de la pregunta desde el recurso (ej: "/questions/123456")
            const questionId = notification.resource.split('/').pop();

            // 2. Buscar detalles de la pregunta
            const questionData = await obtenerDetallesPregunta(questionId);
            if (questionData.status !== 'ANSWERED') { // Evitamos responder preguntas viejas
                const preguntaTexto = questionData.text;
                const itemId = questionData.item_id;
                
                console.log(`Pregunta recibida: "${preguntaTexto}" para el ítem: ${itemId}`);

                // 3. Buscar el Número de pieza del producto
                const numeroPieza = await obtenerNumeroPieza(itemId);
                console.log(`Número de pieza identificado en la publicación: ${numeroPieza}`);

                // 4. Consultar a Gemini
                const respuestaIA = await consultarGemini(preguntaTexto, numeroPieza);
                console.log(`Gemini generó la respuesta: "${respuestaIA}"`);

                // 5. Enviar la respuesta a Mercado Libre
                await enviarRespuestaMeli(questionId, respuestaIA);
                console.log(`[Éxito] Respuesta enviada correctamente a la pregunta ${questionId}`);
            }
        } catch (err) {
            console.error('Error procesando el flujo automático:', err.message);
        }
    }
});

// Función para obtener el texto de la pregunta y el item_id
async function obtenerDetallesPregunta(questionId) {
    const url = `https://api.mercadolibre.com/questions/${questionId}`;
    const res = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    return res.data;
}


// // VERSIÓN DE PRUEBA: Simulamos la respuesta para saltear el bloqueo de Test Users
// async function obtenerNumeroPieza(itemId) {
//     console.log(`[Modo Prueba] Simulando búsqueda para el ítem ${itemId}...`);
    
//     // Acá simulás el número de pieza que vos quieras para testear a Gemini
//     // Por ejemplo, el número de pieza de una bomba de agua real de Clio:
//     const numeroPiezaSimulado = "90386398 / 93270308"; 
    
//     return numeroPiezaSimulado;
// }





// Función para extraer el número de pieza de los atributos técnicos del ítem
async function obtenerNumeroPieza(itemId) {
    const url = `https://api.mercadolibre.com/items/${itemId}`;
    
    try {
        const res = await axios.get(url, { 
            headers: { 
                'Authorization': `Bearer ${accessToken}`,
                // Esta línea es la clave para que no te bloquee el firewall:
                'User-Agent': 'BotRespuestasAuto/1.0', 
                'Accept': 'application/json'
            } 
        });
        
        const atributos = res.data.attributes || [];
        const attrNumeroPieza = atributos.find(attr => attr.id === 'PART_NUMBER');
        return attrNumeroPieza ? attrNumeroPieza.value_name : "No especificado";
        
    } catch (error) {
        // Si hay error, imprimimos la respuesta exacta de Mercado Libre
        console.error(`[Error en Ítem] Falla al buscar el producto ${itemId}:`);
        console.error(error.response ? error.response.data : error.message);
        // Lanzamos el error para detener el flujo de esta pregunta
        throw error; 
    }
}





// Función para interactuar con la API de Gemini
async function consultarGemini(pregunta, numeroPieza) {
    const prompt = `Un cliente pregunta: "${pregunta}". \nEl número de pieza del repuesto que está mirando es: "${numeroPieza}". \n¿Es compatible? Respondé siguiendo tus instrucciones de sistema.`;
    const result = await model.generateContent(prompt);
    return result.response.text();
}

/**
 * =================================================================
 * ENDPOINT DE PRUEBA: Aislar Gemini para testear desde Postman
 * =================================================================
 */
app.post('/test-gemini', async (req, res) => {
    try {
        const { pregunta, numeroPieza } = req.body;

        if (!pregunta || !numeroPieza) {
            return res.status(400).json({ error: "El JSON debe incluir 'pregunta' y 'numeroPieza'." });
        }

        console.log(`\n[Test IA] Evaluando compatibilidad...`);
        console.log(`Pieza: ${numeroPieza} | Vehículo/Pregunta: "${pregunta}"`);

        // Llamamos a la misma función de Gemini que usa el bot real
        const respuestaIA = await consultarGemini(pregunta, numeroPieza);
        
        console.log(`[Test IA] Respuesta generada:\n${respuestaIA}\n`);

        res.json({
            exito: true,
            respuesta_generada: respuestaIA
        });

    } catch (error) {
        console.error('[Test IA] Error en la IA:', error.message);
        res.status(500).json({ 
            exito: false, 
            error: error.message,
            detalle: error.response ? error.response.data : "Error desconocido"
        });
    }
});


// Función para publicar la respuesta en Mercado Libre
async function enviarRespuestaMeli(questionId, textoRespuesta) {
    const url = `https://api.mercadolibre.com/answers`;
    await axios.post(url, {
        question_id: questionId,
        text: textoRespuesta
    }, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
}

app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));