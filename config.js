// Nuestra fuente de la verdad para respuestas automáticas directas
const respuestasFijas = {
    STOCK: "Hola, si la publicación está activa tenemos stock disponible. Podés comprar sin problemas. ¡Saludos!",
    LOCAL: "Hola, no contamos con local al público. Trabajamos únicamente mediante Mercado Envíos. ¡Saludos!",
    AGRADECIMIENTO: "¡Gracias a vos por tu consulta! Estamos a disposición ante cualquier otra duda."
};

// Prompt que convierte a Gemini en un Router/Clasificador
const promptClasificador = (pregunta, numeroPieza) => `
Sos un sistema clasificador de intenciones para atención al cliente de una tienda de repuestos de autos.
Analizá la siguiente pregunta: "${pregunta}" sobre la pieza con número de parte "${numeroPieza}".

Devolvé ÚNICAMENTE un JSON válido con la siguiente estructura exacta:
{"intencion": "TIPO"}

Donde TIPO debe ser estrictamente UNA de estas opciones:
- "STOCK": Si preguntan si hay stock sobre la pieza publicada, si tienen, o disponibilidad.
- "LOCAL": Si preguntan si se puede retirar, si tienen local, o dónde están ubicados.
- "AGRADECIMIENTO": Si dicen gracias, buen día, o saludan sin hacer una pregunta real.
- "COMPATIBILIDAD_SEGURA": Si preguntan si la pieza aplica a su auto y brindan información (año, motor, modelo).
- "REVISION_MANUAL": Si preguntan por otros repuestos que no están en la publicación, piden links, mencionan medidas físicas (ej. "es más chica"), dicen "mi mecánico me dijo", dan códigos extraños, o si la pregunta es muy confusa.
`;

module.exports = { respuestasFijas, promptClasificador };