/**
 * Web Auditor - Static HTML Parser Module
 * Analyzes HTML string using browser's DOMParser and executes audits.
 */

export function auditHTML(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  
  const issues = [];
  
  // Helper to add issues
  function addIssue({ category, title, description, recommendation, impact, effort, beforeCode = '', afterCode = '' }) {
    issues.push({
      id: `${category}-${Math.random().toString(36).substr(2, 9)}`,
      category,
      title,
      description,
      recommendation,
      impact, // 'high' | 'medium' | 'low'
      effort, // 'high' | 'medium' | 'low'
      beforeCode,
      afterCode
    });
  }

  // --- 1. SEO AUDIT ---
  // A. Title Tag
  const titleTag = doc.querySelector('title');
  if (!titleTag) {
    addIssue({
      category: 'seo',
      title: 'Falta la etiqueta de título (<title>)',
      description: 'El título es el elemento SEO más importante de la página. Indica a los motores de búsqueda el tema del sitio y se muestra en los resultados de búsqueda (SERP).',
      recommendation: 'Agrega una etiqueta <title> dentro del <head> con un texto descriptivo.',
      impact: 'high',
      effort: 'low',
      beforeCode: '<head>\n  <!-- Falta título -->\n</head>',
      afterCode: '<head>\n  <title>Título Descriptivo y Atractivo (50-60 caracteres)</title>\n</head>'
    });
  } else {
    const titleText = titleTag.textContent.trim();
    if (titleText.length < 30) {
      addIssue({
        category: 'seo',
        title: 'El título es demasiado corto',
        description: `El título actual tiene ${titleText.length} caracteres. Un título demasiado corto no aprovecha el espacio disponible en los resultados de búsqueda para incluir palabras clave.`,
        recommendation: 'Amplía el título para incluir palabras clave relevantes y el nombre de la marca (idealmente entre 50 y 60 caracteres).',
        impact: 'medium',
        effort: 'low',
        beforeCode: `<title>${titleText}</title>`,
        afterCode: `<title>${titleText} | Palabras Clave y Nombre de Marca</title>`
      });
    } else if (titleText.length > 65) {
      addIssue({
        category: 'seo',
        title: 'El título es demasiado largo',
        description: `El título actual tiene ${titleText.length} caracteres. Los títulos de más de 60-65 caracteres se recortan en los resultados de búsqueda de Google.`,
        recommendation: 'Acorta el título para que no supere los 60 caracteres, manteniendo las palabras clave más importantes al inicio.',
        impact: 'medium',
        effort: 'low',
        beforeCode: `<title>${titleText}</title>`,
        afterCode: `<title>${titleText.substring(0, 57)}...</title>`
      });
    }
  }

  // B. Meta Description
  const metaDesc = doc.querySelector('meta[name="description"]');
  if (!metaDesc) {
    addIssue({
      category: 'seo',
      title: 'Falta la meta descripción',
      description: 'La meta descripción proporciona un resumen del contenido de la página para los buscadores. Afecta directamente el CTR (tasa de clics) en las búsquedas.',
      recommendation: 'Agrega una etiqueta <meta name="description"> en el <head> que resuma de forma atractiva el contenido.',
      impact: 'high',
      effort: 'low',
      beforeCode: '<head>\n  <!-- Falta meta descripción -->\n</head>',
      afterCode: '<head>\n  <meta name="description" content="Escribe un resumen atractivo y persuasivo de la página (entre 120 y 160 caracteres).">\n</head>'
    });
  } else {
    const descText = metaDesc.getAttribute('content') || '';
    if (descText.trim().length < 70) {
      addIssue({
        category: 'seo',
        title: 'La meta descripción es demasiado corta',
        description: `Tiene ${descText.length} caracteres. Una descripción muy corta no ofrece suficiente contexto para incitar al clic.`,
        recommendation: 'Expande la meta descripción para detallar mejor el contenido de la página (entre 120 y 160 caracteres).',
        impact: 'medium',
        effort: 'low',
        beforeCode: `<meta name="description" content="${descText}">`,
        afterCode: `<meta name="description" content="${descText} ¡Descubre más detalles, beneficios y soluciones en nuestro sitio oficial!">`
      });
    } else if (descText.trim().length > 165) {
      addIssue({
        category: 'seo',
        title: 'La meta descripción es demasiado larga',
        description: `Tiene ${descText.length} caracteres. Las descripciones de más de 160 caracteres suelen ser recortadas por los buscadores.`,
        recommendation: 'Resume la meta descripción para mantenerla por debajo de los 160 caracteres.',
        impact: 'medium',
        effort: 'low',
        beforeCode: `<meta name="description" content="${descText}">`,
        afterCode: `<meta name="description" content="${descText.substring(0, 155)}...">`
      });
    }
  }

  // C. Headings hierarchy
  const h1s = doc.querySelectorAll('h1');
  if (h1s.length === 0) {
    addIssue({
      category: 'seo',
      title: 'Falta el encabezado principal (<h1>)',
      description: 'Cada página web debe tener un único H1 que represente el título principal del contenido. Su ausencia dificulta que Google entienda el tema central.',
      recommendation: 'Agrega un encabezado <h1> único al inicio del contenido principal con las palabras clave más importantes.',
      impact: 'high',
      effort: 'low',
      beforeCode: '<body>\n  <!-- Falta H1 -->\n  <p>Bienvenidos al sitio...</p>\n</body>',
      afterCode: '<body>\n  <h1>Título Principal de la Página</h1>\n  <p>Bienvenidos al sitio...</p>\n</body>'
    });
  } else if (h1s.length > 1) {
    addIssue({
      category: 'seo',
      title: 'Múltiples etiquetas H1 detectadas',
      description: `Se encontraron ${h1s.length} etiquetas H1. Aunque HTML5 lo permite, la mejor práctica de SEO recomienda un único H1 para clarificar el tema central de la página.`,
      recommendation: 'Conserva solo el H1 principal de la página y cambia los demás H1 secundarios a etiquetas H2 o H3.',
      impact: 'medium',
      effort: 'low',
      beforeCode: '<h1>Título Principal</h1>\n...\n<h1>Otro Título Importante</h1>',
      afterCode: '<h1>Título Principal</h1>\n...\n<h2>Otro Título Importante (H2)</h2>'
    });
  }

  // Check heading skips (e.g. H1 to H3 without H2)
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(el => parseInt(el.tagName[1]));
  let hasHeadingSkip = false;
  for (let i = 0; i < headings.length - 1; i++) {
    if (headings[i + 1] - headings[i] > 1) {
      hasHeadingSkip = true;
      break;
    }
  }
  if (hasHeadingSkip) {
    addIssue({
      category: 'seo',
      title: 'Salto en la jerarquía de encabezados',
      description: 'La estructura de encabezados salta de nivel de forma incorrecta (ej. de H1 directamente a H3 sin pasar por un H2). Esto afecta la lectura lógica por parte de indexadores y lectores de pantalla.',
      recommendation: 'Ajusta la jerarquía de tus encabezados para que sigan un orden secuencial (H1 -> H2 -> H3 -> H4).',
      impact: 'low',
      effort: 'medium',
      beforeCode: '<h1>Título Principal</h1>\n<h3>Subtítulo Anidado (salta H2)</h3>',
      afterCode: '<h1>Título Principal</h1>\n<h2>Subtítulo Intermedio (H2)</h2>\n<h3>Subtítulo Anidado (H3)</h3>'
    });
  }

  // D. Canonical Tag
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (!canonical) {
    addIssue({
      category: 'seo',
      title: 'Falta la etiqueta Canonical',
      description: 'La etiqueta canonical previene problemas de contenido duplicado al indicarle a los motores de búsqueda cuál es la URL oficial y preferida para indexar.',
      recommendation: 'Agrega una etiqueta <link rel="canonical" href="URL_OFICIAL"> dentro del <head>.',
      impact: 'medium',
      effort: 'low',
      beforeCode: '<head>\n  <!-- Falta canonical link -->\n</head>',
      afterCode: '<head>\n  <link rel="canonical" href="https://ejemplo.com/pagina-actual">\n</head>'
    });
  }

  // E. Social Media Tags (Open Graph / Twitter Card)
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  const ogImage = doc.querySelector('meta[property="og:image"]');
  if (!ogTitle || !ogImage) {
    addIssue({
      category: 'seo',
      title: 'Faltan etiquetas de Open Graph (Social Sharing)',
      description: 'Las etiquetas Open Graph (`og:title`, `og:image`, `og:description`) definen cómo se visualiza tu enlace al ser compartido en redes sociales como LinkedIn, Facebook y WhatsApp.',
      recommendation: 'Implementa etiquetas Open Graph básicas en el head para optimizar el aspecto visual al compartir enlaces.',
      impact: 'low',
      effort: 'low',
      beforeCode: '<head>\n  <!-- Falta metadata para compartir -->\n</head>',
      afterCode: '<head>\n  <meta property="og:title" content="Título para Compartir">\n  <meta property="og:description" content="Breve descripción para compartir.">\n  <meta property="og:image" content="https://ejemplo.com/imagen-destacada.jpg">\n  <meta property="og:type" content="website">\n</head>'
    });
  }

  // F. Viewport tag
  const viewport = doc.querySelector('meta[name="viewport"]');
  if (!viewport) {
    addIssue({
      category: 'seo',
      title: 'Falta etiqueta Meta Viewport (SEO & Móvil)',
      description: 'Sin la etiqueta meta viewport, los navegadores de dispositivos móviles renderizan la página en un ancho de escritorio estándar, provocando que el texto sea ilegible y requiera zoom.',
      recommendation: 'Añade la etiqueta viewport con el ancho del dispositivo al <head> de tu HTML.',
      impact: 'high',
      effort: 'low',
      beforeCode: '<head>\n  <!-- Falta viewport -->\n</head>',
      afterCode: '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n</head>'
    });
  }


  // --- 2. ACCESSIBILITY (A11y) AUDIT ---
  // A. Alt tags on images
  const images = doc.querySelectorAll('img');
  let missingAltCount = 0;
  let sampleImageHTML = '';
  images.forEach(img => {
    if (!img.hasAttribute('alt')) {
      missingAltCount++;
      if (!sampleImageHTML) {
        sampleImageHTML = img.outerHTML;
      }
    }
  });

  if (missingAltCount > 0) {
    addIssue({
      category: 'a11y',
      title: `Imágenes sin atributo ALT (${missingAltCount} detectadas)`,
      description: `Se encontraron ${missingAltCount} imágenes que no tienen el atributo "alt". Los lectores de pantalla para personas con discapacidad visual leen el nombre del archivo en su lugar, lo que empeora drásticamente la accesibilidad. También afecta el SEO de imágenes.`,
      recommendation: 'Agrega un atributo alt descriptivo a cada etiqueta <img>. Si la imagen es puramente decorativa, añade alt="" vacío.',
      impact: 'high',
      effort: 'low',
      beforeCode: sampleImageHTML || '<img src="foto.jpg">',
      afterCode: sampleImageHTML ? sampleImageHTML.replace('src=', 'alt="Descripción clara de la imagen" src=') : '<img src="foto.jpg" alt="Descripción clara de la imagen">'
    });
  }

  // B. HTML lang attribute
  const htmlTag = doc.querySelector('html');
  if (!htmlTag || !htmlTag.hasAttribute('lang') || !htmlTag.getAttribute('lang').trim()) {
    addIssue({
      category: 'a11y',
      title: 'Falta declarar el idioma en la etiqueta <html>',
      description: 'Declarar el atributo "lang" en la etiqueta <html> permite que los lectores de pantalla sinteticen la pronunciación correcta del idioma del sitio.',
      recommendation: 'Añade el atributo lang (ej. lang="es" para español, lang="en" para inglés) a la etiqueta raíz <html>.',
      impact: 'high',
      effort: 'low',
      beforeCode: '<html>',
      afterCode: '<html lang="es">'
    });
  }

  // C. Form labels
  const inputs = doc.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="tel"], textarea, select');
  let unlabelledInputs = 0;
  let sampleInputHTML = '';
  
  inputs.forEach(input => {
    const id = input.id;
    let hasLabel = false;
    
    // Check if wrapped in <label>
    if (input.closest('label')) {
      hasLabel = true;
    }
    // Check for label with matching "for" attribute
    if (!hasLabel && id) {
      if (doc.querySelector(`label[for="${id}"]`)) {
        hasLabel = true;
      }
    }
    // Check aria attributes
    if (!hasLabel && (input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby') || input.hasAttribute('placeholder'))) {
      // Placeholder gives some visual cue, but legally/a11y-wise it's not a label. 
      // Let's flag it if it has absolutely no label or aria-label.
      if (input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby')) {
        hasLabel = true;
      }
    }
    
    if (!hasLabel) {
      unlabelledInputs++;
      if (!sampleInputHTML) {
        sampleInputHTML = input.outerHTML;
      }
    }
  });

  if (unlabelledInputs > 0) {
    addIssue({
      category: 'a11y',
      title: `Campos de formulario sin etiqueta asociada (${unlabelledInputs} detectados)`,
      description: 'Los campos de entrada que carecen de una etiqueta <label> correspondiente son difíciles o imposibles de navegar con lectores de pantalla. Los usuarios no sabrán qué dato ingresar.',
      recommendation: 'Asocia cada input con un <label> usando el atributo "for" coincidente con el "id" del input, o envuelve el input dentro de la etiqueta <label>.',
      impact: 'high',
      effort: 'medium',
      beforeCode: sampleInputHTML || '<input id="nombre" type="text">',
      afterCode: `<label for="nombre">Nombre Completo</label>\n<input id="nombre" type="text">`
    });
  }

  // D. Empty buttons/links
  const linksAndButtons = doc.querySelectorAll('a, button');
  let emptyClickables = 0;
  let sampleClickableHTML = '';
  linksAndButtons.forEach(el => {
    const text = el.textContent.trim();
    const hasAria = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
    const hasImageWithAlt = el.querySelector('img[alt]') || el.querySelector('svg title');
    
    if (!text && !hasAria && !hasImageWithAlt) {
      emptyClickables++;
      if (!sampleClickableHTML) {
        sampleClickableHTML = el.outerHTML;
      }
    }
  });
  if (emptyClickables > 0) {
    addIssue({
      category: 'a11y',
      title: `Enlaces o botones vacíos (${emptyClickables} detectados)`,
      description: 'Enlaces o botones sin texto legible o atributos ARIA son invisibles para herramientas de accesibilidad, impidiendo que el usuario sepa su función o hacia dónde dirigen.',
      recommendation: 'Añade texto claro dentro del elemento. Si contiene solo un icono (ej. SVG), agrega un atributo aria-label con la descripción del botón.',
      impact: 'high',
      effort: 'low',
      beforeCode: sampleClickableHTML || '<button class="btn-search"></button>',
      afterCode: '<button class="btn-search" aria-label="Buscar en el sitio"></button>'
    });
  }

  // E. Missing semantic structure landmarks
  const hasHeader = doc.querySelector('header');
  const hasNav = doc.querySelector('nav');
  const hasMain = doc.querySelector('main');
  const hasFooter = doc.querySelector('footer');
  if (!hasHeader || !hasNav || !hasMain || !hasFooter) {
    const missing = [];
    if (!hasHeader) missing.push('<header>');
    if (!hasNav) missing.push('<nav>');
    if (!hasMain) missing.push('<main>');
    if (!hasFooter) missing.push('<footer>');
    
    addIssue({
      category: 'a11y',
      title: 'Faltan etiquetas estructurales semánticas (Landmarks)',
      description: `Faltan las siguientes etiquetas semánticas fundamentales: ${missing.join(', ')}. Estas etiquetas permiten a los usuarios de lectores de pantalla navegar rápidamente entre secciones (salto al menú, salto al contenido principal).`,
      recommendation: 'Estructura tu HTML envolviendo el contenido correspondiente en etiquetas <header>, <nav>, <main> y <footer> en lugar de usar divs genéricos.',
      impact: 'medium',
      effort: 'medium',
      beforeCode: '<body>\n  <div class="header">...</div>\n  <div class="content">...</div>\n</body>',
      afterCode: '<body>\n  <header>...</header>\n  <main>\n    <nav>...</nav>\n    <article>...</article>\n  </main>\n  <footer>...</footer>\n</body>'
    });
  }


  // --- 3. PERFORMANCE AUDIT ---
  // A. Non-lazy loaded images
  let nonLazyImages = 0;
  let sampleNonLazyHTML = '';
  images.forEach(img => {
    if (!img.hasAttribute('loading') || img.getAttribute('loading') !== 'lazy') {
      nonLazyImages++;
      if (!sampleNonLazyHTML) {
        sampleNonLazyHTML = img.outerHTML;
      }
    }
  });
  // If we have many images, we should lazy load all except maybe the first 1-2. Let's warn if there are more than 2 non-lazy loaded images.
  if (nonLazyImages > 2) {
    addIssue({
      category: 'performance',
      title: `Imágenes sin carga diferida (loading="lazy")`,
      description: `Se detectaron ${nonLazyImages} imágenes cargándose inmediatamente. Las imágenes fuera de la pantalla inicial (below the fold) deberían cargarse de forma diferida para ahorrar ancho de banda y acelerar la carga inicial del sitio.`,
      recommendation: 'Agrega el atributo loading="lazy" a todas las imágenes que no aparezcan inmediatamente en la parte superior al cargar la página.',
      impact: 'low',
      effort: 'low',
      beforeCode: sampleNonLazyHTML || '<img src="galeria-1.jpg">',
      afterCode: '<img src="galeria-1.jpg" loading="lazy">'
    });
  }

  // B. Missing width/height on images (causes CLS - Cumulative Layout Shift)
  let missingDimensionsCount = 0;
  let sampleDimensionHTML = '';
  images.forEach(img => {
    if (!img.hasAttribute('width') || !img.hasAttribute('height')) {
      missingDimensionsCount++;
      if (!sampleDimensionHTML) {
        sampleDimensionHTML = img.outerHTML;
      }
    }
  });
  if (missingDimensionsCount > 0) {
    addIssue({
      category: 'performance',
      title: `Imágenes sin atributos de dimensiones width/height (${missingDimensionsCount} detectadas)`,
      description: 'Las imágenes que no tienen width y height asignados causan saltos bruscos en el diseño (Cumulative Layout Shift) mientras se cargan, lo que daña drásticamente la UX y penaliza en Google Core Web Vitals.',
      recommendation: 'Especifica siempre los atributos width y height (en pixeles puros) en la etiqueta HTML. Luego usa CSS para hacerlas responsivas (max-width: 100%, height: auto).',
      impact: 'medium',
      effort: 'low',
      beforeCode: sampleDimensionHTML || '<img src="banner.jpg">',
      afterCode: '<img src="banner.jpg" width="1200" height="400" style="max-width: 100%; height: auto;">'
    });
  }

  // C. Blocking scripts in head
  const headScripts = doc.querySelectorAll('head script');
  let blockingScripts = 0;
  let sampleScriptHTML = '';
  headScripts.forEach(script => {
    const isAsync = script.hasAttribute('async');
    const isDefer = script.hasAttribute('defer');
    const isModule = script.getAttribute('type') === 'module';
    const isInline = !script.hasAttribute('src');
    
    if (!isAsync && !isDefer && !isModule && !isInline) {
      blockingScripts++;
      if (!sampleScriptHTML) {
        sampleScriptHTML = script.outerHTML;
      }
    }
  });
  if (blockingScripts > 0) {
    addIssue({
      category: 'performance',
      title: `Scripts bloqueantes en el <head> (${blockingScripts} detectados)`,
      description: 'Los scripts cargados en el <head> sin los atributos "defer" o "async" bloquean por completo el renderizado del HTML (el navegador detiene la pintura hasta descargar y ejecutar el script).',
      recommendation: 'Añade el atributo "defer" (conserva el orden de ejecución) o "async" (ejecución asíncrona inmediata) a las etiquetas de script externas en la cabecera.',
      impact: 'high',
      effort: 'low',
      beforeCode: sampleScriptHTML || '<script src="app.js"></script>',
      afterCode: '<script src="app.js" defer></script>'
    });
  }

  // D. Legacy image formats (.jpg, .png)
  let legacyImages = 0;
  let sampleLegacyImgHTML = '';
  images.forEach(img => {
    const src = img.getAttribute('src') || '';
    if (src.endsWith('.jpg') || src.endsWith('.jpeg') || src.endsWith('.png')) {
      legacyImages++;
      if (!sampleLegacyImgHTML) {
        sampleLegacyImgHTML = img.outerHTML;
      }
    }
  });
  if (legacyImages > 0) {
    addIssue({
      category: 'performance',
      title: `Uso de formatos de imagen obsoletos (${legacyImages} detectadas)`,
      description: 'El uso de extensiones JPEG y PNG incrementa drásticamente el peso de la página comparado con formatos modernos de compresión como WebP o AVIF (que reducen el peso entre un 30% y 50% con igual calidad).',
      recommendation: 'Convierte tus imágenes a formato .webp o .avif. Utiliza la etiqueta <picture> para servir formatos modernos conservando JPG de respaldo si es necesario.',
      impact: 'medium',
      effort: 'medium',
      beforeCode: sampleLegacyImgHTML || '<img src="foto.png">',
      afterCode: '<picture>\n  <source srcset="foto.webp" type="image/webp">\n  <img src="foto.png" alt="Imagen">\n</picture>'
    });
  }

  // E. Excessive DOM Node Count
  const allNodes = doc.querySelectorAll('*');
  if (allNodes.length > 800) {
    addIssue({
      category: 'performance',
      title: `Estructura DOM sobredimensionada (${allNodes.length} nodos)`,
      description: `El documento tiene ${allNodes.length} nodos. Un DOM que excede los 800-1000 elementos ralentiza el rendimiento de la pintura, incrementa el consumo de memoria en dispositivos móviles y hace lenta la interactividad.`,
      recommendation: 'Simplifica la estructura HTML eliminando divs contenedores redundantes o inútiles. Utiliza grid y flexbox para lograr layouts complejos con menos elementos.',
      impact: 'medium',
      effort: 'high',
      beforeCode: '<!-- HTML excesivamente anidado -->\n<div class="row">\n  <div class="col">\n    <div class="card-wrapper">\n      <div class="card">\n        ...',
      afterCode: '<!-- Layout simplificado con CSS Grid -->\n<div class="card-grid">\n  <article class="card">\n    ...'
    });
  }


  // --- 4. UX & CONVERSION (CRO) AUDIT ---
  // A. Mobile UX input forms optimization
  const textInputs = doc.querySelectorAll('input');
  let badTypeInputs = 0;
  let sampleBadInputHTML = '';
  textInputs.forEach(input => {
    const type = input.getAttribute('type') || 'text';
    const name = (input.getAttribute('name') || '').toLowerCase();
    const id = (input.getAttribute('id') || '').toLowerCase();
    
    // Check for email or phone fields that are just standard text inputs
    if (type === 'text') {
      if (name.includes('tel') || name.includes('phone') || id.includes('tel') || id.includes('phone') ||
          name.includes('mail') || id.includes('mail')) {
        badTypeInputs++;
        if (!sampleBadInputHTML) {
          sampleBadInputHTML = input.outerHTML;
        }
      }
    }
  });

  if (badTypeInputs > 0) {
    addIssue({
      category: 'ux',
      title: 'Campos de correo/teléfono usan el tipo genérico input type="text"',
      description: 'El uso de input type="text" para correos o teléfonos evita que los teclados de smartphones muestren el teclado específico (con la "@" o el teclado numérico), creando fricción y disminuyendo la conversión.',
      recommendation: 'Cambia el atributo type="text" por type="email" o type="tel" según corresponda. Añade autocomplete="email" o autocomplete="tel".',
      impact: 'high',
      effort: 'low',
      beforeCode: sampleBadInputHTML || '<input type="text" name="telefono">',
      afterCode: '<input type="tel" name="telefono" autocomplete="tel">'
    });
  }

  // B. Missing Submit Button in Forms
  const forms = doc.querySelectorAll('form');
  let formsWithoutSubmit = 0;
  let sampleFormHTML = '';
  forms.forEach(form => {
    const submit = form.querySelector('button[type="submit"], input[type="submit"]');
    if (!submit) {
      formsWithoutSubmit++;
      if (!sampleFormHTML) {
        sampleFormHTML = form.outerHTML.substring(0, 150) + '...';
      }
    }
  });
  if (formsWithoutSubmit > 0) {
    addIssue({
      category: 'ux',
      title: 'Formularios sin botón de envío claro (submit)',
      description: 'Se encontraron formularios que no tienen un botón marcado explícitamente con type="submit". Depender únicamente de que el usuario pulse Enter es un patrón UX perjudicial que confunde a muchos usuarios.',
      recommendation: 'Asegúrate de que cada formulario tenga un <button type="submit"> visible y legible.',
      impact: 'high',
      effort: 'low',
      beforeCode: sampleFormHTML || '<form>\n  <input type="text">\n</form>',
      afterCode: '<form>\n  <input type="text">\n  <button type="submit">Enviar Formulario</button>\n</form>'
    });
  }

  // C. Clickable elements using non-semantic divs/spans
  // Looking for onclick handlers or classes that sound like buttons on non-button/link elements
  const nonSemanticClickables = doc.querySelectorAll('div[onclick], span[onclick], div[class*="btn-"], span[class*="btn-"]');
  let badClickablesCount = 0;
  let sampleBadClickHTML = '';
  nonSemanticClickables.forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (tag !== 'a' && tag !== 'button' && tag !== 'input') {
      badClickablesCount++;
      if (!sampleBadClickHTML) {
        sampleBadClickHTML = el.outerHTML.substring(0, 100);
      }
    }
  });
  if (badClickablesCount > 0) {
    addIssue({
      category: 'ux',
      title: `Elementos interactivos sin etiquetas semánticas (${badClickablesCount} detectados)`,
      description: 'El uso de divs o spans para realizar acciones (en lugar de <a> o <button>) rompe la navegación por teclado (tabulación), y no avisa a los lectores de pantalla que el elemento es clickeable.',
      recommendation: 'Reemplaza los divs/spans interactivos por etiquetas <button> o, si no es posible, añade los atributos role="button" y tabindex="0".',
      impact: 'medium',
      effort: 'medium',
      beforeCode: sampleBadClickHTML || '<div class="btn-primary" onclick="irPagina()">Enviar</div>',
      afterCode: '<button class="btn-primary" onclick="irPagina()">Enviar</button>'
    });
  }

  // D. Missing placeholders in forms
  let missingPlaceholders = 0;
  let sampleNoPlaceholderHTML = '';
  inputs.forEach(input => {
    if (input.tagName.toLowerCase() === 'input' && !input.hasAttribute('placeholder')) {
      const type = input.getAttribute('type') || 'text';
      if (['text', 'email', 'tel', 'number'].includes(type)) {
        missingPlaceholders++;
        if (!sampleNoPlaceholderHTML) {
          sampleNoPlaceholderHTML = input.outerHTML;
        }
      }
    }
  });
  if (missingPlaceholders > 0) {
    addIssue({
      category: 'ux',
      title: `Inputs de texto sin marcadores de posición (placeholders)`,
      description: `Se detectaron ${missingPlaceholders} campos de texto sin atributo placeholder. Los placeholders sirven de guía visual sobre el formato esperado y reducen la carga cognitiva del usuario.`,
      recommendation: 'Agrega un atributo placeholder explicativo a cada campo de entrada.',
      impact: 'low',
      effort: 'low',
      beforeCode: sampleNoPlaceholderHTML || '<input type="email">',
      afterCode: '<input type="email" placeholder="ejemplo@correo.com">'
    });
  }

  // E. Trust/Conversion - missing privacy policy or cookie banner indicator
  const htmlLower = htmlString.toLowerCase();
  const hasPrivacy = htmlLower.includes('privacidad') || htmlLower.includes('privacy') || htmlLower.includes('politica');
  if (!hasPrivacy) {
    addIssue({
      category: 'ux',
      title: 'Ausencia de políticas de privacidad o aviso legal visible',
      description: 'No se detectaron enlaces o menciones a la política de privacidad. Esto reduce la confianza del usuario al ingresar datos en el sitio y genera incumplimientos regulatorios (GDPR / CCPA) que dañan la conversión.',
      recommendation: 'Agrega un enlace a tu Política de Privacidad en el pie de página (footer) de tu sitio web.',
      impact: 'medium',
      effort: 'low',
      beforeCode: '<footer>\n  <p>© 2026 Todos los derechos reservados</p>\n</footer>',
      afterCode: '<footer>\n  <p>© 2026 Todos los derechos reservados | <a href="/privacidad">Política de Privacidad</a></p>\n</footer>'
    });
  }

  // --- SCORE CALCULATIONS ---
  // Default values
  const scores = {
    seo: 100,
    a11y: 100,
    performance: 100,
    ux: 100
  };

  // Penalty weights
  const penaltyWeights = {
    high: 15,
    medium: 8,
    low: 3
  };

  issues.forEach(issue => {
    const penalty = penaltyWeights[issue.impact] || 5;
    scores[issue.category] = Math.max(0, scores[issue.category] - penalty);
  });

  // Calculate overall score (average of the 4)
  const overall = Math.round((scores.seo + scores.a11y + scores.performance + scores.ux) / 4);

  return {
    overallScore: overall,
    scores,
    issues
  };
}
