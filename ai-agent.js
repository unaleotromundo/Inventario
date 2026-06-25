/* ==========================================================================
   AI AGENT MANAGER - OpenAI Integration
   ========================================================================== */
const AIAgentManager = {
    apiKey: null,
    isConfigured: false,

    // Initialize AI Agent with API key from localStorage
    init() {
        this.apiKey = localStorage.getItem('openai_key');
        this.isConfigured = !!this.apiKey;
        return this.isConfigured;
    },

    // Save API key to localStorage
    saveApiKey(key) {
        localStorage.setItem('openai_key', key);
        this.apiKey = key;
        this.isConfigured = true;
    },

    // Test connection to OpenAI API
    async testConnection() {
        if (!this.apiKey) {
            return { success: false, error: 'No API key configured' };
        }

        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Connection failed');
            }

            return { success: true };
        } catch (err) {
            console.error('OpenAI connection test failed:', err);
            return { success: false, error: err.message };
        }
    },

    // Generate image using DALL-E 3
    async generateImage(prompt, category = 'general') {
        if (!this.isConfigured) {
            throw new Error('AI Agent not configured. Please add your OpenAI API key in settings.');
        }

        // Enhance prompt based on category
        const enhancedPrompt = this.enhanceImagePrompt(prompt, category);

        try {
            const response = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'dall-e-3',
                    prompt: enhancedPrompt,
                    n: 1,
                    size: '1024x1024',
                    quality: 'standard'
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Image generation failed');
            }

            const data = await response.json();
            return {
                success: true,
                imageUrl: data.data[0].url,
                revisedPrompt: data.data[0].revised_prompt
            };
        } catch (err) {
            console.error('Image generation failed:', err);
            throw err;
        }
    },

    // Chat completion using GPT-4
    async chat(userMessage, context = null) {
        if (!this.isConfigured) {
            throw new Error('AI Agent not configured. Please add your OpenAI API key in settings.');
        }

        try {
            const messages = [
                {
                    role: 'system',
                    content: this.getSystemPrompt(context)
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ];

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: messages,
                    max_tokens: 1000,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Chat completion failed');
            }

            const data = await response.json();
            return {
                success: true,
                message: data.choices[0].message.content,
                usage: data.usage
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
