// Nuestra fuente de la verdad para respuestas automáticas directas
const respuestasFijas = {
    STOCK: "Hola, si la publicación está activa tenemos stock disponible. Podés comprar sin problemas. ¡Saludos!",
    LOCAL: "Hola, no contamos con local al público. Trabajamos únicamente mediante Mercado Envíos. ¡Saludos!",
    AGRADECIMIENTO: "¡Gracias a vos por tu consulta! Estamos a disposición ante cualquier otra duda."
};

// Prompt que convierte a Gemini en un Router/Clasificador
const promptClasificador = (pregunta, numeroPieza, titulo = "No especificado") =>  `
    Sos un clasificador de intenciones para un vendedor de mangueras y repuestos de autos en Mercado Libre.
    Analizá los datos de nuestro producto y la pregunta del cliente para devolver ÚNICAMENTE una de las siguientes categorías exactas.

    DATOS DE NUESTRO PRODUCTO:
    - Título: "${titulo}"
    - Número de pieza: "${numeroPieza}"

    Devolvé ÚNICAMENTE un JSON válido con la siguiente estructura exacta:
    {"intencion": "TIPO"}

    Donde TIPO debe ser estrictamente UNA de estas opciones:

    CATEGORÍAS PERMITIDAS:
    - "STOCK": Si el cliente pregunta si hay disponibilidad ("¿Tenés stock?", "¿Te queda uno?").
    - "LOCAL": Si preguntan si se puede retirar, si tienen local, o dónde están ubicados.
    - "AGRADECIMIENTO": Si dicen "gracias", "dale, ahí compro", o saludos finales.
    - "COMPATIBILIDAD_SEGURA": ÚNICAMENTE si con los datos brindados por el cliente podes estar 100% SEGURO de que es compatible con nuestro producto.
    
    - "REVISION_MANUAL": Úsala de forma estricta para TODOS los demás casos. Específicamente:
        1. Si le faltan datos al cliente (ej. no aclara qué motor o qué año es su auto). NO pidas los datos faltantes.
        2. Si tenés un 1% de duda sobre la compatibilidad.
        3. Si sabés que la pieza es INCOMPATIBLE.
        4. Si es sobre precios, cuotas, descuentos o reclamos.
        5. Si preguntan por otros repuestos que no están en la publicación, piden links, mencionan medidas físicas (ej. "es más chica"), dicen "mi mecánico me dijo", dan códigos extraños, o si la pregunta es muy confusa.
    Pregunta del cliente: "${pregunta}"
    Devuelve solo el nombre de la categoría, sin explicaciones.
    `;

module.exports = { respuestasFijas, promptClasificador };