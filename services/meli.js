const axios = require('axios');

// Función para obtener el texto de la pregunta y el item_id
async function obtenerDetallesPregunta(questionId, accessToken) {
    const url = `https://api.mercadolibre.com/questions/${questionId}`;
    const res = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    return res.data;
}

// Función para extraer el número de pieza de los atributos técnicos del ítem
async function obtenerNumeroPieza(itemId, accessToken) {
    const url = `https://api.mercadolibre.com/items/${itemId}`;
    
    try {
        const res = await axios.get(url, { 
            headers: { 
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': 'BotRespuestasAuto/1.0', 
                'Accept': 'application/json'
            } 
        });
        
        const atributos = res.data.attributes || [];
        const attrNumeroPieza = atributos.find(attr => attr.id === 'PART_NUMBER');
        return attrNumeroPieza ? attrNumeroPieza.value_name : "No especificado";
        
    } catch (error) {
        console.error(`[Error en Ítem] Falla al buscar el producto ${itemId}:`);
        console.error(error.response ? error.response.data : error.message);
        throw error; 
    }
}

// NUEVA FUNCIÓN: Extrae tanto el título como el número de pieza en un solo viaje
async function obtenerDetallesItem(itemId, accessToken) {
    const url = `https://api.mercadolibre.com/items/${itemId}`;
    
    try {
        const res = await axios.get(url, { 
            headers: { 
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': 'BotRespuestasAuto/1.0', 
                'Accept': 'application/json'
            } 
        });
        
        const titulo = res.data.title || "Sin título";
        const atributos = res.data.attributes || [];
        const attrNumeroPieza = atributos.find(attr => attr.id === 'PART_NUMBER');
        const numeroPieza = attrNumeroPieza ? attrNumeroPieza.value_name : "No especificado";
        
        return {
            titulo,
            numeroPieza
        };
        
    } catch (error) {
        console.error(`[Error en Ítem] Falla al buscar el producto ${itemId}:`);
        console.error(error.response ? error.response.data : error.message);
        throw error; 
    }
}


// // VERSIÓN DE PRUEBA: Simulamos la respuesta para saltear el bloqueo de Test Users
// async function obtenerNumeroPieza(itemId) {
//     console.log(`[Modo Prueba] Simulando búsqueda para el ítem ${itemId}...`);
    
//     // Acá simulás el número de pieza que vos quieras para testear a Gemini
//     // Por ejemplo, el número de pieza de una bomba de agua real de Clio:
//     const numeroPiezaSimulado = "90386398 / 93270308"; 
    
//     return numeroPiezaSimulado;
// }


// Función para publicar la respuesta en Mercado Libre
async function enviarRespuestaMeli(questionId, textoRespuesta, accessToken) {
    const url = `https://api.mercadolibre.com/answers`;
    await axios.post(url, {
        question_id: questionId,
        text: textoRespuesta
    }, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
}



async function renovarToken(refreshToken) {
    const url = 'https://api.mercadolibre.com/oauth/token';
    const data = {
        grant_type: 'refresh_token',
        client_id: process.env.MELI_APP_ID,
        client_secret: process.env.MELI_CLIENT_SECRET,
        refresh_token: refreshToken
    };

    try {
        const res = await axios.post(url, data, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return res.data; // Devuelve access_token, refresh_token, y expires_in nuevos
    } catch (error) {
        console.error("[Meli API] Error renovando token:", error.response ? error.response.data : error.message);
        throw error;
    }
}


module.exports = {
    obtenerDetallesPregunta,
    obtenerNumeroPieza,
    enviarRespuestaMeli,
    renovarToken,
    obtenerDetallesItem
};