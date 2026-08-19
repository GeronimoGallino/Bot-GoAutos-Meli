const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Inicializamos Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    systemInstruction: `Sos un asistente experto en atención al cliente para una tienda de repuestos automotores especializada en Mercado Libre.
    Tu objetivo es responder a los clientes basándote ÚNICAMENTE en la información técnica estricta que se te provee.
    
    Reglas de comportamiento:
    1. Sé amable, profesional y directo.
    2. Las respuestas deben ser concisas, pensadas para leerse rápido.
    3. NUNCA inventes información de compatibilidad.
    4. NUNCA le hagas preguntas de seguimiento al cliente (por ejemplo, NO preguntes "qué año es tu auto").`
});

// Función que actúa como Router inicial (Ahora incluye el JSON de la BD)
async function clasificarPregunta(pregunta, producto) {
    const prompt = `
    Sos un clasificador estricto de intenciones. 
    Analizá la pregunta del cliente en base a nuestros datos de producto y devolvé un JSON válido.
    
    DATOS DEL PRODUCTO EN BASE DE DATOS:
    - Título: "${producto.titulo_meli}"
    - Número OEM: "${producto.oem}"
    - Tabla estricta de compatibilidad (JSON): ${producto.compatibilidad}

    CATEGORÍAS PERMITIDAS:
    - "STOCK": Si el cliente pregunta si hay disponibilidad ("¿Tenés stock?", "¿Te queda?").
    - "LOCAL": Si pregunta por envíos, ubicaciones o retiro en persona.
    - "AGRADECIMIENTO": Agradecimientos o saludos finales.
    - "COMPATIBILIDAD_SEGURA": ÚNICAMENTE si el auto del cliente (modelo y año) coincide EXACTAMENTE con alguno de los vehículos listados en la "Tabla estricta de compatibilidad".
    - "REVISION_MANUAL": En cualquier otro caso. Si falta el año en la pregunta, si el año no está en el rango permitido, o si pregunta por otra cosa.

    Pregunta del cliente: "${pregunta}"
    
    Devolvé ÚNICAMENTE un JSON con este formato exacto:
    {"intencion": "TIPO_DE_INTENCION"}
    `;
    
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }]}],
        generationConfig: { responseMimeType: "application/json" }
    });
    
    try {
        const respuestaJSON = JSON.parse(result.response.text());
        return respuestaJSON.intencion;
    } catch (error) {
        console.error("[Router] Error parseando JSON:", result.response.text());
        return "REVISION_MANUAL"; 
    }
}

// Función para redactar la respuesta (Con contexto inyectado)
async function consultarGemini(pregunta, producto) {
    const prompt = `
    El sistema ya validó que este producto ES TOTALMENTE COMPATIBLE con el vehículo del cliente.
    
    DETALLES DE NUESTRO REPUESTO:
    - Título: "${producto.titulo_meli}"
    - Número de pieza de fábrica (OEM): "${producto.oem}"
    
    PREGUNTA DEL CLIENTE:
    "${pregunta}"

    INSTRUCCIONES:
    - Redactá una respuesta confirmando la compatibilidad de forma segura, amable y directa.
    - Podés usar un tono cercano (ej: "Hola, ¿cómo estás? Sí, te confirmo que le va perfecto a tu auto. Esperamos tu compra!").
    - BAJO NINGÚN PUNTO DE VISTA le hagas preguntas de seguimiento al cliente.
    - No expliques que "verificaste en la base de datos", respondé como si lo supieras naturalmente.
    `;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
}

// Exportamos los servicios
module.exports = {
    clasificarPregunta,
    consultarGemini
};