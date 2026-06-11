/**
 * Web Auditor - Gemini API Integration Module
 * Handles optional AI-powered audits.
 */

/**
 * Cleans HTML to reduce token consumption before sending it to the API.
 * Keeps only structure, meta tags, forms, headers, and semantic elements.
 */
function cleanHTMLForAI(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // 1. Remove heavy elements
  const elementsToRemove = ['svg', 'script', 'style', 'iframe', 'noscript', 'canvas'];
  elementsToRemove.forEach(tag => {
    doc.querySelectorAll(tag).forEach(el => el.remove());
  });

  // 2. Remove comments
  const iterator = doc.createNodeIterator(doc.documentElement, NodeFilter.SHOW_COMMENT);
  let currentNode;
  while (currentNode = iterator.nextNode()) {
    currentNode.parentNode.removeChild(currentNode);
  }

  // 3. Truncate long innerText of paragraph elements or headers to keep layout but avoid huge text bodies
  const textElements = doc.querySelectorAll('p, li, span, a, h1, h2, h3, h4, h5, h6');
  textElements.forEach(el => {
    const text = el.textContent.trim();
    if (text.length > 150) {
      el.textContent = text.substring(0, 140) + '... (texto truncado)';
    }
  });

  // 4. Return clean outerHTML
  return doc.documentElement.outerHTML;
}

/**
 * Performs a deep audit of the cleaned HTML using the Gemini API.
 */
export async function runDeepAIAudit(htmlString, apiKey) {
  if (!apiKey) {
    throw new Error('Se requiere una API Key de Gemini para el análisis con IA.');
  }

  const cleanedHTML = cleanHTMLForAI(htmlString);
  const modelName = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const systemPrompt = `
Actúa como un especialista senior en UX, SEO y optimización de tasa de conversión (CRO).
Analizarás el código HTML provisto para detectar problemas cualitativos de usabilidad, diseño, jerarquía visual, fricción en el registro/compra y SEO avanzado.
Para cada problema detectado, debes asignar una categoría (siempre 'ux'), puntuación de impacto ('high', 'medium', 'low') y esfuerzo estimado de corrección ('high', 'medium', 'low').

Debes responder estrictamente en formato JSON con la siguiente estructura. No incluyas markdown adicional fuera del JSON:
{
  "issues": [
    {
      "category": "ux",
      "title": "Breve título descriptivo del problema en español",
      "description": "Explicación detallada del por qué esto afecta la usabilidad, experiencia del usuario o conversión.",
      "recommendation": "Sugerencia de cambio técnico o de diseño claro y directo para solucionar el problema.",
      "impact": "high" | "medium" | "low",
      "effort": "high" | "medium" | "low",
      "beforeCode": "Código HTML problemático actual (relevante para el problema, extraído del HTML provisto)",
      "afterCode": "Código HTML propuesto ya corregido que el usuario puede copiar"
    }
  ]
}
`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          { text: `Aquí está el código HTML a auditar:\n\n\`\`\`html\n${cleanedHTML}\n\`\`\`` }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorMessage = `Error en la API de Gemini: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch (e) {
        // Fallback to basic HTTP details if response is not JSON
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) {
      throw new Error('No se recibió respuesta del modelo de IA.');
    }

    const parsedResult = JSON.parse(responseText.trim());
    
    if (!parsedResult.issues || !Array.isArray(parsedResult.issues)) {
      throw new Error('La respuesta de la IA no contiene una lista válida de problemas.');
    }

    return parsedResult.issues;
  } catch (error) {
    console.error('Error al ejecutar la auditoría de IA:', error);
    throw error;
  }
}
