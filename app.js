/* ==========================================================================
   INDEXEDDB DATABASE SETUP (LOCAL FALLBACK)
   ========================================================================== */
const DB_NAME = 'InventarioEmprendimientosDB';
const DB_VERSION = 1;
const STORE_NAME = 'items';
let localDb = null;

// Initialize Local Database (IndexedDB)
function initLocalDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Error al abrir la base de datos local:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            localDb = event.target.result;
            resolve(localDb);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// Get all items from local DB
function getLocalItems() {
    return new Promise((resolve, reject) => {
        if (!localDb) return resolve([]);
        const transaction = localDb.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Add item to local DB
function addLocalItem(item) {
    return new Promise((resolve, reject) => {
        const transaction = localDb.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(item);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Delete item from local DB
function deleteLocalItem(id) {
    return new Promise((resolve, reject) => {
        const transaction = localDb.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* ==========================================================================
   SUPABASE INTEGRATION
   ========================================================================== */
let supabaseClient = null;

const SupabaseManager = {
    // Check credentials and initialize client
    init() {
        const url = localStorage.getItem('supabase_url');
        const key = localStorage.getItem('supabase_key');
        
        if (url && key) {
            try {
                // Initialize using Supabase CDN library
                supabaseClient = supabase.createClient(url, key);
                return true;
            } catch (err) {
                console.error('Error al inicializar cliente de Supabase:', err);
                supabaseClient = null;
            }
        }
        return false;
    },

    // Test connection by fetching a single row
    async testConnection(url, key) {
        try {
            const testClient = supabase.createClient(url, key);
            // Fetch one item just to test the connection and credentials
            const { data, error } = await testClient.from('items').select('id').limit(1);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('Prueba de conexión fallida:', err);
            return { success: false, error: err.message || err };
        }
    },

    // Get all items from PostgreSQL
    async getAll() {
        if (!supabaseClient) throw new Error('Cliente Supabase no inicializado');
        const { data, error } = await supabaseClient
            .from('items')
            .select('*')
            .order('date', { ascending: false });
            
        if (error) throw error;
        
        // Map PostgreSQL columns back to JS standards
        return data.map(item => ({
            id: item.id,
            title: item.title,
            category: item.category,
            type: item.type,
            date: item.date,
            description: item.description,
            fileName: item.file_name,
            fileType: item.file_type,
            fileSize: item.file_size,
            fileUrl: item.file_url,
            fileBlob: null
        }));
    },

    // Upload file to storage and write row in DB
    async add(item) {
        if (!supabaseClient) throw new Error('Cliente Supabase no inicializado');
        
        // 1. Upload file to Storage (bucket: 'inventario-files')
        const fileExt = item.fileName.split('.').pop();
        const storagePath = `${item.category}/${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('inventario-files')
            .upload(storagePath, item.fileBlob, {
                cacheControl: '3600',
                upsert: false
            });
            
        if (uploadError) {
            console.error('Storage Upload Error:', uploadError);
            throw new Error(`Error de almacenamiento: ${uploadError.message}`);
        }

        // 2. Get Public URL
        const { data: urlData } = supabaseClient.storage
            .from('inventario-files')
            .getPublicUrl(storagePath);
            
        const fileUrl = urlData.publicUrl;

        // 3. Insert Row in PostgreSQL
        const { data: insertData, error: insertError } = await supabaseClient
            .from('items')
            .insert([{
                title: item.title,
                category: item.category,
                type: item.type,
                date: item.date,
                description: item.description,
                file_name: item.fileName,
                file_type: item.fileType,
                file_size: item.fileSize,
                file_url: fileUrl
            }])
            .select();

        if (insertError) {
            // Rollback uploaded file from Storage
            await supabaseClient.storage.from('inventario-files').remove([storagePath]);
            console.error('Database Insert Error:', insertError);
            throw new Error(`Error en base de datos: ${insertError.message}`);
        }

        return insertData[0];
    },

    // Delete file from Storage and Row from DB
    async delete(item) {
        if (!supabaseClient) throw new Error('Cliente Supabase no inicializado');

        // Extract storage path from fileUrl
        // URL Format: https://[proj-id].supabase.co/storage/v1/object/public/inventario-files/[category]/[filename]
        const storagePrefix = '/public/inventario-files/';
        const index = item.fileUrl.indexOf(storagePrefix);
        
        if (index !== -1) {
            const storagePath = item.fileUrl.substring(index + storagePrefix.length);
            // Delete file from Storage
            const { error: storageError } = await supabaseClient.storage
                .from('inventario-files')
                .remove([storagePath]);
                
            if (storageError) {
                console.warn('No se pudo borrar el archivo de storage (posiblemente ya no existe):', storageError);
            }
        }

        // Delete row from PostgreSQL
        const { error: dbError } = await supabaseClient
            .from('items')
            .delete()
            .eq('id', item.id);
            
        if (dbError) throw dbError;
    }
};

/* ==========================================================================
   UNIFIED DATA MANAGER (HYBRID ENGINE)
   ========================================================================== */
const DataManager = {
    mode: 'local', // 'local' | 'supabase'

    async init() {
        await initLocalDB();
        
        const hasSupabase = SupabaseManager.init();
        if (hasSupabase) {
            // Confirm connectivity by calling getAll
            try {
                await SupabaseManager.getAll();
                this.mode = 'supabase';
                console.log('Backend conectado a Supabase Cloud con éxito.');
            } catch (err) {
                console.warn('Fallo al conectar con Supabase. Cayendo en fallback local de IndexedDB.', err);
                this.mode = 'local';
            }
        } else {
            this.mode = 'local';
        }
        
        updateConnectionStatusUI();
    },

    async getAll() {
        if (this.mode === 'supabase') {
            return await SupabaseManager.getAll();
        } else {
            return await getLocalItems();
        }
    },

    async add(item) {
        if (this.mode === 'supabase') {
            return await SupabaseManager.add(item);
        } else {
            return await addLocalItem(item);
        }
    },

    async delete(item) {
        if (this.mode === 'supabase') {
            await SupabaseManager.delete(item);
        } else {
            await deleteLocalItem(item.id);
        }
    }
};

// Helper: Convert File/Blob to Base64 String (for JSON export)
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Helper: Convert Base64 back to Blob (for JSON import)
async function base64ToBlob(base64Url) {
    const res = await fetch(base64Url);
    return await res.blob();
}

/* ==========================================================================
   APP STATE & SELECTORS
   ========================================================================== */
const state = {
    items: [],
    activeCategory: 'all',
    activeType: 'all',
    searchQuery: '',
    currentOpenItem: null
};

// DOM Cache
const DOM = {
    body: document.body,
    // Stats
    statTotal: document.querySelector('#stat-total .stat-value'),
    statSuculentas: document.querySelector('.suculentas-stat .stat-value'),
    statPc: document.querySelector('.pc-stat .stat-value'),
    statWeb: document.querySelector('.web-stat .stat-value'),
    
    // Connection Info
    dbStatusBadge: document.getElementById('db-status-badge'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    
    // Settings Modal
    settingsModal: document.getElementById('settings-modal'),
    settingsOverlay: document.getElementById('settings-overlay'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
    settingsForm: document.getElementById('settings-form'),
    sbUrlInput: document.getElementById('sb-url'),
    sbKeyInput: document.getElementById('sb-key'),
    btnTestConn: document.getElementById('btn-test-conn'),
    settingsConnStatus: document.getElementById('settings-conn-status'),
    settingsSyncBox: document.getElementById('settings-sync-box'),
    btnSyncData: document.getElementById('btn-sync-data'),
    
    // Filters & Search
    searchInput: document.getElementById('search-input'),
    categoryFilters: document.getElementById('category-filters'),
    typeFilters: document.getElementById('type-filters'),
    
    // Upload Form
    toggleUploadFormBtn: document.getElementById('toggle-upload-form'),
    uploadForm: document.getElementById('upload-form'),
    dragDropZone: document.getElementById('drag-drop-zone'),
    fileInput: document.getElementById('item-file'),
    filePreview: document.getElementById('file-preview-container'),
    previewFilename: document.getElementById('preview-filename'),
    previewFilesize: document.getElementById('preview-filesize'),
    previewFileIcon: document.getElementById('preview-file-icon'),
    removePreviewBtn: document.getElementById('remove-preview-btn'),
    uploaderContent: document.querySelector('.uploader-content'),
    
    // Form Inputs
    inputTitle: document.getElementById('item-title'),
    inputCategory: document.getElementById('item-category'),
    inputType: document.getElementById('item-type'),
    inputDate: document.getElementById('item-date'),
    inputDescription: document.getElementById('item-description'),
    btnSubmit: document.getElementById('btn-submit'),
    
    // Gallery
    itemsGrid: document.getElementById('items-grid'),
    emptyState: document.getElementById('empty-state'),
    itemsCountDisplay: document.getElementById('items-count-display'),
    
    // Backup Actions
    btnExport: document.getElementById('btn-export'),
    btnImportTrigger: document.getElementById('btn-import-trigger'),
    importFileInput: document.getElementById('import-file-input'),
    
    // Modal
    modal: document.getElementById('detail-modal'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalPreviewBox: document.getElementById('modal-preview-box'),
    modalCategoryBadge: document.getElementById('modal-category-badge'),
    modalTypeBadge: document.getElementById('modal-type-badge'),
    modalTitle: document.getElementById('modal-title'),
    modalDate: document.getElementById('modal-date'),
    modalDescription: document.getElementById('modal-description'),
    modalMetaSize: document.getElementById('modal-meta-size'),
    modalMetaMime: document.getElementById('modal-meta-mime'),
    btnDownload: document.getElementById('btn-download'),
    btnDelete: document.getElementById('btn-delete')
};

// Global File tracking for form
let selectedFile = null;

/* ==========================================================================
   INITIALIZATION & PRELOAD SAMPLES
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    // Set default date to today
    DOM.inputDate.valueAsDate = new Date();
    
    try {
        await DataManager.init();
        await loadAndRenderData();
        
        // Setup App Event Listeners
        setupEventListeners();
    } catch (error) {
        console.error('Error al iniciar la aplicación:', error);
        alert('Hubo un error al iniciar el almacenamiento. Revisa la consola para más detalles.');
    }
});

// Load all data, preload samples if empty and local, and render UI
async function loadAndRenderData() {
    state.items = await DataManager.getAll();
    
    // Preload default assets only if DB is empty and mode is local
    // (We don't automatically populate cloud Supabase, only if they request it)
    if (state.items.length === 0 && DataManager.mode === 'local') {
        await preloadSampleData();
        state.items = await DataManager.getAll();
    }
    
    updateStatistics();
    renderGallery();
    checkSyncVisibility();
}

// Preload beautiful mock items using local assets (for IndexedDB)
async function preloadSampleData() {
    const samples = [
        {
            title: 'Catálogo de Suculentas Primavera',
            category: 'suculentas',
            type: 'flyer',
            date: '2026-09-21',
            description: 'Primer catálogo digital completo de suculentas exóticas, cactus y macetas artesanales de terracota. Creado para promocionar las ventas de la temporada primaveral en redes sociales.',
            fileName: 'suculentas_default.png',
            fileType: 'image/png',
            fileSize: 450 * 1024,
            assetPath: 'assets/suculentas_default.png'
        },
        {
            title: 'Folleto de Servicio Técnico y Mantenimiento de Computadoras',
            category: 'pc',
            type: 'flyer',
            date: '2026-03-10',
            description: 'Volante promocional detallando servicios informáticos a domicilio y en taller. Incluye limpieza interna de hardware, optimización de velocidad, eliminación de virus e instalación de discos sólidos (SSD).',
            fileName: 'pc_repairs_default.png',
            fileType: 'image/png',
            fileSize: 520 * 1024,
            assetPath: 'assets/pc_repairs_default.png'
        },
        {
            title: 'Mockup de Plataforma Web de E-commerce',
            category: 'web',
            type: 'photo',
            date: '2026-05-18',
            description: 'Diseño de interfaz y dashboard administrativo para un cliente de comercio electrónico. Se muestran gráficos de ventas mensuales, control de stock y panel de configuración con enfoque minimalista y oscuro.',
            fileName: 'web_portfolio_default.png',
            fileType: 'image/png',
            fileSize: 610 * 1024,
            assetPath: 'assets/web_portfolio_default.png'
        }
    ];

    for (const sample of samples) {
        try {
            const response = await fetch(sample.assetPath);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();
            
            const item = {
                title: sample.title,
                category: sample.category,
                type: sample.type,
                date: sample.date,
                description: sample.description,
                fileName: sample.fileName,
                fileType: sample.fileType,
                fileSize: blob.size,
                fileBlob: blob
            };
            
            await addLocalItem(item);
        } catch (err) {
            console.warn(`No se pudo cargar la imagen de muestra: ${sample.assetPath}. Usando placeholder vacío.`, err);
        }
    }
}

/* ==========================================================================
   STATISTICS & THEMING & SYNC ACTIONS
   ========================================================================== */
function updateStatistics() {
    const counts = {
        total: state.items.length,
        suculentas: state.items.filter(item => item.category === 'suculentas').length,
        pc: state.items.filter(item => item.category === 'pc').length,
        web: state.items.filter(item => item.category === 'web').length
    };
    
    DOM.statTotal.textContent = counts.total;
    DOM.statSuculentas.textContent = counts.suculentas;
    DOM.statPc.textContent = counts.pc;
    DOM.statWeb.textContent = counts.web;
}

// Sincronización connection badge indicator
function updateConnectionStatusUI() {
    DOM.dbStatusBadge.className = `db-status-badge ${DataManager.mode}`;
    const dot = DOM.dbStatusBadge.querySelector('.status-dot');
    const text = DOM.dbStatusBadge.querySelector('.status-text');
    
    if (DataManager.mode === 'supabase') {
        text.textContent = 'Nube (Supabase)';
    } else {
        text.textContent = 'Local (IndexedDB)';
    }
}

// Dynamically change global theme colors depending on category filter
function updateThemeColors(category) {
    DOM.body.classList.remove('theme-default', 'theme-suculentas', 'theme-pc', 'theme-web');
    
    if (category === 'all') {
        DOM.body.classList.add('theme-default');
    } else {
        DOM.body.classList.add(`theme-${category}`);
    }
}

// Check if sync local files button is visible (Supabase active & IndexedDB has items)
async function checkSyncVisibility() {
    if (DataManager.mode === 'supabase') {
        const localItems = await getLocalItems();
        // Ignore sample/preload files during sync verification unless they were altered
        if (localItems.length > 0) {
            DOM.settingsSyncBox.style.display = 'block';
            return;
        }
    }
    DOM.settingsSyncBox.style.display = 'none';
}

/* ==========================================================================
   UI RENDERING (GALLERY GRID)
   ========================================================================== */
function renderGallery() {
    // Filter items
    const filteredItems = state.items.filter(item => {
        const matchesCategory = state.activeCategory === 'all' || item.category === state.activeCategory;
        const matchesType = state.activeType === 'all' || item.type === state.activeType;
        
        const q = state.searchQuery.toLowerCase().trim();
        const matchesSearch = !q || 
            item.title.toLowerCase().includes(q) || 
            item.description.toLowerCase().includes(q) ||
            item.fileName.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q);
            
        return matchesCategory && matchesType && matchesSearch;
    });

    // Update count display
    DOM.itemsCountDisplay.textContent = `Mostrando ${filteredItems.length} de ${state.items.length} archivos`;

    // Empty state
    if (filteredItems.length === 0) {
        DOM.itemsGrid.style.display = 'none';
        DOM.emptyState.style.display = 'flex';
        return;
    }

    DOM.itemsGrid.style.display = 'grid';
    DOM.emptyState.style.display = 'none';
    DOM.itemsGrid.innerHTML = '';

    // Sort items newest first
    const sortedItems = [...filteredItems].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Render items
    sortedItems.forEach(item => {
        const card = createItemCard(item);
        DOM.itemsGrid.appendChild(card);
    });
}

// Create individual card elements
function createItemCard(item) {
    const card = document.createElement('article');
    card.className = 'item-card glass-card';
    card.setAttribute('data-category', item.category);
    
    // Media section
    let mediaHTML = '';
    const isImage = item.fileType.startsWith('image/');
    
    if (isImage) {
        const srcUrl = item.fileBlob ? URL.createObjectURL(item.fileBlob) : item.fileUrl;
        mediaHTML = `<img src="${srcUrl}" alt="${item.title}" class="card-img" loading="lazy">`;
    } else {
        // Doc/Files layout
        const fileExt = item.fileName.split('.').pop() || 'FILE';
        let iconClass = 'fa-file-lines';
        if (item.fileType.includes('pdf')) iconClass = 'fa-file-pdf';
        if (item.fileType.includes('zip') || item.fileType.includes('rar')) iconClass = 'fa-file-zipper';
        if (item.fileType.includes('word') || item.fileName.endsWith('.doc') || item.fileName.endsWith('.docx')) iconClass = 'fa-file-word';
        if (item.fileType.includes('excel') || item.fileName.endsWith('.xls') || item.fileName.endsWith('.xlsx')) iconClass = 'fa-file-excel';
        
        mediaHTML = `
            <div class="card-doc-placeholder">
                <i class="fa-solid ${iconClass} doc-placeholder-icon"></i>
                <span class="doc-placeholder-ext">${fileExt}</span>
            </div>
        `;
    }

    const typeIcons = {
        flyer: '<i class="fa-solid fa-bullhorn"></i> Flyer',
        photo: '<i class="fa-solid fa-image"></i> Foto',
        document: '<i class="fa-solid fa-file-lines"></i> Archivo'
    };

    const categoryNames = {
        suculentas: '<i class="fa-solid fa-seedling"></i> Suculentas',
        pc: '<i class="fa-solid fa-desktop"></i> Soporte PC',
        web: '<i class="fa-solid fa-code"></i> Páginas / Apps'
    };

    // Format Date
    const formattedDate = formatDateString(item.date);
    const formattedSize = formatBytes(item.fileSize);

    card.innerHTML = `
        <div class="card-media-box">
            ${mediaHTML}
            <div class="card-badges">
                <span class="badge cat-badge">${categoryNames[item.category] || item.category}</span>
                <span class="badge type-badge">${typeIcons[item.type] || item.type}</span>
            </div>
        </div>
        <div class="card-info">
            <div class="card-title-row">
                <h3 class="card-title" title="${item.title}">${item.title}</h3>
                <span class="card-date"><i class="fa-solid fa-calendar"></i> ${formattedDate}</span>
            </div>
            <p class="card-desc">${item.description || 'Sin descripción o notas adicionales.'}</p>
            <div class="card-footer">
                <span class="card-size"><i class="fa-solid fa-microchip"></i> ${formattedSize}</span>
                <span class="card-action-hint">Ver Detalles <i class="fa-solid fa-arrow-right-long"></i></span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => openDetailModal(item));
    return card;
}

// Helpers for formatted values
function formatDateString(dateStr) {
    if (!dateStr) return 'Sin fecha';
    const date = new Date(dateStr + 'T00:00:00'); // Prevent UTC conversion offset
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/* ==========================================================================
   EVENT LISTENERS & FORM HANDLERS
   ========================================================================== */
function setupEventListeners() {
    // 1. Sidebar Category Filters
    DOM.categoryFilters.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        
        DOM.categoryFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        state.activeCategory = btn.getAttribute('data-filter');
        updateThemeColors(state.activeCategory);
        renderGallery();
    });

    // Statistics click links to filters
    document.querySelectorAll('.category-stat').forEach(stat => {
        stat.addEventListener('click', () => {
            const category = stat.getAttribute('data-category');
            const targetFilterBtn = DOM.categoryFilters.querySelector(`[data-filter="${category}"]`);
            if (targetFilterBtn) targetFilterBtn.click();
        });
    });

    // 2. Sidebar File Type Filters
    DOM.typeFilters.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        
        DOM.typeFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        state.activeType = btn.getAttribute('data-filter');
        renderGallery();
    });

    // 3. Search input
    DOM.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderGallery();
    });

    // 4. Form Collapse Toggle
    DOM.toggleUploadFormBtn.addEventListener('click', () => {
        const isCollapsed = DOM.uploadForm.classList.contains('collapsed');
        if (isCollapsed) {
            DOM.uploadForm.classList.remove('collapsed');
            DOM.toggleUploadFormBtn.classList.add('active-toggle');
        } else {
            DOM.uploadForm.classList.add('collapsed');
            DOM.toggleUploadFormBtn.classList.remove('active-toggle');
        }
    });

    // 5. Drag & Drop Handlers
    DOM.dragDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.dragDropZone.classList.add('dragover');
    });

    DOM.dragDropZone.addEventListener('dragleave', () => {
        DOM.dragDropZone.classList.remove('dragover');
    });

    DOM.dragDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.dragDropZone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    // File input change
    DOM.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Remove preview button inside Drag Drop zone
    DOM.removePreviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetFileSelection();
    });

    // 6. Form Submit (Save Item)
    DOM.uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!selectedFile) {
            alert('Por favor selecciona un archivo o imagen.');
            return;
        }

        const title = DOM.inputTitle.value.trim();
        const category = DOM.inputCategory.value;
        const type = DOM.inputType.value;
        const date = DOM.inputDate.value || new Date().toISOString().split('T')[0];
        const description = DOM.inputDescription.value.trim();

        const item = {
            title,
            category,
            type,
            date,
            description,
            fileName: selectedFile.name,
            fileType: selectedFile.type || 'application/octet-stream',
            fileSize: selectedFile.size,
            fileBlob: selectedFile
        };

        try {
            DOM.btnSubmit.disabled = true;
            DOM.btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            
            await DataManager.add(item);
            
            // Success reset
            DOM.uploadForm.reset();
            resetFileSelection();
            DOM.inputDate.valueAsDate = new Date();
            
            // Collapse form automatically on success
            DOM.uploadForm.classList.add('collapsed');
            DOM.toggleUploadFormBtn.classList.remove('active-toggle');
            
            // Reload
            await loadAndRenderData();
        } catch (err) {
            console.error('Error al guardar el ítem:', err);
            alert(`Error al guardar en el backend (${DataManager.mode}): ` + err.message);
        } finally {
            DOM.btnSubmit.disabled = false;
            DOM.btnSubmit.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar en Inventario';
        }
    });

    // 7. Modal Closing Event Handlers (Detail Modal)
    DOM.modalOverlay.addEventListener('click', closeDetailModal);
    DOM.modalCloseBtn.addEventListener('click', closeDetailModal);
    
    // 8. Settings Modal Event Handlers
    DOM.btnOpenSettings.addEventListener('click', openSettingsModal);
    DOM.settingsOverlay.addEventListener('click', closeSettingsModal);
    DOM.settingsCloseBtn.addEventListener('click', closeSettingsModal);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDetailModal();
            closeSettingsModal();
        }
    });

    // Modal Actions
    DOM.btnDelete.addEventListener('click', handleDeleteItem);

    // 9. Backup Database Actions (Local JSON file actions)
    DOM.btnExport.addEventListener('click', handleExportBackup);
    DOM.btnImportTrigger.addEventListener('click', () => DOM.importFileInput.click());
    DOM.importFileInput.addEventListener('change', handleImportBackup);

    // 10. Supabase Settings Actions
    DOM.btnTestConn.addEventListener('click', handleTestConnection);
    DOM.settingsForm.addEventListener('submit', handleSaveSettings);
    DOM.btnSyncData.addEventListener('click', handleSyncDataToCloud);
}

// Manage file selection UI states
function handleFileSelect(file) {
    selectedFile = file;
    DOM.fileInput.required = false;
    
    DOM.previewFilename.textContent = file.name;
    DOM.previewFilesize.textContent = formatBytes(file.size);
    
    const isImage = file.type.startsWith('image/');
    if (isImage) {
        DOM.previewFileIcon.className = 'fa-solid fa-file-image preview-icon';
    } else {
        DOM.previewFileIcon.className = 'fa-solid fa-file-lines preview-icon';
        if (file.type.includes('pdf')) DOM.previewFileIcon.className = 'fa-solid fa-file-pdf preview-icon';
        if (file.type.includes('zip') || file.type.includes('rar')) DOM.previewFileIcon.className = 'fa-solid fa-file-zipper preview-icon';
    }
    
    DOM.uploaderContent.style.opacity = '0';
    DOM.filePreview.style.display = 'flex';
}

function resetFileSelection() {
    selectedFile = null;
    DOM.fileInput.value = '';
    DOM.fileInput.required = true;
    DOM.filePreview.style.display = 'none';
    DOM.uploaderContent.style.opacity = '1';
}

/* ==========================================================================
   DETAIL MODAL CONTROLLER
   ========================================================================== */
let modalObjectUrl = null;

function openDetailModal(item) {
    state.currentOpenItem = item;
    
    // Apply item category theme context to modal
    DOM.modal.className = `modal active theme-${item.category}`;

    // Fill badge tags
    const categoryNames = {
        suculentas: 'Suculentas',
        pc: 'Soporte Técnico PC',
        web: 'Páginas & Apps Web'
    };
    
    const typeNames = {
        flyer: '<i class="fa-solid fa-bullhorn"></i> Flyer',
        photo: '<i class="fa-solid fa-image"></i> Foto',
        document: '<i class="fa-solid fa-file-lines"></i> Archivo'
    };

    DOM.modalCategoryBadge.textContent = categoryNames[item.category] || item.category;
    DOM.modalTypeBadge.innerHTML = typeNames[item.type] || item.type;
    
    DOM.modalTitle.textContent = item.title;
    DOM.modalDate.innerHTML = `<i class="fa-solid fa-calendar-days"></i> Creado: ${formatDateString(item.date)}`;
    DOM.modalDescription.textContent = item.description || 'Sin notas adicionales.';
    
    DOM.modalMetaSize.textContent = `Tamaño: ${formatBytes(item.fileSize)}`;
    DOM.modalMetaMime.textContent = `MIME: ${item.fileType}`;

    // Clean up any old object URL in memory
    if (modalObjectUrl) {
        URL.revokeObjectURL(modalObjectUrl);
        modalObjectUrl = null;
    }

    // Set Preview Content
    DOM.modalPreviewBox.innerHTML = '';
    
    const isImage = item.fileType.startsWith('image/');
    const srcUrl = item.fileBlob ? (modalObjectUrl = URL.createObjectURL(item.fileBlob)) : item.fileUrl;

    if (srcUrl) {
        if (isImage) {
            const img = document.createElement('img');
            img.src = srcUrl;
            img.alt = item.title;
            DOM.modalPreviewBox.appendChild(img);
        } else {
            const fileExt = item.fileName.split('.').pop() || 'FILE';
            let iconClass = 'fa-file-lines';
            if (item.fileType.includes('pdf')) iconClass = 'fa-file-pdf';
            if (item.fileType.includes('zip') || item.fileType.includes('rar')) iconClass = 'fa-file-zipper';
            
            DOM.modalPreviewBox.innerHTML = `
                <div class="card-doc-placeholder">
                    <i class="fa-solid ${iconClass} doc-placeholder-icon"></i>
                    <span class="doc-placeholder-ext" style="font-size: 1rem; padding: 4px 10px;">${fileExt}</span>
                    <p style="margin-top: 12px; font-size: 0.85rem; color: var(--text-secondary);">${item.fileName}</p>
                </div>
            `;
        }

        // Set Download button
        DOM.btnDownload.href = srcUrl;
        DOM.btnDownload.setAttribute('download', item.fileName);
        
        // If it's a supabase file, open in a new tab for download to work nicely across origins
        if (!item.fileBlob) {
            DOM.btnDownload.target = '_blank';
        } else {
            DOM.btnDownload.removeAttribute('target');
        }
        DOM.btnDownload.style.display = 'inline-flex';
    } else {
        DOM.modalPreviewBox.innerHTML = '<p>Error al cargar el archivo de vista previa.</p>';
        DOM.btnDownload.style.display = 'none';
    }
}

function closeDetailModal() {
    DOM.modal.classList.remove('active');
    
    if (modalObjectUrl) {
        URL.revokeObjectURL(modalObjectUrl);
        modalObjectUrl = null;
    }
    
    state.currentOpenItem = null;
}

// Delete item
async function handleDeleteItem() {
    if (!state.currentOpenItem) return;
    
    const confirmDelete = confirm(`¿Estás seguro de que quieres eliminar "${state.currentOpenItem.title}" del inventario? Esta acción no se puede deshacer.`);
    
    if (confirmDelete) {
        try {
            DOM.btnDelete.disabled = true;
            DOM.btnDelete.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Eliminando...';
            
            await DataManager.delete(state.currentOpenItem);
            closeDetailModal();
            await loadAndRenderData();
        } catch (err) {
            console.error('Error al borrar el ítem:', err);
            alert('No se pudo eliminar el elemento del backend.');
        } finally {
            DOM.btnDelete.disabled = false;
            DOM.btnDelete.innerHTML = '<i class="fa-solid fa-trash-can"></i> Eliminar de Inventario';
        }
    }
}

/* ==========================================================================
   SETTINGS MODAL CONTROLLER & ACTION HANDLERS
   ========================================================================== */
function openSettingsModal() {
    // Fill inputs with current values
    DOM.sbUrlInput.value = localStorage.getItem('supabase_url') || '';
    DOM.sbKeyInput.value = localStorage.getItem('supabase_key') || '';
    
    DOM.settingsConnStatus.style.display = 'none';
    DOM.settingsModal.classList.add('active');
    checkSyncVisibility();
}

function closeSettingsModal() {
    DOM.settingsModal.classList.remove('active');
}

// Test credentials connection
async function handleTestConnection() {
    const url = DOM.sbUrlInput.value.trim();
    const key = DOM.sbKeyInput.value.trim();
    
    if (!url || !key) {
        showSettingsStatus('Por favor ingresa la URL y la Anon Key.', 'error');
        return;
    }

    showSettingsStatus('Conectando a Supabase...', 'checking');

    const result = await SupabaseManager.testConnection(url, key);
    
    if (result.success) {
        showSettingsStatus('¡Conexión exitosa! La base de datos responde correctamente.', 'success');
    } else {
        showSettingsStatus('Error de conexión: ' + result.error, 'error');
    }
}

// Save Supabase credentials
async function handleSaveSettings(e) {
    e.preventDefault();
    const url = DOM.sbUrlInput.value.trim();
    const key = DOM.sbKeyInput.value.trim();

    if (!url || !key) {
        // Clear configuration to revert back to IndexedDB local mode
        localStorage.removeItem('supabase_url');
        localStorage.removeItem('supabase_key');
        
        alert('Credenciales limpias. Volviendo al modo local (IndexedDB).');
        closeSettingsModal();
        
        await DataManager.init();
        await loadAndRenderData();
        return;
    }

    showSettingsStatus('Validando y guardando...', 'checking');
    
    const result = await SupabaseManager.testConnection(url, key);
    
    if (result.success) {
        localStorage.setItem('supabase_url', url);
        localStorage.setItem('supabase_key', key);
        
        showSettingsStatus('¡Credenciales guardadas y conectadas!', 'success');
        
        // Wait a small moment so the user sees the green success feedback
        setTimeout(async () => {
            closeSettingsModal();
            await DataManager.init();
            await loadAndRenderData();
        }, 1000);
    } else {
        showSettingsStatus('Credenciales incorrectas. No se guardaron. Detalles: ' + result.error, 'error');
    }
}

// Helper: UI Settings Status display
function showSettingsStatus(msg, type) {
    DOM.settingsConnStatus.className = `settings-status-box ${type}`;
    DOM.settingsConnStatus.querySelector('.status-msg').textContent = msg;
    DOM.settingsConnStatus.style.display = 'block';
}

// Sync items from IndexedDB to Supabase
async function handleSyncDataToCloud() {
    const localItems = await getLocalItems();
    if (localItems.length === 0) {
        alert('No hay elementos locales para sincronizar.');
        return;
    }

    const confirmSync = confirm(`Se detectaron ${localItems.length} elementos en tu base de datos local (IndexedDB). ¿Deseas subirlos a tu almacenamiento en la nube de Supabase?`);
    if (!confirmSync) return;

    try {
        DOM.btnSyncData.disabled = true;
        DOM.btnSyncData.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Subiendo archivos...';

        let count = 0;
        for (const item of localItems) {
            // Check if there's a fileBlob to upload, if not, skip
            if (!item.fileBlob) continue;
            
            // Build item format for Supabase upload
            const supabaseItem = {
                title: item.title,
                category: item.category,
                type: item.type,
                date: item.date,
                description: item.description,
                fileName: item.fileName,
                fileType: item.fileType,
                fileSize: item.fileSize,
                fileBlob: item.fileBlob
            };

            await SupabaseManager.add(supabaseItem);
            // Delete from IndexedDB once uploaded successfully to keep things clean and avoid double syncs
            await deleteLocalItem(item.id);
            count++;
        }

        alert(`Sincronización terminada con éxito. ${count} elementos subidos a la nube.`);
        DOM.settingsSyncBox.style.display = 'none';
        closeSettingsModal();
        await loadAndRenderData();

    } catch (err) {
        console.error('Error al sincronizar con Supabase:', err);
        alert('Error durante la sincronización: ' + err.message);
    } finally {
        DOM.btnSyncData.disabled = false;
        DOM.btnSyncData.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Subir Datos Locales a la Nube';
    }
}

/* ==========================================================================
   IMPORT & EXPORT (BACKUP HANDLERS)
   ========================================================================== */
// Export whole database as a backup file (converting files to base64 JSON)
async function handleExportBackup() {
    try {
        DOM.btnExport.disabled = true;
        DOM.btnExport.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparando...';
        
        const items = await DataManager.getAll();
        if (items.length === 0) {
            alert('No hay elementos en tu inventario para exportar.');
            return;
        }

        // Process items synchronously to convert Blobs or download cloud URLs
        const processedItems = [];
        for (const item of items) {
            let base64Data = null;
            
            if (item.fileBlob) {
                // Local Blob
                base64Data = await blobToBase64(item.fileBlob);
            } else if (item.fileUrl) {
                // Cloud URL: fetch and download it to serialize
                try {
                    const response = await fetch(item.fileUrl);
                    const blob = await response.blob();
                    base64Data = await blobToBase64(blob);
                } catch (err) {
                    console.warn(`No se pudo serializar el archivo remoto para exportar: ${item.fileUrl}. Se exportará sin adjunto.`, err);
                }
            }

            const processedItem = {
                title: item.title,
                category: item.category,
                type: item.type,
                date: item.date,
                description: item.description,
                fileName: item.fileName,
                fileType: item.fileType,
                fileSize: item.fileSize,
                fileBase64: base64Data
            };
            processedItems.push(processedItem);
        }

        const backupData = {
            exportDate: new Date().toISOString(),
            app: 'InventarioEmprendimientos',
            version: DB_VERSION,
            data: processedItems
        };

        const jsonString = JSON.stringify(backupData, null, 2);
        const jsonBlob = new Blob([jsonString], { type: 'application/json' });
        
        const downloadUrl = URL.createObjectURL(jsonBlob);
        const dateStr = new Date().toISOString().slice(0, 10);
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `inventario_backup_${dateStr}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
        
    } catch (error) {
        console.error('Error al exportar copia de seguridad:', error);
        alert('Error al generar la copia de seguridad.');
    } finally {
        DOM.btnExport.disabled = false;
        DOM.btnExport.innerHTML = '<i class="fa-solid fa-download"></i> Exportar';
    }
}

// Import database from backup JSON
async function handleImportBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const backup = JSON.parse(event.target.result);
            
            // Basic structures verification
            if (backup.app !== 'InventarioEmprendimientos' || !Array.isArray(backup.data)) {
                alert('El archivo seleccionado no es una copia de seguridad válida de este sitio.');
                return;
            }

            const confirmImport = confirm(`Se detectaron ${backup.data.length} elementos en la copia de seguridad. Esto se agregará a tu base de datos actual (${DataManager.mode}). ¿Deseas continuar?`);
            if (!confirmImport) return;

            DOM.btnImportTrigger.disabled = true;
            DOM.btnImportTrigger.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';

            for (const itemData of backup.data) {
                let fileBlob = null;
                if (itemData.fileBase64) {
                    fileBlob = await base64ToBlob(itemData.fileBase64);
                }
                
                const item = {
                    title: itemData.title,
                    category: itemData.category,
                    type: itemData.type,
                    date: itemData.date,
                    description: itemData.description,
                    fileName: itemData.fileName,
                    fileType: itemData.fileType,
                    fileSize: itemData.fileSize || (fileBlob ? fileBlob.size : 0),
                    fileBlob: fileBlob
                };
                
                await DataManager.add(item);
            }

            alert('Copia de seguridad importada con éxito.');
            await loadAndRenderData();
            
        } catch (error) {
            console.error('Error al importar copia de seguridad:', error);
            alert('Error al analizar e importar el archivo. Verifica que sea un JSON válido.');
        } finally {
            DOM.btnImportTrigger.disabled = false;
            DOM.btnImportTrigger.innerHTML = '<i class="fa-solid fa-upload"></i> Importar';
            DOM.importFileInput.value = '';
        }
    };
    
    reader.readAsText(file);
}
