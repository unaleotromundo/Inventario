/* ==========================================================================
   AI AGENT MANAGER - Hugging Face Integration (Free Models)
   ========================================================================== */
const AIAgentManager = {
    apiKey: null,
    isConfigured: false,

    // Initialize AI Agent with API key from localStorage
    init() {
        this.apiKey = localStorage.getItem('huggingface_key');
        this.isConfigured = !!this.apiKey;
        // Image generation doesn't require API key (uses Pollinations.ai)
        this.canGenerateImages = true; 
        // Chat also works without API key now
        this.canChat = true;
        return this.isConfigured;
    },

    // Save API key to localStorage
    saveApiKey(key) {
        localStorage.setItem('huggingface_key', key);
        this.apiKey = key;
        this.isConfigured = true;
    },

    // Test connection to Hugging Face API
    async testConnection() {
        if (!this.apiKey) {
            return { success: false, error: 'No API key configured' };
        }

        try {
            const response = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: 'Test',
                    parameters: { max_new_tokens: 5 }
                })
            });

            if (!response.ok) {
                throw new Error('Connection failed');
            }

            return { success: true };
        } catch (err) {
            console.error('Hugging Face connection test failed:', err);
            return { success: false, error: err.message };
        }
    },

    // Generate image using Pollinations.ai (No API key required)
    async generateImage(prompt, category = 'general') {
        // Enhance prompt based on category
        const enhancedPrompt = this.enhanceImagePrompt(prompt, category);

        try {
            // Pollinations.ai - free, no API key needed
            const encodedPrompt = encodeURIComponent(enhancedPrompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;
            
            // Download the image
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            return {
                success: true,
                imageUrl: blobUrl,
                revisedPrompt: enhancedPrompt,
                blob: blob
            };
        } catch (err) {
            console.error('Image generation failed:', err);
            throw err;
        }
    },

    // Download image from URL and convert to Blob (for compatibility)
    async downloadImageAsBlob(imageUrl) {
        // If imageUrl is already a blob URL, fetch it
        if (imageUrl.startsWith('blob:')) {
            const response = await fetch(imageUrl);
            return await response.blob();
        }
        
        // Otherwise, it's a regular URL
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            return blob;
        } catch (err) {
            console.error('Failed to download image:', err);
            throw new Error('No se pudo descargar la imagen generada');
        }
    },

    // Chat completion using free API (no API key required)
    async chat(userMessage, context = null) {
        try {
            const systemPrompt = this.getSystemPrompt(context);
            const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage}\nAssistant:`;

            // Using free API from Pollinations (text generation)
            const response = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    seed: Math.floor(Math.random() * 1000)
                })
            });

            if (!response.ok) {
                throw new Error('Chat completion failed');
            }

            const data = await response.json();
            const message = data.response || data.message || data.text || 'No response';
            
            return {
                success: true,
                message: message.trim()
            };
        } catch (err) {
            console.error('Chat completion failed:', err);
            throw err;
        }
    },

    // Analyze inventory data with AI
    async analyzeInventory(items) {
        if (!this.isConfigured) {
            throw new Error('AI Agent not configured. Please add your OpenAI API key in settings.');
        }

        // Format inventory data for AI
        const inventorySummary = this.formatInventoryForAI(items);

        const prompt = `Analiza mi inventario de emprendimientos y dame insights útiles:\n\n${inventorySummary}\n\nPor favor proporciona:
1. Resumen general de mis emprendimientos
2. Recomendaciones para mejorar
3. Patrones o tendencias que notes
4. Sugerencias de próximos pasos`;

        return await this.chat(prompt);
    },

    // Generate flyer content with AI
    async generateFlyerContent(category, productName, additionalInfo = '') {
        if (!this.isConfigured) {
            throw new Error('AI Agent not configured. Please add your OpenAI API key in settings.');
        }

        const prompt = `Genera contenido atractivo para un flyer promocional.
Categoría: ${category}
Producto/Servicio: ${productName}
Información adicional: ${additionalInfo}

Por favor genera:
1. Un título llamativo
2. Un eslogan corto
3. 3-4 beneficios clave
4. Una llamada a la acción
5. Sugerencia de descripción para el inventario`;

        return await this.chat(prompt);
    },

    // Helper: Enhance image prompt based on category
    enhanceImagePrompt(prompt, category) {
        const categoryStyles = {
            suculentas: 'professional product photography, natural lighting, botanical aesthetic, clean background, high quality, commercial photography style',
            pc: 'modern tech aesthetic, clean professional look, computer repair service, technology focused, high quality',
            web: 'modern web design, sleek interface, professional tech aesthetic, clean minimalist style, high quality',
            general: 'professional commercial photography, high quality, clean aesthetic, modern design'
        };

        const style = categoryStyles[category] || categoryStyles.general;
        return `${prompt}. Style: ${style}. Make it visually appealing and professional.`;
    },

    // Helper: Get system prompt for chat
    getSystemPrompt(context) {
        let systemPrompt = `Eres un asistente de IA experto para una aplicación de inventario de emprendimientos. 
El usuario gestiona tres tipos de emprendimientos: Suculentas (plantas), Soporte PC (reparaciones), y Páginas & Apps Web (desarrollo).
Tu rol es ayudar a generar contenido, analizar datos y responder preguntas sobre su inventario.
Responde en español de manera clara y profesional.`;

        if (context && context.inventoryData) {
            systemPrompt += `\n\nContexto del inventario actual:\n${context.inventoryData}`;
        }

        return systemPrompt;
    },

    // Helper: Format inventory data for AI analysis
    formatInventoryForAI(items) {
        if (!items || items.length === 0) {
            return 'El inventario está vacío.';
        }

        const summary = items.map(item => 
            `- ${item.title} (${item.category}, ${item.type}): ${item.description || 'Sin descripción'}`
        ).join('\n');

        const stats = {
            total: items.length,
            byCategory: {
                suculentas: items.filter(i => i.category === 'suculentas').length,
                pc: items.filter(i => i.category === 'pc').length,
                web: items.filter(i => i.category === 'web').length
            },
            byType: {
                flyers: items.filter(i => i.type === 'flyer').length,
                photos: items.filter(i => i.type === 'photo').length,
                documents: items.filter(i => i.type === 'document').length
            }
        };

        return `Total de archivos: ${stats.total}\n\nPor categoría:\n- Suculentas: ${stats.byCategory.suculentas}\n- Soporte PC: ${stats.byCategory.pc}\n- Páginas & Apps: ${stats.byCategory.web}\n\nPor tipo:\n- Flyers: ${stats.byType.flyers}\n- Fotos: ${stats.byType.photos}\n- Documentos: ${stats.byType.documents}\n\nArchivos:\n${summary}`;
    },

    // Helper: Download image from URL and convert to Blob
    async downloadImageAsBlob(imageUrl) {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            return blob;
        } catch (err) {
            console.error('Failed to download image:', err);
            throw new Error('No se pudo descargar la imagen generada');
        }
    }
};

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIAgentManager;
}
