const { GoogleGenerativeAI } = require('@google/generative-ai');
const { promptClasificador } = require('../config'); // Importamos el prompt desde la raíz
require('dotenv').config();

// Inicializamos Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
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

// Función que actúa como Router inicial
async function clasificarPregunta(pregunta, numeroPieza) {
    const prompt = promptClasificador(pregunta, numeroPieza);
    
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

// Función para interactuar con la API de Gemini
async function consultarGemini(pregunta, numeroPieza) {
    const prompt = `Un cliente pregunta: "${pregunta}". \nEl número de pieza del repuesto que está mirando es: "${numeroPieza}". \n¿Es compatible? Respondé siguiendo tus instrucciones de sistema.`;
    const result = await model.generateContent(prompt);
    return result.response.text();
}

// Exportamos los servicios
module.exports = {
    clasificarPregunta,
    consultarGemini
};